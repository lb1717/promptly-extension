import { AmbientBackground } from "@/components/AmbientBackground";
import { CompanionDownloadClient } from "@/components/companion/CompanionDownloadClient";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getCompanionDownloadInfo } from "@/lib/companionDownload";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Promptly Companion — desktop download",
  description:
    "Download Promptly Companion for Mac or Windows. Improve and refine AI prompts in a floating desktop workshop, then copy into ChatGPT, Claude, or any AI app.",
  path: "/companion"
});

export default async function CompanionDownloadPage() {
  const download = await getCompanionDownloadInfo();

  return (
    <main className="relative min-h-screen bg-page text-ink">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <CompanionDownloadClient download={download} />
        <Footer />
      </div>
    </main>
  );
}
