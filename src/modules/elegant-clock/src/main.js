const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  screen,
  shell: electronShell,
  Tray,
  utilityProcess
} = require('electron');
const { createHash } = require('crypto');
const { createWriteStream, existsSync, mkdirSync, promises: fsPromises, readFileSync, unlinkSync, writeFileSync } = require('fs');
const os = require('os');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { pathToFileURL } = require('url');
const packageInfo = require('../package.json');
const {
  createUpdateInfo,
  fetchLatestRelease,
  getDirectDownloadUrl,
  getProxyDownloadUrl
} = require('./update-checker');

let mainWindow;
let aboutWindow;
let settingsWindow;
let toolsWindow;
let updateWindow;
let tray;
let isQuitting = false;
let compactMode = false;
let startInCompactMode = false;
let stateSaveTimer;
let timerEngine;
let latestUpdateInfo;
let updateCheckStarted = false;
let updateCheckPromise;
let updateDownloadPromise;
let updateDownloadAbortController;
let watchdogProcess;
let watchdogReady = false;
let watchdogHeartbeatPending = false;
let watchdogRestartTimer;
let rendererRecoveryTimer;

const defaultWindowSize = {
  width: 560,
  height: 430,
  minWidth: 420,
  minHeight: 320
};

const compactWindowState = {
  bounds: null,
  maximized: false,
  fullscreen: false
};

const appId = 'io.github.dai2010.elegantclock';
const appDisplayName = 'Elegant Clock';
const githubProfileUrl = 'https://github.com/Dai2010';
const projectHomepageUrl = 'https://github.com/Dai2010/elegant-clock';
const autostartDesktopFileName = 'elegant-clock.desktop';
const windowsRunEntryName = 'Elegant Clock';
const autostartArgs = ['--autostart'];
const maxTargetNotifyBeforeMs = 3650 * 24 * 60 * 60 * 1000;
const updateCheckTimeoutMs = 12000;
const updateProgressIntervalMs = 120;
const watchdogRestartDelayMs = 30_000;
const rendererRecoveryLockMs = 30_000;
const watchdogSmokeTestTimeoutMs = 15_000;
const watchdogSmokeTestMode = process.argv.includes('--watchdog-smoke-test');

const defaultSettings = {
  transparent: true,
  alwaysOnTop: false,
  opacity: 78,
  fontFamily: '',
  fontSize: 82,
  fontColor: '#f8fbff',
  backgroundColor: '#101623',
  ringtone: null,
  pomodoro: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: 4
  }
};

const appState = {
  settings: structuredClone(defaultSettings),
  pomodoro: {
    phase: 'focus',
    running: false,
    deadlineMs: 0,
    remainingMs: 25 * 60 * 1000,
    completedFocusSessions: 0,
    status: '待开始'
  },
  countdown: {
    mode: 'duration',
    running: false,
    deadlineMs: 0,
    remainingMs: 5 * 60 * 1000,
    durationMs: 5 * 60 * 1000,
    targetMs: 0,
    targetNotifyBeforeUnit: 'hours',
    targetNotifyBeforeMs: 0,
    targetPreNotified: false,
    finished: false,
    status: '待开始'
  },
  stopwatch: {
    running: false,
    startEpochMs: 0,
    elapsedMs: 0,
    status: '待开始'
  },
  reminders: []
};

const platformWindowConfig = {
  win32: {
    compactWidth: 420,
    compactHeight: 168,
    trayIconSize: 16
  },
  linux: {
    compactWidth: 440,
    compactHeight: 176,
    trayIconSize: 22
  },
  default: {
    compactWidth: 420,
    compactHeight: 168,
    trayIconSize: 18
  }
};

let host;

function getWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeCountdownNotifyUnit(unit) {
  return unit === 'days' ? 'days' : 'hours';
}

function normalizeCountdownNotifyBeforeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(maxTargetNotifyBeforeMs, Math.max(0, Math.trunc(parsed)));
}

function formatLeadTime(milliseconds) {
  const safeMs = Math.max(0, Math.trunc(Number(milliseconds) || 0));
  const totalHours = Math.max(1, Math.ceil(safeMs / (60 * 60 * 1000)));

  if (totalHours >= 24 && totalHours % 24 === 0) {
    return `${totalHours / 24} 天`;
  }

  return `${totalHours} 小时`;
}

function normalizeColor(value, fallback) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function createDefaultRingtoneSetting() {
  const ringtone = createRingtonePayload(getDefaultRingtonePath());
  return {
    type: 'bundled',
    name: 'ringtone_default.mp3',
    path: ringtone.path,
    url: ringtone.url
  };
}

function normalizeRingtone(ringtone) {
  if (ringtone?.type === 'custom' && typeof ringtone.url === 'string' && ringtone.url.length > 0) {
    return {
      type: 'custom',
      name: ringtone.name || '自定义铃声',
      path: ringtone.path || '',
      url: ringtone.url
    };
  }

  return createDefaultRingtoneSetting();
}

function normalizeSettings(settings = {}) {
  return {
    transparent: settings.transparent !== false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    opacity: clampNumber(settings.opacity, 20, 100),
    fontFamily: typeof settings.fontFamily === 'string' ? settings.fontFamily.trim() : '',
    fontSize: clampNumber(settings.fontSize, 48, 160),
    fontColor: normalizeColor(settings.fontColor, '#f8fbff'),
    backgroundColor: normalizeColor(settings.backgroundColor, '#101623'),
    ringtone: normalizeRingtone(settings.ringtone),
    pomodoro: {
      focusMinutes: clampNumber(settings.pomodoro?.focusMinutes, 1, 180),
      shortBreakMinutes: clampNumber(settings.pomodoro?.shortBreakMinutes, 1, 60),
      longBreakMinutes: clampNumber(settings.pomodoro?.longBreakMinutes, 1, 120),
      longBreakEvery: clampNumber(settings.pomodoro?.longBreakEvery, 1, 12)
    }
  };
}

function getStatePath() {
  return path.join(app.getPath('userData'), 'elegant-clock-state.json');
}

function getPomodoroPhaseLabel(phase = appState.pomodoro.phase) {
  if (phase === 'shortBreak') {
    return '短休息';
  }

  if (phase === 'longBreak') {
    return '长休息';
  }

  return '专注';
}

function getPomodoroPhaseDurationMs(phase = appState.pomodoro.phase) {
  const config = appState.settings.pomodoro;
  if (phase === 'shortBreak') {
    return config.shortBreakMinutes * 60 * 1000;
  }

  if (phase === 'longBreak') {
    return config.longBreakMinutes * 60 * 1000;
  }

  return config.focusMinutes * 60 * 1000;
}

function normalizeAppState() {
  appState.settings = normalizeSettings(appState.settings);
  appState.pomodoro.phase = ['focus', 'shortBreak', 'longBreak'].includes(appState.pomodoro.phase)
    ? appState.pomodoro.phase
    : 'focus';
  appState.pomodoro.running = Boolean(appState.pomodoro.running);
  appState.pomodoro.deadlineMs = Number(appState.pomodoro.deadlineMs) || 0;
  appState.pomodoro.remainingMs = Math.max(0, Number(appState.pomodoro.remainingMs) || getPomodoroPhaseDurationMs());
  appState.pomodoro.completedFocusSessions = clampNumber(appState.pomodoro.completedFocusSessions, 0, 9999);
  appState.pomodoro.status = appState.pomodoro.status || '待开始';

  appState.countdown.mode = appState.countdown.mode === 'target' ? 'target' : 'duration';
  appState.countdown.running = Boolean(appState.countdown.running);
  appState.countdown.deadlineMs = Math.max(0, Number(appState.countdown.deadlineMs) || 0);
  appState.countdown.durationMs = Math.max(0, Number(appState.countdown.durationMs) || 5 * 60 * 1000);
  appState.countdown.targetMs = Math.max(0, Number(appState.countdown.targetMs) || 0);
  appState.countdown.targetNotifyBeforeUnit = normalizeCountdownNotifyUnit(appState.countdown.targetNotifyBeforeUnit);
  appState.countdown.targetNotifyBeforeMs = normalizeCountdownNotifyBeforeMs(appState.countdown.targetNotifyBeforeMs);
  appState.countdown.targetPreNotified = Boolean(appState.countdown.targetPreNotified);
  appState.countdown.remainingMs = Math.max(0, Number(appState.countdown.remainingMs) || appState.countdown.durationMs);
  appState.countdown.finished = Boolean(appState.countdown.finished);
  appState.countdown.status = appState.countdown.status || '待开始';

  appState.stopwatch.running = Boolean(appState.stopwatch.running);
  appState.stopwatch.startEpochMs = Math.max(0, Number(appState.stopwatch.startEpochMs) || 0);
  appState.stopwatch.elapsedMs = Math.max(0, Number(appState.stopwatch.elapsedMs) || 0);
  appState.stopwatch.status = appState.stopwatch.status || '待开始';

  appState.reminders = Array.isArray(appState.reminders)
    ? appState.reminders
        .filter((reminder) => Number.isFinite(Number(reminder?.scheduledAt)))
        .map((reminder) => ({
          id: String(reminder.id || `${Date.now()}-${Math.random()}`),
          title: String(reminder.title || '提醒').slice(0, 60),
          note: String(reminder.note || '').slice(0, 200),
          scheduledAt: Number(reminder.scheduledAt),
          createdAt: Number(reminder.createdAt) || Date.now(),
          done: Boolean(reminder.done),
          notifiedAt: Number(reminder.notifiedAt) || undefined
        }))
    : [];
}

function loadAppState() {
  appState.settings = clone(defaultSettings);

  try {
    const savedState = JSON.parse(readFileSync(getStatePath(), 'utf8'));
    Object.assign(appState.settings, savedState.settings || {});
    Object.assign(appState.pomodoro, savedState.pomodoro || {});
    Object.assign(appState.countdown, savedState.countdown || {});
    Object.assign(appState.stopwatch, savedState.stopwatch || {});
    appState.reminders = Array.isArray(savedState.reminders) ? savedState.reminders : [];
  } catch {
    appState.settings = clone(defaultSettings);
  }

  normalizeAppState();
}

function saveAppStateNow() {
  try {
    mkdirSync(path.dirname(getStatePath()), { recursive: true });
    writeFileSync(getStatePath(), JSON.stringify(getPersistableState(), null, 2), 'utf8');
  } catch {
    // State persistence should never make the app unusable.
  }
}

function scheduleStateSave() {
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(saveAppStateNow, 250);
}

function getCurrentCountdownRemainingMs() {
  if (appState.countdown.running) {
    return Math.max(0, appState.countdown.deadlineMs - Date.now());
  }

  return Math.max(0, appState.countdown.remainingMs);
}

function getCurrentPomodoroRemainingMs() {
  if (appState.pomodoro.running) {
    return Math.max(0, appState.pomodoro.deadlineMs - Date.now());
  }

  return Math.max(0, appState.pomodoro.remainingMs);
}

function getCurrentStopwatchElapsedMs() {
  if (appState.stopwatch.running) {
    return Math.max(0, Date.now() - appState.stopwatch.startEpochMs);
  }

  return Math.max(0, appState.stopwatch.elapsedMs);
}

function getPersistableState() {
  const state = getStateSnapshot();
  return {
    settings: state.settings,
    pomodoro: state.pomodoro,
    countdown: state.countdown,
    stopwatch: state.stopwatch,
    reminders: state.reminders
  };
}

function getStateSnapshot() {
  return {
    settings: clone(appState.settings),
    pomodoro: {
      ...clone(appState.pomodoro),
      phaseLabel: getPomodoroPhaseLabel(),
      remainingMs: getCurrentPomodoroRemainingMs()
    },
    countdown: {
      ...clone(appState.countdown),
      remainingMs: getCurrentCountdownRemainingMs()
    },
    stopwatch: {
      ...clone(appState.stopwatch),
      elapsedMs: getCurrentStopwatchElapsedMs()
    },
    reminders: clone(appState.reminders)
  };
}

function sendToAllWindows(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

function broadcastState() {
  sendToAllWindows('state:changed', getStateSnapshot());
}

function applyWindowSettings() {
  mainWindow?.setAlwaysOnTop(Boolean(appState.settings.alwaysOnTop), 'floating');
}

function showSystemNotification(title, body, focus = false, sourceWindow = mainWindow, playSound = false) {
  const safeTitle = String(title || appDisplayName);
  const safeBody = String(body || '提醒时间到了');

  if (playSound) {
    const audioWindow = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    audioWindow?.webContents.send('alert:play', {
      title: safeTitle,
      body: safeBody,
      ringtone: appState.settings.ringtone
    });
  }

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: safeTitle,
      body: safeBody,
      silent: playSound
    });

    notification.on('click', () => {
      requestFullUi(sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : mainWindow);
    });

    notification.show();
  } else {
    sourceWindow?.flashFrame(true);
  }

  if (focus) {
    requestFullUi(sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : mainWindow);
  }
}

function completePomodoroPhase(manual = false) {
  const finishedPhase = appState.pomodoro.phase;
  const finishedLabel = getPomodoroPhaseLabel(finishedPhase);
  appState.pomodoro.running = false;
  appState.pomodoro.deadlineMs = 0;

  if (finishedPhase === 'focus' && !manual) {
    appState.pomodoro.completedFocusSessions += 1;
  }

  if (finishedPhase === 'focus') {
    const shouldUseLongBreak = appState.pomodoro.completedFocusSessions > 0
      && appState.pomodoro.completedFocusSessions % appState.settings.pomodoro.longBreakEvery === 0;
    appState.pomodoro.phase = shouldUseLongBreak ? 'longBreak' : 'shortBreak';
  } else {
    appState.pomodoro.phase = 'focus';
  }

  const nextLabel = getPomodoroPhaseLabel();
  appState.pomodoro.remainingMs = getPomodoroPhaseDurationMs();
  appState.pomodoro.status = manual ? `已跳过，准备${nextLabel}` : `阶段完成，准备${nextLabel}`;

  if (!manual) {
    const body = finishedPhase === 'focus'
      ? `${finishedLabel}结束，${nextLabel}时间到了。`
      : `${finishedLabel}结束，准备开始专注。`;
    showSystemNotification('番茄钟', body, true);
  }

  scheduleStateSave();
  broadcastState();
}

function checkTimers() {
  let changed = false;
  const now = Date.now();
  const hasLiveState = appState.countdown.running || appState.pomodoro.running || appState.stopwatch.running;

  if (appState.countdown.running) {
    appState.countdown.remainingMs = Math.max(0, appState.countdown.deadlineMs - now);

    if (
      appState.countdown.mode === 'target'
      && appState.countdown.targetNotifyBeforeMs > 0
      && !appState.countdown.targetPreNotified
      && appState.countdown.remainingMs > 0
      && appState.countdown.remainingMs <= appState.countdown.targetNotifyBeforeMs
    ) {
      appState.countdown.targetPreNotified = true;
      showSystemNotification(
        '指定日期倒计时',
        `距离目标时间还剩约 ${formatLeadTime(appState.countdown.targetNotifyBeforeMs)}。`,
        false,
        mainWindow,
        false
      );
      changed = true;
    }

    if (appState.countdown.remainingMs === 0) {
      appState.countdown.running = false;
      appState.countdown.finished = true;
      appState.countdown.status = '已完成';
      showSystemNotification('倒计时', '倒计时已结束。', true, mainWindow, appState.countdown.mode === 'duration');
      changed = true;
    } else {
      appState.countdown.status = '进行中';
    }
  }

  if (appState.pomodoro.running) {
    appState.pomodoro.remainingMs = Math.max(0, appState.pomodoro.deadlineMs - now);

    if (appState.pomodoro.remainingMs === 0) {
      completePomodoroPhase(false);
      changed = true;
    } else {
      appState.pomodoro.status = '进行中';
    }
  }

  for (const reminder of appState.reminders) {
    if (!reminder.done && reminder.scheduledAt <= now) {
      reminder.done = true;
      reminder.notifiedAt = now;
      showSystemNotification(`提醒：${reminder.title}`, reminder.note || '提醒时间到了。', true, mainWindow, false);
      changed = true;
    }
  }

  if (changed) {
    scheduleStateSave();
  }

  if (changed || hasLiveState) {
    broadcastState();
  }
}

function startTimerEngine() {
  clearInterval(timerEngine);
  timerEngine = setInterval(checkTimers, 1000);
  checkTimers();
}

function updateSettings(partialSettings = {}) {
  const nextSettings = {
    ...appState.settings,
    ...partialSettings,
    pomodoro: {
      ...appState.settings.pomodoro,
      ...(partialSettings.pomodoro || {})
    }
  };

  appState.settings = normalizeSettings(nextSettings);

  if (!appState.pomodoro.running && appState.pomodoro.status === '待开始') {
    appState.pomodoro.remainingMs = getPomodoroPhaseDurationMs();
  }

  applyWindowSettings();
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function setCountdownMode(mode) {
  appState.countdown.mode = mode === 'target' ? 'target' : 'duration';
  appState.countdown.running = false;
  appState.countdown.finished = false;
  appState.countdown.targetPreNotified = false;
  appState.countdown.deadlineMs = 0;
  appState.countdown.remainingMs = appState.countdown.mode === 'duration'
    ? appState.countdown.durationMs
    : Math.max(0, appState.countdown.targetMs - Date.now());
  appState.countdown.status = '待开始';
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function configureCountdown(options = {}) {
  const previousTargetMs = appState.countdown.targetMs;
  const previousNotifyBeforeMs = appState.countdown.targetNotifyBeforeMs;

  if (options.mode === 'target' || options.mode === 'duration') {
    appState.countdown.mode = options.mode;
  }

  if (Number.isFinite(Number(options.durationMs))) {
    appState.countdown.durationMs = Math.max(0, Math.trunc(Number(options.durationMs)));
  }

  if (Number.isFinite(Number(options.targetMs))) {
    appState.countdown.targetMs = Math.max(0, Math.trunc(Number(options.targetMs)));
  }

  if (Object.hasOwn(options, 'targetNotifyBeforeMs')) {
    appState.countdown.targetNotifyBeforeMs = normalizeCountdownNotifyBeforeMs(options.targetNotifyBeforeMs);
  }

  if (Object.hasOwn(options, 'targetNotifyBeforeUnit')) {
    appState.countdown.targetNotifyBeforeUnit = normalizeCountdownNotifyUnit(options.targetNotifyBeforeUnit);
  }

  if (
    appState.countdown.targetMs !== previousTargetMs
    || appState.countdown.targetNotifyBeforeMs !== previousNotifyBeforeMs
  ) {
    appState.countdown.targetPreNotified = false;
  }

  if (!appState.countdown.running) {
    appState.countdown.remainingMs = appState.countdown.mode === 'duration'
      ? appState.countdown.durationMs
      : Math.max(0, appState.countdown.targetMs - Date.now());
    appState.countdown.finished = false;
    appState.countdown.status = '待开始';
  }

  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function startCountdown(options = {}) {
  const hasInputOptions = ['mode', 'durationMs', 'targetMs', 'targetNotifyBeforeMs', 'targetNotifyBeforeUnit']
    .some((key) => Object.hasOwn(options, key));
  const shouldResume = appState.countdown.status === '已暂停' && appState.countdown.remainingMs > 0;
  if (hasInputOptions && !shouldResume) {
    configureCountdown(options);
  }

  const now = Date.now();
  appState.countdown.finished = false;

  if (appState.countdown.mode === 'duration') {
    const remainingMs = appState.countdown.remainingMs > 0
      ? appState.countdown.remainingMs
      : appState.countdown.durationMs;

    if (remainingMs <= 0) {
      appState.countdown.status = '请输入大于 0 的时长';
      broadcastState();
      return getStateSnapshot();
    }

    appState.countdown.remainingMs = remainingMs;
    appState.countdown.deadlineMs = now + remainingMs;
  } else {
    if (shouldResume) {
      appState.countdown.deadlineMs = now + appState.countdown.remainingMs;
      appState.countdown.targetMs = appState.countdown.deadlineMs;
      appState.countdown.running = true;
      appState.countdown.status = '进行中';
      scheduleStateSave();
      broadcastState();
      return getStateSnapshot();
    }

    if (!Number.isFinite(appState.countdown.targetMs) || appState.countdown.targetMs <= now) {
      appState.countdown.status = '请选择未来时间';
      broadcastState();
      return getStateSnapshot();
    }

    appState.countdown.deadlineMs = appState.countdown.targetMs;
    appState.countdown.remainingMs = appState.countdown.targetMs - now;
  }

  appState.countdown.running = true;
  appState.countdown.status = '进行中';
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function pauseCountdown() {
  if (appState.countdown.running) {
    appState.countdown.remainingMs = getCurrentCountdownRemainingMs();
    appState.countdown.running = false;
    appState.countdown.status = '已暂停';
    scheduleStateSave();
    broadcastState();
  }

  return getStateSnapshot();
}

function resetCountdown() {
  appState.countdown.running = false;
  appState.countdown.finished = false;
  appState.countdown.targetPreNotified = false;
  appState.countdown.deadlineMs = 0;
  appState.countdown.remainingMs = appState.countdown.mode === 'duration'
    ? appState.countdown.durationMs
    : Math.max(0, appState.countdown.targetMs - Date.now());
  appState.countdown.status = '待开始';
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function startPomodoro() {
  if (!appState.pomodoro.running) {
    appState.pomodoro.remainingMs ||= getPomodoroPhaseDurationMs();
    appState.pomodoro.deadlineMs = Date.now() + appState.pomodoro.remainingMs;
    appState.pomodoro.running = true;
    appState.pomodoro.status = '进行中';
    scheduleStateSave();
    broadcastState();
  }

  return getStateSnapshot();
}

function pausePomodoro() {
  if (appState.pomodoro.running) {
    appState.pomodoro.remainingMs = getCurrentPomodoroRemainingMs();
    appState.pomodoro.running = false;
    appState.pomodoro.status = '已暂停';
    scheduleStateSave();
    broadcastState();
  }

  return getStateSnapshot();
}

function resetPomodoro() {
  appState.pomodoro.phase = 'focus';
  appState.pomodoro.running = false;
  appState.pomodoro.deadlineMs = 0;
  appState.pomodoro.remainingMs = getPomodoroPhaseDurationMs();
  appState.pomodoro.completedFocusSessions = 0;
  appState.pomodoro.status = '待开始';
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function startStopwatch() {
  if (!appState.stopwatch.running) {
    appState.stopwatch.startEpochMs = Date.now() - appState.stopwatch.elapsedMs;
    appState.stopwatch.running = true;
    appState.stopwatch.status = '进行中';
    scheduleStateSave();
    broadcastState();
  }

  return getStateSnapshot();
}

function pauseStopwatch() {
  if (appState.stopwatch.running) {
    appState.stopwatch.elapsedMs = getCurrentStopwatchElapsedMs();
    appState.stopwatch.running = false;
    appState.stopwatch.status = '已暂停';
    scheduleStateSave();
    broadcastState();
  }

  return getStateSnapshot();
}

function resetStopwatch() {
  appState.stopwatch.running = false;
  appState.stopwatch.startEpochMs = 0;
  appState.stopwatch.elapsedMs = 0;
  appState.stopwatch.status = '待开始';
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function createReminderId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addReminder(reminder = {}) {
  const scheduledAt = Number(reminder.scheduledAt);
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
    throw new Error('请选择未来的提醒时间');
  }

  appState.reminders.push({
    id: createReminderId(),
    title: String(reminder.title || '提醒').trim().slice(0, 60) || '提醒',
    note: String(reminder.note || '').trim().slice(0, 200),
    scheduledAt,
    createdAt: Date.now(),
    done: false
  });
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function updateReminder(id, action) {
  const reminder = appState.reminders.find((item) => item.id === id);
  if (!reminder) {
    return getStateSnapshot();
  }

  if (action === 'delete') {
    appState.reminders = appState.reminders.filter((item) => item.id !== id);
  } else if (action === 'toggle') {
    reminder.done = !reminder.done;
    reminder.notifiedAt = reminder.done ? Date.now() : undefined;
  }

  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function clearDoneReminders() {
  appState.reminders = appState.reminders.filter((reminder) => !reminder.done);
  scheduleStateSave();
  broadcastState();
  return getStateSnapshot();
}

function escapeDesktopEntryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function quoteDesktopExecPart(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function getLaunchPath() {
  return app.isPackaged ? process.execPath : process.argv[0];
}

function getAutostartLaunchArgs() {
  if (app.isPackaged) {
    return autostartArgs;
  }

  return [path.join(__dirname, '..'), ...autostartArgs];
}

function getLinuxAutostartPath() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'autostart', autostartDesktopFileName);
}

function getLinuxDesktopEntry() {
  const execParts = [getLaunchPath(), ...getAutostartLaunchArgs()].map(quoteDesktopExecPart).join(' ');
  const iconPath = getIconPath();

  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${escapeDesktopEntryValue(appDisplayName)}`,
    'Comment=Launch Elegant Clock on login',
    `Exec=${execParts}`,
    `Icon=${escapeDesktopEntryValue(iconPath)}`,
    'Terminal=false',
    'Categories=Utility;',
    'X-GNOME-Autostart-enabled=true',
    `StartupWMClass=${escapeDesktopEntryValue(appDisplayName)}`,
    ''
  ].join('\n');
}

function getWindowsLoginItemSettings() {
  if (app.isPackaged) {
    return app.getLoginItemSettings({
      path: process.execPath,
      args: autostartArgs,
      name: windowsRunEntryName
    });
  }

  return app.getLoginItemSettings({
    path: process.argv[0],
    args: getAutostartLaunchArgs(),
    name: windowsRunEntryName
  });
}

function setWindowsAutostart(enabled) {
  const options = app.isPackaged
    ? {
        openAtLogin: enabled,
        openAsHidden: false,
        path: process.execPath,
        args: autostartArgs,
        name: windowsRunEntryName
      }
    : {
        openAtLogin: enabled,
        openAsHidden: false,
        path: process.argv[0],
        args: getAutostartLaunchArgs(),
        name: windowsRunEntryName
      };

  app.setLoginItemSettings(options);
}

function getAutostartInfo() {
  if (host) return host.getAutostartInfo();
  if (process.platform === 'win32') {
    const loginSettings = getWindowsLoginItemSettings();
    return {
      supported: true,
      enabled: Boolean(loginSettings.openAtLogin),
      method: 'Windows 登录启动项',
      detail: '通过当前用户的 Windows 登录启动项配置'
    };
  }

  if (process.platform === 'linux') {
    const autostartPath = getLinuxAutostartPath();
    let enabled = false;

    if (existsSync(autostartPath)) {
      try {
        enabled = !/^Hidden\s*=\s*true\s*$/im.test(readFileSync(autostartPath, 'utf8'));
      } catch {
        enabled = true;
      }
    }

    return {
      supported: true,
      enabled,
      method: 'XDG Autostart',
      detail: '写入 ~/.config/autostart/elegant-clock.desktop，适配 GNOME、KDE、Cinnamon、LXQt、Xfce 等桌面'
    };
  }

  return {
    supported: false,
    enabled: false,
    method: '不支持的平台',
    detail: '当前平台暂未提供开机自启动配置'
  };
}

function setAutostart(enabled) {
  if (host) return host.setAutostart(enabled);
  if (process.platform === 'win32') {
    setWindowsAutostart(enabled);
    return getAutostartInfo();
  }

  if (process.platform === 'linux') {
    const autostartPath = getLinuxAutostartPath();

    if (enabled) {
      mkdirSync(path.dirname(autostartPath), { recursive: true });
      writeFileSync(autostartPath, getLinuxDesktopEntry(), { encoding: 'utf8', mode: 0o644 });
    } else if (existsSync(autostartPath)) {
      unlinkSync(autostartPath);
    }

    return getAutostartInfo();
  }

  throw new Error('当前平台不支持开机自启动');
}

function getPlatformWindowConfig() {
  return platformWindowConfig[process.platform] || platformWindowConfig.default;
}

function getIconPath() {
  if (host) return host.iconPath;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  }

  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'build', 'icon.ico');
  }

  return path.join(__dirname, '..', 'build', 'icons', '512x512.png');
}

function getAboutInfo() {
  return {
    name: appDisplayName,
    version: app.getVersion(),
    author: packageInfo.author || 'Dai2010',
    githubProfileUrl,
    projectHomepageUrl,
    license: packageInfo.license || 'GPL-3.0-only'
  };
}

function getLinuxDistributionIds() {
  if (process.platform !== 'linux') {
    return [];
  }

  try {
    const values = readFileSync('/etc/os-release', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^(?:ID|ID_LIKE)=(.*)$/)?.[1])
      .filter(Boolean)
      .flatMap((value) => value.replace(/^["']|["']$/g, '').split(/\s+/))
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-z0-9._-]+$/.test(value));

    return [...new Set(values)];
  } catch {
    return [];
  }
}

function sendUpdateProgress(progress) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update:progress', progress);
  }
}

async function performUpdateCheck() {
  if (updateCheckPromise) {
    return updateCheckPromise;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), updateCheckTimeoutMs);
  timeout.unref?.();

  const operation = (async () => {
    const release = await fetchLatestRelease((...args) => net.fetch(...args), abortController.signal);
    latestUpdateInfo = createUpdateInfo(
      release,
      app.getVersion(),
      process.platform,
      process.arch,
      getLinuxDistributionIds()
    );

    return {
      status: latestUpdateInfo ? 'update-available' : 'up-to-date',
      currentVersion: app.getVersion(),
      latestVersion: latestUpdateInfo?.latestVersion || app.getVersion()
    };
  })();
  updateCheckPromise = operation;

  try {
    return await operation;
  } finally {
    clearTimeout(timeout);
    if (updateCheckPromise === operation) {
      updateCheckPromise = undefined;
    }
  }
}

async function checkForUpdatesOnLaunch() {
  if (updateCheckStarted) {
    return;
  }

  updateCheckStarted = true;

  try {
    const result = await performUpdateCheck();
    if (result.status === 'update-available' && !isQuitting) {
      createUpdateWindow();
    }
  } catch {
    // Update checks must not delay or interrupt normal startup.
  }
}

function createDownloadMonitor(asset) {
  const hash = createHash('sha256');
  let downloadedBytes = 0;
  let lastProgressAt = 0;

  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      const nextDownloadedBytes = downloadedBytes + chunk.length;
      if (nextDownloadedBytes > asset.size) {
        callback(new Error('下载文件大小与发布信息不一致'));
        return;
      }

      downloadedBytes = nextDownloadedBytes;
      hash.update(chunk);

      const now = Date.now();
      if (now - lastProgressAt >= updateProgressIntervalMs || downloadedBytes === asset.size) {
        lastProgressAt = now;
        sendUpdateProgress({
          phase: 'downloading',
          message: `正在下载 ${asset.name}`,
          percent: (downloadedBytes / asset.size) * 100
        });
      }

      callback(null, chunk);
    }
  });

  return {
    stream,
    getDownloadedBytes: () => downloadedBytes,
    getSha256: () => hash.digest('hex')
  };
}

async function launchDownloadedUpdate(downloadPath) {
  saveAppStateNow();
  const errorMessage = await electronShell.openPath(downloadPath);

  if (errorMessage) {
    throw new Error(`无法启动系统安装程序：${errorMessage}`);
  }

  sendUpdateProgress({
    phase: 'complete',
    message: '安装程序已启动，Elegant Clock 即将退出'
  });

  const quitTimer = setTimeout(() => {
    isQuitting = true;
    app.quit();
  }, 1200);
  quitTimer.unref?.();
}

async function downloadAndLaunchUpdate(asset, source, signal) {
  const downloadDirectory = await fsPromises.mkdtemp(path.join(app.getPath('temp'), 'elegant-clock-update-'));
  const downloadPath = path.join(downloadDirectory, asset.name);
  const usesProxy = source === 'proxy';
  const sourceName = usesProxy ? 'ghfast.top' : 'GitHub';
  const downloadUrl = usesProxy
    ? getProxyDownloadUrl(asset.downloadUrl)
    : getDirectDownloadUrl(asset.downloadUrl);

  try {
    sendUpdateProgress({
      phase: 'connecting',
      message: `正在连接 ${sourceName}…`
    });

    const response = await net.fetch(downloadUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`${usesProxy ? '代理' : '原地址'}下载失败（HTTP ${response.status}）`);
    }

    sendUpdateProgress({
      phase: 'downloading',
      message: `正在下载 ${asset.name}`,
      percent: 0
    });

    const monitor = createDownloadMonitor(asset);
    await pipeline(
      Readable.fromWeb(response.body),
      monitor.stream,
      createWriteStream(downloadPath, { flags: 'wx', mode: 0o600 }),
      { signal }
    );

    sendUpdateProgress({
      phase: 'verifying',
      message: '正在校验安装包完整性…'
    });

    if (monitor.getDownloadedBytes() !== asset.size) {
      throw new Error('下载文件大小与发布信息不一致');
    }

    if (monitor.getSha256() !== asset.sha256) {
      throw new Error('安装包 SHA-256 校验失败，已阻止运行');
    }

    if (signal.aborted) {
      throw new Error('下载已取消');
    }

    sendUpdateProgress({
      phase: 'launching',
      message: '校验通过，正在启动系统安装程序…'
    });
    await launchDownloadedUpdate(downloadPath);
  } catch (error) {
    await fsPromises.rm(downloadDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function startUpdate(source) {
  if (updateDownloadPromise) {
    return {
      ok: false,
      error: '更新包已在下载中'
    };
  }

  const asset = latestUpdateInfo?.asset;
  if (!asset) {
    return {
      ok: false,
      error: '当前平台没有可校验的安装包，请前往发布页下载'
    };
  }

  const abortController = new AbortController();
  updateDownloadAbortController = abortController;
  const operation = downloadAndLaunchUpdate(asset, source, abortController.signal);
  updateDownloadPromise = operation;

  try {
    await operation;
    return { ok: true };
  } catch (error) {
    const message = abortController.signal.aborted
      ? '下载已取消'
      : error?.message || (source === 'proxy'
        ? '代理更新失败，请前往发布页手动下载'
        : '原地址更新失败，可尝试代理更新');
    sendUpdateProgress({ phase: 'error', message });
    return { ok: false, error: message };
  } finally {
    if (updateDownloadPromise === operation) {
      updateDownloadPromise = undefined;
      updateDownloadAbortController = undefined;
    }
  }
}

function openExternalUrl(value) {
  const url = new URL(String(value));

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) links can be opened externally');
  }

  return electronShell.openExternal(url.toString());
}

function openExternalUrlSafely(value) {
  try {
    return openExternalUrl(value).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function getTrayIcon() {
  const icon = nativeImage.createFromPath(getIconPath());
  const { trayIconSize } = getPlatformWindowConfig();

  return icon.isEmpty()
    ? icon
    : icon.resize({ width: trayIconSize, height: trayIconSize });
}

function clampBoundsToWorkArea(bounds) {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  });
  const { workArea } = display;
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: Math.min(Math.max(Math.round(bounds.x), workArea.x), maxX),
    y: Math.min(Math.max(Math.round(bounds.y), workArea.y), maxY),
    width,
    height
  };
}

function getCompactBounds(window) {
  const { compactWidth, compactHeight } = getPlatformWindowConfig();
  const bounds = window.getBounds();

  return clampBoundsToWorkArea({
    x: bounds.x + (bounds.width - compactWidth) / 2,
    y: bounds.y + (bounds.height - compactHeight) / 2,
    width: compactWidth,
    height: compactHeight
  });
}

function requestFullUi(window = mainWindow) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (compactMode) {
    setWindowCompactMode(window, false);
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
  window.webContents.send('window:restore-full-ui');
}

function requestOrCreateFullUi() {
  if (!app.isReady()) {
    app.whenReady().then(() => requestOrCreateFullUi());
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  requestFullUi();
}

function hideWindowToTray(window = mainWindow) {
  if (!window || window.isDestroyed()) {
    return false;
  }

  if (compactMode) {
    setWindowCompactMode(window, false);
  }

  if (!tray) {
    window.minimize();
    return true;
  }

  window.hide();
  return true;
}

function applyPlatformCompactMode(window, enabled) {
  if (process.platform === 'win32') {
    window.setSkipTaskbar(enabled);
    window.setFocusable(!enabled);
    window.setResizable(!enabled);
    return;
  }

  if (process.platform === 'linux') {
    window.setSkipTaskbar(enabled);
    window.setResizable(!enabled);
    return;
  }

  window.setSkipTaskbar(enabled);
  window.setFocusable(!enabled);
  window.setResizable(!enabled);
}

function setWindowCompactMode(window, enabled) {
  if (!window || window.isDestroyed()) {
    return false;
  }

  if (enabled) {
    if (compactMode) {
      return true;
    }

    compactWindowState.bounds = typeof window.getNormalBounds === 'function'
      ? window.getNormalBounds()
      : window.getBounds();
    compactWindowState.maximized = window.isMaximized();
    compactWindowState.fullscreen = window.isFullScreen();
    compactMode = true;

    if (compactWindowState.fullscreen) {
      window.setFullScreen(false);
    }

    if (compactWindowState.maximized) {
      window.unmaximize();
    }

    applyPlatformCompactMode(window, true);
    window.setMinimumSize(getPlatformWindowConfig().compactWidth, getPlatformWindowConfig().compactHeight);
    window.setBounds(getCompactBounds(window), false);
    window.showInactive();
    return true;
  }

  if (!compactMode) {
    applyPlatformCompactMode(window, false);
    window.show();
    window.focus();
    return true;
  }

  compactMode = false;
  applyPlatformCompactMode(window, false);
  window.setMinimumSize(defaultWindowSize.minWidth, defaultWindowSize.minHeight);

  if (compactWindowState.bounds && !compactWindowState.fullscreen) {
    window.setBounds(clampBoundsToWorkArea(compactWindowState.bounds), false);
  }

  if (compactWindowState.fullscreen) {
    window.setFullScreen(true);
  } else if (compactWindowState.maximized) {
    window.maximize();
  }

  window.show();
  window.focus();
  return true;
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const autostartInfo = getAutostartInfo();

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示完整窗口',
      click: () => requestFullUi()
    },
    {
      label: '隐藏到状态栏',
      click: () => hideWindowToTray()
    },
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    {
      label: '功能',
      click: () => createToolsWindow()
    },
    {
      label: '开机自启动',
      type: 'checkbox',
      enabled: autostartInfo.supported,
      checked: autostartInfo.enabled,
      click: (menuItem) => {
        try {
          setAutostart(menuItem.checked);
        } finally {
          updateTrayMenu();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  if (tray) {
    return;
  }

  const trayIcon = getTrayIcon();
  if (trayIcon.isEmpty()) {
    return;
  }

  try {
    tray = new Tray(trayIcon);
  } catch {
    tray = null;
    return;
  }

  tray.setToolTip('Elegant Clock');
  tray.on('click', () => requestFullUi());
  tray.on('double-click', () => requestFullUi());
  updateTrayMenu();
}

function getDefaultRingtonePath() {
  if (host) return host.ringtonePath();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'audio', 'ringtone_default.mp3');
  }

  return path.join(__dirname, 'assets', 'audio', 'ringtone_default.mp3');
}

function createRingtonePayload(filePath) {
  return {
    path: filePath,
    url: pathToFileURL(filePath).toString(),
    name: path.basename(filePath)
  };
}

function getWatchdogScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'watchdog', 'watchdog.js');
  }

  return path.join(__dirname, 'watchdog.js');
}

function shouldMonitorMainRenderer() {
  return Boolean(
    mainWindow
    && !mainWindow.isDestroyed()
    && mainWindow.isVisible()
    && !mainWindow.isMinimized()
  );
}

function clearRendererRecoveryLock() {
  if (rendererRecoveryTimer) {
    clearTimeout(rendererRecoveryTimer);
    rendererRecoveryTimer = undefined;
  }
}

function recoverMainRendererSilently() {
  if (isQuitting || rendererRecoveryTimer || !shouldMonitorMainRenderer()) {
    return false;
  }

  const contents = mainWindow.webContents;
  if (contents.isDestroyed() || contents.isLoadingMainFrame()) {
    return false;
  }

  rendererRecoveryTimer = setTimeout(clearRendererRecoveryLock, rendererRecoveryLockMs);
  rendererRecoveryTimer.unref?.();

  try {
    contents.reloadIgnoringCache();
    return true;
  } catch {
    clearRendererRecoveryLock();
    return false;
  }
}

function syncWatchdogMonitoringState() {
  if (!watchdogProcess || !watchdogReady) {
    return;
  }

  try {
    watchdogProcess.postMessage({
      type: 'renderer-monitoring',
      enabled: shouldMonitorMainRenderer()
    });
  } catch {
    watchdogReady = false;
  }
}

function forwardRendererHeartbeat() {
  if (!shouldMonitorMainRenderer()) {
    watchdogHeartbeatPending = false;
    return;
  }

  watchdogHeartbeatPending = true;

  if (!watchdogProcess || !watchdogReady) {
    return;
  }

  try {
    watchdogProcess.postMessage({ type: 'renderer-heartbeat' });
    watchdogHeartbeatPending = false;
  } catch {
    watchdogReady = false;
  }
}

function scheduleWatchdogRestart() {
  if (isQuitting || watchdogRestartTimer) {
    return;
  }

  watchdogRestartTimer = setTimeout(() => {
    watchdogRestartTimer = undefined;
    startWatchdogProcess();
  }, watchdogRestartDelayMs);
  watchdogRestartTimer.unref?.();
}

function startWatchdogProcess() {
  if (isQuitting || watchdogProcess) {
    return;
  }

  let child;
  try {
    child = utilityProcess.fork(getWatchdogScriptPath(), [], {
      serviceName: 'Elegant Clock Watchdog',
      stdio: 'ignore'
    });
  } catch {
    scheduleWatchdogRestart();
    return;
  }

  watchdogProcess = child;
  watchdogReady = false;

  child.on('message', (message) => {
    if (watchdogProcess !== child) {
      return;
    }

    if (message?.type === 'watchdog-ready') {
      watchdogReady = true;
      syncWatchdogMonitoringState();
      if (watchdogHeartbeatPending) {
        forwardRendererHeartbeat();
      }
      return;
    }

    if (message?.type === 'renderer-stalled') {
      recoverMainRendererSilently();
    }
  });

  child.on('error', (type, location) => {
    console.error(`Watchdog process error (${type}) at ${location}`);
  });

  child.once('exit', () => {
    if (watchdogProcess !== child) {
      return;
    }

    watchdogProcess = undefined;
    watchdogReady = false;
    scheduleWatchdogRestart();
  });
}

function stopWatchdogProcess() {
  if (watchdogRestartTimer) {
    clearTimeout(watchdogRestartTimer);
    watchdogRestartTimer = undefined;
  }

  clearRendererRecoveryLock();
  watchdogReady = false;
  watchdogHeartbeatPending = false;

  const child = watchdogProcess;
  watchdogProcess = undefined;
  if (!child) {
    return;
  }

  try {
    child.postMessage({ type: 'shutdown' });
  } catch {
    child.kill();
  }
}

function runWatchdogSmokeTest() {
  let child;
  let watchdogResponded = false;
  let watchdogFailed = false;
  let finished = false;

  const finish = (exitCode) => {
    if (finished) {
      return;
    }

    finished = true;
    clearTimeout(timeout);
    app.exit(exitCode);
  };

  const timeout = setTimeout(() => {
    child?.kill();
    console.error('Packaged watchdog smoke test timed out.');
    finish(1);
  }, watchdogSmokeTestTimeoutMs);

  try {
    child = utilityProcess.fork(getWatchdogScriptPath(), [], {
      serviceName: 'Elegant Clock Watchdog Smoke Test',
      stdio: 'ignore'
    });
  } catch (error) {
    console.error('Unable to start the packaged watchdog process.', error);
    finish(1);
    return;
  }

  child.on('message', (message) => {
    if (message?.type !== 'watchdog-ready') {
      return;
    }

    watchdogResponded = true;
    try {
      child.postMessage({ type: 'shutdown' });
    } catch (error) {
      console.error('Unable to communicate with the packaged watchdog process.', error);
      finish(1);
    }
  });

  child.on('error', (type, location) => {
    watchdogFailed = true;
    console.error(`Packaged watchdog process error (${type}) at ${location}`);
  });

  child.once('exit', (code) => {
    finish(watchdogResponded && !watchdogFailed && code === 0 ? 0 : 1);
  });
}

function createWindow() {
  compactMode = false;
  mainWindow = new BrowserWindow({
    width: defaultWindowSize.width,
    height: defaultWindowSize.height,
    minWidth: defaultWindowSize.minWidth,
    minHeight: defaultWindowSize.minHeight,
    title: 'Elegant Clock',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: getIconPath(),
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.center();
    applyWindowSettings();
    if (host?.startHidden) {
      mainWindow.hide();
    } else if (startInCompactMode) {
      setWindowCompactMode(mainWindow, true);
      mainWindow.webContents.send('window:compact-state', true);
    } else {
      mainWindow.show();
    }
  });
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('state:changed', getStateSnapshot());
    mainWindow?.webContents.send('toolkit:schedule', host?.getScheduleState());
  });

  mainWindow.on('close', (event) => {
    if (isQuitting || !tray) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    syncWatchdogMonitoringState();
  });
  mainWindow.on('show', syncWatchdogMonitoringState);
  mainWindow.on('hide', syncWatchdogMonitoringState);
  mainWindow.on('minimize', syncWatchdogMonitoringState);
  mainWindow.on('restore', syncWatchdogMonitoringState);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function createManagedWindow(kind, options) {
  const existingWindow = kind === 'settings' ? settingsWindow : toolsWindow;
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const window = new BrowserWindow({
    width: options.width,
    height: options.height,
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    title: options.title,
    frame: true,
    backgroundColor: '#101623',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.once('did-finish-load', () => {
    window.webContents.send('state:changed', getStateSnapshot());
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrlSafely(url);
    return { action: 'deny' };
  });
  window.on('closed', () => {
    if (kind === 'settings') {
      settingsWindow = null;
    } else {
      toolsWindow = null;
    }
  });
  window.loadFile(path.join(__dirname, options.file));

  if (kind === 'settings') {
    settingsWindow = window;
  } else {
    toolsWindow = window;
  }

  return window;
}

function createSettingsWindow() {
  return createManagedWindow('settings', {
    file: 'settings.html',
    title: 'Elegant Clock 设置',
    width: 660,
    height: 720,
    minWidth: 520,
    minHeight: 560
  });
}

function createToolsWindow() {
  return createManagedWindow('tools', {
    file: 'tools.html',
    title: 'Elegant Clock 功能',
    width: 660,
    height: 720,
    minWidth: 520,
    minHeight: 560
  });
}

function createAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show();
    aboutWindow.focus();
    return;
  }

  const aboutFilePath = path.join(__dirname, 'about.html');
  const aboutFileUrl = pathToFileURL(aboutFilePath).toString();

  aboutWindow = new BrowserWindow({
    width: 500,
    height: 430,
    minWidth: 420,
    minHeight: 360,
    title: '关于 Elegant Clock',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: false,
    frame: true,
    backgroundColor: '#101623',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  aboutWindow.setMenuBarVisibility(false);
  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show();
  });
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrlSafely(url);
    return { action: 'deny' };
  });
  aboutWindow.webContents.on('will-navigate', (event, url) => {
    if (url === aboutFileUrl) {
      return;
    }

    event.preventDefault();
    openExternalUrlSafely(url);
  });
  aboutWindow.loadFile(aboutFilePath);
}

function createUpdateWindow() {
  if (!latestUpdateInfo) {
    return null;
  }

  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show();
    updateWindow.focus();
    return updateWindow;
  }

  const updateFilePath = path.join(__dirname, 'update.html');
  const updateFileUrl = pathToFileURL(updateFilePath).toString();

  updateWindow = new BrowserWindow({
    width: 620,
    height: 680,
    minWidth: 460,
    minHeight: 520,
    title: 'Elegant Clock 更新',
    frame: true,
    backgroundColor: '#17191c',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // This window deliberately has no parent, so main-window compacting and hiding cannot affect it.
  updateWindow.setMenuBarVisibility(false);
  updateWindow.once('ready-to-show', () => {
    updateWindow?.show();
    updateWindow?.focus();
  });
  updateWindow.on('closed', () => {
    updateWindow = null;
    updateDownloadAbortController?.abort();
  });
  updateWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrlSafely(url);
    return { action: 'deny' };
  });
  updateWindow.webContents.on('will-navigate', (event, url) => {
    if (url === updateFileUrl) {
      return;
    }

    event.preventDefault();
    openExternalUrlSafely(url);
  });
  updateWindow.loadFile(updateFilePath);

  return updateWindow;
}

module.exports = {
  initialize(services) {
    host = services;
    loadAppState();
    startTimerEngine();
    createTray();
    startWatchdogProcess();
  },
  show: requestOrCreateFullUi,
  compact() { startInCompactMode = true; requestOrCreateFullUi(); },
  hide() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); },
  settings: createSettingsWindow,
  tools: createToolsWindow,
  sync() {
    mainWindow?.webContents.send('toolkit:schedule', host.getScheduleState());
    updateSettings({ ringtone: createRingtonePayload(host.ringtonePath()) });
  }
};

app.on('before-quit', () => {
  isQuitting = true;
  stopWatchdogProcess();
  saveAppStateNow();
});

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:get-about-info', () => getAboutInfo());

ipcMain.handle('app:get-update-info', () => latestUpdateInfo ? clone(latestUpdateInfo) : null);

ipcMain.handle('app:check-for-updates', async (event) => {
  if (host) {
    await electronShell.openExternal('https://github.com/Dai2010/Education-Toolkit/releases/latest');
    return { ok: true, status: 'up-to-date' };
  }
  if (getWindowFromEvent(event) !== settingsWindow) {
    return {
      ok: false,
      error: '只能从设置窗口检查更新'
    };
  }

  try {
    const result = await performUpdateCheck();
    if (result.status === 'update-available' && !isQuitting) {
      createUpdateWindow();
    }

    return { ok: true, ...result };
  } catch {
    return {
      ok: false,
      error: '检查更新失败，请检查网络连接后重试'
    };
  }
});

ipcMain.handle('app:start-direct-update', (event) => {
  if (host) return { ok: false, error: '请通过 Education Toolkit 更新整个工具包' };
  if (getWindowFromEvent(event) !== updateWindow) {
    return {
      ok: false,
      error: '原地址更新只能从版本提示窗口启动'
    };
  }

  return startUpdate('direct');
});

ipcMain.handle('app:start-proxy-update', (event) => {
  if (host) return { ok: false, error: '请通过 Education Toolkit 更新整个工具包' };
  if (getWindowFromEvent(event) !== updateWindow) {
    return {
      ok: false,
      error: '代理更新只能从版本提示窗口启动'
    };
  }

  return startUpdate('proxy');
});

ipcMain.handle('app:open-about', () => {
  createAboutWindow();
  return true;
});

ipcMain.handle('app:open-settings', () => {
  createSettingsWindow();
  return true;
});

ipcMain.handle('app:open-tools', () => {
  createToolsWindow();
  return true;
});

ipcMain.handle('app:open-external', (_event, url) => openExternalUrl(url));

ipcMain.handle('state:get', () => getStateSnapshot());

ipcMain.handle('state:update-settings', (_event, partialSettings) => updateSettings(partialSettings || {}));

ipcMain.handle('countdown:set-mode', (_event, mode) => setCountdownMode(mode));

ipcMain.handle('countdown:configure', (_event, options) => configureCountdown(options || {}));

ipcMain.handle('countdown:start', (_event, options) => startCountdown(options || {}));

ipcMain.handle('countdown:pause', () => pauseCountdown());

ipcMain.handle('countdown:reset', () => resetCountdown());

ipcMain.handle('pomodoro:start', () => startPomodoro());

ipcMain.handle('pomodoro:pause', () => pausePomodoro());

ipcMain.handle('pomodoro:skip', () => {
  completePomodoroPhase(true);
  return getStateSnapshot();
});

ipcMain.handle('pomodoro:reset', () => resetPomodoro());

ipcMain.handle('stopwatch:start', () => startStopwatch());

ipcMain.handle('stopwatch:pause', () => pauseStopwatch());

ipcMain.handle('stopwatch:reset', () => resetStopwatch());

ipcMain.handle('reminder:add', (_event, reminder) => addReminder(reminder || {}));

ipcMain.handle('reminder:update', (_event, id, action) => updateReminder(String(id || ''), action));

ipcMain.handle('reminder:clear-done', () => clearDoneReminders());

ipcMain.handle('app:get-default-ringtone', () => createRingtonePayload(getDefaultRingtonePath()));

ipcMain.handle('app:get-autostart', () => getAutostartInfo());

ipcMain.handle('app:set-autostart', (_event, enabled) => {
  const autostartInfo = setAutostart(Boolean(enabled));
  updateTrayMenu();
  return autostartInfo;
});

ipcMain.handle('ringtone:choose', async (event) => {
  const window = getWindowFromEvent(event);
  const dialogOptions = {
    title: '选择闹钟铃声',
    properties: ['openFile'],
    filters: [
      { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  };
  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return createRingtonePayload(result.filePaths[0]);
});

ipcMain.handle('notification:show', (event, options = {}) => {
  const window = getWindowFromEvent(event);
  const title = String(options.title || 'Elegant Clock');
  const body = String(options.body || '提醒时间到了');
  showSystemNotification(title, body, Boolean(options.focus), window);
  return true;
});

ipcMain.on('window:minimize', (event) => {
  getWindowFromEvent(event)?.minimize();
});

ipcMain.on('window:hide-to-tray', (event) => {
  hideWindowToTray(getWindowFromEvent(event));
});

ipcMain.on('window:toggle-maximize', (event) => {
  const window = getWindowFromEvent(event);
  if (!window) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.handle('window:set-compact-mode', (event, enabled) => setWindowCompactMode(getWindowFromEvent(event), enabled));

ipcMain.handle('window:get-compact-mode', (event) => (
  getWindowFromEvent(event) === mainWindow && compactMode
));

ipcMain.on('watchdog:renderer-heartbeat', (event) => {
  if (getWindowFromEvent(event) === mainWindow) {
    forwardRendererHeartbeat();
  }
});

ipcMain.on('window:move-by', (event, positionDelta = {}) => {
  const window = getWindowFromEvent(event);
  if (!window || !compactMode) {
    return;
  }

  const bounds = window.getBounds();
  const nextBounds = clampBoundsToWorkArea({
    x: bounds.x + (Number(positionDelta.deltaX) || 0),
    y: bounds.y + (Number(positionDelta.deltaY) || 0),
    width: bounds.width,
    height: bounds.height
  });

  window.setBounds(nextBounds, false);
});

ipcMain.on('window:close', (event) => {
  getWindowFromEvent(event)?.close();
});

ipcMain.on('window:set-always-on-top', (event, enabled) => {
  getWindowFromEvent(event)?.setAlwaysOnTop(Boolean(enabled), 'floating');
});
