import type { NextConfig } from "next";

const projectRoot = import.meta.dirname;

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
