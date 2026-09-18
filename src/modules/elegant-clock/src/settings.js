const shell = window.elegantClock;

const elements = {
  appearanceStatus: document.querySelector('#appearance-status'),
  transparentToggle: document.querySelector('#transparent-toggle'),
  alwaysTopToggle: document.querySelector('#always-top-toggle'),
  autostartToggle: document.querySelector('#autostart-toggle'),
  autostartStatus: document.querySelector('#autostart-status'),
  opacityInput: document.querySelector('#opacity-input'),
  opacityValue: document.querySelector('#opacity-value'),
  fontFamilyInput: document.querySelector('#font-family-input'),
  fontSizeInput: document.querySelector('#font-size-input'),
  fontSizeValue: document.querySelector('#font-size-value'),
  aboutOpen: document.querySelector('#about-open')
};

let currentState;
let previewAudio;
let audioContext;
let settingsSignature = '';

function normalizeColor(value, fallback) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function parseHexColor(value) {
  const input = String(value || '').trim();
  const candidate = input.startsWith('#') ? input : `#${input}`;
  return /^#[\da-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : null;
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

function renderSettings(settings = {}) {
  applyWindowTheme(settings);
  elements.transparentToggle.checked = settings.transparent !== false;
  elements.alwaysTopToggle.checked = Boolean(settings.alwaysOnTop);
  elements.opacityInput.value = String(settings.opacity ?? 78);
  elements.opacityValue.textContent = `${settings.opacity ?? 78}%`;
  elements.fontFamilyInput.value = settings.fontFamily || '';
  elements.fontSizeInput.value = String(settings.fontSize ?? 82);
  elements.fontSizeValue.textContent = `${settings.fontSize ?? 82}px`;
  elements.appearanceStatus.textContent = `${settings.transparent === false ? 100 : settings.opacity ?? 78}% · ${settings.fontSize ?? 82}px`;
}

function renderState(state) {
  currentState = state;
  const nextSignature = JSON.stringify(state?.settings || {});
  if (nextSignature !== settingsSignature) {
    settingsSignature = nextSignature;
    renderSettings(state?.settings || {});
  }
}

function updateSettings(partialSettings) {
  shell?.updateSettings?.(partialSettings)?.catch?.(() => {});
}

function renderBackgroundColorValidation(color) {
  const valid = Boolean(color);
  if (valid) {
  elements.backgroundColorHexInput?.removeAttribute('aria-invalid');
  } else {
  elements.backgroundColorHexInput?.setAttribute('aria-invalid', 'true');
  }
  if (elements.backgroundColorError) elements.backgroundColorError.hidden = valid;
}

function updateBackgroundColorFromText() {
  const color = parseHexColor(elements.backgroundColorHexInput?.value);
  renderBackgroundColorValidation(color);

  if (!color) {
    return;
  }

  if (elements.backgroundColorHexInput) elements.backgroundColorHexInput.value = color;
  if (elements.backgroundColorInput) elements.backgroundColorInput.value = color;
  updateSettings({ backgroundColor: color });
}

function restoreBackgroundColorInput() {
  const color = normalizeColor(currentState?.settings?.backgroundColor, '#101623');
  if (elements.backgroundColorInput) elements.backgroundColorInput.value = color;
  if (elements.backgroundColorHexInput) elements.backgroundColorHexInput.value = color.toUpperCase();
  renderBackgroundColorValidation(color);
}

function renderAutostartInfo(info) {
  if (!elements.autostartToggle || !elements.autostartStatus) return;
  const supported = Boolean(info?.supported);
  const enabled = Boolean(info?.enabled);
  const method = info?.method || '未知方式';
  const detail = info?.detail || '';

  elements.autostartToggle.disabled = !supported;
  elements.autostartToggle.checked = enabled;
  elements.autostartStatus.textContent = supported
    ? `${enabled ? '已启用' : '未启用'} · ${method}${detail ? ` · ${detail}` : ''}`
    : detail || '当前平台暂不支持开机自启动';
}

async function refreshAutostartInfo() {
  if (!elements.autostartToggle || !elements.autostartStatus) return;
  try {
    renderAutostartInfo(await shell?.getAutostart?.());
  } catch {
    elements.autostartToggle.disabled = true;
    elements.autostartStatus.textContent = '读取开机自启动状态失败';
  }
}

async function updateAutostartSetting(enabled) {
  elements.autostartToggle.disabled = true;
  elements.autostartStatus.textContent = enabled ? '正在启用开机自启动…' : '正在关闭开机自启动…';

  try {
    renderAutostartInfo(await shell?.setAutostart?.(enabled));
  } catch {
    await refreshAutostartInfo();
    elements.autostartStatus.textContent = '更新开机自启动失败，请检查系统权限或桌面环境设置';
  }
}

function createDefaultRingtone(ringtone) {
  return {
    type: 'bundled',
    name: 'ringtone_default.mp3',
    path: ringtone?.path || '',
    url: ringtone?.url || new URL('./assets/audio/ringtone_default.mp3', window.location.href).toString()
  };
}

async function chooseRingtone() {
  const ringtone = await shell?.chooseRingtone?.();
  if (!ringtone?.url) {
    return;
  }

  updateSettings({
    ringtone: {
      type: 'custom',
      name: ringtone.name || '自定义铃声',
      path: ringtone.path || '',
      url: ringtone.url
    }
  });
}

async function useDefaultRingtone() {
  const ringtone = await shell?.getDefaultRingtone?.();
  updateSettings({ ringtone: createDefaultRingtone(ringtone) });
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

function stopRingtonePreview() {
  if (!previewAudio) {
    return;
  }

  previewAudio.pause();
  previewAudio.currentTime = 0;
  previewAudio = undefined;
  if (elements.ringtoneStop) elements.ringtoneStop.disabled = true;
}

function playRingtonePreview() {
  stopRingtonePreview();
  const ringtoneUrl = currentState?.settings?.ringtone?.url;

  if (!ringtoneUrl) {
    playFallbackTone();
    return;
  }

  previewAudio = new Audio(ringtoneUrl);
  previewAudio.volume = 0.85;
  elements.ringtoneStop.disabled = false;
  previewAudio.addEventListener('ended', stopRingtonePreview, { once: true });
  previewAudio.play()?.catch?.(() => {
    stopRingtonePreview();
    playFallbackTone();
  });
}

function bindEvents() {
  elements.transparentToggle.addEventListener('change', () => updateSettings({ transparent: elements.transparentToggle.checked }));
  elements.alwaysTopToggle.addEventListener('change', () => updateSettings({ alwaysOnTop: elements.alwaysTopToggle.checked }));
  elements.autostartToggle?.addEventListener('change', () => updateAutostartSetting(elements.autostartToggle.checked));
  elements.fontFamilyInput.addEventListener('change', () => updateSettings({ fontFamily: elements.fontFamilyInput.value }));
  elements.opacityInput.addEventListener('input', () => {
    elements.opacityValue.textContent = `${elements.opacityInput.value}%`;
    updateSettings({ opacity: elements.opacityInput.value });
  });
  elements.fontSizeInput.addEventListener('input', () => {
    elements.fontSizeValue.textContent = `${elements.fontSizeInput.value}px`;
    updateSettings({ fontSize: elements.fontSizeInput.value });
  });
  elements.fontColorInput?.addEventListener('input', () => updateSettings({ fontColor: elements.fontColorInput.value }));
  elements.backgroundColorInput?.addEventListener('input', () => {
    const color = elements.backgroundColorInput.value.toUpperCase();
    elements.backgroundColorHexInput.value = color;
    renderBackgroundColorValidation(color);
    updateSettings({ backgroundColor: color });
  });
  elements.backgroundColorHexInput?.addEventListener('input', updateBackgroundColorFromText);
  elements.backgroundColorHexInput?.addEventListener('change', () => {
    if (!parseHexColor(elements.backgroundColorHexInput.value)) {
      restoreBackgroundColorInput();
    }
  });
  elements.backgroundColorHexInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      elements.backgroundColorHexInput.blur();
    }
  });
  elements.ringtoneChoose?.addEventListener('click', () => chooseRingtone().catch(() => {
    elements.ringtoneLabel.textContent = '选择铃声失败';
  }));
  elements.ringtoneTest?.addEventListener('click', playRingtonePreview);
  elements.ringtoneStop?.addEventListener('click', stopRingtonePreview);
  elements.ringtoneDefault?.addEventListener('click', () => useDefaultRingtone().catch(() => {}));
  elements.aboutOpen.addEventListener('click', () => shell?.openAbout?.()?.catch?.(() => {}));
  shell?.onStateChanged?.(renderState);
  shell?.onThemeChanged?.((color) => {
    if (/^#[0-9a-f]{6}$/i.test(color || '')) {
      document.documentElement.style.setProperty('--accent', color);
    }
  });
}

async function init() {
  bindEvents();
  const state = await shell?.getState?.();
  renderState(state);
  void refreshAutostartInfo();
}

init();
