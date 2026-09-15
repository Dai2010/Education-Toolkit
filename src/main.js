const { app, BrowserWindow, dialog, ipcMain, Notification, shell } = require('electron');
const { existsSync, promises: fs } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const defaultState = {
  settings: {
    themeColor: '#8888CC',
    ringtonePath: '',
    desktopWidgetEnabled: false,
    autostart: false,
    selectedNameList: '默认名单'
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
  next.assignments = Array.isArray(next.assignments) ? next.assignments : [];
  next.schedule = Array.isArray(next.schedule) ? next.schedule : [];
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function sendState() {
  mainWindow?.webContents.send('state-updated', state);
  widgetWindow?.webContents.send('state-updated', state);
}

function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return;
  widgetWindow = new BrowserWindow({
    width: 360,
    height: 225,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#252542',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  widgetWindow.on('closed', () => { widgetWindow = undefined; });
}

function closeWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();
  widgetWindow = undefined;
}

function playReminder(assignment) {
  if (Notification.isSupported()) {
    new Notification({ title: '作业提醒', body: `${assignment.name} · ${assignment.subject || '其它'} 已到提醒时间` }).show();
  }
  mainWindow?.webContents.send('reminder-due', {
    assignment,
    ringtonePath: state.settings.ringtonePath || path.join(__dirname, '..', 'assets-lofi-beats.mp3')
  });
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
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args: ['--autostart'] });
  state.settings.autostart = Boolean(enabled);
}

function registerIpc() {
  ipcMain.handle('get-state', () => state);
  ipcMain.handle('save-state', async (_event, next) => {
    state = normalizeState(next);
    await saveState();
    if (state.settings.desktopWidgetEnabled) createWidget(); else closeWidget();
    sendState();
    return state;
  });
  ipcMain.handle('pick-ringtone', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择提醒铃声', properties: ['openFile'], filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('import-json', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入 JSON', properties: ['openFile'], filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
    if (result.canceled) return null;
    return JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
  });
  ipcMain.handle('get-autostart-status', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('set-autostart', async (_event, enabled) => { setAutostart(enabled); await saveState(); return app.getLoginItemSettings().openAtLogin; });
  ipcMain.handle('show-item-in-folder', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('launch-clock', () => launchExternal('elegant-clock', ['npm', 'start']));
  ipcMain.handle('launch-rollcall', () => launchExternal('rollcall', ['java', '-jar', path.join('target', 'rollcall.jar')]));
}

function launchExternal(project, command) {
  const cwd = path.join(__dirname, '..', '..', project);
  if (!existsSync(cwd)) return { ok: false, message: `未找到 ${project} 项目` };
  const child = spawn(command[0], command.slice(1), { cwd, detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
  child.unref();
  return { ok: true };
}

app.whenReady().then(async () => {
  await loadState();
  registerIpc();
  createWindow();
  if (state.settings.desktopWidgetEnabled) createWidget();
  reminderTimer = setInterval(reminderTick, 1000);
  reminderTick();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => clearInterval(reminderTimer));
