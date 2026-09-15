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
    const lessons = forDay(schedule, weekday(now));
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

  return { normalize, forDay, summary, nextDue, weekday };
});
