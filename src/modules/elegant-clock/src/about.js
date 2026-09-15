const shell = window.elegantClock;

const elements = {
  appName: document.querySelector('#app-name'),
  versionLabel: document.querySelector('#version-label'),
  profileLink: document.querySelector('#profile-link'),
  projectLink: document.querySelector('#project-link'),
  licenseLabel: document.querySelector('#license-label'),
  licenseInline: document.querySelector('#license-inline')
};

let aboutInfo = {
  name: 'Elegant Clock',
  version: '',
  githubProfileUrl: 'https://github.com/Dai2010',
  projectHomepageUrl: 'https://github.com/Dai2010/elegant-clock',
  license: 'GPL-3.0-only'
};

function renderAboutInfo() {
  elements.appName.textContent = aboutInfo.name || 'Elegant Clock';
  elements.versionLabel.textContent = aboutInfo.version ? `v${aboutInfo.version}` : 'v--';
  elements.profileLink.textContent = aboutInfo.githubProfileUrl;
  elements.projectLink.textContent = aboutInfo.projectHomepageUrl;
  elements.licenseLabel.textContent = aboutInfo.license;
  elements.licenseInline.textContent = aboutInfo.license;
}

function openUrl(url) {
  shell?.openExternal?.(url)?.catch?.(() => {});
}

async function init() {
  try {
    const receivedInfo = await shell?.getAboutInfo?.();
    aboutInfo = { ...aboutInfo, ...receivedInfo };
  } catch {
    aboutInfo.version = await shell?.getVersion?.().catch?.(() => '') || '';
  }

  renderAboutInfo();
  elements.profileLink.addEventListener('click', () => openUrl(aboutInfo.githubProfileUrl));
  elements.projectLink.addEventListener('click', () => openUrl(aboutInfo.projectHomepageUrl));
}

init();
