import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Myphelium2",
    short_name: "Myphelium2",
    description: "Personal AI dashboard",
    start_url: "/",
    display: "standalone",
    // The installed app as a share target (PhirstMaxx spec §5, Android):
    // a shared link, text or picture lands in /api/phirstmaxx/share.
    share_target: {
      action: "/api/phirstmaxx/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "file", accept: ["image/*"] }] },
    },
    theme_color: "#0e1410",
    background_color: "#0e1410",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
