/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep dev and prod build outputs separate to avoid chunk corruption
  // when build commands run while the dev server is active.
  distDir: process.env.NEXT_DIST_DIR || ".next"
};

export default nextConfig;
