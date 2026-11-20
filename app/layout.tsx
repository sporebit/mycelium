import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { PrivacyProvider } from "@/lib/context/PrivacyContext";
import { TransitionProvider } from "@/lib/context/TransitionContext";
import { TransitionOverlay } from "@/components/nav/TransitionOverlay";
import { SoilGrain } from "@/components/dashboard/SoilGrain";
import { MyceliumField } from "@/components/art/MyceliumField";
import { SessionWatch } from "@/components/auth/SessionWatch";
import { ShellPrefProvider } from "@/components/shell/ShellPref";
import { createUserClient } from "@/lib/supabase/user";
import { UI_PREFS_DEFAULTS, getUiPrefs } from "@/lib/settings/uiPrefs";

// Every page is behind a session and the layout reads the request's
// principal to load the caller's ui prefs, so nothing here can be static.
// Declared rather than discovered: otherwise the build logs a dynamic-usage
// bailout for every route.
export const dynamic = "force-dynamic";

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

// The Specimen plate's caption face (claude/ui-direction.md). Not preloaded: only Home in the new shell uses it.
const newsreader = Newsreader({
  variable: "--font-plate",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
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
  // The login page renders inside this layout with no session; the query
  // then sees no rows under RLS and getUiPrefs returns the defaults.
  let motion = UI_PREFS_DEFAULTS.motion;
  let shell = UI_PREFS_DEFAULTS.shell;
  try {
    const supabase = await createUserClient();
    const prefs = await getUiPrefs(supabase);
    motion = prefs.motion;
    shell = prefs.shell === "new" ? "new" : "classic";
  } catch (err) {
    console.error("[layout/uiPrefs]", err);
  }
  return (
    <html
      lang="en"
      data-motion={motion}
      data-shell={shell}
      className={`${interTight.variable} ${jetbrainsMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface-0 text-text-hi">
        <SoilGrain />
        <MyceliumField />
        <SessionWatch />
        <TransitionProvider>
          <PrivacyProvider>
            <ShellPrefProvider value={shell}>
              <div className="relative z-10 flex-1 flex flex-col">{children}</div>
            </ShellPrefProvider>
          </PrivacyProvider>
          <TransitionOverlay />
        </TransitionProvider>
      </body>
    </html>
  );
}
