import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { PrivacyProvider } from "@/lib/context/PrivacyContext";
import { TransitionProvider } from "@/lib/context/TransitionContext";
import { TransitionOverlay } from "@/components/nav/TransitionOverlay";
import { SoilGrain } from "@/components/dashboard/SoilGrain";
import { HyphalThreads } from "@/components/dashboard/HyphalThreads";

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

// Fraunces is a variable serif with opsz + SOFT axes exposed.
// next/font requires `weight: "variable"` when custom axes are supplied,
// so the full 100-900 weight range loads (any font-weight utility works).
// Both opsz and SOFT axes loaded.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  variable: "--font-fraunces",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink-0 text-ink-4">
        <SoilGrain />
        <HyphalThreads />
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
