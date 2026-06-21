export type CompanionDownloadInfo = {
  version: string;
  macUrl: string | null;
  macZipUrl: string | null;
  winUrl: string | null;
  macLabel: string | null;
  macZipLabel: string | null;
  winLabel: string | null;
};

export type CompanionAssetUrls = {
  version: string;
  macDmg: string | null;
  macZip: string | null;
  winExe: string | null;
};

const GITHUB_REPO = "lb1717/promptly-extension";

/** Stable fallback when GitHub API is unavailable at runtime. */
const FALLBACK_RELEASE_TAG = "companion-v0.1.16";
const FALLBACK_BASE = `https://github.com/${GITHUB_REPO}/releases/download/${FALLBACK_RELEASE_TAG}`;

const FALLBACK_ASSETS: CompanionAssetUrls = {
  version: "0.1.16",
  macDmg: `${FALLBACK_BASE}/Promptly-Companion-0.1.16-mac.dmg`,
  macZip: `${FALLBACK_BASE}/Promptly-Companion-0.1.16-mac.zip`,
  winExe: `${FALLBACK_BASE}/Promptly-Companion-0.1.16-win.exe`
};

/** macOS bundle path after drag-to-Applications (matches electron-builder productName). */
export const PROMPTLY_MAC_APP_PATH = "/Applications/Promptly Companion.app";

export const PROMPTLY_MAC_INSTALL_COMMAND = `xattr -cr "${PROMPTLY_MAC_APP_PATH}"`;

export const PROMPTLY_MAC_DMG_FALLBACK_URL = FALLBACK_ASSETS.macDmg!;

export const PROMPTLY_WIN_EXE_FALLBACK_URL = FALLBACK_ASSETS.winExe!;

function pickCompanionAsset(
  assets: Array<{ name: string; browser_download_url: string }>,
  ext: string
): { url: string; label: string } | null {
  const match = assets.find(
    (a) =>
      a.name.toLowerCase().endsWith(ext) &&
      (/companion/i.test(a.name) || /promptly companion/i.test(a.name))
  );
  if (!match) return null;
  return { url: match.browser_download_url, label: match.name };
}

function compareCompanionVersions(a: string, b: string): number {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickNewestCompanionRelease(
  releases: Array<Parameters<typeof parseCompanionRelease>[0]>
): CompanionAssetUrls | null {
  const parsed = releases
    .map((release) => parseCompanionRelease(release))
    .filter((release): release is CompanionAssetUrls => release !== null);
  if (!parsed.length) return null;
  return parsed.sort((a, b) => compareCompanionVersions(b.version, a.version))[0];
}

function parseCompanionRelease(release: {
  tag_name?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}): CompanionAssetUrls | null {
  const tag = String(release.tag_name || "");
  if (!/^companion-v/i.test(tag)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const macDmg = pickCompanionAsset(assets, ".dmg");
  const macZip = pickCompanionAsset(assets, ".zip");
  const winExe = pickCompanionAsset(assets, ".exe");
  if (!macDmg && !macZip && !winExe) return null;
  return {
    version: tag.replace(/^companion-v/i, "").replace(/^v/, ""),
    macDmg: macDmg?.url ?? null,
    macZip: macZip?.url ?? null,
    winExe: winExe?.url ?? null
  };
}

async function fetchFromGitHubApi(path: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "promptly-labs-companion-download"
    }
  });
}

export async function resolveCompanionAssetUrls(): Promise<CompanionAssetUrls> {
  const envMac = process.env.NEXT_PUBLIC_COMPANION_MAC_URL?.trim();
  const envWin = process.env.NEXT_PUBLIC_COMPANION_WIN_URL?.trim();
  if (envMac || envWin) {
    return {
      version: process.env.NEXT_PUBLIC_COMPANION_VERSION?.trim() || FALLBACK_ASSETS.version,
      macDmg: envMac || null,
      macZip: null,
      winExe: envWin || null
    };
  }

  try {
    const listRes = await fetchFromGitHubApi("/releases?per_page=30");
    if (listRes.ok) {
      const releases = (await listRes.json()) as Array<Parameters<typeof parseCompanionRelease>[0]>;
      const newest = pickNewestCompanionRelease(releases);
      if (newest) return newest;
    }

    const latestRes = await fetchFromGitHubApi("/releases/latest");
    if (latestRes.ok) {
      const latest = (await latestRes.json()) as Parameters<typeof parseCompanionRelease>[0];
      const parsed = parseCompanionRelease(latest);
      if (parsed) return parsed;
    }
  } catch {
    /* use fallback */
  }

  return FALLBACK_ASSETS;
}

/** Page-facing download links — direct GitHub release URLs with versioned filenames. */
export async function getCompanionDownloadInfo(): Promise<CompanionDownloadInfo> {
  const assets = await resolveCompanionAssetUrls();

  return {
    version: assets.version,
    macUrl: assets.macDmg || null,
    macZipUrl: assets.macZip || null,
    winUrl: assets.winExe || null,
    macLabel: assets.macDmg ? `Download for Mac (v${assets.version} .dmg)` : null,
    macZipLabel: assets.macZip ? `Download Mac ZIP (v${assets.version})` : null,
    winLabel: assets.winExe ? `Download for Windows (v${assets.version} .exe)` : null
  };
}

export async function getCompanionMacRedirectUrl(): Promise<string | null> {
  const assets = await resolveCompanionAssetUrls();
  return assets.macDmg || assets.macZip || null;
}

export async function getCompanionWindowsRedirectUrl(): Promise<string | null> {
  const assets = await resolveCompanionAssetUrls();
  return assets.winExe || null;
}
