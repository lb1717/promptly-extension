export type CompanionDownloadInfo = {
  version: string;
  macUrl: string | null;
  winUrl: string | null;
  macLabel: string | null;
  winLabel: string | null;
};

const SITE_MAC_PREFIX = "/downloads/companion/";
const GITHUB_REPO = "lb1717/promptly-extension";

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

export async function getCompanionDownloadInfo(): Promise<CompanionDownloadInfo> {
  const version = process.env.NEXT_PUBLIC_COMPANION_VERSION?.trim() || "0.1.0";

  const envMac = process.env.NEXT_PUBLIC_COMPANION_MAC_URL?.trim();
  const envWin = process.env.NEXT_PUBLIC_COMPANION_WIN_URL?.trim();
  if (envMac || envWin) {
    return {
      version,
      macUrl: envMac || null,
      winUrl: envWin || null,
      macLabel: envMac ? "Download for Mac" : null,
      winLabel: envWin ? "Download for Windows" : null
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      next: { revalidate: 300 },
      headers: { Accept: "application/vnd.github+json" }
    });
    if (res.ok) {
      const data = (await res.json()) as {
        tag_name?: string;
        assets?: Array<{ name: string; browser_download_url: string }>;
      };
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const mac = pickCompanionAsset(assets, ".dmg") || pickCompanionAsset(assets, ".zip");
      const win = pickCompanionAsset(assets, ".exe");
      if (mac || win) {
        return {
          version: String(data.tag_name || version).replace(/^companion-v/i, "").replace(/^v/, ""),
          macUrl: mac?.url ?? null,
          winUrl: win?.url ?? null,
          macLabel: mac ? "Download for Mac (.dmg)" : null,
          winLabel: win ? "Download for Windows (.exe)" : null
        };
      }
    }
  } catch {
    /* fall through to static paths */
  }

  const staticMac = `${SITE_MAC_PREFIX}Promptly-Companion-mac.dmg`;

  return {
    version,
    macUrl: staticMac,
    winUrl: null,
    macLabel: "Download for Mac (.dmg)",
    winLabel: null
  };
}
