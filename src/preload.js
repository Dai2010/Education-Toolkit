const { contextBridge, ipcRenderer } = require('electron');

const clockTools = {};
for (const [name, channel] of Object.entries({
  getState: 'state:get', updateSettings: 'state:update-settings',
  countdownSetMode: 'countdown:set-mode', countdownConfigure: 'countdown:configure', countdownStart: 'countdown:start', countdownPause: 'countdown:pause', countdownReset: 'countdown:reset',
  pomodoroStart: 'pomodoro:start', pomodoroPause: 'pomodoro:pause', pomodoroSkip: 'pomodoro:skip', pomodoroReset: 'pomodoro:reset',
  stopwatchStart: 'stopwatch:start', stopwatchPause: 'stopwatch:pause', stopwatchReset: 'stopwatch:reset',
  reminderAdd: 'reminder:add', reminderUpdate: 'reminder:update', reminderClearDone: 'reminder:clear-done'
})) clockTools[name] = (...args) => ipcRenderer.invoke(channel, ...args);
clockTools.onStateChanged = callback => {
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('state:changed', listener);
  return () => ipcRenderer.removeListener('state:changed', listener);
};
contextBridge.exposeInMainWorld('clockTools', clockTools);

contextBridge.exposeInMainWorld('educationToolkit', {
  adjustSchedule: (request, expected) => ipcRenderer.invoke('adjust-schedule', request, expected),
  openClockSettings: () => ipcRenderer.invoke('toolkit:clock-settings'),
  openClockTools: () => ipcRenderer.invoke('toolkit:clock-tools'),
  onNavigate: (callback) => ipcRenderer.on('toolkit:navigate', (_event, view) => callback(view)),
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  pickRingtone: () => ipcRenderer.invoke('pick-ringtone'),
  importJson: () => ipcRenderer.invoke('import-json'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  moveHomeworkWidget: (x, y) => ipcRenderer.invoke('move-homework-widget', x, y),
  getAutostartStatus: () => ipcRenderer.invoke('get-autostart-status'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  openToolkit: () => ipcRenderer.invoke('open-toolkit'),
  randomDraw: (options) => ipcRenderer.invoke('random-draw', options),
  resetDrawn: () => ipcRenderer.invoke('reset-drawn'),
  toggleHomeworkWidget: (expanded) => ipcRenderer.invoke('toggle-homework-widget', Boolean(expanded)),
  onStateUpdated: (callback) => ipcRenderer.on('state-updated', (_event, value) => callback(value)),
  onReminderDue: (callback) => ipcRenderer.on('reminder-due', (_event, value) => callback(value))
});
