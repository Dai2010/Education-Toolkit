const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('application assets and primary views exist', () => {
  assert.ok(fs.existsSync(path.join(root, 'src', 'main.js')));
  assert.ok(fs.existsSync(path.join(root, 'src', 'preload.js')));
  assert.ok(fs.existsSync(path.join(root, 'src', 'renderer.js')));
  assert.ok(fs.existsSync(path.join(root, 'assets-lofi-beats.mp3')));
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
  for (const view of ['randomView', 'clockView', 'assignmentsView', 'settingsView']) assert.match(renderer, new RegExp(`function ${view}`));
});

test('GPL installer configuration is present', () => {
  const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageInfo.license, 'GPL-3.0-only');
  assert.equal(packageInfo.build.nsis.license, 'LICENSE');
  assert.ok(packageInfo.build.win.target.includes('msi'));
});
