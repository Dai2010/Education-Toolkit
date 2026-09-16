const api = window.educationToolkit;
const app = document.querySelector('#app');
const title = document.querySelector('#page-title');
const backButton = document.querySelector('#back-btn');
const headerTime = document.querySelector('#header-time');
const toast = document.querySelector('#toast');

const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其它'];
const scheduleSubjects = [...subjects, '体育', '艺术', '早读', '信息技术', '通用技术', '活动课', '自习', '午练', '听力', '班会', '校本选修'];
const viewTitles = { home: '首页', random: '随机抽人', clock: '桌面时钟', assignments: '作业布置', settings: '设置与关于' };
let state;
let currentView = 'home';
let previousView = 'home';
let settingsTab = 'general';
let helpTopic = 'overview';
let editingAssignmentId = null;
let editingScheduleId = null;
let clockTimer;
let scheduleDay = ToolkitSchedule.weekday(new Date());
const todaySchedule = () => ToolkitSchedule.forDay(state.schedule, ToolkitSchedule.weekday(new Date()));

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatDate = (date) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
const formatDateTime = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '未设置时间';
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600); };
const save = async () => { state = await api.saveState(state); render(); };
const navigate = (view) => { if (view !== currentView) previousView = currentView; currentView = view; render(); };

function render() {
  document.documentElement.style.setProperty('--primary', state?.settings?.themeColor || '#8888CC');
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === currentView));
  title.textContent = viewTitles[currentView];
  backButton.style.visibility = currentView === 'home' ? 'hidden' : 'visible';
  app.innerHTML = views[currentView]();
  bindView();
}

function homeView() {
  const pending = state.assignments.filter((item) => !item.completed).length;
  return `<section class="view-heading"><div><div class="eyebrow">EDUCATION TOOLKIT</div><h1>今天要做什么？</h1><p>把课堂里常用的小工具，放在一个清晰的工作台上。</p></div></section>
    <div class="module-grid">
      <button class="module-card" data-go="random"><div class="module-icon"><img src="../assets/icons/random.svg" alt="" /></div><h2>随机抽人</h2><p>内置课堂随机抽人，直接使用工具包中的名单和抽取逻辑。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="clock"><div class="module-icon"><img src="../assets/icons/clock.svg" alt="" /></div><h2>桌面时钟</h2><p>保留 Elegant Clock 的核心时钟体验，并在下方显示下一节课和课间状态。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="assignments"><div class="module-icon"><img src="../assets/icons/homework.svg" alt="" /></div><h2>作业布置</h2><p>集中记录作业、上交时间和提醒状态，到点发送系统通知。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="settings"><div class="module-icon"><img src="../assets/icons/settings.svg" alt="" /></div><h2>设置与关于</h2><p>主题、铃声、开机自启动、桌面显示、名单、课表和帮助。</p><span class="arrow">→</span></button>
    </div>
    <div class="stats-row"><div class="stat"><span>待完成作业</span><strong>${pending}</strong></div><div class="stat"><span>今日课程</span><strong>${todaySchedule().length}</strong></div><div class="stat"><span>当前名单人数</span><strong>${state.names.length}</strong></div></div>`;
}

function randomView() {
  return `<section class="view-heading"><div><div class="eyebrow">CLASSROOM TOOL</div><h1>随机抽人</h1><p>使用当前名单进行课堂抽取，结果只在本机显示。</p></div></section>
    <div class="panel"><div class="panel-title"><div><h2>快速抽取</h2><p>当前名单：${esc(state.settings.selectedNameList)}</p></div><button class="btn btn-primary" data-action="draw">开始抽取</button></div><div id="draw-result" class="empty">点击“开始抽取”选择一位同学</div></div>
    <div class="panel"><div class="panel-title"><h2>名单预览</h2><button class="help-link" data-help="names">管理名单 →</button></div><div class="item-list">${state.names.slice(0, 8).map((person) => `<div class="list-item"><div><h3>${esc(person.name)}</h3><p>${esc(person.group || '未分组')}</p></div></div>`).join('') || '<div class="empty">还没有名单，请在设置中创建。</div>'}</div></div>`;
}

function scheduleSummary() {
  const result = ToolkitSchedule.summary(state.schedule);
  return { label: result.label === '未上课' ? '下一节课' : result.label, item: result.item };
}

function clockSummaryMarkup() {
  const result = ToolkitSchedule.summary(state.schedule);
  const current = result.label === '上课中' ? result.item : null;
  const next = result.label === '课间' ? result.next : null;
  const teacher = current ? (state.settings.subjectTeachers?.[current.subject] || '') : '';
  return `<span class="state-label">${esc(result.label)}</span>${current ? `<h2>${esc(current.course)}</h2>${teacher ? `<p>${esc(teacher)}</p>` : ''}` : ''}${next ? `<p>下一节：${esc(next.course)}<br><small>${esc(state.settings.subjectTeachers?.[next.subject] || '')} · ${esc(next.start)}</small></p>` : (!current && result.label !== '课间' ? '<p>下一节课程将在课间显示。</p>' : '')}`;
}

function clockView() {
  const schedule = todaySchedule();
  return `<section class="view-heading"><div><h1>桌面时钟</h1><p>桌面时钟随课表静默更新，不会因上下课弹到前台。</p></div><div class="inline-actions"><label class="setting-inline"><input id="desktop-clock-toggle" type="checkbox" ${(state.settings.desktopWidgetEnabled || state.settings.autostart) ? 'checked' : ''} /> 桌面时钟与作业状态</label><button class="btn btn-secondary" data-clock-tools>倒计时与提醒</button><button class="btn btn-primary" data-clock-settings>字体与时钟设置</button></div></section>
    <div class="clock-board"><div class="clock-face"><div class="time" id="clock-time">--:--:--</div><div class="date" id="clock-date">${formatDate(new Date())}</div></div><div class="panel next-class" id="clock-summary">${clockSummaryMarkup()}</div></div>
    <div class="panel"><div class="panel-title"><h2>今日课表 · ${schedule.length} 项</h2><button class="help-link" data-help="schedule">课表帮助 →</button></div>${schedule.length ? `<table class="schedule-table"><thead><tr><th>开始时间</th><th>课程</th><th>任课老师</th><th>时长</th></tr></thead><tbody>${schedule.map((item) => `<tr><td>${esc(item.start)}</td><td>${esc(item.course)}</td><td>${esc(state.settings.subjectTeachers?.[item.subject] || '—')}</td><td>${item.duration} 分钟</td></tr>`).join('')}</tbody></table>` : '<div class="empty">今天没有课程。</div>'}</div>`;
}

function assignmentForm() {
  const item = state.assignments.find((assignment) => assignment.id === editingAssignmentId) || {};
  return `<div class="panel"><div class="panel-title"><div><h2>${editingAssignmentId ? '编辑作业' : '添加作业'}</h2><p>名称必填；上交时间可以精确到日期和时间。</p></div></div><form id="assignment-form"><div class="form-grid"><div class="form-field full"><label for="assignment-name">名称 *</label><input id="assignment-name" name="name" required value="${esc(item.name)}" placeholder="例如：完成练习册第 12 页" /></div><div class="form-field"><label for="assignment-subject">科目</label><select id="assignment-subject" name="subject">${subjects.map((subject) => `<option ${item.subject === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select></div><div class="form-field"><label for="assignment-due">上交时间（可选）</label><input id="assignment-due" name="dueAt" type="datetime-local" value="${item.dueAt ? item.dueAt.slice(0, 16) : ''}" /></div><div class="form-field"><label for="assignment-lesson">按课表提醒（可选）</label><select id="assignment-lesson" name="lessonId"><option value="">不关联课表</option>${state.schedule.map((lesson) => `<option value="${esc(lesson.id)}" ${item.lessonId === lesson.id ? 'selected' : ''}>${lesson.weekday ? `星期${['一','二','三','四','五','六','日'][lesson.weekday - 1]} ` : '每天 '}${esc(lesson.start)} ${esc(lesson.course)}</option>`).join('')}</select></div><div class="form-field"><label for="assignment-relation">提醒时机</label><select id="assignment-relation" name="relation"><option value="before" ${item.relation !== 'after' ? 'selected' : ''}>上课前</option><option value="after" ${item.relation === 'after' ? 'selected' : ''}>上课后</option></select></div></div><div class="actions"><button class="btn btn-ghost" type="button" data-action="cancel-assignment">取消</button><button class="btn btn-primary" type="submit">保存作业</button></div></form></div>`;
}

function assignmentsView() {
  const items = [...state.assignments].sort((a, b) => Number(a.completed) - Number(b.completed) || String(a.dueAt).localeCompare(String(b.dueAt)));
  return `<section class="view-heading"><div><div class="eyebrow">HOMEWORK HUB</div><h1>作业布置</h1><p>清楚记录每项作业，提醒通过系统通知送达。</p></div><div class="inline-actions"><label class="setting-inline"><input id="homework-widget-toggle" type="checkbox" ${state.settings.homeworkWidgetEnabled ? 'checked' : ''} /> 始终显示桌面作业状态</label><button class="btn btn-primary" data-action="new-assignment">＋ 添加作业</button></div></section>${editingAssignmentId === 'new' || editingAssignmentId ? assignmentForm() : ''}
    <div class="panel"><div class="panel-title"><div><h2>作业列表</h2><p>${items.filter((item) => !item.completed).length} 项待完成</p></div></div><div class="item-list">${items.length ? items.map((item) => `<div class="list-item ${item.completed ? 'done' : ''}"><div><h3>${esc(item.name)}</h3><p>${esc(item.subject || '其它')} · ${formatDateTime(item.dueAt)}${item.lessonLabel ? ` · ${esc(item.lessonLabel)}` : ''}</p></div><div class="inline-actions"><label class="switch" title="标记完成"><input type="checkbox" data-complete="${esc(item.id)}" ${item.completed ? 'checked' : ''} /><span class="slider"></span></label><button class="btn btn-ghost" data-edit-assignment="${esc(item.id)}">编辑</button><button class="btn btn-danger" data-delete-assignment="${esc(item.id)}">删除</button></div></div>`).join('') : '<div class="empty">还没有作业，点击右上角添加第一项。</div>'}</div></div>`;
}

function namesSection() {
  return `<div class="setting-section ${settingsTab === 'names' ? 'active' : ''}" data-section="names"><div class="panel-title"><div><h2>名单管理</h2><p>支持导入 JSON 或手动创建名单。</p></div><button class="help-link" data-help="names">帮助</button></div><form id="name-form"><div class="form-grid"><div class="form-field"><label>姓名 *</label><input name="name" required placeholder="例如：林同学" /></div><div class="form-field"><label>分组</label><input name="group" placeholder="例如：一组" /></div></div><div class="actions"><button class="btn btn-secondary" type="button" data-action="import-names">导入 JSON</button><button class="btn btn-primary" type="submit">添加名单</button></div></form><div class="item-list" style="margin-top:18px">${state.names.map((person, index) => `<div class="list-item"><div><h3>${esc(person.name)}</h3><p>${esc(person.group || '未分组')}</p></div><button class="btn btn-danger" data-delete-name="${index}">删除</button></div>`).join('') || '<div class="empty">暂无名单。</div>'}</div></div>`;
}

function scheduleSection() {
  const item = state.schedule.find((lesson) => lesson.id === editingScheduleId) || { weekday: scheduleDay };
  const availableSubjects = [...new Set([...scheduleSubjects, ...state.schedule.map((row) => row.subject)])];
  return `<div class="setting-section ${settingsTab === 'schedule' ? 'active' : ''}" data-section="schedule"><div class="panel-title"><div><h2>课表管理</h2><p>老师按科目统一设置，老师姓名可以留空。</p></div><button class="help-link" data-help="schedule">帮助</button></div><div class="form-field"><label for="schedule-day">查看星期</label><select id="schedule-day">${['一','二','三','四','五','六','日'].map((day,index) => `<option value="${index+1}" ${scheduleDay === index+1 ? 'selected' : ''}>星期${day}</option>`).join('')}</select></div><form id="schedule-form"><div class="form-grid"><div class="form-field"><label>科目 *</label><select name="subject" required>${availableSubjects.map((subject) => `<option value="${esc(subject)}" ${item.subject === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select></div><div class="form-field"><label>课程名 *</label><input name="course" required value="${esc(item.course)}" /></div><div class="form-field"><label>星期（可选）</label><select name="weekday"><option value="">每天</option>${['一', '二', '三', '四', '五', '六', '日'].map((day, index) => `<option value="${index + 1}" ${Number(item.weekday) === index + 1 ? 'selected' : ''}>星期${day}</option>`).join('')}</select></div><div class="form-field"><label>任课老师（可留空）</label><input name="teacher" value="${esc(state.settings.subjectTeachers?.[item.subject || availableSubjects[0]] || '')}" placeholder="可不填写" /></div><div class="form-field"><label>开始时间 *</label><input name="start" type="time" required value="${esc(item.start)}" /></div><div class="form-field"><label>课程时长（分钟）</label><input name="duration" type="number" min="1" value="${Number(item.duration ?? 40)}" /></div><div class="form-field"><label>课间时长（分钟）</label><input name="breakDuration" type="number" min="0" value="${Number(item.breakDuration ?? 10)}" /></div></div><div class="actions"><button class="btn btn-secondary" type="button" data-action="import-schedule">导入 JSON</button>${editingScheduleId ? '<button class="btn btn-ghost" type="button" data-action="cancel-schedule">取消编辑</button>' : ''}<button class="btn btn-primary" type="submit">${editingScheduleId ? '保存课程' : '添加课程'}</button></div></form><div class="item-list" style="margin-top:18px">${ToolkitSchedule.forDay(state.schedule, scheduleDay).map((lesson) => `<div class="list-item"><div><h3>${esc(lesson.start)} · ${esc(lesson.course)}</h3><p>${lesson.weekday ? `星期${['一', '二', '三', '四', '五', '六', '日'][lesson.weekday - 1]} · ` : ''}${esc(lesson.subject || '其它')} · ${esc(state.settings.subjectTeachers?.[lesson.subject] || '未设置老师')} · ${Number(lesson.duration ?? 40)} 分钟 · 课间 ${Number(lesson.breakDuration ?? 10)} 分钟</p></div><div class="inline-actions"><button class="btn btn-ghost" data-edit-schedule="${esc(lesson.id)}">编辑</button><button class="btn btn-danger" data-delete-schedule="${esc(lesson.id)}">删除</button></div></div>`).join('') || '<div class="empty">暂无课程。</div>'}</div></div>`;
}

function helpView() {
  const topics = {
    overview: ['使用概览', '<p>Education Toolkit 将课堂常用工具集中在一个工作台中。首页卡片可以打开各模块，页面左上角返回键回到上一个界面。</p><p>不会创建？联系作者以获取帮助！（QQ:3361619396邮箱:dschuaweimate20@outlook.com或3361619396@qq.com）</p>'],
    random: ['随机抽人', '<p>随机抽人使用设置中的当前名单。名单可以手动添加、删除，也可以导入 JSON。</p><p>示例：<code>[{"name":"张同学","group":"一组"}]</code></p>'],
    clock: ['桌面时钟', '<p>桌面时钟直接嵌入 Elegant Clock，保留原有倒计时、字体和时钟设置。课表状态会显示在时间下方，并标记上课中、课间和放学状态。</p><p>开机自启动可在常规设置中检测和调整。</p>'],
    assignments: ['作业布置', '<p>作业名称必填，科目和上交时间可选。提醒可以直接填写日期时间，也可以关联课表并选择上课前或上课后。</p><p>到点后只发送系统通知，不播放铃声。桌面作业状态默认关闭，开启后可拖动右侧小方块并手动展开或收缩。</p>'],
    names: ['名单管理', '<p>名单支持姓名、分组和 JSON 导入。随机抽人使用当前名单；删除名单后会立即同步到所有模块。</p>'],
    schedule: ['课表管理', '<p>课程包含科目、课程名、开始时间、课程时长和课间时长，默认课程 40 分钟、课间 10 分钟。</p><p>任课老师按科目统一设置，可留空。星期用 weekday 表示，1 至 7 为周一至周日；省略则每天重复。subjectTeachers 为科目与老师对照，schedule 为全部课程。导入会检查时间重叠；零分钟课间会保留。JSON 示例：</p><p><code>[{"subject":"数学","course":"数学","start":"08:00","duration":40,"breakDuration":10}]</code></p>'],
    settings: ['设置与更新', '<p>常规设置包含主题色、默认音频路径、全局更新和开机自启动。主题色默认是 <code>#8888CC</code>。</p><p>帮助文件支持导入 Markdown；导入内容只在当前帮助页预览。</p>']
  };
  const [titleText, content] = topics[helpTopic] || topics.overview;
  return `<div class="setting-section ${settingsTab === 'help' ? 'active' : ''}" data-section="help"><div class="panel-title"><div><h2>模块帮助</h2><p>从左侧选择模块查看对应说明。</p></div></div><div class="help-layout"><nav class="help-nav">${Object.entries(topics).map(([key, value]) => `<button class="help-nav-item ${helpTopic === key ? 'active' : ''}" data-help-topic="${key}">${value[0]}</button>`).join('')}</nav><div class="panel help-copy"><h2>${titleText}</h2>${content}${helpTopic === 'overview' ? '<div class="actions"><button class="btn btn-secondary" data-action="import-markdown">导入 Markdown 帮助</button></div><div id="markdown-preview"></div>' : ''}</div></div></div>`;
}

function settingsView() {
  return `<section class="view-heading"><div><div class="eyebrow">WORKSPACE SETTINGS</div><h1>设置与关于</h1><p>将工具调整成适合你课堂节奏的样子。</p></div></section><div class="settings-layout"><nav class="settings-tabs">${[['general', '常规设置'], ['names', '名单管理'], ['schedule', '课表管理'], ['help', '帮助与关于']].map(([key, label]) => `<button class="settings-tab ${settingsTab === key ? 'active' : ''}" data-settings-tab="${key}">${label}</button>`).join('')}</nav><div class="settings-content"><div class="setting-section ${settingsTab === 'general' ? 'active' : ''}" data-section="general"><div class="panel"><div class="panel-title"><div><h2>外观与提醒</h2><p>颜色会立即应用到整个工具包。</p></div></div><div class="setting-row"><div><h3>主题颜色</h3><p>默认颜色为 #8888CC</p></div><input id="theme-color" class="color-input" type="color" value="${esc(state.settings.themeColor)}" /></div><div class="setting-row"><div><h3>默认铃声</h3><p>${esc(state.settings.ringtonePath || 'lofi-beats.mp3（FileGator）')}</p></div><button class="btn btn-secondary" data-action="pick-ringtone">选择铃声</button></div><div class="setting-row"><div><h3>全局更新</h3><p>打开最新版本发布页检查更新。</p></div><button class="btn btn-secondary" data-action="check-updates">检查更新</button></div><div class="setting-row"><div><h3>开机自启动</h3><p id="autostart-copy">正在检测系统状态…</p></div><label class="switch"><input id="autostart-toggle" type="checkbox" ${state.settings.autostart ? 'checked' : ''} /><span class="slider"></span></label></div></div></div>${namesSection()}${scheduleSection()}${helpView()}</div></div>`;
}
const views = { home: homeView, random: randomView, clock: clockView, assignments: assignmentsView, settings: settingsView };

function bindView() {
  document.querySelectorAll('[data-go]').forEach((element) => element.addEventListener('click', () => navigate(element.dataset.go)));
  document.querySelectorAll('[data-settings-tab]').forEach((element) => element.addEventListener('click', () => { settingsTab = element.dataset.settingsTab; render(); if (settingsTab === 'general') api.getAutostartStatus().then((status) => { const copy = document.querySelector('#autostart-copy'); if (copy) copy.textContent = status ? '系统当前已开启' : '系统当前未开启'; }); }));
  document.querySelectorAll('[data-help]').forEach((element) => element.addEventListener('click', () => { helpTopic = element.dataset.help; settingsTab = 'help'; navigate('settings'); }));
  document.querySelectorAll('[data-help-topic]').forEach((element) => element.addEventListener('click', () => { helpTopic = element.dataset.helpTopic; render(); }));
  document.querySelector('[data-action="new-assignment"]')?.addEventListener('click', () => { editingAssignmentId = 'new'; render(); });
  document.querySelector('[data-action="cancel-assignment"]')?.addEventListener('click', () => { editingAssignmentId = null; render(); });
  document.querySelector('#assignment-form')?.addEventListener('submit', onAssignmentSubmit);
  document.querySelectorAll('[data-delete-assignment]').forEach((element) => element.addEventListener('click', async () => { state.assignments = state.assignments.filter((item) => item.id !== element.dataset.deleteAssignment); await save(); showToast('作业已删除'); }));
  document.querySelectorAll('[data-edit-assignment]').forEach((element) => element.addEventListener('click', () => { editingAssignmentId = element.dataset.editAssignment; render(); }));
  document.querySelectorAll('[data-complete]').forEach((element) => element.addEventListener('change', async () => { const item = state.assignments.find((assignment) => assignment.id === element.dataset.complete); if (item) item.completed = element.checked; await save(); }));
  document.querySelector('[data-action="draw"]')?.addEventListener('click', async () => { const result = document.querySelector('#draw-result'); if (!state.names.length) { result.textContent = '请先在设置中添加名单'; return; } const selected = await api.randomDraw(state.names); result.innerHTML = `<div style="font-size:30px;font-weight:700;color:var(--primary-dark)">${esc(selected.name)}</div><div style="margin-top:7px;color:var(--muted);font-size:13px">${esc(selected.group || '未分组')}</div>`; });
  document.querySelector('#theme-color')?.addEventListener('input', async (event) => { state.settings.themeColor = event.target.value; await save(); });
  document.querySelector('#homework-widget-toggle')?.addEventListener('change', async (event) => { state.settings.homeworkWidgetEnabled = event.target.checked; await save(); });
  document.querySelector('#desktop-clock-toggle')?.addEventListener('change', async (event) => { const enabled = event.target.checked; const actual = await api.setAutostart(enabled); state.settings.autostart = actual; state.settings.desktopWidgetEnabled = actual; state.settings.homeworkWidgetEnabled = enabled; if (!actual && enabled) event.target.checked = false; await save(); showToast(actual === enabled ? (enabled ? '已开启桌面时钟与作业状态' : '已关闭桌面显示和开机启动') : '开机启动未能修改，已保持关闭'); });
  document.querySelector('#autostart-toggle')?.addEventListener('change', async (event) => { const actual = await api.setAutostart(event.target.checked); state.settings.autostart = actual; event.target.checked = actual; const copy = document.querySelector('#autostart-copy'); if (copy) copy.textContent = actual ? '系统当前已开启' : '系统当前未开启'; showToast(actual ? '已开启开机自启动' : '已关闭开机自启动'); });
  document.querySelector('[data-action="import-markdown"]')?.addEventListener('click', async () => { const text = await api.importMarkdown(); if (text) { const preview = document.querySelector('#markdown-preview'); if (preview) preview.innerHTML = markdownToHtml(text); showToast('Markdown 已载入'); } });
  document.querySelector('[data-action="check-updates"]')?.addEventListener('click', async () => { await api.checkForUpdates(); showToast('已打开更新页面'); });
  document.querySelector('[data-action="pick-ringtone"]')?.addEventListener('click', async () => { const selected = await api.pickRingtone(); if (selected) { state.settings.ringtonePath = selected; await save(); showToast('铃声已更新'); } });
  document.querySelector('#name-form')?.addEventListener('submit', onNameSubmit);
  document.querySelector('[data-action="import-names"]')?.addEventListener('click', importNames);
  document.querySelectorAll('[data-delete-name]').forEach((element) => element.addEventListener('click', async () => { state.names.splice(Number(element.dataset.deleteName), 1); state.nameLists[0].names = state.names; await save(); }));
  document.querySelector('#schedule-form')?.addEventListener('submit', onScheduleSubmit);
  document.querySelector('#schedule-day')?.addEventListener('change', (event) => { scheduleDay = Number(event.target.value); editingScheduleId = null; render(); });
  document.querySelector('#schedule-form [name="subject"]')?.addEventListener('change', (event) => { document.querySelector('#schedule-form [name="teacher"]').value = state.settings.subjectTeachers?.[event.target.value] || ''; });
  document.querySelector('[data-clock-tools]')?.addEventListener('click', () => api.openClockTools());
  document.querySelector('[data-clock-settings]')?.addEventListener('click', () => api.openClockSettings());
  document.querySelector('[data-action="import-schedule"]')?.addEventListener('click', importSchedule);
  document.querySelector('[data-action="cancel-schedule"]')?.addEventListener('click', () => { editingScheduleId = null; render(); });
  document.querySelectorAll('[data-edit-schedule]').forEach((element) => element.addEventListener('click', () => { editingScheduleId = element.dataset.editSchedule; render(); }));
  document.querySelectorAll('[data-delete-schedule]').forEach((element) => element.addEventListener('click', async () => { state.schedule = state.schedule.filter((lesson) => lesson.id !== element.dataset.deleteSchedule); await save(); }));
  if (settingsTab === 'general') api.getAutostartStatus().then((status) => { const copy = document.querySelector('#autostart-copy'); if (copy) copy.textContent = status ? '系统当前已开启' : '系统当前未开启'; });
  startClock();
}

async function onAssignmentSubmit(event) {
  event.preventDefault(); const form = new FormData(event.target); const name = String(form.get('name') || '').trim(); if (!name) return;
  const lesson = state.schedule.find((item) => item.id === form.get('lessonId')); let dueAt = form.get('dueAt') ? new Date(form.get('dueAt')).toISOString() : '';
  if (!dueAt && lesson) dueAt = ToolkitSchedule.nextDue(lesson, form.get('relation'));
  const payload = { id: editingAssignmentId === 'new' ? uid() : editingAssignmentId, name, subject: form.get('subject'), dueAt, relation: form.get('relation'), lessonId: form.get('lessonId'), lessonLabel: lesson ? `${lesson.start} ${lesson.course}` : '', completed: false, remindedAt: '' };
  const index = state.assignments.findIndex((item) => item.id === editingAssignmentId); if (index >= 0) payload.completed = state.assignments[index].completed; if (index >= 0) state.assignments[index] = payload; else state.assignments.push(payload); editingAssignmentId = null; await save(); showToast('作业已保存');
}

async function onNameSubmit(event) { event.preventDefault(); const form = new FormData(event.target); const name = String(form.get('name') || '').trim(); if (!name) return; state.names.push({ name, group: String(form.get('group') || '').trim() }); state.nameLists[0].names = state.names; await save(); event.target.reset(); showToast('名单已添加'); }
async function importNames() { try { const data = await api.importJson(); if (!data) return; const names = Array.isArray(data) ? data : data.names; if (!Array.isArray(names)) throw new Error('名单 JSON 应为数组或包含 names 数组'); state.names = names.map((item) => typeof item === 'string' ? { name: item, group: '' } : { name: item.name, group: item.group || '' }).filter((item) => item.name); state.nameLists[0].names = state.names; await save(); showToast(`已导入 ${state.names.length} 人`); } catch (error) { showToast(`导入失败：${error.message}`); } }
async function onScheduleSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const subject = String(form.get('subject') || '其它');
  const payload = { id: editingScheduleId || uid(), subject, course: String(form.get('course') || '').trim(), start: form.get('start'), duration: Number(form.get('duration') || 40), breakDuration: Number(form.get('breakDuration') || 0), ...(form.get('weekday') ? { weekday: Number(form.get('weekday')) } : {}) };
  const rows = state.schedule.filter((row) => row.id !== editingScheduleId).concat(payload);
  try {
    const normalized = ToolkitSchedule.normalize({ schedule: rows, subjectTeachers: { ...state.settings.subjectTeachers, [subject]: String(form.get('teacher') || '').trim() } });
    const next = { ...state, schedule: normalized.schedule, settings: { ...state.settings, subjectTeachers: normalized.subjectTeachers } };
    state = await api.saveState(next);
    editingScheduleId = null;
    render();
    showToast('课程已保存');
  } catch (error) { showToast(`保存失败：${error.message}`); }
}

async function importSchedule() { try { const data = await api.importJson(); if (!data) return; const normalized = ToolkitSchedule.normalize(data); const next = { ...state, schedule: normalized.schedule, settings: { ...state.settings, subjectTeachers: { ...state.settings.subjectTeachers, ...normalized.subjectTeachers } } }; state = await api.saveState(next); render(); showToast(`已导入 ${state.schedule.length} 节课`); } catch (error) { showToast(`导入失败：${error.message}`); } }

function markdownToHtml(markdown) { return String(markdown || '').split(/\r?\n/).map((line) => { const escaped = esc(line); if (escaped.startsWith('### ')) return `<h3>${escaped.slice(4)}</h3>`; if (escaped.startsWith('## ')) return `<h2>${escaped.slice(3)}</h2>`; if (escaped.startsWith('# ')) return `<h1>${escaped.slice(2)}</h1>`; if (/^- /.test(escaped)) return `<li>${escaped.slice(2)}</li>`; return escaped ? `<p>${escaped}</p>` : ''; }).join(''); }

function startClock() { clearInterval(clockTimer); let lastDay = ToolkitSchedule.weekday(new Date()); const tick = () => { const now = new Date(); const currentDay = ToolkitSchedule.weekday(now); if (currentDay !== lastDay) { lastDay = currentDay; render(); return; } const summary = document.querySelector('#clock-summary'); if (summary) summary.innerHTML = clockSummaryMarkup(); headerTime.textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now); const dateElement = document.querySelector('#clock-date'); const timeElement = document.querySelector('#clock-time'); if (dateElement) dateElement.textContent = formatDate(now); if (timeElement) timeElement.textContent = now.toLocaleTimeString('zh-CN', { hour12: false }); }; tick(); clockTimer = setInterval(tick, 1000); }

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => navigate(item.dataset.view)));
backButton.addEventListener('click', () => { currentView = previousView || 'home'; render(); });
api.onNavigate((view) => { if (viewTitles[view]) navigate(view); });
api.onReminderDue(({ assignment }) => { showToast(`作业提醒：${assignment.name}`); });
api.onStateUpdated((next) => { state = next; render(); });
api.getState().then((next) => { state = next; render(); });
