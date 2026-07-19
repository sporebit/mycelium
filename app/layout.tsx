import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PrivacyProvider } from "@/lib/context/PrivacyContext";
import { TransitionProvider } from "@/lib/context/TransitionContext";
import { TransitionOverlay } from "@/components/nav/TransitionOverlay";
import { SoilGrain } from "@/components/dashboard/SoilGrain";
import { MyceliumField } from "@/components/art/MyceliumField";
import { createServerClient } from "@/lib/supabase/server";
import { UI_PREFS_DEFAULTS, getUiPrefs } from "@/lib/settings/uiPrefs";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Myphelium2",
  description: "Personal AI dashboard",
  appleWebApp: {
    capable: true,
    title: "Myphelium2",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    "theme-color": "#0e1410",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-render data-motion so [data-motion="off"] takes effect on the
  // very first paint — no client flash, no hydration mismatch.
  const uid = process.env.USER_ID;
  let motion = UI_PREFS_DEFAULTS.motion;
  if (uid) {
    try {
      const supabase = createServerClient();
      const prefs = await getUiPrefs(supabase, uid);
      motion = prefs.motion;
    } catch (err) {
      console.error("[layout/uiPrefs]", err);
    }
  }
  return (
    <html
      lang="en"
      data-motion={motion}
      className={`${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink-0 text-ink-4">
        <SoilGrain />
        <MyceliumField />
        <TransitionProvider>
          <PrivacyProvider>
            <div className="relative z-10 flex-1 flex flex-col">{children}</div>
          </PrivacyProvider>
          <TransitionOverlay />
        </TransitionProvider>
      </body>
    </html>
  );
}
