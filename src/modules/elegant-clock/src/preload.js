const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elegantClock', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getAboutInfo: () => ipcRenderer.invoke('app:get-about-info'),
  getUpdateInfo: () => ipcRenderer.invoke('app:get-update-info'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  startDirectUpdate: () => ipcRenderer.invoke('app:start-direct-update'),
  startProxyUpdate: () => ipcRenderer.invoke('app:start-proxy-update'),
  openAbout: () => ipcRenderer.invoke('app:open-about'),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
  openTools: () => ipcRenderer.invoke('app:open-tools'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', String(url)),
  getState: () => ipcRenderer.invoke('state:get'),
  updateSettings: (settings) => ipcRenderer.invoke('state:update-settings', settings || {}),
  getDefaultRingtone: () => ipcRenderer.invoke('app:get-default-ringtone'),
  getAutostart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('app:set-autostart', Boolean(enabled)),
  chooseRingtone: () => ipcRenderer.invoke('ringtone:choose'),
  countdownSetMode: (mode) => ipcRenderer.invoke('countdown:set-mode', String(mode)),
  countdownConfigure: (options) => ipcRenderer.invoke('countdown:configure', options || {}),
  countdownStart: (options) => ipcRenderer.invoke('countdown:start', options || {}),
  countdownPause: () => ipcRenderer.invoke('countdown:pause'),
  countdownReset: () => ipcRenderer.invoke('countdown:reset'),
  pomodoroStart: () => ipcRenderer.invoke('pomodoro:start'),
  pomodoroPause: () => ipcRenderer.invoke('pomodoro:pause'),
  pomodoroSkip: () => ipcRenderer.invoke('pomodoro:skip'),
  pomodoroReset: () => ipcRenderer.invoke('pomodoro:reset'),
  stopwatchStart: () => ipcRenderer.invoke('stopwatch:start'),
  stopwatchPause: () => ipcRenderer.invoke('stopwatch:pause'),
  stopwatchReset: () => ipcRenderer.invoke('stopwatch:reset'),
  reminderAdd: (reminder) => ipcRenderer.invoke('reminder:add', reminder || {}),
  reminderUpdate: (id, action) => ipcRenderer.invoke('reminder:update', String(id), String(action)),
  reminderClearDone: () => ipcRenderer.invoke('reminder:clear-done'),
  minimize: () => ipcRenderer.send('window:minimize'),
  hideToTray: () => ipcRenderer.send('window:hide-to-tray'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  setAlwaysOnTop: (enabled) => ipcRenderer.send('window:set-always-on-top', Boolean(enabled)),
  getCompactMode: () => ipcRenderer.invoke('window:get-compact-mode'),
  setCompactMode: (enabled) => ipcRenderer.invoke('window:set-compact-mode', Boolean(enabled)),
  reportRendererHeartbeat: () => ipcRenderer.send('watchdog:renderer-heartbeat'),
  moveWindowBy: (deltaX, deltaY) => ipcRenderer.send('window:move-by', {
    deltaX: Number(deltaX) || 0,
    deltaY: Number(deltaY) || 0
  }),
  onRestoreFullUi: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on('window:restore-full-ui', listener);
    return () => ipcRenderer.removeListener('window:restore-full-ui', listener);
  },
  onStateChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  onPlayAlert: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('alert:play', listener);
    return () => ipcRenderer.removeListener('alert:play', listener);
  },
  onUpdateProgress: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  showNotification: (options) => ipcRenderer.invoke('notification:show', {
    title: options?.title,
    body: options?.body,
    focus: Boolean(options?.focus)
  }),
  platform: process.platform
  ,openToolkit: () => ipcRenderer.invoke('toolkit:open')
  ,getScheduleState: () => ipcRenderer.invoke('toolkit:get-schedule-state')
  ,onScheduleChanged: (callback) => ipcRenderer.on('toolkit:schedule', (_event, value) => callback(value))
  ,onThemeChanged: (callback) => ipcRenderer.on('toolkit:theme', (_event, value) => callback(value))
  ,onCompactState: (callback) => ipcRenderer.on('window:compact-state', (_event, value) => callback(value))
});

