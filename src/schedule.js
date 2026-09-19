(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ToolkitSchedule = api;
})(globalThis, function () {
  const weekday = (date) => date.getDay() || 7;
  const minutes = (time) => {
    const [hour, minute] = String(time).split(':').map(Number);
    return hour * 60 + minute;
  };

  function normalize(data) {
    const rows = Array.isArray(data) ? data : data?.schedule;
    if (!Array.isArray(rows)) throw new Error('课表应为数组或包含 schedule 数组');
    const subjectTeachers = { ...(data?.subjectTeachers || {}) };
    const ids = new Set();
    const schedule = rows.map((row, index) => {
      const course = String(row.course || row.name || '').trim();
      const start = String(row.start || row.time || '');
      const subject = String(row.subject || course).trim();
      const duration = Number(row.duration ?? 40);
      const breakDuration = Number(row.breakDuration ?? 10);
      const day = row.weekday == null ? null : Number(row.weekday);
      if (!course || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)) {
        throw new Error(`第 ${index + 1} 节课缺少课程名或有效时间`);
      }
      if (!Number.isInteger(duration) || duration < 1 || minutes(start) + duration > 1440 ||
          !Number.isInteger(breakDuration) || breakDuration < 0 || breakDuration > 1440) {
        throw new Error(`第 ${index + 1} 节课的时长无效`);
      }
      if (day !== null && (!Number.isInteger(day) || day < 1 || day > 7)) {
        throw new Error('weekday 必须为 1 至 7（周一至周日）');
      }
      if (row.teacher != null) {
        const teacher = String(row.teacher).trim();
        if (teacher && subjectTeachers[subject] && subjectTeachers[subject] !== teacher) {
          throw new Error(`科目“${subject}”有不同老师，请统一后导入`);
        }
        if (teacher) subjectTeachers[subject] = teacher;
      }
      const id = String(row.id || `lesson-${index + 1}`);
      if (ids.has(id)) throw new Error('课程 id 不能重复');
      ids.add(id);
      return { id, subject, course, start, duration, breakDuration, ...(day === null ? {} : { weekday: day }) };
    });
    for (let day = 1; day <= 7; day += 1) {
      const lessons = forDay(schedule, day);
      for (let index = 1; index < lessons.length; index += 1) {
        const previous = lessons[index - 1];
        if (minutes(previous.start) + previous.duration > minutes(lessons[index].start)) {
          throw new Error(`星期 ${day} 的课程时间重叠`);
        }
      }
    }
    for (const subject of Object.keys(subjectTeachers)) subjectTeachers[subject] = String(subjectTeachers[subject] ?? '').trim();
    return { schedule, subjectTeachers };
  }

  function forDay(schedule, day) {
    return schedule.filter((lesson) => lesson.weekday == null || Number(lesson.weekday) === day)
      .slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }

  function summary(schedule, now = new Date()) {
    const lessons = Array.isArray(schedule) ? forDay(schedule, weekday(now)) : forDate(schedule, dateKey(now));
    const time = now.getHours() * 60 + now.getMinutes();
    const active = lessons.find((lesson) => time >= minutes(lesson.start) && time < minutes(lesson.start) + lesson.duration);
    const next = lessons.find((lesson) => minutes(lesson.start) > time) || null;
    if (active) return { label: '上课中', item: active, next };
    if (!lessons.length) return { label: '今日无课程', item: null, next: null };
    if (!next) return { label: '放学', item: null, next: null };
    const previous = lessons.filter((lesson) => minutes(lesson.start) + lesson.duration <= time).pop();
    const label = !previous ? '未上课' :
      time < minutes(previous.start) + previous.duration + previous.breakDuration ? '课间' : '休息';
    return { label, item: next, next };
  }

  function nextDue(lesson, relation, now = new Date()) {
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = new Date(now);
      date.setDate(date.getDate() + offset);
      if (lesson.weekday != null && Number(lesson.weekday) !== weekday(date)) continue;
      const [hour, minute] = lesson.start.split(':').map(Number);
      date.setHours(hour, minute + (relation === 'after' ? lesson.duration : 0), 0, 0);
      if (date >= now) return date.toISOString();
    }
    throw new Error('无法计算课程提醒时间');
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('请选择有效日期');
    const date = new Date(`${key}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || dateKey(date) !== key) throw new Error('日期无效');
    return date;
  }

  function addDays(key, count) {
    const date = parseDate(key);
    date.setDate(date.getDate() + count);
    return dateKey(date);
  }

  function validateLessons(rows) {
    const normalized = normalize(rows.map((row) => ({ ...row, weekday: null, teacher: undefined }))).schedule;
    return normalized.map((row, i) => ({ ...row, teacher: String(rows[i].teacher ?? ''), originKey: String(rows[i].originKey || ''), originId: String(rows[i].originId || row.id) }));
  }

  function normalizeOverrides(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('日期调整数据无效');
    const result = {};
    for (const [key, override] of Object.entries(value)) {
      parseDate(key);
      if (!override || !['weekday', 'off', 'custom'].includes(override.kind)) throw new Error('日期安排类型无效');
      const entry = { kind: override.kind, reason: String(override.reason || '') };
      if (entry.kind === 'weekday') {
        entry.weekday = Number(override.weekday);
        if (!Number.isInteger(entry.weekday) || entry.weekday < 1 || entry.weekday > 7) throw new Error('请选择周一至周日');
      }
      if (entry.kind === 'custom') entry.lessons = validateLessons(override.lessons || []);
      result[key] = entry;
    }
    return result;
  }

  function forDate(model, key) {
    const date = parseDate(key);
    const override = model.scheduleOverrides?.[key];
    if (override?.kind === 'off') return [];
    if (override?.kind === 'custom') return structuredClone(override.lessons).sort((a, b) => minutes(a.start) - minutes(b.start));
    const day = override?.kind === 'weekday' ? override.weekday : weekday(date);
    return forDay(model.schedule || [], day).map((row) => ({ ...row, teacher: model.settings?.subjectTeachers?.[row.subject] || model.subjectTeachers?.[row.subject] || '', originKey: `${key}:${row.id}`, originId: row.id }));
  }

  function dateLabel(model, key) {
    const entry = model.scheduleOverrides?.[key];
    if (!entry) return '正常安排';
    return ({ off: '放假 / 停课', custom: '已调课 · 临时安排', weekday: `补课 · 按周${'一二三四五六日'[entry.weekday - 1]}` })[entry.kind];
  }

  function nextOccurrence(model, lessonId, relation, now = new Date()) {
    for (let offset = 0; offset <= 366; offset++) {
      const key = addDays(dateKey(now), offset);
      for (const row of forDate(model, key)) {
        if (row.originId !== lessonId) continue;
        const date = new Date(`${key}T${row.start}:00`);
        if (relation === 'after') date.setMinutes(date.getMinutes() + row.duration);
        if (date >= now) return { dueAt: date.toISOString(), lessonOccurrence: row.originKey, lessonDate: key };
      }
    }
    throw new Error('未来一年内没有该课程，请指定提醒时间');
  }

  function applyAdjustment(model, request) {
    const next = structuredClone(model);
    next.scheduleOverrides = normalizeOverrides(next.scheduleOverrides);
    next.scheduleHistory = next.scheduleHistory || [];
    const source = request.date;
    const reason = String(request.reason || '').trim();
    const before = {};
    const touched = new Set();
    function remember(key) {
      parseDate(key);
      if (!touched.has(key)) before[key] = structuredClone(next.scheduleOverrides[key] || null);
      touched.add(key);
    }
    function custom(key, lessons) {
      remember(key);
      next.scheduleOverrides[key] = { kind: 'custom', reason, lessons: validateLessons(lessons) };
    }
    const type = request.type;
    if (['weekday', 'off', 'restore'].includes(type)) {
      parseDate(source);
      const end = request.endDate || source;
      parseDate(end);
      if (end < source) throw new Error('结束日期不能早于开始日期');
      let count = 0;
      for (let key = source; key <= end; key = addDays(key, 1)) {
        if (++count > 366) throw new Error('一次最多调整 366 天');
        remember(key);
        if (type === 'restore') delete next.scheduleOverrides[key];
        else next.scheduleOverrides[key] = { kind: type, reason, ...(type === 'weekday' ? { weekday: Number(request.weekday) } : {}) };
      }
    } else if (type === 'custom') {
      custom(source, request.lessons || []);
    } else if (type === 'swap-day') {
      if (source === request.targetDate) throw new Error('请选择两个不同日期');
      const a = forDate(next, source);
      const b = forDate(next, request.targetDate);
      custom(source, b);
      custom(request.targetDate, a);
    } else if (type === 'swap' || type === 'move') {
      const target = request.targetDate;
      const a = forDate(next, source);
      const b = source === target ? a : forDate(next, target);
      const i = a.findIndex(row => row.id === request.lessonId);
      if (i < 0) throw new Error('原课程已变更，请重新选择');
      if (type === 'swap') {
        const j = b.findIndex(row => row.id === request.targetLessonId);
        if (j < 0) throw new Error('目标课程已变更，请重新选择');
        if (a === b && i === j) throw new Error('不能与同一节课交换');
        const content = row => ({ subject: row.subject, course: row.course, teacher: row.teacher, originId: row.originId, originKey: row.originKey });
        const first = content(a[i]);
        a[i] = { ...a[i], ...content(b[j]) };
        b[j] = { ...b[j], ...first };
      } else {
        const [row] = a.splice(i, 1);
        b.push({ ...row, id: `moved-${request.id}`, start: request.start, duration: Number(request.duration ?? row.duration), breakDuration: Number(request.breakDuration ?? row.breakDuration) });
      }
      custom(source, a);
      if (source !== target) custom(target, b);
    } else if (type === 'undo') {
      const index = next.scheduleHistory.findIndex(item => item.id === request.recordId);
      const record = next.scheduleHistory[index];
      if (!record || record.undone) throw new Error('该记录已撤销或不存在');
      if (next.scheduleHistory.slice(index + 1).some(item => !item.undone && item.dates.some(key => record.dates.includes(key)))) {
        throw new Error('这些日期还有后续调整，请先撤销后续记录');
      }
      for (const key of record.dates) {
        remember(key);
        if (record.before[key]) next.scheduleOverrides[key] = structuredClone(record.before[key]);
        else delete next.scheduleOverrides[key];
      }
      record.undone = true;
    } else throw new Error('不支持的调整操作');
    next.scheduleOverrides = normalizeOverrides(next.scheduleOverrides);
    const dates = [...touched];
    if (type !== 'undo') {
      if (!request.id || next.scheduleHistory.some(record => record.id === request.id)) throw new Error('调整记录编号无效或重复');
      next.scheduleHistory.push({ id: request.id, type, reason, dates, before, createdAt: new Date().toISOString(), description: String(request.description || '') });
    }
    const reminderChanges = [];
    const afterLessons = dates.flatMap(key => forDate(next, key).map(row => ({ key, row })));
    for (const assignment of next.assignments || []) {
      if (assignment.completed || assignment.remindedAt || !assignment.lessonId || assignment.reminderMode === 'fixed') continue;
      const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
      const oldKey = assignment.lessonDate || (due && dateKey(due));
      if (!dates.includes(oldKey)) continue;
      const oldLesson = forDate(model, oldKey).find(row => row.originId === assignment.lessonId);
      const origin = assignment.lessonOccurrence || oldLesson?.originKey;
      const found = afterLessons.find(({ row }) => row.originKey === origin);
      let dueAt = '';
      if (found) {
        const date = new Date(`${found.key}T${found.row.start}:00`);
        if (assignment.relation === 'after') date.setMinutes(date.getMinutes() + found.row.duration);
        dueAt = date.toISOString();
      }
      if (dueAt === assignment.dueAt) continue;
      reminderChanges.push({ id: assignment.id, name: assignment.name, before: assignment.dueAt, after: dueAt });
      if (request.syncReminders !== false) {
        assignment.dueAt = dueAt;
        assignment.lessonOccurrence = origin;
        assignment.lessonDate = found?.key || oldKey;
        assignment.schedulePaused = !found;
      } else assignment.reminderMode = 'fixed';
    }
    return { state: next, dates, reminderChanges };
  }

  return { normalize, forDay, summary, nextDue, weekday, dateKey, parseDate, addDays, forDate, dateLabel, normalizeOverrides, nextOccurrence, applyAdjustment };
});
