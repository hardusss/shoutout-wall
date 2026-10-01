import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: no server, no API routes. `npm run build` writes the site to ./out.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
