import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  // The end-to-end server builds into its own directory, so clearing .next
  // before a production build cannot pull the floor from under it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      { source: "/crm", destination: "/organisation", permanent: true },
      { source: "/crm/content", destination: "/organisation/captures", permanent: true },
      { source: "/crm/:path*", destination: "/organisation/:path*", permanent: true },
      { source: "/compost", destination: "/organisation", permanent: true },
      { source: "/compost/:path*", destination: "/organisation/:path*", permanent: true },
      { source: "/brain", destination: "/the-boys", permanent: true },
      { source: "/brain/:path*", destination: "/the-boys/:path*", permanent: true },
      { source: "/stroma", destination: "/the-boys", permanent: true },
      { source: "/stroma/:path*", destination: "/the-boys/:path*", permanent: true },
      { source: "/dashboard", destination: "/", permanent: true },
    ];
  },
};

export default withSerwist(nextConfig);
