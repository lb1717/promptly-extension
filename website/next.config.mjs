/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep build output in .next-build so Vercel builds succeed when the project’s
  // “Output Directory” (or legacy preset) still points at .next-build.
  distDir: process.env.NEXT_DIST_DIR || ".next-build"
};

export default nextConfig;
