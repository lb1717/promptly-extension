/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Default `.next-build` so builds match Vercel when Output Directory is set to `.next-build`.
  // If your Vercel project uses the default Next folder instead, set env `NEXT_DIST_DIR=.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next-build",
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
