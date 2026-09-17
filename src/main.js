const { app, BrowserWindow, dialog, ipcMain, Notification, shell, screen } = require('electron');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const elegantClock = require('./modules/elegant-clock/src/main.js');
const scheduleTools = require('./schedule.js');
const autostart = require('./autostart.js')(app);

const defaultState = {
  settings: {
    themeColor: '#8888CC',
    ringtonePath: '',
    desktopWidgetEnabled: false,
    homeworkWidgetEnabled: false,
    homeworkWidgetExpanded: false,
    autostart: false,
    selectedNameList: '默认名单',
    subjectTeachers: {},
    homeworkWidgetX: null,
    homeworkWidgetY: null,
    drawMode: 'single',
    drawGroupSize: 1,
    drawGroupCount: 1,
    drawContinuous: false,
    drawResultFontSize: 30
  },
  names: [{ name: '示例同学', group: '默认' }],
  nameLists: [{ name: '默认名单', names: [{ name: '示例同学', group: '默认' }] }],
  schedule: [],
  assignments: [],
  drawnIds: []
};

let mainWindow;
let widgetWindow;
let state = structuredClone(defaultState);
let reminderTimer;

function statePath() {
  return path.join(app.getPath('userData'), 'education-toolkit.json');
}

function normalizeState(value) {
  const next = { ...structuredClone(defaultState), ...(value || {}) };
  next.settings = { ...defaultState.settings, ...(value?.settings || {}) };
  next.settings.subjectTeachers = { ...(value?.settings?.subjectTeachers || {}) };
  next.assignments = Array.isArray(next.assignments) ? next.assignments : [];
  next.schedule = Array.isArray(next.schedule) ? next.schedule : [];
  next.drawnIds = Array.isArray(next.drawnIds) ? next.drawnIds : [];
  {
    const normalizedSchedule = scheduleTools.normalize({ schedule: next.schedule, subjectTeachers: next.settings.subjectTeachers });
    next.schedule = normalizedSchedule.schedule;
    next.settings.subjectTeachers = normalizedSchedule.subjectTeachers;
  }
  next.nameLists = Array.isArray(next.nameLists) && next.nameLists.length ? next.nameLists : structuredClone(defaultState.nameLists);
  next.names = Array.isArray(next.names) ? next.names : next.nameLists[0].names;
  return next;
}

async function loadState() {
  try {
    state = normalizeState(JSON.parse(await fs.readFile(statePath(), 'utf8')));
  } catch {
    state = structuredClone(defaultState);
  }
}

async function saveState() {
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#f8f7fc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', (event) => { if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); } });
}

function sendState() {
  mainWindow?.webContents.send('state-updated', state);
  widgetWindow?.webContents.send('state-updated', state);
}

function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return;
  widgetWindow = new BrowserWindow({
    width: state.settings.homeworkWidgetExpanded ? 310 : 54,
    height: state.settings.homeworkWidgetExpanded ? 190 : 54,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#252542',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  const display = screen.getPrimaryDisplay().workArea;
  const width = state.settings.homeworkWidgetExpanded ? 310 : 54;
  const height = state.settings.homeworkWidgetExpanded ? 190 : 54;
  const savedX = state.settings.homeworkWidgetX;
  const savedY = state.settings.homeworkWidgetY;
  
  // 完整的边界保护：确保窗口不会移出屏幕任何边缘
  const defaultX = display.x + display.width - width - 24;
  const defaultY = display.y + 120;
  const x = Number.isFinite(savedX) 
    ? Math.max(display.x, Math.min(savedX, display.x + display.width - width))
    : defaultX;
  const y = Number.isFinite(savedY)
    ? Math.max(display.y, Math.min(savedY, display.y + display.height - height))
    : defaultY;
  
  widgetWindow.setPosition(x, y);
  widgetWindow.on('closed', () => { widgetWindow = undefined; });
}

function closeWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();
  widgetWindow = undefined;
}

function resizeHomeworkWidget(expanded) {
  state.settings.homeworkWidgetExpanded = Boolean(expanded);
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const bounds = widgetWindow.getBounds();
  const width = expanded ? 310 : 54;
  const height = expanded ? 190 : 54;
  widgetWindow.setBounds({ x: Math.max(0, bounds.x + bounds.width - width), y: bounds.y, width, height }, false);
}

function playReminder(assignment) {
  if (Notification.isSupported()) {
    new Notification({ title: '作业提醒', body: `${assignment.name} · ${assignment.subject || '其它'} 已到提醒时间` }).show();
  }
  mainWindow?.webContents.send('reminder-due', { assignment });
}

function reminderTick() {
  const now = Date.now();
  let changed = false;
  for (const assignment of state.assignments) {
    if (assignment.completed || !assignment.dueAt || assignment.remindedAt) continue;
    const due = new Date(assignment.dueAt).getTime();
    if (Number.isFinite(due) && due <= now) {
      assignment.remindedAt = new Date().toISOString();
      playReminder(assignment);
      changed = true;
    }
  }
  if (changed) saveState().catch(() => {});
}

function setAutostart(enabled) {
  state.settings.autostart = autostart.set(enabled);
}

function drawSingle(list, continuous) {
  const available = continuous 
    ? list.filter((person, index) => !state.drawnIds.includes(index))
    : list;

  if (!available.length) {
    if (continuous) {
      return { error: '所有人都已被抽取，请重置后继续', shouldReset: true };
    }
    return { error: '名单为空' };
  }

  const selected = available[Math.floor(Math.random() * available.length)];
  
  if (continuous) {
    const originalIndex = list.findIndex(p => p.name === selected.name && p.group === selected.group);
    if (originalIndex !== -1) {
      state.drawnIds.push(originalIndex);
    }
  }

  return {
    mode: 'single',
    selected,
    remaining: continuous ? list.length - state.drawnIds.length : list.length,
    total: list.length
  };
}

function drawGroups(list, groupSize, groupCount, continuous) {
  if (groupSize <= 0) return { error: '每组人数必须大于 0' };
  if (groupCount <= 0) return { error: '组数必须大于 0' };
  if (groupSize > list.length) return { error: '每组人数不能超过名单总人数' };

  const requested = groupSize * groupCount;
  const available = continuous 
    ? list.filter((_, index) => !state.drawnIds.includes(index))
    : list;

  if (continuous && requested > available.length) {
    return { 
      error: `连续抽取时剩余人数不足：需要 ${requested} 人，当前仅剩 ${available.length} 人`,
      shouldReset: true
    };
  }

  const groups = [];
  const workingList = [...available];
  
  for (let i = 0; i < groupCount; i++) {
    if (workingList.length < groupSize) break;
    
    const group = [];
    for (let j = 0; j < groupSize; j++) {
      const randomIndex = Math.floor(Math.random() * workingList.length);
      const selected = workingList.splice(randomIndex, 1)[0];
      group.push(selected);
      
      if (continuous) {
        const originalIndex = list.findIndex(p => p.name === selected.name && p.group === selected.group);
        if (originalIndex !== -1 && !state.drawnIds.includes(originalIndex)) {
          state.drawnIds.push(originalIndex);
        }
      }
    }
    groups.push(group);
  }

  return {
    mode: 'group',
    groups,
    remaining: continuous ? list.length - state.drawnIds.length : list.length,
    total: list.length
  };
}


function registerIpc() {
  ipcMain.handle('get-state', () => state);
  ipcMain.handle('save-state', async (_event, next) => {
    state = normalizeState(next);
    await saveState();
    if (state.settings.homeworkWidgetEnabled) createWidget(); else closeWidget();
    sendState();
    elegantClock.sync?.();
    return state;
  });
  ipcMain.handle('pick-ringtone', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择提醒铃声', properties: ['openFile'], filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('import-markdown', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入 Markdown', properties: ['openFile'], filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }] });
    if (result.canceled) return null;
    return fs.readFile(result.filePaths[0], 'utf8');
  });
  ipcMain.handle('check-for-updates', async () => { await shell.openExternal('https://github.com/Dai2010/Education-Toolkit/releases/latest'); return { ok: true }; });
  ipcMain.handle('import-json', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入 JSON', properties: ['openFile'], filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
    if (result.canceled) return null;
    return JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
  });
  ipcMain.handle('get-autostart-status', () => autostart.get());
  ipcMain.handle('set-autostart', async (_event, enabled) => { setAutostart(enabled); await saveState(); return autostart.get(); });
  ipcMain.handle('show-item-in-folder', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('open-toolkit', () => { mainWindow?.show(); mainWindow?.focus(); return true; });
  ipcMain.handle('toolkit:open', () => { mainWindow?.webContents.send('toolkit:navigate', 'clock'); mainWindow?.show(); mainWindow?.focus(); return true; });
  ipcMain.handle('toolkit:clock-settings', () => { elegantClock.settings(); return true; });
  ipcMain.handle('toolkit:clock-tools', () => { elegantClock.tools(); return true; });
  ipcMain.handle('toolkit:get-schedule-state', () => state.schedule);
  ipcMain.handle('random-draw', (_event, options = {}) => {
    const list = Array.isArray(state.names) ? state.names.filter((person) => person?.name) : [];
    if (!list.length) return { error: '名单为空，请先在设置中添加名单' };

    const mode = options.mode || state.settings.drawMode || 'single';
    const groupSize = Number(options.groupSize) || Number(state.settings.drawGroupSize) || 1;
    const groupCount = Number(options.groupCount) || Number(state.settings.drawGroupCount) || 1;
    const continuous = options.continuous !== undefined ? options.continuous : state.settings.drawContinuous;

    try {
      if (mode === 'single') {
        return drawSingle(list, continuous);
      } else if (mode === 'group') {
        return drawGroups(list, groupSize, groupCount, continuous);
      }
      return { error: '未知的抽取模式' };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('reset-drawn', async () => {
    state.drawnIds = [];
    await saveState();
    sendState();
    return { success: true };
  });
  ipcMain.handle('toggle-homework-widget', async (_event, expanded) => { 
    resizeHomeworkWidget(expanded); 
    await saveState(); 
    sendState(); 
    return state.settings.homeworkWidgetExpanded; 
  });
  ipcMain.handle('move-homework-widget', async (_event, x, y) => { 
    if (!widgetWindow || widgetWindow.isDestroyed()) return false; 
    
    // 边界保护：确保窗口不会移出屏幕
    const display = screen.getPrimaryDisplay().workArea;
    const bounds = widgetWindow.getBounds();
    const clampedX = Math.max(display.x, Math.min(x, display.x + display.width - bounds.width));
    const clampedY = Math.max(display.y, Math.min(y, display.y + display.height - bounds.height));
    
    widgetWindow.setPosition(Math.round(clampedX), Math.round(clampedY)); 
    const [nextX, nextY] = widgetWindow.getPosition(); 
    state.settings.homeworkWidgetX = nextX; 
    state.settings.homeworkWidgetY = nextY; 
    await saveState(); 
    return true; 
  });
}


app.whenReady().then(async () => {
  await loadState();
  registerIpc();
  createWindow();
  elegantClock.initialize({
    iconPath: path.join(__dirname, '..', 'build', 'icon.png'),
    ringtonePath: () => state.settings.ringtonePath || path.join(__dirname, '..', 'assets-lofi-beats.mp3'),
    getAutostartInfo: () => ({ supported: true, enabled: autostart.get() }),
    setAutostart: (enabled) => { setAutostart(enabled); return { supported: true, enabled: autostart.get() }; },
    getScheduleState: () => state.schedule,
    getSubjectTeachers: () => state.settings.subjectTeachers,
    getThemeColor: () => state.settings.themeColor,
    startHidden: true
  });
  elegantClock.compact();
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.webContents.send('toolkit:navigate', 'clock'); });
  if (state.settings.homeworkWidgetEnabled) createWidget();
  reminderTimer = setInterval(reminderTick, 1000);
  reminderTick();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; clearInterval(reminderTimer); });
