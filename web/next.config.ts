import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    // this app is its own workspace — keeps Turbopack from inferring a parent
    // directory (with its foreign lockfiles) as the root
    root: path.join(__dirname),
  },
};

export default nextConfig;
