/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep build output in .next-build so Vercel builds succeed when the project’s
  // “Output Directory” (or legacy preset) still points at .next-build.
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
