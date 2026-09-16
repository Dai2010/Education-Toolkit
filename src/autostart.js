const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports = function createAutostart(app, platform = process.platform) {
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  const options = { path: process.execPath, args, name: 'Education Toolkit' };
  const file = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'education-toolkit.desktop');
  const quote = (value) => '"' + String(value).replace(/[\\"`$]/g, '\\$&') + '"';
  const command = [process.execPath, ...args].map(quote).join(' ');
  function get() {
    if (platform === 'linux') {
      try {
        const text = fs.readFileSync(file, 'utf8');
        return !/^Hidden\s*=\s*true\s*$/im.test(text) &&
          !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text) && text.split('\n').includes(`Exec=${command}`);
      } catch { return false; }
    }
    return Boolean(app.getLoginItemSettings(options).openAtLogin);
  }
  function set(enabled) {
    if (platform === 'linux') {
      if (enabled) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Education Toolkit\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
      } else fs.rmSync(file, { force: true });
    } else app.setLoginItemSettings({ ...options, openAtLogin: Boolean(enabled) });
    return get();
  }
  return { get, set };
};
