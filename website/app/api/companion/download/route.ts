import { getCompanionDownloadInfo } from "@/lib/companionDownload";

export async function GET() {
  const download = await getCompanionDownloadInfo();
  return Response.json({
    version: download.version,
    macUrl: download.macUrl
  });
}
