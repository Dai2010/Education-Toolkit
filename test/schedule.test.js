const test = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../src/schedule.js');

const model = () => ({
  schedule: schedule.normalize([
    { id: 'math', weekday: 1, subject: '数学', course: '数学', start: '08:00', duration: 40, breakDuration: 0 },
    { id: 'english', weekday: 1, subject: '英语', course: '英语', start: '09:00', duration: 45, breakDuration: 10 },
    { id: 'physics', weekday: 5, subject: '物理', course: '物理', start: '14:00', duration: 50, breakDuration: 5 }
  ]).schedule,
  settings: { subjectTeachers: { 数学: '甲', 英语: '乙', 物理: '丙' } },
  assignments: [], scheduleOverrides: {}, scheduleHistory: []
});

test('cross-week swaps move content and teachers but keep both time slots, atomically undo', () => {
  const original = model();
  const result = schedule.applyAdjustment(original, { id: 'a', type: 'swap', date: '2026-09-18', lessonId: 'physics', targetDate: '2026-09-21', targetLessonId: 'math' }).state;
  const friday = schedule.forDate(result, '2026-09-18')[0];
  const monday = schedule.forDate(result, '2026-09-21')[0];
  assert.deepEqual([friday.course, friday.teacher, friday.start, friday.duration], ['数学', '甲', '14:00', 50]);
  assert.deepEqual([monday.course, monday.teacher, monday.start, monday.duration, monday.breakDuration], ['物理', '丙', '08:00', 40, 0]);
  assert.equal(schedule.forDate(result, '2026-09-28')[0].course, '数学');
  assert.equal(schedule.summary(result, new Date('2026-09-21T08:01:00')).item.course, '物理');
  assert.deepEqual(original, model(), 'Does not mutate source on preview');
  const undone = schedule.applyAdjustment(result, { type: 'undo', recordId: 'a' }).state;
  assert.deepEqual(undone.scheduleOverrides, {});
  assert.equal(undone.scheduleHistory[0].undone, true);
});

test('same-day swap, same-week move, conflicts, and dependent undo', () => {
  const swapped = schedule.applyAdjustment(model(), { id: 'a', type: 'swap', date: '2026-09-14', lessonId: 'math', targetDate: '2026-09-14', targetLessonId: 'english' }).state;
  assert.deepEqual(schedule.forDate(swapped, '2026-09-14').map(row => row.course), ['英语', '数学']);
  assert.throws(() => schedule.applyAdjustment(swapped, { id: 'b', type: 'move', date: '2026-09-14', lessonId: 'math', targetDate: '2026-09-14', start: '09:20' }), /重叠/);
  const moved = schedule.applyAdjustment(swapped, { id: 'b', type: 'move', date: '2026-09-14', lessonId: 'math', targetDate: '2026-09-16', start: '11:00' }).state;
  assert.equal(schedule.forDate(moved, '2026-09-14').length, 1);
  assert.equal(schedule.forDate(moved, '2026-09-16')[0].course, '英语');
  assert.throws(() => schedule.applyAdjustment(moved, { type: 'undo', recordId: 'a' }), /后续调整/);
  const firstUndo = schedule.applyAdjustment(moved, { type: 'undo', recordId: 'b' }).state;
  assert.deepEqual(schedule.applyAdjustment(firstUndo, { type: 'undo', recordId: 'a' }).state.scheduleOverrides, {});
});

test('makeup references track base changes; custom days freeze content and allow per-lesson teachers', () => {
  const makeup = schedule.applyAdjustment(model(), { id: 'a', type: 'weekday', date: '2026-09-19', weekday: 1 }).state;
  makeup.schedule[0].course = '数学练习';
  assert.equal(schedule.forDate(makeup, '2026-09-19')[0].course, '数学练习');
  const rows = schedule.forDate(makeup, '2026-09-19');
  rows[1].subject = '数学'; rows[1].teacher = '代课老师';
  const custom = schedule.applyAdjustment(makeup, { id: 'b', type: 'custom', date: '2026-09-19', lessons: rows }).state;
  custom.schedule[0].course = '新的基础课';
  assert.equal(schedule.forDate(custom, '2026-09-19')[0].course, '数学练习');
  assert.equal(schedule.forDate(custom, '2026-09-19')[1].teacher, '代课老师');
  assert.equal(schedule.forDate(custom, '2026-09-19')[0].originKey, '2026-09-19:math');
});

test('day exchanges, holidays across month boundary and restoring only selected dates', () => {
  const swapped = schedule.applyAdjustment(model(), { id: 'a', type: 'swap-day', date: '2026-09-18', targetDate: '2026-09-21' }).state;
  assert.equal(schedule.forDate(swapped, '2026-09-18').length, 2);
  assert.equal(schedule.forDate(swapped, '2026-09-21')[0].course, '物理');
  const off = schedule.applyAdjustment(swapped, { id: 'b', type: 'off', date: '2026-09-30', endDate: '2026-10-07' }).state;
  assert.equal(schedule.forDate(off, '2026-10-02').length, 0);
  assert.equal(schedule.summary(off, new Date('2026-10-02T14:10:00')).label, '今日无课程');
  const restored = schedule.applyAdjustment(off, { id: 'c', type: 'restore', date: '2026-10-02' }).state;
  assert.equal(schedule.forDate(restored, '2026-10-02')[0].course, '物理');
  assert.equal(schedule.forDate(restored, '2026-10-05').length, 0);
  for (const date of ['2026-02-30', 'bad-date']) assert.throws(() => schedule.forDate(off, date));
  assert.throws(() => schedule.applyAdjustment(off, { id: 'd', type: 'off', date: '2026-10-02', endDate: '2026-09-30' }));
});

test('linked reminders follow exact moved occurrence; fixed reminders remain; holiday pauses and undo restores', () => {
  const original = model();
  const occurrence = schedule.nextOccurrence(original, 'physics', 'after', new Date('2026-09-18T13:00:00'));
  original.assignments = [
    { id: 'linked', name: '练习', lessonId: 'physics', relation: 'after', reminderMode: 'schedule', ...occurrence },
    { id: 'fixed', name: '固定提醒', lessonId: 'physics', relation: 'after', reminderMode: 'fixed', dueAt: occurrence.dueAt }
  ];
  const swap = { id: 'a', type: 'swap', date: '2026-09-18', lessonId: 'physics', targetDate: '2026-09-21', targetLessonId: 'math' };
  const preview = schedule.applyAdjustment(original, swap);
  assert.equal(preview.reminderChanges.length, 1);
  assert.equal(preview.state.assignments[0].dueAt, new Date('2026-09-21T08:40:00').toISOString());
  assert.equal(preview.state.assignments[1].dueAt, occurrence.dueAt);
  const unsynced = schedule.applyAdjustment(original, { ...swap, syncReminders: false }).state;
  assert.equal(unsynced.assignments[0].dueAt, occurrence.dueAt);
  assert.equal(unsynced.assignments[0].reminderMode, 'fixed');
  const off = schedule.applyAdjustment(preview.state, { id: 'b', type: 'off', date: '2026-09-21' }).state;
  assert.equal(off.assignments[0].dueAt, '');
  assert.equal(off.assignments[0].schedulePaused, true);
  const undo = schedule.applyAdjustment(off, { type: 'undo', recordId: 'b' }).state;
  assert.equal(undo.assignments[0].dueAt, new Date('2026-09-21T08:40:00').toISOString());
  assert.equal(schedule.nextOccurrence(preview.state, 'physics', 'before', new Date('2026-09-18T13:00:00')).lessonDate, '2026-09-21');
});

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
