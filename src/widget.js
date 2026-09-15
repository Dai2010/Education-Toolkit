const api = window.educationToolkit;
const dateElement = document.querySelector('#date');
const timeElement = document.querySelector('#time');
const courseElement = document.querySelector('#course');
const metaElement = document.querySelector('#meta');
let state;

function tick() {
  const now = new Date();
  dateElement.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now);
  timeElement.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
}

function render() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const next = [...(state?.schedule || [])].sort((a, b) => String(a.start).localeCompare(String(b.start))).find((lesson) => { const [hour, minute] = String(lesson.start).split(':').map(Number); return hour * 60 + minute > minutes; });
  courseElement.textContent = next?.course || '放学啦';
  metaElement.textContent = next ? `${next.start} · ${next.teacher || '未设置任课老师'} · ${Number(next.duration || 40)} 分钟` : '今天没有更多课程安排';
}

document.querySelector('#close').addEventListener('click', () => window.close());
api.onStateUpdated((next) => { state = next; render(); });
api.getState().then((next) => { state = next; render(); });
tick();
setInterval(tick, 1000);
