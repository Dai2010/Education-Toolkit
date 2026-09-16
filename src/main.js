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
    homeworkWidgetY: null
  },
  names: [{ name: '示例同学', group: '默认' }],
  nameLists: [{ name: '默认名单', names: [{ name: '示例同学', group: '默认' }] }],
  schedule: [],
  assignments: []
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
  const x = Number.isFinite(state.settings.homeworkWidgetX) ? state.settings.homeworkWidgetX : display.x + display.width - width - 24;
  const y = Number.isFinite(state.settings.homeworkWidgetY) ? state.settings.homeworkWidgetY : display.y + 120;
  widgetWindow.setPosition(Math.max(display.x, x), Math.max(display.y, y));
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
  ipcMain.handle('random-draw', (_event, people) => {
    const list = Array.isArray(people) ? people.filter((person) => person?.name) : [];
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  });
  ipcMain.handle('toggle-homework-widget', async (_event, expanded) => { resizeHomeworkWidget(expanded); await saveState(); resizeHomeworkWidget(expanded); sendState(); return state.settings.homeworkWidgetExpanded; });
  ipcMain.handle('move-homework-widget', async (_event, x, y) => { if (!widgetWindow || widgetWindow.isDestroyed()) return false; widgetWindow.setPosition(Math.round(x), Math.round(y)); const [nextX, nextY] = widgetWindow.getPosition(); state.settings.homeworkWidgetX = nextX; state.settings.homeworkWidgetY = nextY; await saveState(); return true; });
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
    startHidden: true
  });
  elegantClock.show();
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
