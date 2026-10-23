import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Authenticated pages are per-user and realtime, so Cache Components buys nothing here.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["firebase-admin", "@google-cloud/tasks"],
  // @google-cloud/tasks loads this file with a dynamic require that tracing can't see.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@google-cloud/tasks/build/protos/protos.json"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
