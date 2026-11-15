import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  // The admin lists must show fresh data when you navigate back to them. Next 14.2 keeps
  // visited pages in the browser's router cache for 30s; Next 15 defaults to 0. Pin it.
  experimental: { staleTimes: { dynamic: 0, static: 30 } },
};

export default nextConfig;
