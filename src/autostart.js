const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports = function createAutostart(app, platform = process.platform) {
  // 修复：确保在打包后使用正确的执行路径
  const execPath = app.isPackaged ? process.execPath : process.execPath;
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  const options = { path: execPath, args, name: 'Education Toolkit' };
  const file = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'education-toolkit.desktop');
  const quote = (value) => '"' + String(value).replace(/[\\"`$]/g, '\\$&') + '"';
  const command = [execPath, ...args].map(quote).join(' ');
  
  function get() {
    if (platform === 'linux') {
      try {
        const text = fs.readFileSync(file, 'utf8');
        return !/^Hidden\s*=\s*true\s*$/im.test(text) &&
          !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text) && text.split('\n').includes(`Exec=${command}`);
      } catch { return false; }
    }
    // Windows 和 macOS
    const settings = app.getLoginItemSettings(options);
    return Boolean(settings.openAtLogin);
  }
  
  function set(enabled) {
    if (platform === 'linux') {
      if (enabled) {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Education Toolkit\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
        } catch (error) {
          console.error('Failed to create autostart file:', error);
          return false;
        }
      } else {
        try {
          fs.rmSync(file, { force: true });
        } catch (error) {
          console.error('Failed to remove autostart file:', error);
        }
      }
    } else {
      // Windows 和 macOS
      try {
        app.setLoginItemSettings({ ...options, openAtLogin: Boolean(enabled) });
      } catch (error) {
        console.error('Failed to set login item:', error);
        return false;
      }
    }
    return get();
  }
  
  return { get, set };
};
