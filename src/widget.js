const api = window.educationToolkit;
const body = document.body;
const list = document.querySelector('#list');
let state;
function render() {
  body.classList.toggle('expanded', Boolean(state?.settings?.homeworkWidgetExpanded));
  const assignments = (state?.assignments || []).filter((item) => !item.completed).slice(0, 3);
  list.innerHTML = assignments.length ? assignments.map((item) => `<div class="assignment"><strong>${String(item.name).replace(/[&<>]/g, '')}</strong><span>${item.subject || '其它'} · ${item.dueAt ? new Date(item.dueAt).toLocaleString('zh-CN') : '未设置时间'}</span></div>`).join('') : '<div class="assignment"><span>暂无待完成作业</span></div>';
}
document.querySelector('#toggle').addEventListener('click', () => api.toggleHomeworkWidget(!state?.settings?.homeworkWidgetExpanded));
api.onStateUpdated((next) => { state = next; render(); });
api.getState().then((next) => { state = next; render(); });
