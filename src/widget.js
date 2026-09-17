const api = window.educationToolkit;
const container = document.querySelector('#widget-container');
let state;
let drag;

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function render() {
  const expanded = Boolean(state?.settings?.homeworkWidgetExpanded);
  const assignments = (state?.assignments || []).filter((item) => !item.completed);
  
  if (expanded) {
    container.innerHTML = `
      <div class="expanded">
        <div class="header">
          <div class="title">作业状态（${assignments.length}）</div>
          <div class="header-buttons">
            <button id="minimize-btn" title="最小化">−</button>
            <button id="close-btn" title="收缩">×</button>
          </div>
        </div>
        <div class="content" id="content">
          ${assignments.length ? assignments.map((item) => `
            <div class="assignment">
              <strong>${esc(item.name)}</strong>
              <span>${esc(item.subject || '其它')} · ${item.dueAt ? new Date(item.dueAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '未设置时间'}</span>
            </div>
          `).join('') : '<div class="empty">暂无待完成作业</div>'}
        </div>
      </div>
    `;
    bindExpandedEvents();
  } else {
    container.innerHTML = `
      <div class="collapsed">
        <button class="expand-btn" id="expand-btn" title="展开作业状态"></button>
      </div>
    `;
    bindCollapsedEvents();
  }
}

function bindCollapsedEvents() {
  const expandBtn = document.querySelector('#expand-btn');
  if (!expandBtn) return;
  
  let isDragging = false;
  let startX, startY, startWindowX, startWindowY;
  
  expandBtn.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    isDragging = false;
    startX = event.screenX;
    startY = event.screenY;
    startWindowX = window.screenX;
    startWindowY = window.screenY;
    expandBtn.setPointerCapture(event.pointerId);
  });
  
  expandBtn.addEventListener('pointermove', (event) => {
    if (!expandBtn.hasPointerCapture(event.pointerId)) return;
    const dx = event.screenX - startX;
    const dy = event.screenY - startY;
    if (Math.hypot(dx, dy) > 5) {
      isDragging = true;
      api.moveHomeworkWidget(startWindowX + dx, startWindowY + dy);
    }
  });
  
  expandBtn.addEventListener('pointerup', (event) => {
    if (!expandBtn.hasPointerCapture(event.pointerId)) return;
    expandBtn.releasePointerCapture(event.pointerId);
    if (!isDragging) {
      api.toggleHomeworkWidget(true);
    }
  });
  
  expandBtn.addEventListener('pointercancel', () => {
    isDragging = false;
  });
}

function bindExpandedEvents() {
  const header = document.querySelector('.header');
  const closeBtn = document.querySelector('#close-btn');
  const minimizeBtn = document.querySelector('#minimize-btn');
  
  if (!header) return;
  
  // 拖动标题栏移动窗口
  let isDragging = false;
  let startX, startY, startWindowX, startWindowY;
  
  header.addEventListener('pointerdown', (event) => {
    // 只在标题栏空白区域触发拖动（不包括按钮）
    if (event.target.tagName === 'BUTTON') return;
    if (event.button !== 0) return;
    isDragging = false;
    startX = event.screenX;
    startY = event.screenY;
    startWindowX = window.screenX;
    startWindowY = window.screenY;
    header.setPointerCapture(event.pointerId);
  });
  
  header.addEventListener('pointermove', (event) => {
    if (!header.hasPointerCapture(event.pointerId)) return;
    const dx = event.screenX - startX;
    const dy = event.screenY - startY;
    if (Math.hypot(dx, dy) > 5) {
      isDragging = true;
      api.moveHomeworkWidget(startWindowX + dx, startWindowY + dy);
    }
  });
  
  header.addEventListener('pointerup', (event) => {
    if (!header.hasPointerCapture(event.pointerId)) return;
    header.releasePointerCapture(event.pointerId);
    isDragging = false;
  });
  
  header.addEventListener('pointercancel', () => {
    isDragging = false;
  });
  
  // 最小化按钮（收缩到小方块）
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      api.toggleHomeworkWidget(false);
    });
  }
  
  // 关闭按钮（收缩到小方块）
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      api.toggleHomeworkWidget(false);
    });
  }
}

api.onStateUpdated((next) => { 
  state = next; 
  render(); 
});

api.getState().then((next) => { 
  state = next; 
  render(); 
});
