const api = window.educationToolkit;
const app = document.querySelector('#app');
const title = document.querySelector('#page-title');
const backButton = document.querySelector('#back-btn');
const headerTime = document.querySelector('#header-time');
const toast = document.querySelector('#toast');

const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '政治', '地理', '其它'];
const scheduleSubjects = [...subjects, '体育', '艺术', '早读', '信息技术', '通用技术', '活动课', '自习', '午练', '听力', '班会', '校本选修'];
const viewTitles = { home: '首页', random: '随机抽人', clock: '桌面时钟', schedule: '课表', assignments: '作业布置', settings: '设置与关于' };
let state = { settings: {}, names: [], schedule: [], assignments: [], drawnIds: [] };
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

function getGreeting() {
  const hour = new Date().getHours();
  
  const greetings = {
    '早上': [
      "早上好呀！新的一天开始啦～ (｀・ω・´)",
      "早安！今天也要元气满满哦～",
      "早上好！要不要先看看今天的课表？",
      "新的一天开始了！准备好上课了吗？",
      "早安～今天的作业都做完了吗？(｀・ω・´)",
      "早上好！愿你今天收获满满～",
      "清晨好呀～看看今天有什么安排吧！",
      "早上好！记得吃早餐再开始学习哦～"
    ],
    '上午': [
      "上午好！上课认真听讲哦～ (◕‿◕)",
      "上午好！学习进展如何啦？",
      "已经上了几节课啦？休息一下～",
      "上午好！记得多喝水保持精力充沛～",
      "继续加油！上午最适合学习了～",
      "上午好～课间记得活动一下身体哦！",
      "学习进行中～看看今天的作业？",
      "上午好！专注学习的你最棒啦～"
    ],
    '中午': [
      "中午好！该吃午饭啦～ (´・ω・`)",
      "午安！记得好好休息，下午才有精力哦～",
      "中午啦！吃饱才有力气继续学习～",
      "午安～要不要小憩一会儿？",
      "中午好！今天的午餐吃什么呢？",
      "该休息啦～劳逸结合才能学得更好！",
      "午安！放松一下，给大脑充充电～",
      "中午好～下午还有课要上哦！"
    ],
    '下午': [
      "下午好！继续努力吧～ (｀・ω・´)",
      "下午好！距离放学还有一会儿～",
      "下午好～还剩几节课就放学啦！",
      "下午啦！坚持住，胜利就在前方～",
      "下午好！今天的作业记得记录哦～",
      "下午好～看看今天布置了什么作业？",
      "下午时光～学习别忘了劳逸结合！",
      "下午好！保持专注，你可以的～"
    ],
    '傍晚': [
      "傍晚好！先去吃个饭吧～ (´｡• ᵕ •｡`)",
      "该吃晚饭啦！补充能量准备晚自习～",
      "傍晚啦～吃完饭还有晚自习要上呢！",
      "晚饭时间到！吃饱了才有精神～",
      "傍晚好～趁晚自习前休息一下吧！",
      "一天课程告一段落！准备晚自习了～",
      "傍晚时分～先吃饭，晚自习不着急！",
      "晚上好！记得吃饭，晚自习还要加油～"
    ],
    '晚自习': [
      "晚自习时间！加油完成作业吧～ (｀・ω・´)",
      "晚自习中～今天的作业都记下来了吗？",
      "晚自习啦～安静学习，效率更高哦！",
      "晚上好！晚自习要专心致志～",
      "晚自习时光～争取把作业都写完吧！",
      "现在是晚自习～整理一下今天的笔记？",
      "晚自习进行中～别忘了复习今天的内容！",
      "晚上好～晚自习认真学习最帅啦！"
    ],
    '晚上': [
      "晚自习结束啦！今天辛苦了～ (´｡• ω •｡`)",
      "该回家休息啦～今天收获了什么呢？",
      "晚上好！作业都完成了吗？",
      "辛苦一天了～该准备洗漱睡觉啦！",
      "晚上啦～早点休息才能明天精神饱满～",
      "终于可以休息了！检查明天要带的东西吧～",
      "晚上好～别忘了预习明天的课程哦！",
      "一天结束啦！早点睡，明天见～ (´ω`)"
    ],
    '深夜': [
      "夜深了...还不睡吗？(´；ω；`)",
      "都这么晚了...明天还要上课呢！",
      "该睡觉啦！熬夜对身体不好哦～",
      "已经很晚了...作业明天再写吧！",
      "深夜了...快去睡觉，别熬夜啦！(｀-ω-´)",
      "这么晚还在学习？注意休息呀～",
      "夜深人静...该关电脑睡觉啦！",
      "都几点了...赶紧去睡觉！(つω-`)"
    ]
  };
  
  let period;
  if (hour >= 5 && hour < 9) period = '早上';
  else if (hour >= 9 && hour < 12) period = '上午';
  else if (hour >= 12 && hour < 14) period = '中午';
  else if (hour >= 14 && hour < 18) period = '下午';
  else if (hour >= 18 && hour < 19) period = '傍晚';
  else if (hour >= 19 && hour < 21 || (hour === 21 && new Date().getMinutes() < 30)) period = '晚自习';
  else if ((hour === 21 && new Date().getMinutes() >= 30) || hour === 22) period = '晚上';
  else period = '深夜';
  
  const messages = greetings[period];
  return messages[Math.floor(Math.random() * messages.length)];
}

function homeView() {
  const pending = state.assignments.filter((item) => !item.completed).length;
  const greeting = getGreeting();
  return `<section class="view-heading"><div><div class="eyebrow">EDUCATION TOOLKIT</div><h1>${esc(greeting)}</h1><p>把课堂里常用的小工具，放在一个清晰的工作台上。</p></div></section>
    <div class="module-grid">
      <button class="module-card" data-go="random"><div class="module-icon"><img src="../assets/icons/random.svg" alt="" /></div><h2>随机抽人</h2><p>内置课堂随机抽人，直接使用工具包中的名单和抽取逻辑。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="clock"><div class="module-icon"><img src="../assets/icons/clock.svg" alt="" /></div><h2>桌面时钟</h2><p>保留 Elegant Clock 的核心时钟体验，并在下方显示下一节课和课间状态。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="assignments"><div class="module-icon"><img src="../assets/icons/homework.svg" alt="" /></div><h2>作业布置</h2><p>集中记录作业、上交时间和提醒状态，到点发送系统通知。</p><span class="arrow">→</span></button>
      <button class="module-card" data-go="settings"><div class="module-icon"><img src="../assets/icons/settings.svg" alt="" /></div><h2>设置与关于</h2><p>主题、铃声、开机自启动、桌面显示、名单、课表和帮助。</p><span class="arrow">→</span></button>
    </div>
    <div class="stats-row"><div class="stat"><span>待完成作业</span><strong>${pending}</strong></div><div class="stat"><span>今日课程</span><strong>${todaySchedule().length}</strong></div><div class="stat"><span>当前名单人数</span><strong>${state.names.length}</strong></div></div>`;
}

function randomView() {
  const mode = state.settings.drawMode || 'single';
  const continuous = state.settings.drawContinuous || false;
  const remaining = continuous ? state.names.length - (state.drawnIds?.length || 0) : state.names.length;
  const drawn = state.drawnIds?.length || 0;
  
  return `<section class="view-heading"><div><div class="eyebrow">CLASSROOM TOOL</div><h1>随机抽人</h1><p>使用当前名单进行课堂抽取，支持单人和分组模式。</p></div><div class="inline-actions"><button class="help-link" data-help="random">抽取设置 →</button></div></section>
    <div class="panel"><div class="panel-title"><div><h2>抽取控制</h2><p>当前名单：${esc(state.settings.selectedNameList)} · ${state.names.length} 人${continuous ? ` · 已抽 ${drawn} 人 · 剩余 ${remaining} 人` : ''}</p></div><div class="inline-actions">${continuous ? '<button class="btn btn-secondary" data-action="reset-drawn">重置记录</button>' : ''}<button class="btn btn-primary" data-action="draw">开始抽取</button></div></div><div class="draw-controls"><label class="setting-inline"><input type="radio" name="draw-mode" value="single" ${mode === 'single' ? 'checked' : ''} data-draw-mode /> 单人模式</label><label class="setting-inline"><input type="radio" name="draw-mode" value="group" ${mode === 'group' ? 'checked' : ''} data-draw-mode /> 分组模式</label>${mode === 'group' ? `<div class="draw-group-settings"><label>每组 <input type="number" min="1" max="${state.names.length}" value="${state.settings.drawGroupSize || 1}" data-group-size style="width:60px" /> 人</label><label>共 <input type="number" min="1" max="20" value="${state.settings.drawGroupCount || 1}" data-group-count style="width:60px" /> 组</label></div>` : ''}<label class="setting-inline"><input type="checkbox" ${continuous ? 'checked' : ''} data-draw-continuous /> 连续不重复抽取</label></div><div id="draw-result" class="draw-result empty">点击"开始抽取"选择同学</div></div>
    <div class="panel"><div class="panel-title"><h2>名单预览 · ${state.names.length} 人</h2><button class="help-link" data-help="names">管理名单 →</button></div><div class="item-list">${state.names.map((person, index) => `<div class="list-item ${continuous && state.drawnIds?.includes(index) ? 'drawn' : ''}"><div><h3>${esc(person.name)}</h3><p>${esc(person.group || '未分组')}${continuous && state.drawnIds?.includes(index) ? ' · 已抽取' : ''}</p></div></div>`).join('') || '<div class="empty">还没有名单，请在设置中创建。</div>'}</div></div>`;
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
  return `<section class="view-heading"><div><div class="eyebrow">DESKTOP CLOCK</div><h1>桌面时钟</h1><p>显示时间和当前课程状态；完整课表请进入“课表”区域查看。</p></div></section>
    <div class="panel clock-controls"><div class="panel-title"><div><h2>时钟控制</h2><p>时钟外观、倒计时、提醒和更新使用 Elegant Clock 的功能。</p></div><div class="inline-actions"><button class="btn btn-secondary" data-clock-tools>倒计时与提醒</button><button class="btn btn-secondary" data-clock-update>检查更新</button><button class="btn btn-primary" data-clock-settings>时钟设置</button></div></div></div>
    <div class="clock-board"><div class="clock-face"><div class="time" id="clock-time">--:--:--</div><div class="date" id="clock-date">${formatDate(new Date())}</div></div><div class="panel next-class" id="clock-summary">${clockSummaryMarkup()}</div></div>`;
}

function scheduleView() {
  settingsTab = 'schedule';
  const weekSchedule = buildWeekSchedule();
  return `<section class="view-heading"><div><div class="eyebrow">CLASS SCHEDULE</div><h1>课表</h1><p>完整查看、编辑和导入课表。课表状态会同步到桌面时钟。</p></div><button class="help-link" data-help="schedule">课表帮助 →</button></section>
    <div class="panel"><div class="panel-title"><div><h2>完整周课表</h2><p>当前课程会随系统时间自动高亮。</p></div></div>${weekSchedule.periods.length ? renderWeekSchedule(weekSchedule) : '<div class="empty">还没有课表，请在下方添加或导入。</div>'}</div>
    ${scheduleSection(true)}`;
}

function buildWeekSchedule() {
  // 获取所有时间段（不包含重复时间）
  const timeSet = new Set();
  state.schedule.forEach(lesson => {
    timeSet.add(lesson.start);
  });
  
  const periods = Array.from(timeSet).sort((a, b) => {
    const [ha, ma] = a.split(':').map(Number);
    const [hb, mb] = b.split(':').map(Number);
    return (ha * 60 + ma) - (hb * 60 + mb);
  });
  
  // 为每天每个时间段组织课程
  const grid = {};
  for (let day = 1; day <= 7; day++) {
    grid[day] = {};
    const dayLessons = ToolkitSchedule.forDay(state.schedule, day);
    dayLessons.forEach(lesson => {
      grid[day][lesson.start] = lesson;
    });
  }
  
  return { periods, grid };
}

function renderWeekSchedule(weekSchedule) {
  const { periods, grid } = weekSchedule;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const now = new Date();
  const today = ToolkitSchedule.weekday(now);
  const currentStatus = ToolkitSchedule.summary(state.schedule, now);
  
  // 判断当前正在上的课或课间相邻的课
  const isCurrentLesson = (lesson) => {
    if (!lesson) return false;
    
    // 检查是否是今天的课（没有weekday表示每天重复，或weekday匹配今天）
    const isToday = !lesson.weekday || lesson.weekday === today;
    if (!isToday) return false;
    
    if (currentStatus.label === '上课中' && currentStatus.item) {
      return lesson.id === currentStatus.item.id;
    }
    
    if (currentStatus.label === '课间' && (currentStatus.item || currentStatus.next)) {
      // 课间时高亮前一节课和下一节课
      return (currentStatus.item && lesson.id === currentStatus.item.id) ||
             (currentStatus.next && lesson.id === currentStatus.next.id);
    }
    
    return false;
  };
  
  return `<div class="week-schedule">
    <div class="week-schedule-header">
      <div class="time-header">节次</div>
      ${weekdays.map((day, index) => 
        `<div class="day-header ${today === index + 1 ? 'today' : ''}" data-day="${index + 1}">周${day}</div>`
      ).join('')}
    </div>
    <div class="week-schedule-body">
      ${periods.map((time, periodIndex) => `
        <div class="schedule-row">
          <div class="period-time">
            <div class="period-number">${periodIndex + 1}</div>
            <div class="time-label">${time}</div>
          </div>
          ${weekdays.map((_, dayIndex) => {
            const lesson = grid[dayIndex + 1]?.[time];
            if (lesson) {
              const teacher = state.settings.subjectTeachers?.[lesson.subject] || '';
              const isCurrent = isCurrentLesson(lesson);
        return `<div class="lesson-cell filled ${isCurrent ? 'current' : ''}" data-lesson-id="${esc(lesson.id)}" data-lesson-day="${dayIndex + 1}">
                <div class="lesson-name">${esc(lesson.course)}</div>
                ${teacher ? `<div class="lesson-teacher">${esc(teacher)}</div>` : ''}
              </div>`;
            }
            return `<div class="lesson-cell empty"></div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>
  </div>`;
}

function assignmentForm() {
  const item = state.assignments.find((assignment) => assignment.id === editingAssignmentId) || {};
  return `<div class="panel"><div class="panel-title"><div><h2>${editingAssignmentId ? '编辑作业' : '添加作业'}</h2><p>名称必填；上交时间可以精确到日期和时间。</p></div></div><form id="assignment-form"><div class="form-grid"><div class="form-field full"><label for="assignment-name">名称 *</label><input id="assignment-name" name="name" required value="${esc(item.name)}" placeholder="例如：完成练习册第 12 页" /></div><div class="form-field"><label for="assignment-subject">科目</label><select id="assignment-subject" name="subject">${subjects.map((subject) => `<option ${item.subject === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select></div><div class="form-field"><label for="assignment-due">上交时间（可选）</label><input id="assignment-due" name="dueAt" type="datetime-local" value="${item.dueAt ? item.dueAt.slice(0, 16) : ''}" /></div><div class="form-field"><label for="assignment-lesson">按课表提醒（可选）</label><select id="assignment-lesson" name="lessonId"><option value="">不关联课表</option>${state.schedule.map((lesson) => `<option value="${esc(lesson.id)}" ${item.lessonId === lesson.id ? 'selected' : ''}>${lesson.weekday ? `星期${['一','二','三','四','五','六','日'][lesson.weekday - 1]} ` : '每天 '}${esc(lesson.start)} ${esc(lesson.course)}</option>`).join('')}</select></div><div class="form-field"><label for="assignment-relation">提醒时机</label><select id="assignment-relation" name="relation"><option value="before" ${item.relation !== 'after' ? 'selected' : ''}>上课前</option><option value="after" ${item.relation === 'after' ? 'selected' : ''}>上课后</option></select></div></div><div class="actions"><button class="btn btn-ghost" type="button" data-action="cancel-assignment">取消</button><button class="btn btn-primary" type="submit">保存作业</button></div></form></div>`;
}

function assignmentsView() {
  const items = [...state.assignments].sort((a, b) => {
    // 先按完成状态排序：未完成在前
    if (a.completed !== b.completed) {
      return Number(a.completed) - Number(b.completed);
    }
    
    // 再按上交时间排序：有时间的在前，时间早的在前
    const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return aTime - bTime;
  });
  
  return `<section class="view-heading"><div><div class="eyebrow">HOMEWORK HUB</div><h1>作业布置</h1><p>清楚记录每项作业，提醒通过系统通知送达。</p></div><div class="inline-actions"><label class="setting-inline"><input id="homework-widget-toggle" type="checkbox" ${state.settings.homeworkWidgetEnabled ? 'checked' : ''} /> 始终显示桌面作业状态</label><button class="btn btn-primary" data-action="new-assignment">＋ 添加作业</button></div></section>${editingAssignmentId === 'new' || editingAssignmentId ? assignmentForm() : ''}
    <div class="panel assignments-panel"><div class="panel-title"><div><h2>作业列表</h2><p>${items.filter((item) => !item.completed).length} 项待完成</p></div></div><div class="assignment-list">${items.length ? items.map((item) => `<div class="assignment-item ${item.completed ? 'done' : ''}"><div class="assignment-content"><h3 class="assignment-name">${esc(item.name)}</h3><p class="assignment-meta">${esc(item.subject || '其它')} · ${formatDateTime(item.dueAt)}${item.lessonLabel ? ` · ${esc(item.lessonLabel)}` : ''}</p></div><div class="assignment-actions"><label class="switch" title="标记完成"><input type="checkbox" data-complete="${esc(item.id)}" ${item.completed ? 'checked' : ''} /><span class="slider"></span></label><button class="btn btn-ghost" data-edit-assignment="${esc(item.id)}">编辑</button><button class="btn btn-danger" data-delete-assignment="${esc(item.id)}">删除</button></div></div>`).join('') : '<div class="empty">还没有作业，点击右上角添加第一项。</div>'}</div></div>`;
}

function namesSection() {
  return `<div class="setting-section ${settingsTab === 'names' ? 'active' : ''}" data-section="names"><div class="panel-title"><div><h2>名单管理</h2><p>支持导入 JSON 或手动创建名单。</p></div><button class="help-link" data-help="names">帮助</button></div><form id="name-form"><div class="form-grid"><div class="form-field"><label>姓名 *</label><input name="name" required placeholder="例如：林同学" /></div><div class="form-field"><label>分组</label><input name="group" placeholder="例如：一组" /></div></div><div class="actions"><button class="btn btn-secondary" type="button" data-action="import-names">导入 JSON</button><button class="btn btn-primary" type="submit">添加名单</button></div></form><div class="item-list" style="margin-top:18px">${state.names.map((person, index) => `<div class="list-item"><div><h3>${esc(person.name)}</h3><p>${esc(person.group || '未分组')}</p></div><button class="btn btn-danger" data-delete-name="${index}">删除</button></div>`).join('') || '<div class="empty">暂无名单。</div>'}</div></div>`;
}

function scheduleSection(standalone = false) {
  const item = state.schedule.find((lesson) => lesson.id === editingScheduleId) || { weekday: scheduleDay };
  const availableSubjects = [...new Set([...scheduleSubjects, ...state.schedule.map((row) => row.subject)])];
  return `<div class="setting-section ${settingsTab === 'schedule' ? 'active' : ''}" data-section="schedule"><div class="panel-title"><div><h2>课表管理</h2><p>老师按科目统一设置，老师姓名可以留空。</p></div><button class="help-link" data-help="schedule">帮助</button></div><div class="form-field"><label for="schedule-day">查看星期</label><select id="schedule-day">${['一','二','三','四','五','六','日'].map((day,index) => `<option value="${index+1}" ${scheduleDay === index+1 ? 'selected' : ''}>星期${day}</option>`).join('')}</select></div><form id="schedule-form"><div class="form-grid"><div class="form-field"><label>科目 *</label><select name="subject" required>${availableSubjects.map((subject) => `<option value="${esc(subject)}" ${item.subject === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select></div><div class="form-field"><label>课程名 *</label><input name="course" required value="${esc(item.course)}" /></div><div class="form-field"><label>星期（可选）</label><select name="weekday"><option value="">每天</option>${['一', '二', '三', '四', '五', '六', '日'].map((day, index) => `<option value="${index + 1}" ${Number(item.weekday) === index + 1 ? 'selected' : ''}>星期${day}</option>`).join('')}</select></div><div class="form-field"><label>任课老师（可留空）</label><input name="teacher" value="${esc(state.settings.subjectTeachers?.[item.subject || availableSubjects[0]] || '')}" placeholder="可不填写" /></div><div class="form-field"><label>开始时间 *</label><input name="start" type="time" required value="${esc(item.start)}" /></div><div class="form-field"><label>课程时长（分钟）</label><input name="duration" type="number" min="1" value="${Number(item.duration ?? 40)}" /></div><div class="form-field"><label>课间时长（分钟）</label><input name="breakDuration" type="number" min="0" value="${Number(item.breakDuration ?? 10)}" /></div></div><div class="actions"><button class="btn btn-secondary" type="button" data-action="import-schedule">导入 JSON</button>${editingScheduleId ? '<button class="btn btn-ghost" type="button" data-action="cancel-schedule">取消编辑</button>' : ''}<button class="btn btn-primary" type="submit">${editingScheduleId ? '保存课程' : '添加课程'}</button></div></form><div class="item-list" style="margin-top:18px">${ToolkitSchedule.forDay(state.schedule, scheduleDay).map((lesson) => `<div class="list-item"><div><h3>${esc(lesson.start)} · ${esc(lesson.course)}</h3><p>${lesson.weekday ? `星期${['一', '二', '三', '四', '五', '六', '日'][lesson.weekday - 1]} · ` : ''}${esc(lesson.subject || '其它')} · ${esc(state.settings.subjectTeachers?.[lesson.subject] || '未设置老师')} · ${Number(lesson.duration ?? 40)} 分钟 · 课间 ${Number(lesson.breakDuration ?? 10)} 分钟</p></div><div class="inline-actions"><button class="btn btn-ghost" data-edit-schedule="${esc(lesson.id)}">编辑</button><button class="btn btn-danger" data-delete-schedule="${esc(lesson.id)}">删除</button></div></div>`).join('') || '<div class="empty">暂无课程。</div>'}</div></div>`;
}

function helpView() {
  const topics = {
    overview: ['先看这里', '<h3>日常使用顺序</h3><ol><li>在“设置与关于 → 课表”录入或导入课表。</li><li>在“设置与关于 → 名单管理”添加或导入学生名单。</li><li>需要时在“作业布置”记录作业和提醒时间。</li><li>上课时点击左侧对应区块，工具会保留当前页面。</li></ol><h3>启动后看不到主界面</h3><p>这是正常行为：应用启动后只显示桌面时钟。点击桌面时钟会打开主界面的“桌面时钟”区块；也可以从托盘菜单打开。</p>'],
    clock: ['桌面时钟', '<h3>这里显示什么</h3><p>这里显示当前时间、日期和当前课程状态。课表内容不放在时钟区，完整课表请点击左侧“课表”。</p><h3>时钟控制</h3><ul><li>“时钟设置”：调整字体、字号、透明度、置顶等时钟专属选项。</li><li>“倒计时与提醒”：使用 Elegant Clock 的倒计时、番茄钟、秒表和提醒。</li><li>“检查更新”：检查 Education Toolkit 的新版本，并使用直连或代理下载。</li></ul><p>主题颜色、铃声和开机自启动属于工具包全局设置，请到“设置与关于 → 常规设置”修改。</p>'],
    schedule: ['课表', '<h3>录入课程</h3><p>点击“添加课程”，填写科目、课程名、开始时间、课程时长和课间时长。选择具体星期表示只在该天使用；选择“每天”表示每天重复。</p><h3>任课老师</h3><p>老师按科目统一保存。同一科目的课程会使用同一个老师名称，修改某一节课时也会更新该科目的老师。</p><h3>查看和同步</h3><p>上方周课表按星期显示全部课程，当前课程会自动高亮。课表状态会同步到桌面时钟，但编辑课表必须在“课表”区域完成。</p><h3>导入格式</h3><p>导入 JSON 时使用 <code>schedule</code> 数组，每项至少包含 <code>subject</code>、<code>course</code>、<code>start</code>；可选字段为 <code>weekday</code>、<code>duration</code>、<code>breakDuration</code>。</p>'],
    random: ['随机抽人', '<h3>单人模式</h3><p>每次随机抽取一名学生。</p><h3>分组模式</h3><p>设置每组人数和组数，系统会在本次抽取中避免重复分组。</p><h3>连续不重复</h3><p>打开后，已经抽过的学生会被记录并在名单预览中标记。剩余人数不足以完成下一次抽取时，系统会停止本次抽取；点击“重置记录”后重新开始。</p><p>名单来源是“设置与关于 → 名单管理”中的当前名单。</p>'],
    names: ['名单管理', '<h3>手动添加</h3><p>输入姓名，可选填写分组，然后点击“添加名单”。</p><h3>批量导入</h3><p>支持字符串数组或对象数组。例如：<code>[{"name":"张三","group":"一组"}]</code>。也兼容包含 <code>names</code>、<code>students</code> 或 FileGator <code>lists</code> 数据的文件。</p><h3>注意</h3><p>随机抽人使用当前名单。导入名单会替换当前名单，不会追加到旧名单。</p>'],
    assignments: ['作业布置', '<h3>添加作业</h3><p>名称必填，科目和上交时间可选。可以直接填写上交时间，也可以选择课表课程并设置在课前或课后提醒。</p><h3>完成和删除</h3><p>勾选右侧开关表示已完成；编辑会保留完成状态，删除会立即移除记录。</p><h3>桌面作业状态</h3><p>打开页面右上角的桌面作业状态后，会显示一个置顶小组件。小组件可以拖动，位置会自动保存。</p>'],
    settings: ['全局设置', '<h3>常规设置</h3><p>主题颜色、默认铃声和开机自启动都在这里设置。时钟区块会自动跟随这些全局设置，不需要重复配置。</p><h3>更新</h3><p>更新检查会显示版本说明。选择直连或代理下载后，程序会先校验安装包大小和 SHA-256，校验成功才会启动安装程序。</p><h3>数据</h3><p>数据保存在 Electron 的用户数据目录中。卸载或清理用户数据前，请先备份课表、名单和作业数据。</p>']
  };
  const [titleText, content] = topics[helpTopic] || topics.overview;
  return `<div class="setting-section ${settingsTab === 'help' ? 'active' : ''}" data-section="help"><div class="panel-title"><div><h2>模块帮助</h2><p>从左侧选择模块查看对应说明。</p></div></div><div class="help-layout"><nav class="help-nav">${Object.entries(topics).map(([key, value]) => `<button class="help-nav-item ${helpTopic === key ? 'active' : ''}" data-help-topic="${key}">${value[0]}</button>`).join('')}</nav><div class="panel help-copy"><h2>${titleText}</h2>${content}</div></div></div>`;
}

function settingsView() {
  if (settingsTab === 'schedule') settingsTab = 'general';
  return `<section class="view-heading"><div><div class="eyebrow">WORKSPACE SETTINGS</div><h1>设置与关于</h1><p>将工具调整成适合你课堂节奏的样子。</p></div></section><div class="settings-layout"><nav class="settings-tabs">${[['general', '常规设置'], ['names', '名单管理'], ['schedule', '课表管理'], ['help', '帮助与关于']].map(([key, label]) => `<button class="settings-tab ${settingsTab === key ? 'active' : ''}" data-settings-tab="${key}">${label}</button>`).join('')}</nav><div class="settings-content"><div class="setting-section ${settingsTab === 'general' ? 'active' : ''}" data-section="general"><div class="panel"><div class="panel-title"><div><h2>外观与提醒</h2><p>颜色会立即应用到整个工具包。</p></div></div><div class="setting-row"><div><h3>主题颜色</h3><p>默认颜色为 #8888CC</p></div><input id="theme-color" class="color-input" type="color" value="${esc(state.settings.themeColor)}" /></div><div class="setting-row"><div><h3>默认铃声</h3><p>${esc(state.settings.ringtonePath || 'lofi-beats.mp3（FileGator）')}</p></div><button class="btn btn-secondary" data-action="pick-ringtone">选择铃声</button></div><div class="setting-row"><div><h3>全局更新</h3><p>打开最新版本发布页检查更新。</p></div><button class="btn btn-secondary" data-action="check-updates">检查更新</button></div><div class="setting-row"><div><h3>开机自启动</h3><p id="autostart-copy">正在检测系统状态…</p></div><label class="switch"><input id="autostart-toggle" type="checkbox" ${state.settings.autostart ? 'checked' : ''} /><span class="slider"></span></label></div></div><div class="panel"><div class="panel-title"><div><h2>随机抽人设置</h2><p>调整抽取结果的显示样式。</p></div></div><div class="setting-row"><div><h3>结果字号</h3><p>抽取结果显示的字体大小，默认 30px</p></div><input id="draw-font-size" type="number" min="16" max="72" value="${state.settings.drawResultFontSize || 30}" style="width:80px" /></div></div></div>${namesSection()}${scheduleSection()}${helpView()}</div></div>`;
}
const views = { home: homeView, random: randomView, clock: clockView, schedule: scheduleView, assignments: assignmentsView, settings: settingsView };

function bindView() {
  document.querySelectorAll('[data-go]').forEach((element) => element.addEventListener('click', () => navigate(element.dataset.go)));
  document.querySelectorAll('[data-settings-tab]').forEach((element) => element.addEventListener('click', () => { settingsTab = element.dataset.settingsTab; render(); if (settingsTab === 'general') api.getAutostartStatus().then((status) => { const copy = document.querySelector('#autostart-copy'); if (copy) copy.textContent = status ? '系统当前已开启' : '系统当前未开启'; }); }));
  document.querySelector('[data-settings-tab="schedule"]')?.addEventListener('click', () => navigate('schedule'));
  document.querySelectorAll('[data-help]').forEach((element) => element.addEventListener('click', () => { helpTopic = element.dataset.help; settingsTab = 'help'; navigate('settings'); }));
  document.querySelectorAll('[data-help-topic]').forEach((element) => element.addEventListener('click', () => { helpTopic = element.dataset.helpTopic; render(); }));
  document.querySelector('[data-action="new-assignment"]')?.addEventListener('click', () => { editingAssignmentId = 'new'; render(); });
  document.querySelector('[data-action="cancel-assignment"]')?.addEventListener('click', () => { editingAssignmentId = null; render(); });
  document.querySelector('#assignment-form')?.addEventListener('submit', onAssignmentSubmit);
  document.querySelectorAll('[data-delete-assignment]').forEach((element) => element.addEventListener('click', async () => { state.assignments = state.assignments.filter((item) => item.id !== element.dataset.deleteAssignment); await save(); showToast('作业已删除'); }));
  document.querySelectorAll('[data-edit-assignment]').forEach((element) => element.addEventListener('click', () => { editingAssignmentId = element.dataset.editAssignment; render(); }));
  document.querySelectorAll('[data-complete]').forEach((element) => element.addEventListener('change', async () => { const item = state.assignments.find((assignment) => assignment.id === element.dataset.complete); if (item) item.completed = element.checked; await save(); }));
  
  // 抽取相关事件
  document.querySelector('[data-action="draw"]')?.addEventListener('click', async () => { 
    const resultEl = document.querySelector('#draw-result'); 
    if (!state.names.length) { 
      resultEl.className = 'draw-result empty';
      resultEl.textContent = '请先在设置中添加名单'; 
      return; 
    } 
    
    const result = await api.randomDraw({ 
      mode: state.settings.drawMode, 
      groupSize: state.settings.drawGroupSize,
      groupCount: state.settings.drawGroupCount,
      continuous: state.settings.drawContinuous 
    }); 
    
    if (result.error) {
      resultEl.className = 'draw-result error';
      resultEl.innerHTML = `<div style="font-size:18px;color:#e53e3e">${esc(result.error)}</div>${result.shouldReset ? '<button class="btn btn-secondary" style="margin-top:12px" data-action="reset-drawn-error">重置记录</button>' : ''}`;
      document.querySelector('[data-action="reset-drawn-error"]')?.addEventListener('click', async () => {
        await api.resetDrawn();
        showToast('已重置抽取记录');
        render();
      });
      return;
    }
    
    const fontSize = state.settings.drawResultFontSize || 30;
    
    if (result.mode === 'single') {
      resultEl.className = 'draw-result';
      resultEl.innerHTML = `<div style="font-size:${fontSize}px;font-weight:700;color:var(--primary-dark)">${esc(result.selected.name)}</div><div style="margin-top:8px;color:var(--muted);font-size:14px">${esc(result.selected.group || '未分组')}${state.settings.drawContinuous ? ` · 剩余 ${result.remaining} 人` : ''}</div>`;
    } else if (result.mode === 'group') {
      resultEl.className = 'draw-result';
      resultEl.innerHTML = result.groups.map((group, index) => 
        `<div class="draw-group"><div class="group-label">第 ${index + 1} 组</div><div class="group-members">${group.map(p => `<span class="member-chip" style="font-size:${Math.max(16, fontSize - 8)}px">${esc(p.name)}</span>`).join('')}</div></div>`
      ).join('') + (state.settings.drawContinuous ? `<div style="margin-top:12px;color:var(--muted);font-size:14px">剩余 ${result.remaining} 人</div>` : '');
    }
    
    state = await api.getState();
    render();
  });
  
  document.querySelector('[data-action="reset-drawn"]')?.addEventListener('click', async () => {
    await api.resetDrawn();
    showToast('已重置抽取记录');
    render();
  });
  
  document.querySelectorAll('[data-draw-mode]').forEach((element) => element.addEventListener('change', async (event) => {
    state.settings.drawMode = event.target.value;
    await save();
    render();
  }));
  
  document.querySelector('[data-draw-continuous]')?.addEventListener('change', async (event) => {
    state.settings.drawContinuous = event.target.checked;
    await save();
    render();
  });
  
  document.querySelector('[data-group-size]')?.addEventListener('change', async (event) => {
    state.settings.drawGroupSize = Math.max(1, Number(event.target.value));
    await save();
  });
  
  document.querySelector('[data-group-count]')?.addEventListener('change', async (event) => {
    state.settings.drawGroupCount = Math.max(1, Number(event.target.value));
    await save();
  });
  
  document.querySelector('#draw-font-size')?.addEventListener('change', async (event) => {
    state.settings.drawResultFontSize = Math.max(16, Math.min(72, Number(event.target.value)));
    await save();
    showToast('字号已更新');
  });
  document.querySelector('#theme-color')?.addEventListener('input', async (event) => { state.settings.themeColor = event.target.value; await save(); });
  document.querySelector('#homework-widget-toggle')?.addEventListener('change', async (event) => { state.settings.homeworkWidgetEnabled = event.target.checked; await save(); });
  document.querySelector('#desktop-clock-toggle')?.addEventListener('change', async (event) => { state.settings.desktopWidgetEnabled = event.target.checked; await save(); showToast(event.target.checked ? '已开启桌面时钟显示' : '已关闭桌面时钟显示'); });
  document.querySelector('#autostart-toggle')?.addEventListener('change', async (event) => { const actual = await api.setAutostart(event.target.checked); state.settings.autostart = actual; event.target.checked = actual; const copy = document.querySelector('#autostart-copy'); if (copy) copy.textContent = actual ? '系统当前已开启' : '系统当前未开启'; showToast(actual ? '已开启开机自启动' : '已关闭开机自启动'); });
  document.querySelector('#clock-autostart-toggle')?.addEventListener('change', async (event) => { const actual = await api.setAutostart(event.target.checked); state.settings.autostart = actual; event.target.checked = actual; await save(); showToast(actual ? '已开启开机自启动' : '已关闭开机自启动'); });
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
  document.querySelector('[data-clock-update]')?.addEventListener('click', async () => { const result = await api.checkForUpdates(); showToast(result?.status === 'up-to-date' ? '当前已是最新版本' : result?.ok ? '发现新版本' : result?.error || '检查更新失败'); });
  document.querySelector('[data-action="import-schedule"]')?.addEventListener('click', importSchedule);
  document.querySelector('[data-action="cancel-schedule"]')?.addEventListener('click', () => { editingScheduleId = null; render(); });
  document.querySelectorAll('[data-edit-schedule]').forEach((element) => element.addEventListener('click', () => { editingScheduleId = element.dataset.editSchedule; render(); }));
  document.querySelectorAll('[data-delete-schedule]').forEach((element) => element.addEventListener('click', async () => { state.schedule = state.schedule.filter((lesson) => lesson.id !== element.dataset.deleteSchedule); await save(); }));
  if (settingsTab === 'general') {
    api.getAutostartStatus().then((status) => {
      const copy = document.querySelector('#autostart-copy');
      const toggle = document.querySelector('#autostart-toggle');
      if (copy) copy.textContent = status ? '系统当前已开启' : '系统当前未开启';
      if (toggle) toggle.checked = status;
      if (status !== state.settings.autostart) {
        state.settings.autostart = status;
        api.saveState(state);
      }
    });
  }
  if (currentView === 'clock') {
    const clockToggle = document.querySelector('#desktop-clock-toggle');
    const autostartToggle = document.querySelector('#clock-autostart-toggle');
    if (clockToggle) clockToggle.checked = state.settings.desktopWidgetEnabled;
    api.getAutostartStatus().then((status) => {
      if (autostartToggle) autostartToggle.checked = status;
      if (status !== state.settings.autostart) {
        state.settings.autostart = status;
        api.saveState(state);
      }
    });
  }
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
async function importNames() { 
  try { 
    const data = await api.importJson(); 
    if (!data) return; 
    
    let names;
    
    // 兼容多种格式
    if (Array.isArray(data)) {
      // 直接数组格式：[{name, group}] 或 ["name"]
      names = data;
    } else if (data.lists && Array.isArray(data.lists) && data.lists.length > 0) {
      // FileGator lists.json 格式：{lists: [{people: [...]}]}
      const firstList = data.lists[0];
      if (firstList.people && Array.isArray(firstList.people)) {
        names = firstList.people;
      } else {
        throw new Error('lists 格式错误：缺少 people 数组');
      }
    } else if (data.names && Array.isArray(data.names)) {
      // {names: [...]} 格式
      names = data.names;
    } else if (data.students && Array.isArray(data.students)) {
      // 旧版 rollcall 格式：{students: [...]}
      names = data.students;
    } else {
      throw new Error('名单 JSON 应为数组或包含 names/students/lists 数组');
    }
    
    if (!Array.isArray(names)) {
      throw new Error('名单数据格式错误');
    }
    
    // 标准化名单格式
    state.names = names.map((item) => {
      if (typeof item === 'string') {
        return { name: item, group: '' };
      }
      // 兼容多种字段名
      const name = item.name || item.student || '';
      const group = item.group || item.班级 || '';
      return { name: String(name).trim(), group: String(group).trim() };
    }).filter((item) => item.name);
    
    state.nameLists[0].names = state.names; 
    await save(); 
    showToast(`已导入 ${state.names.length} 人`); 
  } catch (error) { 
    showToast(`导入失败：${error.message}`); 
  }
}
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

function markdownToHtml(markdown) {
  let html = '';
  let inList = false;
  let inCodeBlock = false;
  let codeBlockLines = [];
  
  const lines = String(markdown || '').split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // 代码块处理
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        html += `<pre><code>${esc(codeBlockLines.join('\n'))}</code></pre>`;
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // 开始代码块
        inCodeBlock = true;
        if (inList) {
          html += '</ul>';
          inList = false;
        }
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }
    
    const escaped = esc(line);
    
    // 标题
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${esc(trimmed.slice(4))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${esc(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1>${esc(trimmed.slice(2))}</h1>`;
      continue;
    }
    
    // 列表
    if (/^[-*] /.test(trimmed)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${processInline(esc(trimmed.slice(2)))}</li>`;
      continue;
    }
    
    // 空行
    if (!trimmed) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }
    
    // 普通段落
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${processInline(escaped)}</p>`;
  }
  
  if (inList) html += '</ul>';
  if (inCodeBlock) html += `<pre><code>${esc(codeBlockLines.join('\n'))}</code></pre>`;
  
  return html;
}

function processInline(text) {
  // 行内代码 `code`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 粗体 **text** 或 __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // 斜体 *text* 或 _text_
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  return text;
}

function refreshClockSchedule(now) {
  const status = ToolkitSchedule.summary(state.schedule, now);
  const currentIds = new Set();
  if (status.label === '上课中' && status.item) currentIds.add(status.item.id);
  if (status.label === '课间') {
    if (status.item) currentIds.add(status.item.id);
    if (status.next) currentIds.add(status.next.id);
  }

  const today = ToolkitSchedule.weekday(now);
  document.querySelectorAll('.lesson-cell[data-lesson-id]').forEach((cell) => {
    cell.classList.toggle('current', cell.dataset.lessonDay === String(today) && currentIds.has(cell.dataset.lessonId));
  });
  document.querySelectorAll('.day-header[data-day]').forEach((header) => {
    header.classList.toggle('today', header.dataset.day === String(today));
  });
}

function startClock() { clearInterval(clockTimer); let lastDay = ToolkitSchedule.weekday(new Date()); const tick = () => { const now = new Date(); const currentDay = ToolkitSchedule.weekday(now); if (currentDay !== lastDay) { lastDay = currentDay; render(); return; } const summary = document.querySelector('#clock-summary'); if (summary) summary.innerHTML = clockSummaryMarkup(); refreshClockSchedule(now); headerTime.textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now); const dateElement = document.querySelector('#clock-date'); const timeElement = document.querySelector('#clock-time'); if (dateElement) dateElement.textContent = formatDate(now); if (timeElement) timeElement.textContent = now.toLocaleTimeString('zh-CN', { hour12: false }); }; tick(); clockTimer = setInterval(tick, 1000); }

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => navigate(item.dataset.view)));
backButton.addEventListener('click', () => { currentView = previousView || 'home'; render(); });
api.onNavigate((view) => { if (viewTitles[view]) navigate(view); });
api.onReminderDue(({ assignment }) => { showToast(`作业提醒：${assignment.name}`); });
api.onStateUpdated((next) => { state = next; render(); });
api.getState().then((next) => { state = next; render(); });
