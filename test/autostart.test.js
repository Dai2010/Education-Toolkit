const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createAutostart = require('../src/autostart');

const windowsApp = () => ({ isPackaged: true, getAppPath: () => '/app' });

test('Windows autostart reads the run entry directly, so set and get agree', () => {
  const registry = new Map();
  const app = {
    isPackaged: true,
    getAppPath: () => '/app',
    setLoginItemSettings: ({ name, path: executable, args, openAtLogin }) => {
      if (openAtLogin) registry.set(name, `"${executable}" ${args.join(' ')}`);
      else registry.delete(name);
    }
  };
  const queryValue = (keyPath, valueName) => {
    if (keyPath.includes('StartupApproved')) throw new Error('REG: value not found');
    const value = registry.get(valueName);
    if (!value) throw new Error('REG: value not found');
    return `${valueName}    REG_SZ    ${value}`;
  };
  const settings = createAutostart(app, 'win32', queryValue);
  assert.equal(settings.get(), false);
  assert.equal(settings.set(true), true);
  assert.equal(registry.get('Education Toolkit').includes(process.execPath), true);
  assert.equal(settings.set(false), false);
});

test('Windows autostart matches the run entry name case-insensitively', () => {
  const queryValue = (keyPath, valueName) => {
    if (keyPath.includes('StartupApproved')) throw new Error('REG: value not found');
    return `${valueName.toUpperCase()}    REG_SZ    "C:\\Somewhere\\Other.exe" --autostart`;
  };
  assert.equal(createAutostart(windowsApp(), 'win32', queryValue).get(), true);
});

test('Windows autostart reports off while Task Manager keeps the entry disabled', () => {
  const queryValue = (keyPath, valueName) => keyPath.includes('StartupApproved')
    ? `${valueName}    REG_BINARY    030000000000000000000000`
    : `${valueName}    REG_SZ    "${process.execPath}" --autostart`;
  assert.equal(createAutostart(windowsApp(), 'win32', queryValue).get(), false);
});

test('Windows autostart stays off when the registry cannot be queried', () => {
  const queryValue = () => { throw new Error('reg is unavailable'); };
  assert.equal(createAutostart(windowsApp(), 'win32', queryValue).get(), false);
});

test('macOS autostart keeps reading through the login item API', () => {
  const app = { isPackaged: true, getAppPath: () => '/app', getLoginItemSettings: () => ({ openAtLogin: true }) };
  assert.equal(createAutostart(app, 'darwin', () => { throw new Error('reg must not run on macOS'); }).get(), true);
});

test('Linux startup checks disabled entries and removes only its own desktop entry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-test-'));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  try {
    const settings = createAutostart({ isPackaged: false, getAppPath: () => '/tmp/example app' }, 'linux');
    assert.equal(settings.get(), false);
    assert.equal(settings.set(true), true);
    const file = path.join(dir, 'autostart/education-toolkit.desktop');
    fs.appendFileSync(file, 'Hidden=true\n');
    assert.equal(settings.get(), false);
    assert.equal(settings.set(false), false);
    assert.equal(fs.existsSync(file), false);
  } finally {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
