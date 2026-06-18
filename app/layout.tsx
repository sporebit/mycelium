import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Myphilium",
  description: "Personal AI dashboard",
  appleWebApp: {
    capable: true,
    title: "Myphilium",
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
      className={`${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
