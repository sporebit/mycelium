import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PrivacyProvider } from "@/lib/context/PrivacyContext";
import { TransitionProvider } from "@/lib/context/TransitionContext";
import { TransitionOverlay } from "@/components/nav/TransitionOverlay";
import { SoilGrain } from "@/components/dashboard/SoilGrain";
import { MyceliumField } from "@/components/art/MyceliumField";
import { SessionWatch } from "@/components/auth/SessionWatch";
import { ShellPrefProvider } from "@/components/shell/ShellPref";
import { createUserClient } from "@/lib/supabase/user";
import { UI_PREFS_DEFAULTS, getUiPrefs, shellOf } from "@/lib/settings/uiPrefs";
import { THEME_COLOUR, isTheme, type Theme } from "@/lib/theme";

// Every page is behind a session and the layout reads the request's
// principal to load the caller's ui prefs, so nothing here can be static.
// Declared rather than discovered: otherwise the build logs a dynamic-usage
// bailout for every route.
export const dynamic = "force-dynamic";

// Fonts are self-hosted from app/fonts (woff2 from Fontsource, SIL OFL 1.1, licences beside them).
// next/font/google fetched them from Google at build time, and one odd response failed CI #165.
const interTight = localFont({
  variable: "--font-inter-tight",
  src: [
    { path: "./fonts/inter-tight-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-tight-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-tight-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
});

const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
});

// The Specimen plate's caption face (claude/ui-direction.md). Not preloaded: only Home in the new shell uses it.
const newsreader = localFont({
  variable: "--font-plate",
  src: [
    { path: "./fonts/newsreader-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/newsreader-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/newsreader-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
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
  // theme-color is rendered in <head> below: it follows the person's theme preference.
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
  let theme: Theme = UI_PREFS_DEFAULTS.theme;
  try {
    const supabase = await createUserClient();
    const prefs = await getUiPrefs(supabase);
    motion = prefs.motion;
    shell = shellOf(prefs.shell);
    if (isTheme(prefs.theme)) theme = prefs.theme;
  } catch (err) {
    console.error("[layout/uiPrefs]", err);
  }
  return (
    <html
      lang="en"
      data-motion={motion}
      data-shell={shell}
      data-theme={theme}
      className={`${interTight.variable} ${jetbrainsMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        {/* The browser chrome follows the theme; data-theme on <html> does the rest (globals.css). */}
        {theme === "system" ? (
          <>
            <meta name="theme-color" media="(prefers-color-scheme: light)" content={THEME_COLOUR.light} />
            <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLOUR.dark} />
          </>
        ) : (
          <meta name="theme-color" content={THEME_COLOUR[theme]} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-surface-0 text-text-hi">
        {/* The Field shell is calm and flat (design §5, §6): no grain, no network backdrop. */}
        {shell === "field" ? null : (
          <>
            <SoilGrain />
            <MyceliumField />
          </>
        )}
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
