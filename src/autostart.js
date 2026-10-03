const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const entryName = 'Education Toolkit';
const runKeyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const approvedKeyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

// getLoginItemSettings 在 Windows 上不支持 name 选项（只有 set 支持），所以读的时候
// 拿不到自己写进去的那个值名。这里直接查注册表，读写两侧共用 entryName。
function queryRegistryValue(keyPath, valueName) {
  let output;
  try {
    output = execFileSync('reg', ['query', keyPath, '/v', valueName], { encoding: 'utf8', windowsHide: true });
  } catch (error) {
    // reg 用退出码 1 表示「键或值不存在」，那是还没开启自启动的正常状态，不当错误刷日志。
    if (error.status === 1 || error.status === 2) return '';
    throw error;
  }
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith(valueName)) || '';
}

function registryValue(line) {
  const match = /(REG_[A-Z_]+)\s+(.*)$/.exec(line || '');
  return match ? { type: match[1], data: match[2].trim() } : null;
}

function executableOf(commandLine) {
  const quoted = /^"([^"]+)"/.exec(commandLine || '');
  if (quoted) return quoted[1];
  return (commandLine || '').split(/\s+/)[0] || '';
}

// 任务管理器禁用启动项只改 StartupApproved 的字节，不改 Run 的值；第一个字节 03 表示被禁用。
// 读不到或形态不认识就按已启用处理，保持旧行为而不是误报未开启。
function approvedDisabled(line) {
  const value = registryValue(line);
  if (!value || value.type !== 'REG_BINARY') return false;
  return /^03/i.test(value.data.replace(/\s+/g, ''));
}

module.exports = function createAutostart(app, platform = process.platform, queryValue = queryRegistryValue) {
  const execPath = process.execPath;
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  const options = { path: execPath, args, name: entryName, openAsHidden: false };
  const file = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'education-toolkit.desktop');
  const quote = (value) => '"' + String(value).replace(/[\\"`$]/g, '\\$&') + '"';
  const command = [execPath, ...args].map(quote).join(' ');

  function getWindows() {
    const registered = registryValue(queryValue(runKeyPath, entryName));
    if (!registered) return false;
    const expectedPath = path.win32.normalize(execPath).toLowerCase();
    if (path.win32.normalize(executableOf(registered.data)).toLowerCase() !== expectedPath) return false;
    try {
      return !approvedDisabled(queryValue(approvedKeyPath, entryName));
    } catch {
      return true;
    }
  }

  function get() {
    if (platform === 'linux') {
      try {
        const text = fs.readFileSync(file, 'utf8');
        return !/^Hidden\s*=\s*true\s*$/im.test(text) &&
          !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text) && text.split('\n').includes(`Exec=${command}`);
      } catch { return false; }
    }
    // Windows 和 macOS
    try {
      return getWindows();
    } catch (error) {
      console.error('Failed to read login item:', error);
      return false;
    }
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
        // enabled 才是任务管理器里那个「启动已批准」开关，默认 true；关闭时要一起改掉。
        app.setLoginItemSettings({ ...options, openAtLogin: Boolean(enabled), enabled: Boolean(enabled) });
      } catch (error) {
        console.error('Failed to set login item:', error);
        return false;
      }
    }
    return get();
  }

  return { get, set };
};
