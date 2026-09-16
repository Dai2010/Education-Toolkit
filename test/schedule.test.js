const test = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../src/schedule.js');

test('normalizes weekday lessons and subject teachers', () => {
  const result = schedule.normalize({ subjectTeachers: {}, schedule: [
    { weekday: 1, subject: '数学', course: '数学', start: '08:00', duration: 40, breakDuration: 10, teacher: '示例老师' }
  ] });
  assert.equal(result.schedule[0].weekday, 1);
  assert.equal(result.subjectTeachers['数学'], '示例老师');
});

test('rejects overlapping lessons', () => {
  assert.throws(() => schedule.normalize([
    { weekday: 1, course: 'A', start: '08:00', duration: 40 },
    { weekday: 1, course: 'B', start: '08:20', duration: 40 }
  ]), /重叠/);
});

test('keeps zero breaks, distinguishes weekdays and switches at exact boundaries', () => {
  const { schedule: rows } = schedule.normalize([
    { weekday: 1, course: '早读', start: '07:00', duration: 40, breakDuration: 0 },
    { weekday: 1, course: '数学', start: '07:40', duration: 40, breakDuration: 10 },
    { weekday: 1, course: '艺术', start: '08:30', duration: 40, breakDuration: 0 },
    { weekday: 1, course: '自习', start: '14:00', duration: 40, breakDuration: 0 },
    { weekday: 2, course: '英语', start: '07:00', duration: 40 }
  ]);
  const at = (day, hour, minute) => schedule.summary(rows, new Date(2026, 8, 14 + day - 1, hour, minute));
  assert.equal(rows[0].breakDuration, 0);
  assert.equal(at(1, 7, 0).item.course, '早读');
  assert.equal(at(1, 7, 40).item.course, '数学');
  assert.equal(at(1, 8, 20).label, '课间');
  assert.equal(at(1, 8, 30).item.course, '艺术');
  assert.equal(at(1, 12, 0).label, '休息');
  assert.equal(at(1, 14, 40).label, '放学');
  assert.equal(at(2, 7, 0).item.course, '英语');
  assert.equal(at(3, 7, 0).label, '今日无课程');
});

test('rejects conflicting teachers and invalid times without accepting partial data', () => {
  assert.throws(() => schedule.normalize([
    { course: '数学', start: '08:00', teacher: '示例甲' },
    { course: '数学', start: '09:00', teacher: '示例乙' }
  ]), /不同老师/);
  for (const row of [
    { course: '数学', start: '25:00' },
    { course: '数学', start: '08:00', weekday: 0 },
    { course: '数学', start: '08:00', duration: 0 },
    { course: '数学', start: '08:00', breakDuration: -1 }
  ]) assert.throws(() => schedule.normalize([row]));
});

test('reminders choose next occurrence on the correct weekday', () => {
  const lesson = { weekday: 2, start: '08:00', duration: 40 };
  const now = new Date(2026, 8, 14, 9, 0);
  assert.equal(new Date(schedule.nextDue(lesson, 'before', now)).getDay(), 2);
  assert.equal(new Date(schedule.nextDue(lesson, 'after', now)).getMinutes(), 40);
  const passed = new Date(2026, 8, 15, 9, 0);
  assert.equal(new Date(schedule.nextDue(lesson, 'before', passed)).getDate(), 22);
});
