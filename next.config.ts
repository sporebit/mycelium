import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Legacy /crm routes redirect to /compost (308 permanent). The CRM
   * section was renamed in Phase 1 of post-design work — see
   * components/compost for the new home.
   *
   * /crm/content is deprecated entirely and folds into /compost/captures.
   */
  async redirects() {
    return [
      { source: "/crm", destination: "/compost", permanent: true },
      { source: "/crm/content", destination: "/compost/captures", permanent: true },
      { source: "/crm/:path*", destination: "/compost/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
