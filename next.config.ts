import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfjs-dist ships a canvas-dependent Node build that must never be bundled
  // into the browser graph; the browser build is loaded explicitly by the PDF
  // surface instead.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
