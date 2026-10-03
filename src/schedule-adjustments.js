let actualWeekDate = ToolkitSchedule.dateKey(new Date());
let adjustmentDraft = null;
let adjustmentPreview = null;
let adjustmentSaving = false;
let adjustmentStep = 1;
const adjustmentTypes = { swap: '交换两节课', move: '移动一节课', 'swap-day': '交换两天课表', weekday: '按其他星期上课', off: '放假 / 停课', custom: '自定义当天课表', restore: '恢复基础安排', undo: '撤销调整' };

function actualLessonsMarkup(model, date, clickable = false) {
  const rows = ToolkitSchedule.forDate(model, date);
  return rows.map(row => `<${clickable ? 'button type="button"' : 'div'} class="actual-lesson" ${clickable ? `data-adjust-date="${date}" data-adjust-lesson="${esc(row.id)}"` : ''} data-actual-date="${date}" data-actual-start="${row.start}" data-actual-duration="${row.duration}"><strong>${esc(row.start)} · ${esc(row.course)}</strong><span>${row.duration} 分钟${row.teacher ? ` · ${esc(row.teacher)}` : ''}</span></${clickable ? 'button' : 'div'}>`).join('') || '<p class="empty">当天无课程</p>';
}

function actualSchedulePanel() {
  const monday = ToolkitSchedule.addDays(actualWeekDate, 1 - ToolkitSchedule.weekday(ToolkitSchedule.parseDate(actualWeekDate)));
  return `<section class="panel"><div class="panel-title"><div><h2>本周实际安排</h2><p>查看课程；需要调整时，从右侧入口进入分步引导。</p></div><button class="btn btn-primary" data-new-adjustment>调休 / 调课</button></div>
    <div class="inline-actions actual-navigation"><button class="btn btn-secondary" data-week-shift="-7">上一周</button><input type="date" id="actual-week-date" aria-label="查看日期" value="${actualWeekDate}"><button class="btn btn-secondary" data-week-shift="7">下一周</button><button class="btn btn-secondary" data-week-today>本周</button></div>
    <div class="actual-week">${Array.from({length: 7}, (_, i) => {
      const date = ToolkitSchedule.addDays(monday, i);
      return `<section class="actual-day"><h3>${date} 周${'一二三四五六日'[i]}</h3><p class="adjustment-label">${esc(ToolkitSchedule.dateLabel(state, date))}</p><p>${esc(state.scheduleOverrides?.[date]?.reason || '')}</p>${actualLessonsMarkup(state, date)}</section>`;
    }).join('')}</div></section>`;
}

function adjustmentWizardView() {
  if (adjustmentStep === 0) return `<section class="wizard-shell"><section class="panel wizard"><h2>调课记录</h2><div class="wizard-body">${[...(state.scheduleHistory || [])].reverse().map(record => `<div class="list-item"><div><h3>${esc(adjustmentTypes[record.type])}${record.undone ? ' · 已撤销' : ''}</h3><p>${record.dates.map(esc).join('、')} ${esc(record.reason)}</p></div>${record.undone ? '' : `<button class="btn btn-secondary" data-undo-adjustment="${esc(record.id)}">预览撤销</button>`}</div>`).join('') || '暂无记录'}</div><div class="actions"><button class="btn btn-secondary" data-wizard-start>返回新建调整</button></div></section></section>`;
  return `<section class="wizard-shell"><div class="wizard-heading"><h2>${adjustmentStep === 3 ? '3 · 确认调整' : adjustmentStep === 2 ? '2 · 设置具体安排' : '1 · 选择操作和日期'}</h2><p>仅最终确认才保存。页面顶部返回键或离开此页面会丢弃本次未确认修改。</p></div>${adjustmentStep === 3 && adjustmentPreview ? adjustmentPreviewMarkup() : adjustmentEditor()}</section>`;
}

function adjustmentEditor() {
  const draft = adjustmentDraft;
  const options = (date, selected) => ToolkitSchedule.forDate(state, date).map(row => `<option value="${esc(row.id)}" ${row.id === selected ? 'selected' : ''}>${row.start} ${esc(row.course)}${row.teacher ? ` · ${esc(row.teacher)}` : ''}</option>`).join('');
  return `<section class="panel" id="adjustment-editor" aria-label="调整具体日期"><p>交换两节课保留各自时间和时长；自定义安排保存独立副本。“按其他星期上课”会跟随基础课表修改。</p>
    <form id="adjustment-form"><div class="form-grid">
    <label class="form-field">操作<select name="type">${Object.entries(adjustmentTypes).filter(([key]) => key !== 'undo').map(([key, label]) => `<option value="${key}" ${draft.type === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="form-field">原日期 / 开始日期<input name="date" type="date" required value="${draft.date}"></label>
    ${['weekday', 'off', 'restore'].includes(draft.type) ? `<label class="form-field">结束日期（单日可留空）<input name="endDate" type="date" value="${draft.endDate || ''}"></label>` : ''}
    ${draft.type === 'weekday' ? `<label class="form-field">执行星期<select name="weekday">${Array.from({length:7}, (_, i) => `<option value="${i + 1}" ${Number(draft.weekday) === i + 1 ? 'selected' : ''}>周${'一二三四五六日'[i]}</option>`).join('')}</select></label>` : ''}
    ${['swap', 'move'].includes(draft.type) ? `<label class="form-field">原课程<select name="lessonId" required>${options(draft.date, draft.lessonId)}</select></label>` : ''}
    ${['swap', 'move', 'swap-day'].includes(draft.type) ? `<label class="form-field">目标日期<input name="targetDate" type="date" required value="${draft.targetDate}"></label>` : ''}
    ${draft.type === 'swap' ? `<label class="form-field">目标课程<select name="targetLessonId" required>${options(draft.targetDate, draft.targetLessonId)}</select></label>` : ''}
    ${draft.type === 'move' ? `<label class="form-field">目标开始时间<input name="start" type="time" required value="${draft.start || '08:00'}"></label><label class="form-field">课程时长（分钟）<input name="duration" type="number" min="1" max="1440" required value="${draft.duration || 40}"></label><label class="form-field">课间（分钟）<input name="breakDuration" type="number" min="0" max="1440" required value="${draft.breakDuration ?? 10}"></label>` : ''}
    <label class="form-field full">调整原因<input name="reason" value="${esc(draft.reason || '')}" placeholder="例如：教师培训、节假日补课"></label></div>
    ${draft.type === 'custom' ? `<p>可修改科目、课程名、任课老师和时间，新增或删除课程。不会改动基础周课表。</p><div class="custom-lessons">${(draft.lessons || []).map((row, i) => `<fieldset data-custom-row="${i}"><legend>第 ${i + 1} 节</legend><div class="form-grid">${[['subject','科目','text'],['course','课程名','text'],['teacher','老师','text'],['start','开始时间','time'],['duration','时长（分钟）','number'],['breakDuration','课间（分钟）','number']].map(([key,label,type]) => `<label class="form-field">${label}<input data-field="${key}" type="${type}" value="${esc(row[key])}" ${key === 'teacher' ? '' : 'required'} ${type === 'number' ? `min="${key === 'duration' ? 1 : 0}" max="1440"` : ''}></label>`).join('')}</div><button type="button" class="btn btn-danger" data-remove-custom="${i}">删除本节</button></fieldset>`).join('')}</div><button class="btn btn-secondary" type="button" data-add-custom>添加课程</button>` : ''}
    <div class="actions"><button class="btn btn-secondary" type="button" data-cancel-adjustment>取消并退出</button>${adjustmentStep === 2 ? '<button class="btn btn-secondary" type="button" data-wizard-previous>上一步</button>' : '<button class="btn btn-secondary" type="button" data-wizard-history>调课记录</button>'}<button class="btn btn-primary" type="submit">${adjustmentStep === 1 ? '下一步' : '下一步：确认'}</button></div></form></section>`;
}

function adjustmentPreviewMarkup() {
  const preview = adjustmentPreview;
  return `<section class="panel" id="adjustment-preview"><h2>确认调整 · ${esc(adjustmentTypes[preview.request.type])}</h2><p>${esc(preview.request.reason || '')}</p>
    ${preview.dates.map(date => `<h3>${date}</h3><div class="adjustment-comparison"><section><h4>调整前 · ${esc(ToolkitSchedule.dateLabel(state, date))}</h4>${actualLessonsMarkup(state, date)}</section><section><h4>调整后 · ${esc(ToolkitSchedule.dateLabel(preview.state, date))}</h4>${actualLessonsMarkup(preview.state, date)}</section></div>`).join('')}
    ${preview.reminderChanges.length ? `<h3>受影响的作业提醒</h3>${preview.reminderChanges.map(item => `<p>${esc(item.name)}：${formatDateTime(item.before)} → ${item.after ? formatDateTime(item.after) : '课程取消，暂停提醒'}</p>`).join('')}<label class="setting-inline"><input type="checkbox" id="sync-adjustment-reminders" checked>同步这些提醒（取消勾选将保持原时间并改为固定提醒）</label>` : '<p>没有需要同步的作业提醒。手动指定日期的提醒保持不变。</p>'}
    <div class="actions"><button class="btn btn-secondary" data-cancel-preview>返回修改</button><button class="btn btn-primary" data-confirm-adjustment ${adjustmentSaving ? 'disabled' : ''}>确认生效</button></div></section>`;
}

function readAdjustmentForm() {
  const form = document.querySelector('#adjustment-form');
  if (!form) return;
  Object.assign(adjustmentDraft, Object.fromEntries(new FormData(form)));
  if (adjustmentDraft.type === 'custom') {
    document.querySelectorAll('[data-custom-row]').forEach(fieldset => {
      const row = adjustmentDraft.lessons[Number(fieldset.dataset.customRow)];
      fieldset.querySelectorAll('[data-field]').forEach(input => { row[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value; });
    });
  }
}

function previewAdjustment(request) {
  try {
    const result = ToolkitSchedule.applyAdjustment(state, request);
    adjustmentPreview = { ...result, request, expected: JSON.stringify(state) };
    adjustmentStep = 3;
    render();
    document.querySelector('#adjustment-preview')?.scrollIntoView({block: 'start'});
  } catch (error) { showToast(error.message); }
}

function bindAdjustments() {
  function open(date, lessonId) {
    const lesson = ToolkitSchedule.forDate(state, date).find(row => row.id === lessonId);
    adjustmentDraft = { type: lesson ? 'swap' : 'weekday', date, targetDate: ToolkitSchedule.addDays(date, 1), weekday: 1, lessonId, duration: lesson?.duration || 40, breakDuration: lesson?.breakDuration ?? 10, start: lesson?.start || '08:00', reason: '' };
    adjustmentPreview = null;
    adjustmentStep = 1;
    navigate('adjustments');
    document.querySelector('.content').scrollTop = 0;
  }
  document.querySelector('[data-new-adjustment]')?.addEventListener('click', () => open(actualWeekDate));
  document.querySelector('[data-wizard-start]')?.addEventListener('click', () => open(actualWeekDate));
  document.querySelector('[data-wizard-history]')?.addEventListener('click', () => { readAdjustmentForm(); adjustmentStep = 0; render(); });
  document.querySelector('[data-wizard-previous]')?.addEventListener('click', () => { readAdjustmentForm(); adjustmentStep = 1; render(); });
  const form = document.querySelector('#adjustment-form');
  if (form) {
    form.closest('.panel').classList.add('wizard');
    for (const label of form.querySelectorAll('.form-grid > label')) {
      if (label.closest('[data-custom-row]')) continue;
      const input = label.querySelector('[name]');
      if (!input) continue;
      const first = ['type', 'date', 'endDate'].includes(input.name);
      label.hidden = adjustmentStep === 1 ? !first : first;
      input.disabled = label.hidden;
    }
    const custom = form.querySelector('.custom-lessons');
    if (custom) { custom.hidden = adjustmentStep !== 2; custom.querySelectorAll('input').forEach(input => { input.disabled = adjustmentStep !== 2; }); }
    const add = form.querySelector('[data-add-custom]');
    if (add) add.hidden = adjustmentStep !== 2;
    const body = document.createElement('div');
    body.className = 'wizard-body';
    const actions = form.querySelector('.actions');
    while (form.firstChild && form.firstChild !== actions) body.append(form.firstChild);
    form.prepend(body);
  }
  const previewPanel = document.querySelector('#adjustment-preview');
  if (previewPanel) {
    const body = document.createElement('div');
    body.className = 'wizard-body';
    const actions = previewPanel.querySelector('.actions');
    while (previewPanel.firstChild && previewPanel.firstChild !== actions) body.append(previewPanel.firstChild);
    previewPanel.prepend(body);
  }
  document.querySelectorAll('[data-adjust-date]').forEach(button => button.addEventListener('click', () => open(button.dataset.adjustDate, button.dataset.adjustLesson)));
  document.querySelectorAll('[data-week-shift]').forEach(button => button.addEventListener('click', () => { actualWeekDate = ToolkitSchedule.addDays(actualWeekDate, Number(button.dataset.weekShift)); render(); }));
  document.querySelector('[data-week-today]')?.addEventListener('click', () => { actualWeekDate = ToolkitSchedule.dateKey(new Date()); render(); });
  document.querySelector('#actual-week-date')?.addEventListener('change', event => { if (event.target.value) { actualWeekDate = event.target.value; render(); } });
  document.querySelectorAll('#adjustment-form [name="type"], #adjustment-form [name="date"], #adjustment-form [name="targetDate"]').forEach(input => input.addEventListener('change', () => {
    readAdjustmentForm();
    if (!adjustmentDraft.date || !adjustmentDraft.targetDate) return;
    if (adjustmentDraft.type === 'custom') adjustmentDraft.lessons = ToolkitSchedule.forDate(state, adjustmentDraft.date);
    adjustmentPreview = null;
    render();
  }));
  document.querySelector('[data-add-custom]')?.addEventListener('click', () => {
    readAdjustmentForm();
    const id = uid();
    adjustmentDraft.lessons.push({ id, originId: id, originKey: `${adjustmentDraft.date}:${id}`, subject: '', course: '', teacher: '', start: '08:00', duration: 40, breakDuration: 10 });
    render();
  });
  document.querySelectorAll('[data-remove-custom]').forEach(button => button.addEventListener('click', () => { readAdjustmentForm(); adjustmentDraft.lessons.splice(Number(button.dataset.removeCustom), 1); render(); }));
  document.querySelector('#adjustment-form')?.addEventListener('submit', event => {
    event.preventDefault();
    readAdjustmentForm();
    if (adjustmentStep === 1) {
      try {
        ToolkitSchedule.parseDate(adjustmentDraft.date);
        if (adjustmentDraft.endDate && adjustmentDraft.endDate < adjustmentDraft.date) throw new Error('结束日期不能早于开始日期');
        if (adjustmentDraft.type === 'custom' && !adjustmentDraft.lessons) adjustmentDraft.lessons = ToolkitSchedule.forDate(state, adjustmentDraft.date);
        adjustmentStep = 2; render();
      } catch (error) { showToast(error.message); }
      return;
    }
    const request = { ...structuredClone(adjustmentDraft), id: uid() };
    request.description = [request.date, request.lessonId ? ToolkitSchedule.forDate(state, request.date).find(row => row.id === request.lessonId)?.course : '', request.targetDate && ['swap','move','swap-day'].includes(request.type) ? `→ ${request.targetDate}` : '', request.targetLessonId && request.type === 'swap' ? ToolkitSchedule.forDate(state, request.targetDate).find(row => row.id === request.targetLessonId)?.course : ''].filter(Boolean).join(' ');
    previewAdjustment(request);
  });
  document.querySelectorAll('[data-undo-adjustment]').forEach(button => button.addEventListener('click', () => { adjustmentDraft = null; previewAdjustment({ type: 'undo', recordId: button.dataset.undoAdjustment }); }));
  document.querySelector('[data-cancel-adjustment]')?.addEventListener('click', () => navigate('schedule'));
  document.querySelector('[data-cancel-preview]')?.addEventListener('click', () => { adjustmentPreview = null; adjustmentStep = adjustmentDraft ? 2 : 0; render(); });
  document.querySelector('[data-confirm-adjustment]')?.addEventListener('click', async () => {
    if (adjustmentSaving) return;
    adjustmentSaving = true;
    const request = { ...adjustmentPreview.request, syncReminders: document.querySelector('#sync-adjustment-reminders')?.checked !== false };
    try {
      state = await api.adjustSchedule(request, adjustmentPreview.expected);
      adjustmentDraft = null;
      adjustmentPreview = null;
      currentView = 'schedule';
      showToast('实际课表已更新');
    } catch (error) { adjustmentPreview = null; adjustmentStep = adjustmentDraft ? 2 : 0; showToast(error.message); }
    finally { adjustmentSaving = false; render(); }
  });
}

function refreshActualSchedule(now) {
  const today = ToolkitSchedule.dateKey(now);
  const time = now.getHours() * 60 + now.getMinutes();
  document.querySelectorAll('[data-actual-date]').forEach(element => {
    const [hour, minute] = element.dataset.actualStart.split(':').map(Number);
    const start = hour * 60 + minute;
    element.classList.toggle('current', element.dataset.actualDate === today && time >= start && time < start + Number(element.dataset.actualDuration));
  });
}
