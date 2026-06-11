import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
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
