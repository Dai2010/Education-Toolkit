const test = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../src/schedule.js');

test('normalizes weekday lessons and subject teachers', () => {
  const result = schedule.normalize({ subjectTeachers: {}, schedule: [
    { weekday: 1, subject: '数学', course: '数学', start: '08:00', duration: 40, breakDuration: 10, teacher: '王公俊' }
  ] });
  assert.equal(result.schedule[0].weekday, 1);
  assert.equal(result.subjectTeachers['数学'], '王公俊');
});

test('rejects overlapping lessons', () => {
  assert.throws(() => schedule.normalize([
    { weekday: 1, course: 'A', start: '08:00', duration: 40 },
    { weekday: 1, course: 'B', start: '08:20', duration: 40 }
  ]), /重叠/);
});
