import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Off in development, and off in the compiled end-to-end build
  // (e2e/support/build.ts sets E2E_BUILD): that build shares public/ with
  // the main checkout, so bundling a worker there would rewrite sw.js under
  // a server that is still running, and a worker's cache would hand a test
  // yesterday's page. The release build never sets the flag.
  disable: process.env.NODE_ENV !== "production" || process.env.E2E_BUILD === "1",
});

const nextConfig: NextConfig = {
  // The end-to-end server builds into its own directory, so clearing .next
  // before a production build cannot pull the floor from under it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev server rebuilds on any change to a file it watches, and a
  // rebuild aborts a client-side navigation in flight. Next ignores .git,
  // node_modules and ".next" by name, so a dist directory with another
  // name (the end-to-end server builds into .next-e2e) is watched: every
  // compile writes there, which starts the next compile, and a click on a
  // tab never sees its URL change. Playwright's traces (e2e/.results) and
  // sessions (e2e/.auth) are written mid-test as well. Found 2026-11-20
  // (MYC-190). Next's default is a RegExp, so this is one too.
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /(^|[\/])(\.git|\.next[^\/]*|node_modules|e2e[\/]\.results|e2e[\/]\.auth)([\/]|$)/,
    };
    return config;
  },
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
