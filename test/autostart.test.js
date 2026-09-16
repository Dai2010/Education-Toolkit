const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createAutostart = require('../src/autostart');

test('Windows startup is checked using the same path and arguments as the saved entry', () => {
  let saved;
  const app = { isPackaged: true, getAppPath: () => '/app',
    setLoginItemSettings: (value) => { saved = value; },
    getLoginItemSettings: (value) => { assert.equal(value.path, saved.path); assert.deepEqual(value.args, saved.args); assert.equal(value.name, saved.name); return { openAtLogin: saved.openAtLogin }; }
  };
  const settings = createAutostart(app, 'win32');
  assert.equal(settings.set(true), true);
  assert.equal(settings.set(false), false);
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
