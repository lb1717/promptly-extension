/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local default `.next-build` avoids odd local presets; Vercel sets `VERCEL=1` and expects `.next`.
  distDir: process.env.NEXT_DIST_DIR || (process.env.VERCEL ? ".next" : ".next-build"),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }]
      }
    ];
  }
};

export default nextConfig;
