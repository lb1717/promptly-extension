/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use the default `.next` folder in local dev (avoids dev-server cache bugs).
  // Set NEXT_DIST_DIR=.next-build on Vercel when the Output Directory is `.next-build`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
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
