const shell = window.elegantClock;

const elements = {
  releaseName: document.querySelector('#release-name'),
  currentVersion: document.querySelector('#current-version'),
  latestVersion: document.querySelector('#latest-version'),
  publishedAt: document.querySelector('#published-at'),
  releaseNotes: document.querySelector('#release-notes'),
  downloadStatus: document.querySelector('#download-status'),
  statusLabel: document.querySelector('#status-label'),
  statusValue: document.querySelector('#status-value'),
  downloadProgress: document.querySelector('#download-progress'),
  laterButton: document.querySelector('#later-button'),
  releaseButton: document.querySelector('#release-button'),
  directUpdateButton: document.querySelector('#direct-update-button'),
  proxyUpdateButton: document.querySelector('#proxy-update-button')
};

let updateInfo;
let updateInProgress = false;

function formatPublishedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function renderUpdateInfo(info) {
  updateInfo = info;
  elements.releaseName.textContent = info.releaseName;
  elements.currentVersion.textContent = `v${info.currentVersion}`;
  elements.latestVersion.textContent = `v${info.latestVersion}`;
  elements.releaseNotes.textContent = info.releaseNotes;
  document.title = `Elegant Clock v${info.latestVersion} 可用`;

  const publishedAt = formatPublishedAt(info.publishedAt);
  elements.publishedAt.hidden = !publishedAt;
  elements.publishedAt.dateTime = info.publishedAt || '';
  elements.publishedAt.textContent = publishedAt;

  if (!info.asset) {
    elements.directUpdateButton.disabled = true;
    elements.directUpdateButton.title = '当前平台没有可校验的安装包，请前往发布页下载';
    elements.proxyUpdateButton.disabled = true;
    elements.proxyUpdateButton.title = '当前平台没有可校验的安装包，请前往发布页下载';
  }
}

function showProgress(progress = {}) {
  elements.downloadStatus.hidden = false;
  elements.downloadStatus.classList.toggle('error', progress.phase === 'error');
  elements.statusLabel.textContent = progress.message || '正在处理更新';
  elements.statusValue.textContent = '';

  if (progress.phase === 'downloading') {
    const percent = Number(progress.percent);
    if (Number.isFinite(percent)) {
      elements.downloadProgress.value = Math.min(100, Math.max(0, percent));
      elements.statusValue.textContent = `${Math.round(percent)}%`;
    } else {
      elements.downloadProgress.removeAttribute('value');
    }
  } else if (progress.phase === 'complete') {
    elements.downloadProgress.value = 100;
  } else {
    elements.downloadProgress.removeAttribute('value');
  }
}

function setUpdating(enabled) {
  updateInProgress = enabled;
  elements.directUpdateButton.disabled = enabled || !updateInfo?.asset;
  elements.proxyUpdateButton.disabled = enabled || !updateInfo?.asset;
  elements.releaseButton.disabled = enabled;
  elements.laterButton.textContent = enabled ? '取消下载' : '稍后再说';
}

async function startUpdate(source) {
  if (updateInProgress || !updateInfo?.asset) {
    return;
  }

  setUpdating(true);
  showProgress({
    phase: 'connecting',
    message: source === 'proxy' ? '正在连接 ghfast.top…' : '正在连接 GitHub…'
  });

  try {
    const result = source === 'proxy'
      ? await shell?.startProxyUpdate?.()
      : await shell?.startDirectUpdate?.();
    if (!result?.ok) {
      throw new Error(result?.error || (source === 'proxy'
        ? '代理更新失败，请前往发布页手动下载。'
        : '原地址更新失败，可尝试代理更新。'));
    }
  } catch (error) {
    showProgress({
      phase: 'error',
      message: error?.message || '更新失败，请重试或查看发布页。'
    });
    setUpdating(false);
  }
}

function closeWindow() {
  shell?.close?.();
}

async function init() {
  shell?.onUpdateProgress?.(showProgress);

  try {
    const info = await shell?.getUpdateInfo?.();
    if (!info) {
      closeWindow();
      return;
    }

    renderUpdateInfo(info);
  } catch {
    closeWindow();
    return;
  }

  elements.laterButton.addEventListener('click', closeWindow);
  elements.releaseButton.addEventListener('click', () => {
    shell?.openExternal?.(updateInfo.releaseUrl)?.catch?.(() => {});
  });
  elements.directUpdateButton.addEventListener('click', () => startUpdate('direct'));
  elements.proxyUpdateButton.addEventListener('click', () => startUpdate('proxy'));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeWindow();
    }
  });
}

init();
