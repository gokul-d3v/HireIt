import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This tells Next.js that the app is running under /exam/
  basePath: '/exam',
  // standalone output is required for the Dockerfile
  output: "standalone",
};

export default nextConfig;