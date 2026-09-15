const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('educationToolkit', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  pickRingtone: () => ipcRenderer.invoke('pick-ringtone'),
  importJson: () => ipcRenderer.invoke('import-json'),
  getAutostartStatus: () => ipcRenderer.invoke('get-autostart-status'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  launchClock: () => ipcRenderer.invoke('launch-clock'),
  launchRollcall: () => ipcRenderer.invoke('launch-rollcall'),
  onStateUpdated: (callback) => ipcRenderer.on('state-updated', (_event, value) => callback(value)),
  onReminderDue: (callback) => ipcRenderer.on('reminder-due', (_event, value) => callback(value))
});
