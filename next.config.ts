import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 builds with Turbopack by default. No bundler tweaks are needed for
  // pdf.js here because the PDF surface is loaded with `ssr: false`, so the
  // library (and its optional Node `canvas` dependency) is never pulled into
  // the server graph.
  turbopack: {},
};

export default nextConfig;
