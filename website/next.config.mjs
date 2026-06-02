/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local dev uses `.next` (avoids cache bugs). Production builds use `.next-build` to match Vercel Output Directory.
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "production" ? ".next-build" : ".next"),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }]
      },
      {
        source: "/downloads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" }
        ]
      }
    ];
  }
};

export default nextConfig;
