export type CompanionDownloadInfo = {
  version: string;
  macUrl: string | null;
  winUrl: string | null;
  macLabel: string | null;
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
const FALLBACK_RELEASE_TAG = "companion-v0.1.0";
const FALLBACK_BASE = `https://github.com/${GITHUB_REPO}/releases/download/${FALLBACK_RELEASE_TAG}`;

const FALLBACK_ASSETS: CompanionAssetUrls = {
  version: "0.1.0",
  macDmg: `${FALLBACK_BASE}/Promptly-Companion-0.1.0-mac.dmg`,
  macZip: `${FALLBACK_BASE}/Promptly-Companion-0.1.0-mac.zip`,
  winExe: `${FALLBACK_BASE}/Promptly-Companion-0.1.0-win.exe`
};

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
    const latestRes = await fetchFromGitHubApi("/releases/latest");
    if (latestRes.ok) {
      const latest = (await latestRes.json()) as Parameters<typeof parseCompanionRelease>[0];
      const parsed = parseCompanionRelease(latest);
      if (parsed) return parsed;
    }

    const listRes = await fetchFromGitHubApi("/releases?per_page=20");
    if (listRes.ok) {
      const releases = (await listRes.json()) as Array<Parameters<typeof parseCompanionRelease>[0]>;
      for (const release of releases) {
        const parsed = parseCompanionRelease(release);
        if (parsed) return parsed;
      }
    }
  } catch {
    /* use fallback */
  }

  return FALLBACK_ASSETS;
}

/** Page-facing download links — same-origin paths that redirect to the real installer. */
export async function getCompanionDownloadInfo(): Promise<CompanionDownloadInfo> {
  const assets = await resolveCompanionAssetUrls();
  const hasMac = Boolean(assets.macDmg || assets.macZip);
  const hasWin = Boolean(assets.winExe);

  return {
    version: assets.version,
    macUrl: hasMac ? "/downloads/companion/mac" : null,
    winUrl: hasWin ? "/downloads/companion/windows" : null,
    macLabel: "Download for Mac (.dmg)",
    winLabel: "Download for Windows (.exe)"
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
