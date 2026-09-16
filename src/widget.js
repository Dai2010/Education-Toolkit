const api = window.educationToolkit;
const body = document.body;
const list = document.querySelector('#list');
let state;
function render() {
  body.classList.toggle('expanded', Boolean(state?.settings?.homeworkWidgetExpanded));
  const assignments = (state?.assignments || []).filter((item) => !item.completed).slice(0, 3);
  list.innerHTML = assignments.length ? assignments.map((item) => `<div class="assignment"><strong>${String(item.name).replace(/[&<>]/g, '')}</strong><span>${item.subject || '其它'} · ${item.dueAt ? new Date(item.dueAt).toLocaleString('zh-CN') : '未设置时间'}</span></div>`).join('') : '<div class="assignment"><span>暂无待完成作业</span></div>';
}
const toggle = document.querySelector('#toggle');
let drag;
toggle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  drag = { id: event.pointerId, x: event.screenX, y: event.screenY, windowX: window.screenX, windowY: window.screenY, moved: false };
  toggle.setPointerCapture(event.pointerId);
});
toggle.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.screenX - drag.x;
  const dy = event.screenY - drag.y;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (drag.moved) api.moveHomeworkWidget(drag.windowX + dx, drag.windowY + dy);
});
toggle.addEventListener('pointerup', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const moved = drag.moved;
  drag = null;
  toggle.releasePointerCapture(event.pointerId);
  if (!moved) api.toggleHomeworkWidget(!state?.settings?.homeworkWidgetExpanded);
});
toggle.addEventListener('pointercancel', () => { drag = null; });
toggle.addEventListener('click', (event) => {
  if (event.detail === 0) api.toggleHomeworkWidget(!state?.settings?.homeworkWidgetExpanded);
});
api.onStateUpdated((next) => { state = next; render(); });
api.getState().then((next) => { state = next; render(); });
