import type { Metadata } from "next";
import { headers } from "next/headers";
import { Darker_Grotesque, JetBrains_Mono, Outfit } from "next/font/google";
import { PLATFORM_MARKER } from "../../../scripts/platform-marker.mjs";
import { Providers } from "./providers";
import "./globals.css";

const darker = Darker_Grotesque({
  variable: "--font-darker",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { template: "%s · MHAI Platform", default: "MHAI Platform" },
  description: "Measured Health platform administration",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request makes every page dynamic, so each response carries
  // the nonce proxy.ts made for it (Next applies it to its own tags).
  await headers();
  return (
    <html
      lang="en"
      className={`${darker.variable} ${outfit.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* The bundle check finds this in the platform build, never in clinical. */}
        <meta name="mhai-app" content={PLATFORM_MARKER} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
