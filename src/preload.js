const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('educationToolkit', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  pickRingtone: () => ipcRenderer.invoke('pick-ringtone'),
  importJson: () => ipcRenderer.invoke('import-json'),
  importMarkdown: () => ipcRenderer.invoke('import-markdown'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  moveHomeworkWidget: (x, y) => ipcRenderer.invoke('move-homework-widget', x, y),
  getAutostartStatus: () => ipcRenderer.invoke('get-autostart-status'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  openToolkit: () => ipcRenderer.invoke('open-toolkit'),
  randomDraw: (people) => ipcRenderer.invoke('random-draw', people),
  toggleHomeworkWidget: (expanded) => ipcRenderer.invoke('toggle-homework-widget', Boolean(expanded)),
  onStateUpdated: (callback) => ipcRenderer.on('state-updated', (_event, value) => callback(value)),
  onReminderDue: (callback) => ipcRenderer.on('reminder-due', (_event, value) => callback(value))
});
