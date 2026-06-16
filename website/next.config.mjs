/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel project Output Directory is `.next-build`; local dev uses `.next`.
  distDir: process.env.VERCEL ? ".next-build" : ".next",
  async redirects() {
    return [
      {
        source: "/product",
        destination: "/",
        permanent: true
      },
      {
        source: "/labs/papers",
        destination: "/papers",
        permanent: true
      },
      {
        source: "/labs",
        destination: "/research",
        permanent: true
      }
    ];
  },
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
      },
      {
        source: "/install/:path*.ps1",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=300" }
        ]
      }
    ];
  }
};

export default nextConfig;
