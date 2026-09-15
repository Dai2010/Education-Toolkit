const shell = window.elegantClock;

const elements = {
  clockPanel: document.querySelector('#clock-panel'),
  currentDate: document.querySelector('#current-date'),
  currentTime: document.querySelector('#current-time'),
  countdownSummary: document.querySelector('#countdown-summary'),
  settingsToggle: document.querySelector('#settings-toggle'),
  toolsToggle: document.querySelector('#tools-toggle'),
  hideBtn: document.querySelector('#hide-btn'),
  minimizeBtn: document.querySelector('#minimize-btn'),
  maximizeBtn: document.querySelector('#maximize-btn'),
  closeBtn: document.querySelector('#close-btn')
  ,toolkitToggle: document.querySelector('#toolkit-toggle')
  ,nextClass: document.querySelector('#next-class')
};

let audioContext;
let idleTimer;
let latestState;
let lastHeartbeatAt = Number.NEGATIVE_INFINITY;

const idleDelayMs = 5000;
const compactClickMaxMove = 5;
const heartbeatIntervalMs = 10_000;

const compactUi = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function normalizeColor(value, fallback) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function hexToRgbParts(hex) {
  const normalized = normalizeColor(hex, '#101623').slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}

function formatDuration(milliseconds) {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');

  return `${days > 0 ? `${days}天 ` : ''}${base}`;
}

function applySettings(settings = {}) {
  const rootStyle = document.documentElement.style;
  const transparent = settings.transparent !== false;
  const opacity = Number(settings.opacity) || 78;
  const fontSize = Number(settings.fontSize) || 82;
  const fontColor = normalizeColor(settings.fontColor, '#f8fbff');
  const backgroundColor = normalizeColor(settings.backgroundColor, '#101623');

  document.body.classList.toggle('transparent', transparent);
  document.body.classList.toggle('opaque', !transparent);
  rootStyle.setProperty('--panel-alpha', String(transparent ? opacity / 100 : 1));
  rootStyle.setProperty('--clock-font-family', settings.fontFamily || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  rootStyle.setProperty('--clock-font-size', `${fontSize}px`);
  rootStyle.setProperty('--text', fontColor);
  rootStyle.setProperty('--background-color', backgroundColor);
  rootStyle.setProperty('--panel-rgb', hexToRgbParts(backgroundColor));
  shell?.setAlwaysOnTop?.(Boolean(settings.alwaysOnTop));
}

function renderState(state) {
  latestState = state;
  applySettings(state?.settings || {});

  const countdown = state?.countdown;
  const shouldShowCountdown = Boolean(countdown?.running || countdown?.status === '已暂停');
  elements.countdownSummary.hidden = !shouldShowCountdown;

  if (shouldShowCountdown) {
    elements.countdownSummary.textContent = `倒计时 ${formatDuration(countdown.remainingMs)} · ${countdown.status || '进行中'}`;
  }
}

function updateClock() {
  const now = new Date();
  elements.currentDate.textContent = dateFormatter.format(now);
  elements.currentTime.textContent = timeFormatter.format(now);

  if (latestState?.countdown?.running) {
    const remainingMs = Math.max(0, latestState.countdown.deadlineMs - Date.now());
    elements.countdownSummary.textContent = `倒计时 ${formatDuration(remainingMs)} · 进行中`;
  }

  const heartbeatTime = performance.now();
  if (heartbeatTime - lastHeartbeatAt >= heartbeatIntervalMs) {
    lastHeartbeatAt = heartbeatTime;
    shell?.reportRendererHeartbeat?.();
  }
}

async function updateNextClass() {
  const lessons = await shell?.getScheduleState?.() || [];
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...lessons].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const active = sorted.find((item) => { const [h, m] = String(item.start).split(':').map(Number); return minutes >= h * 60 + m && minutes < h * 60 + m + Number(item.duration || 40); });
  const next = sorted.find((item) => { const [h, m] = String(item.start).split(':').map(Number); return h * 60 + m > minutes; });
  const item = active || next;
  elements.nextClass.hidden = !item;
  elements.nextClass.textContent = item ? `${active ? '上课中' : '下一节'} · ${item.course} · ${item.start}` : '放学状态';
}

function scheduleClockUpdate() {
  window.requestAnimationFrame(() => {
    updateClock();
    const nextSecondDelayMs = 1000 - (Date.now() % 1000) + 20;
    window.setTimeout(scheduleClockUpdate, nextSecondDelayMs);
  });
}

function playFallbackTone() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    audioContext ||= new AudioContextConstructor();
    audioContext.resume?.();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.45);
  } catch {
    audioContext = undefined;
  }
}

function playAlertTone(payload = {}) {
  const ringtoneUrl = payload.ringtone?.url || latestState?.settings?.ringtone?.url;
  if (!ringtoneUrl) {
    playFallbackTone();
    return;
  }

  const audio = new Audio(ringtoneUrl);
  audio.volume = 0.85;
  audio.play()?.catch?.(() => playFallbackTone());
}

function scheduleIdleMode() {
  window.clearTimeout(idleTimer);

  if (compactUi.active || document.hidden) {
    return;
  }

  idleTimer = window.setTimeout(() => {
    enterCompactMode();
  }, idleDelayMs);
}

function applyCompactUiState(enabled) {
  compactUi.active = enabled;
  document.body.classList.toggle('compact-mode', enabled);
  elements.clockPanel.setAttribute(
    'aria-label',
    enabled ? '紧凑时钟，点击恢复完整窗口，拖动可移动位置' : '当前时间'
  );
}

async function enterCompactMode() {
  if (compactUi.active || document.hidden) {
    return;
  }

  applyCompactUiState(true);

  try {
    await shell?.setCompactMode?.(true);
  } catch {
    applyCompactUiState(false);
  }
}

async function exitCompactMode() {
  if (!compactUi.active) {
    return;
  }

  applyCompactUiState(false);

  try {
    await shell?.setCompactMode?.(false);
  } catch {
    // Keep renderer usable when IPC is unavailable.
  }

  scheduleIdleMode();
}

function trackActivity(event) {
  if (compactUi.active) {
    return;
  }

  if (event?.type === 'keydown' && ['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  scheduleIdleMode();
}

function bindActivityTracking() {
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input', 'change'].forEach((eventName) => {
    window.addEventListener(eventName, trackActivity, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearTimeout(idleTimer);
    } else {
      scheduleIdleMode();
    }
  });
}

function bindCompactClockInteractions() {
  elements.clockPanel.addEventListener('pointerdown', (event) => {
    if (!compactUi.active || event.button !== 0) {
      return;
    }

    compactUi.pointerId = event.pointerId;
    compactUi.startX = event.screenX;
    compactUi.startY = event.screenY;
    compactUi.lastX = event.screenX;
    compactUi.lastY = event.screenY;
    compactUi.moved = false;
    elements.clockPanel.setPointerCapture(event.pointerId);
  });

  elements.clockPanel.addEventListener('pointermove', (event) => {
    if (!compactUi.active || compactUi.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.screenX - compactUi.lastX;
    const deltaY = event.screenY - compactUi.lastY;
    const totalMove = Math.hypot(event.screenX - compactUi.startX, event.screenY - compactUi.startY);

    if (!compactUi.moved && totalMove <= compactClickMaxMove) {
      return;
    }

    compactUi.moved = true;

    if (deltaX || deltaY) {
      shell?.moveWindowBy?.(deltaX, deltaY);
      compactUi.lastX = event.screenX;
      compactUi.lastY = event.screenY;
    }
  });

  elements.clockPanel.addEventListener('pointerup', (event) => {
    if (!compactUi.active || compactUi.pointerId !== event.pointerId) {
      return;
    }

    elements.clockPanel.releasePointerCapture(event.pointerId);
    compactUi.pointerId = null;

    if (!compactUi.moved) {
      shell?.openToolkit?.();
    }
  });

  elements.clockPanel.addEventListener('pointercancel', (event) => {
    if (compactUi.pointerId === event.pointerId) {
      compactUi.pointerId = null;
    }
  });
}

function bindEvents() {
  elements.settingsToggle.addEventListener('click', () => shell?.openSettings?.());
  elements.toolsToggle.addEventListener('click', () => shell?.openTools?.());
  elements.hideBtn.addEventListener('click', () => shell?.hideToTray?.());
  elements.minimizeBtn.addEventListener('click', () => shell?.minimize?.());
  elements.maximizeBtn.addEventListener('click', () => shell?.toggleMaximize?.());
  elements.closeBtn.addEventListener('click', () => shell?.close?.());
  elements.toolkitToggle?.addEventListener('click', () => shell?.openToolkit?.());

  shell?.onRestoreFullUi?.(() => {
    exitCompactMode();
  });
  shell?.onStateChanged?.(renderState);
  shell?.onPlayAlert?.(playAlertTone);

  bindActivityTracking();
  bindCompactClockInteractions();
}

async function init() {
  bindEvents();
  renderState(await shell?.getState?.());
  applyCompactUiState(Boolean(await shell?.getCompactMode?.()));
  scheduleClockUpdate();
  updateNextClass();
  window.setInterval(updateNextClass, 30_000);

  if (!compactUi.active) {
    scheduleIdleMode();
  }
}

init();
