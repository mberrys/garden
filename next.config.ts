import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 builds with Turbopack by default. No bundler tweaks are needed for
  // pdf.js here because the PDF surface is loaded with `ssr: false`, so the
  // library (and its optional Node `canvas` dependency) is never pulled into
  // the server graph.
  turbopack: {},
};

export default withSentryConfig(nextConfig, {
  org: "berry-studios",
  project: "garden",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
