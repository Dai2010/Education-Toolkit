const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions } = require('../src/modules/elegant-clock/src/update-checker.js');

test('project fix revisions sort after the base release and increase numerically', () => {
  assert.equal(compareVersions('1.0.8-fix1', '1.0.8'), 1);
  assert.equal(compareVersions('1.0.8-fix2', '1.0.8-fix1'), 1);
  assert.equal(compareVersions('v1.0.8-fix1', '1.0.8-fix1'), 0);
  assert.equal(compareVersions('1.0.8', '1.0.8-fix1'), -1);
  assert.equal(compareVersions('1.0.8-fix1', '1.0.9'), -1);
});

test('ordinary prerelease comparisons retain semver behavior', () => {
  assert.equal(compareVersions('1.0.8-beta.2', '1.0.8-beta.1'), 1);
  assert.equal(compareVersions('1.0.8', '1.0.8-rc.1'), 1);
});
