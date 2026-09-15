const shell = window.elegantClock;

const elements = {
  toolBack: document.querySelector('#tool-back'),
  toolsTitle: document.querySelector('#tools-title'),
  toolsStatus: document.querySelector('#tools-status'),
  toolsMenu: document.querySelector('#tools-menu'),
  toolViews: document.querySelectorAll('[data-tool-view]'),
  pomodoroMenuStatus: document.querySelector('#pomodoro-menu-status'),
  countdownMenuStatus: document.querySelector('#countdown-menu-status'),
  stopwatchMenuStatus: document.querySelector('#stopwatch-menu-status'),
  reminderMenuStatus: document.querySelector('#reminder-menu-status'),
  pomodoroStatus: document.querySelector('#pomodoro-status'),
  pomodoroPhase: document.querySelector('#pomodoro-phase'),
  pomodoroCycle: document.querySelector('#pomodoro-cycle'),
  pomodoroDisplay: document.querySelector('#pomodoro-display'),
  pomodoroFocusInput: document.querySelector('#pomodoro-focus-input'),
  pomodoroShortInput: document.querySelector('#pomodoro-short-input'),
  pomodoroLongInput: document.querySelector('#pomodoro-long-input'),
  pomodoroLongEveryInput: document.querySelector('#pomodoro-long-every-input'),
  pomodoroStart: document.querySelector('#pomodoro-start'),
  pomodoroPause: document.querySelector('#pomodoro-pause'),
  pomodoroSkip: document.querySelector('#pomodoro-skip'),
  pomodoroReset: document.querySelector('#pomodoro-reset'),
  countdownStatus: document.querySelector('#countdown-status'),
  countdownDisplay: document.querySelector('#countdown-display'),
  countdownStart: document.querySelector('#countdown-start'),
  countdownPause: document.querySelector('#countdown-pause'),
  countdownReset: document.querySelector('#countdown-reset'),
  durationFields: document.querySelector('#duration-fields'),
  targetFields: document.querySelector('#target-fields'),
  hoursInput: document.querySelector('#hours-input'),
  minutesInput: document.querySelector('#minutes-input'),
  secondsInput: document.querySelector('#seconds-input'),
  targetInput: document.querySelector('#target-input'),
  targetNotifyBeforeInput: document.querySelector('#target-notify-before-input'),
  targetNotifyBeforeUnit: document.querySelector('#target-notify-before-unit'),
  stopwatchStatus: document.querySelector('#stopwatch-status'),
  stopwatchDisplay: document.querySelector('#stopwatch-display'),
  stopwatchStart: document.querySelector('#stopwatch-start'),
  stopwatchPause: document.querySelector('#stopwatch-pause'),
  stopwatchReset: document.querySelector('#stopwatch-reset'),
  reminderStatus: document.querySelector('#reminder-status'),
  reminderTitleInput: document.querySelector('#reminder-title-input'),
  reminderTimeInput: document.querySelector('#reminder-time-input'),
  reminderNoteInput: document.querySelector('#reminder-note-input'),
  reminderAdd: document.querySelector('#reminder-add'),
  reminderClearDone: document.querySelector('#reminder-clear-done'),
  reminderList: document.querySelector('#reminder-list')
};

let currentState;
let activeTool = '';
const editingFields = new WeakSet();

const toolTitles = {
  pomodoro: '番茄钟',
  countdown: '倒计时',
  stopwatch: '正计时',
  reminders: '提醒'
};

const reminderDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function isEditingField(element) {
  return document.activeElement === element || editingFields.has(element);
}

function setInputValue(element, value) {
  const nextValue = String(value);
  if (!isEditingField(element) && element.value !== nextValue) {
    element.value = nextValue;
  }
}

function trackEditableField(element) {
  element.addEventListener('focusin', () => {
    editingFields.add(element);
  });
  element.addEventListener('focusout', () => {
    window.setTimeout(() => editingFields.delete(element), 120);
  });
}

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

function applyWindowTheme(settings = {}) {
  const rootStyle = document.documentElement.style;
  const backgroundColor = normalizeColor(settings.backgroundColor, '#101623');
  rootStyle.setProperty('--clock-font-family', settings.fontFamily || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  rootStyle.setProperty('--text', normalizeColor(settings.fontColor, '#f8fbff'));
  rootStyle.setProperty('--background-color', backgroundColor);
  rootStyle.setProperty('--panel-rgb', hexToRgbParts(backgroundColor));
}

function formatDuration(milliseconds, withTenths = false) {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMs % 1000) / 100);
  const base = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');

  return `${days > 0 ? `${days}天 ` : ''}${base}${withTenths ? `.${tenths}` : ''}`;
}

function formatPomodoroDuration(milliseconds) {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function toLocalDateTimeValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function splitDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function readDurationMs() {
  const hours = clampNumber(elements.hoursInput.value, 0, 999);
  const minutes = clampNumber(elements.minutesInput.value, 0, 59);
  const seconds = clampNumber(elements.secondsInput.value, 0, 59);

  elements.hoursInput.value = String(hours);
  elements.minutesInput.value = String(minutes);
  elements.secondsInput.value = String(seconds);

  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
}

function readTargetMs() {
  if (!elements.targetInput.value) {
    return Number.NaN;
  }

  const targetMs = new Date(elements.targetInput.value).getTime();
  return Number.isFinite(targetMs) ? targetMs : Number.NaN;
}

function readTargetNotifyBeforeUnit() {
  return elements.targetNotifyBeforeUnit.value === 'days' ? 'days' : 'hours';
}

function readTargetNotifyBeforeMs() {
  const unit = readTargetNotifyBeforeUnit();
  const maxAmount = unit === 'days' ? 3650 : 3650 * 24;
  const amount = clampNumber(elements.targetNotifyBeforeInput.value, 0, maxAmount);
  elements.targetNotifyBeforeInput.value = String(amount);

  return amount * (unit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
}

function getTargetNotifyBeforeAmount(countdown = {}) {
  const unit = countdown.targetNotifyBeforeUnit === 'days' ? 'days' : 'hours';
  const unitMs = unit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

  return Math.floor((Number(countdown.targetNotifyBeforeMs) || 0) / unitMs);
}

function syncTargetNotifyBeforeLimit() {
  elements.targetNotifyBeforeInput.max = readTargetNotifyBeforeUnit() === 'days' ? '3650' : '87600';
}

function syncPomodoroInputs(settings = {}) {
  setInputValue(elements.pomodoroFocusInput, settings.focusMinutes ?? 25);
  setInputValue(elements.pomodoroShortInput, settings.shortBreakMinutes ?? 5);
  setInputValue(elements.pomodoroLongInput, settings.longBreakMinutes ?? 15);
  setInputValue(elements.pomodoroLongEveryInput, settings.longBreakEvery ?? 4);
}

function readPomodoroConfig() {
  return {
    focusMinutes: clampNumber(elements.pomodoroFocusInput.value, 1, 180),
    shortBreakMinutes: clampNumber(elements.pomodoroShortInput.value, 1, 60),
    longBreakMinutes: clampNumber(elements.pomodoroLongInput.value, 1, 120),
    longBreakEvery: clampNumber(elements.pomodoroLongEveryInput.value, 1, 12)
  };
}

function sortReminders(reminderList) {
  return [...reminderList].sort((first, second) => {
    if (first.done !== second.done) {
      return Number(first.done) - Number(second.done);
    }

    return first.scheduledAt - second.scheduledAt;
  });
}

function updateToolMenu(state) {
  const countdown = state?.countdown;
  const pomodoro = state?.pomodoro;
  const stopwatch = state?.stopwatch;
  const reminders = state?.reminders || [];
  const pendingReminders = reminders.filter((reminder) => !reminder.done);

  elements.pomodoroMenuStatus.textContent = `${pomodoro?.phaseLabel || '专注'} · ${pomodoro?.status || '待开始'}`;
  elements.countdownMenuStatus.textContent = countdown?.running || countdown?.status === '已暂停'
    ? `${formatDuration(countdown.remainingMs)} · ${countdown.status}`
    : countdown?.status || '待开始';
  elements.stopwatchMenuStatus.textContent = stopwatch?.running || stopwatch?.elapsedMs > 0
    ? `${formatDuration(stopwatch.elapsedMs, true)} · ${stopwatch.status}`
    : '待开始';
  elements.reminderMenuStatus.textContent = pendingReminders.length > 0
    ? `${pendingReminders.length} 个待提醒`
    : '暂无待提醒';
}

function renderPomodoro(state) {
  const pomodoro = state?.pomodoro || {};
  elements.pomodoroPhase.textContent = pomodoro.phaseLabel || '专注';
  elements.pomodoroCycle.textContent = `已完成 ${pomodoro.completedFocusSessions || 0} 个番茄`;
  elements.pomodoroStatus.textContent = pomodoro.status || '待开始';
  elements.pomodoroDisplay.value = formatPomodoroDuration(pomodoro.remainingMs || 0);
  syncPomodoroInputs(state?.settings?.pomodoro || {});
}

function renderCountdown(state) {
  const countdown = state?.countdown || {};
  document.querySelectorAll('input[name="countdown-mode"]').forEach((input) => {
    input.checked = input.value === (countdown.mode || 'duration');
  });
  elements.durationFields.hidden = countdown.mode === 'target';
  elements.targetFields.hidden = countdown.mode !== 'target';
  elements.countdownStatus.textContent = countdown.status || '待开始';
  elements.countdownDisplay.value = formatDuration(countdown.remainingMs || 0);

  if (!countdown.running) {
    const duration = splitDuration(countdown.durationMs || countdown.remainingMs || 0);
    setInputValue(elements.hoursInput, duration.hours);
    setInputValue(elements.minutesInput, duration.minutes);
    setInputValue(elements.secondsInput, duration.seconds);
    setInputValue(elements.targetInput, countdown.targetMs > 0
      ? toLocalDateTimeValue(new Date(countdown.targetMs))
      : elements.targetInput.value || toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  }

  setInputValue(elements.targetNotifyBeforeInput, getTargetNotifyBeforeAmount(countdown));
  setInputValue(elements.targetNotifyBeforeUnit, countdown.targetNotifyBeforeUnit === 'days' ? 'days' : 'hours');
  syncTargetNotifyBeforeLimit();
}

function renderStopwatch(state) {
  const stopwatch = state?.stopwatch || {};
  elements.stopwatchStatus.textContent = stopwatch.status || '待开始';
  elements.stopwatchDisplay.value = formatDuration(stopwatch.elapsedMs || 0, true);
}

function renderReminderStatus(reminders = []) {
  const pendingReminders = reminders
    .filter((reminder) => !reminder.done)
    .sort((first, second) => first.scheduledAt - second.scheduledAt);
  const doneCount = reminders.length - pendingReminders.length;

  if (pendingReminders.length > 0) {
    elements.reminderStatus.textContent = `${pendingReminders.length} 个待提醒 · 下一个 ${reminderDateFormatter.format(new Date(pendingReminders[0].scheduledAt))}`;
  } else if (doneCount > 0) {
    elements.reminderStatus.textContent = `${doneCount} 个已提醒`;
  } else {
    elements.reminderStatus.textContent = '暂无提醒';
  }
}

function renderReminders(state) {
  const reminders = state?.reminders || [];
  elements.reminderList.replaceChildren();

  for (const reminder of sortReminders(reminders)) {
    const item = document.createElement('li');
    item.className = 'reminder-item';
    item.classList.toggle('done', Boolean(reminder.done));

    const content = document.createElement('div');
    const title = document.createElement('p');
    const meta = document.createElement('p');
    const note = document.createElement('p');
    const actions = document.createElement('div');
    const toggleButton = document.createElement('button');
    const deleteButton = document.createElement('button');

    title.className = 'reminder-title';
    title.textContent = reminder.title;
    meta.className = 'reminder-meta';
    meta.textContent = `${reminder.done ? '已提醒' : '待提醒'} · ${reminderDateFormatter.format(new Date(reminder.scheduledAt))}`;
    note.className = 'reminder-note';
    note.textContent = reminder.note || '无备注';

    actions.className = 'reminder-item-actions';
    toggleButton.type = 'button';
    toggleButton.className = 'reminder-toggle';
    toggleButton.dataset.id = reminder.id;
    toggleButton.textContent = reminder.done ? '恢复' : '完成';
    deleteButton.type = 'button';
    deleteButton.className = 'reminder-delete';
    deleteButton.dataset.id = reminder.id;
    deleteButton.textContent = '删除';

    content.append(title, meta, note);
    actions.append(toggleButton, deleteButton);
    item.append(content, actions);
    elements.reminderList.append(item);
  }

  renderReminderStatus(reminders);
}

function renderState(state) {
  currentState = state;
  applyWindowTheme(state?.settings || {});
  updateToolMenu(state);
  renderPomodoro(state);
  renderCountdown(state);
  renderStopwatch(state);
  renderReminders(state);
}

function openTool(tool) {
  activeTool = tool;
  elements.toolsMenu.hidden = true;
  elements.toolBack.hidden = false;
  elements.toolsTitle.textContent = toolTitles[tool] || '功能';
  elements.toolsStatus.textContent = '控制面板';
  elements.toolViews.forEach((view) => {
    view.hidden = view.dataset.toolView !== tool;
  });
}

function backToMenu() {
  activeTool = '';
  elements.toolsMenu.hidden = false;
  elements.toolBack.hidden = true;
  elements.toolsTitle.textContent = '功能';
  elements.toolsStatus.textContent = '选择一个功能';
  elements.toolViews.forEach((view) => {
    view.hidden = true;
  });
}

function setDefaultReminderTime() {
  elements.reminderTimeInput.value = toLocalDateTimeValue(new Date(Date.now() + 10 * 60 * 1000));
}

function updatePomodoroSettings() {
  shell?.updateSettings?.({ pomodoro: readPomodoroConfig() })?.catch?.(() => {});
}

function readCountdownOptions(requireTarget = false) {
  const targetMs = readTargetMs();
  const options = {
    mode: currentState?.countdown?.mode || 'duration',
    durationMs: readDurationMs(),
    targetNotifyBeforeMs: readTargetNotifyBeforeMs(),
    targetNotifyBeforeUnit: readTargetNotifyBeforeUnit()
  };

  if (Number.isFinite(targetMs)) {
    options.targetMs = targetMs;
  } else if (requireTarget) {
    options.targetMs = 0;
  }

  return options;
}

function configureCountdown() {
  return shell?.countdownConfigure?.(readCountdownOptions(false));
}

async function addReminder() {
  const title = elements.reminderTitleInput.value.trim() || '提醒';
  const scheduledAt = new Date(elements.reminderTimeInput.value).getTime();
  const note = elements.reminderNoteInput.value.trim();

  try {
    await shell?.reminderAdd?.({ title, scheduledAt, note });
    elements.reminderTitleInput.value = '';
    elements.reminderNoteInput.value = '';
    setDefaultReminderTime();
  } catch {
    elements.reminderStatus.textContent = '请选择未来的提醒时间';
  }
}

function bindEvents() {
  elements.toolsMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tool]');
    if (button) {
      openTool(button.dataset.tool);
    }
  });

  elements.toolBack.addEventListener('click', backToMenu);

  [
    elements.pomodoroFocusInput,
    elements.pomodoroShortInput,
    elements.pomodoroLongInput,
    elements.pomodoroLongEveryInput,
    elements.hoursInput,
    elements.minutesInput,
    elements.secondsInput,
    elements.targetInput,
    elements.targetNotifyBeforeInput,
    elements.targetNotifyBeforeUnit,
    elements.reminderTimeInput
  ].forEach(trackEditableField);

  [
    elements.pomodoroFocusInput,
    elements.pomodoroShortInput,
    elements.pomodoroLongInput,
    elements.pomodoroLongEveryInput
  ].forEach((input) => {
    input.addEventListener('change', updatePomodoroSettings);
  });

  elements.pomodoroStart.addEventListener('click', async () => {
    updatePomodoroSettings();
    await shell?.pomodoroStart?.();
  });
  elements.pomodoroPause.addEventListener('click', () => shell?.pomodoroPause?.());
  elements.pomodoroSkip.addEventListener('click', () => shell?.pomodoroSkip?.());
  elements.pomodoroReset.addEventListener('click', () => shell?.pomodoroReset?.());

  document.querySelectorAll('input[name="countdown-mode"]').forEach((input) => {
    input.addEventListener('change', () => shell?.countdownSetMode?.(input.value));
  });

  [elements.hoursInput, elements.minutesInput, elements.secondsInput, elements.targetInput].forEach((input) => {
    input.addEventListener('change', () => {
      if (!currentState?.countdown?.running) {
        configureCountdown()?.catch?.(() => {});
      }
    });
  });

  [elements.targetNotifyBeforeInput, elements.targetNotifyBeforeUnit].forEach((input) => {
    input.addEventListener('change', () => {
      syncTargetNotifyBeforeLimit();
      configureCountdown()?.catch?.(() => {});
    });
  });

  elements.countdownStart.addEventListener('click', () => shell?.countdownStart?.(
    readCountdownOptions((currentState?.countdown?.mode || 'duration') === 'target')
  ));
  elements.countdownPause.addEventListener('click', () => shell?.countdownPause?.());
  elements.countdownReset.addEventListener('click', () => shell?.countdownReset?.());
  elements.stopwatchStart.addEventListener('click', () => shell?.stopwatchStart?.());
  elements.stopwatchPause.addEventListener('click', () => shell?.stopwatchPause?.());
  elements.stopwatchReset.addEventListener('click', () => shell?.stopwatchReset?.());

  elements.reminderAdd.addEventListener('click', addReminder);
  elements.reminderClearDone.addEventListener('click', () => shell?.reminderClearDone?.());
  elements.reminderList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) {
      return;
    }

    if (button.classList.contains('reminder-delete')) {
      shell?.reminderUpdate?.(button.dataset.id, 'delete');
    } else if (button.classList.contains('reminder-toggle')) {
      shell?.reminderUpdate?.(button.dataset.id, 'toggle');
    }
  });

  shell?.onStateChanged?.(renderState);
}

function refreshRunningDisplays() {
  if (!currentState) {
    return;
  }

  const state = structuredClone(currentState);
  if (state.countdown?.running) {
    state.countdown.remainingMs = Math.max(0, state.countdown.deadlineMs - Date.now());
  }
  if (state.pomodoro?.running) {
    state.pomodoro.remainingMs = Math.max(0, state.pomodoro.deadlineMs - Date.now());
  }
  if (state.stopwatch?.running) {
    state.stopwatch.elapsedMs = Math.max(0, Date.now() - state.stopwatch.startEpochMs);
  }

  updateToolMenu(state);
  if (activeTool === 'pomodoro') {
    elements.pomodoroDisplay.value = formatPomodoroDuration(state.pomodoro.remainingMs || 0);
  } else if (activeTool === 'countdown') {
    elements.countdownDisplay.value = formatDuration(state.countdown.remainingMs || 0);
  } else if (activeTool === 'stopwatch') {
    elements.stopwatchDisplay.value = formatDuration(state.stopwatch.elapsedMs || 0, true);
  }
}

async function init() {
  bindEvents();
  setDefaultReminderTime();
  renderState(await shell?.getState?.());
  window.setInterval(refreshRunningDisplays, 200);
}

init();
