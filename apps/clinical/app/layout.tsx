import type { Metadata } from "next";
import { headers } from "next/headers";
import { darker, jetbrains, outfit } from "@mhai/tokens/fonts";
import "./globals.css";
import { DemoRibbon } from "@/components/states/demo-ribbon";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MHAI · Measured Health",
  description: "Evidence-checked clinical decision support",
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
      <body
        className="min-h-full"
        // An attribute, not an inline style: the CSP blocks style attributes
        // in the server's HTML. globals.css sets --demo-h from it.
        data-demo={process.env.NEXT_PUBLIC_USE_MOCK === "true" ? "" : undefined}
      >
        <Providers>
          <DemoRibbon />
          {children}
        </Providers>
      </body>
    </html>
  );
}
