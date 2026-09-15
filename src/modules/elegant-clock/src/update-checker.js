const latestReleaseApiUrl = 'https://api.github.com/repos/Dai2010/elegant-clock/releases/latest';
const releasesPageUrl = 'https://github.com/Dai2010/elegant-clock/releases/latest';
const proxyBaseUrl = 'https://ghfast.top/';
const maxReleaseNotesLength = 30000;
const maxUpdateAssetSize = 1024 * 1024 * 1024;

function compareNumericStrings(left, right) {
  const normalizedLeft = left.replace(/^0+(?=\d)/, '');
  const normalizedRight = right.replace(/^0+(?=\d)/, '');

  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length > normalizedRight.length ? 1 : -1;
  }

  if (normalizedLeft === normalizedRight) {
    return 0;
  }

  return normalizedLeft > normalizedRight ? 1 : -1;
}

function parseVersion(value) {
  const match = String(value || '').trim().match(
    /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );

  if (!match) {
    return null;
  }

  return {
    core: match.slice(1, 4),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function comparePrereleaseIdentifiers(left, right) {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return compareNumericStrings(left, right);
  }

  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }

  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return null;
  }

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    const comparison = compareNumericStrings(parsedLeft.core[index], parsedRight.core[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  if (parsedLeft.prerelease.length === 0 || parsedRight.prerelease.length === 0) {
    if (parsedLeft.prerelease.length === parsedRight.prerelease.length) {
      return 0;
    }

    return parsedLeft.prerelease.length === 0 ? 1 : -1;
  }

  const identifierCount = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    if (parsedLeft.prerelease[index] === undefined) {
      return -1;
    }

    if (parsedRight.prerelease[index] === undefined) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifiers(
      parsedLeft.prerelease[index],
      parsedRight.prerelease[index]
    );
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function formatVersion(value) {
  return String(value || '').trim().replace(/^[vV]/, '');
}

function normalizeReleaseUrl(value) {
  try {
    const url = new URL(String(value));
    const expectedPrefix = '/Dai2010/elegant-clock/releases/';

    if (
      url.protocol === 'https:'
      && url.hostname === 'github.com'
      && !url.username
      && !url.password
      && !url.port
      && url.pathname.startsWith(expectedPrefix)
    ) {
      return url.toString();
    }
  } catch {
    return releasesPageUrl;
  }

  return releasesPageUrl;
}

function normalizeAsset(asset) {
  const name = String(asset?.name || '');
  const digest = String(asset?.digest || '').toLowerCase();
  const size = Number(asset?.size);
  let downloadUrl;

  try {
    const url = new URL(String(asset?.browser_download_url || ''));
    const expectedPrefix = '/Dai2010/elegant-clock/releases/download/';

    if (
      url.protocol !== 'https:'
      || url.hostname !== 'github.com'
      || url.username
      || url.password
      || url.port
      || !url.pathname.startsWith(expectedPrefix)
    ) {
      return null;
    }

    downloadUrl = url.toString();
  } catch {
    return null;
  }

  if (
    !name
    || pathBasename(name) !== name
    || name.length > 240
    || !/^[A-Za-z0-9][A-Za-z0-9._()+ -]*$/.test(name)
    || !Number.isSafeInteger(size)
    || size <= 0
    || size > maxUpdateAssetSize
    || !/^sha256:[\da-f]{64}$/.test(digest)
  ) {
    return null;
  }

  return {
    name,
    downloadUrl,
    size,
    sha256: digest.slice('sha256:'.length)
  };
}

function pathBasename(value) {
  return value.split(/[\\/]/).at(-1);
}

function selectUpdateAsset(assets, platform, architecture, linuxDistributionIds = []) {
  if (!Array.isArray(assets) || architecture !== 'x64') {
    return null;
  }

  let assetPattern;

  if (platform === 'win32') {
    assetPattern = /-Windows-x64\.exe$/i;
  } else if (platform === 'linux') {
    const distributionIds = new Set(linuxDistributionIds.map((value) => String(value).toLowerCase()));
    const usesPacman = ['arch', 'manjaro', 'endeavouros'].some((value) => distributionIds.has(value));
    const usesDeb = [
      'debian',
      'deepin',
      'elementary',
      'kali',
      'linuxmint',
      'neon',
      'pop',
      'raspbian',
      'ubuntu',
      'zorin'
    ].some((value) => distributionIds.has(value));
    const usesRpm = [
      'almalinux',
      'centos',
      'fedora',
      'mageia',
      'ol',
      'opensuse',
      'opensuse-leap',
      'opensuse-tumbleweed',
      'rhel',
      'rocky',
      'suse'
    ].some((value) => distributionIds.has(value));

    if (usesPacman) {
      assetPattern = /-Arch-x86_64\.pkg\.tar\.zst$/i;
    } else if (usesRpm) {
      assetPattern = /-Linux-x86_64\.rpm$/i;
    } else if (usesDeb) {
      assetPattern = /-Linux-amd64\.deb$/i;
    } else {
      return null;
    }
  } else {
    return null;
  }

  return normalizeAsset(assets.find((asset) => assetPattern.test(String(asset?.name || ''))));
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}\n\n（更新说明过长，请前往发布页查看完整内容。）`;
}

function normalizePublishedAt(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function createUpdateInfo(release, currentVersion, platform, architecture, linuxDistributionIds = []) {
  if (
    !release
    || release.draft
    || release.prerelease
    || compareVersions(release.tag_name, currentVersion) !== 1
  ) {
    return null;
  }

  const latestVersion = formatVersion(release.tag_name);
  const releaseName = truncateText(release.name, 160) || `Elegant Clock v${latestVersion}`;
  const releaseNotes = truncateText(release.body, maxReleaseNotesLength) || '该版本未提供更新说明。';

  return {
    currentVersion: formatVersion(currentVersion),
    latestVersion,
    releaseName,
    releaseNotes,
    publishedAt: normalizePublishedAt(release.published_at),
    releaseUrl: normalizeReleaseUrl(release.html_url),
    asset: selectUpdateAsset(release.assets, platform, architecture, linuxDistributionIds)
  };
}

async function fetchLatestRelease(fetchImplementation, signal) {
  const response = await fetchImplementation(latestReleaseApiUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    cache: 'no-store',
    signal
  });

  if (!response.ok) {
    throw new Error(`GitHub release request failed with status ${response.status}`);
  }

  return response.json();
}

function getDirectDownloadUrl(downloadUrl) {
  const trustedUrl = normalizeAsset({
    name: 'update.exe',
    browser_download_url: downloadUrl,
    size: 1,
    digest: `sha256:${'0'.repeat(64)}`
  })?.downloadUrl;

  if (!trustedUrl) {
    throw new Error('Invalid GitHub release asset URL');
  }

  return trustedUrl;
}

function getProxyDownloadUrl(downloadUrl) {
  return `${proxyBaseUrl}${getDirectDownloadUrl(downloadUrl)}`;
}

module.exports = {
  compareVersions,
  createUpdateInfo,
  fetchLatestRelease,
  getDirectDownloadUrl,
  getProxyDownloadUrl,
  selectUpdateAsset
};
