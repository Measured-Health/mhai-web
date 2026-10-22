import type { Metadata } from "next";
import { darker, jetbrains, outfit } from "@mhai/tokens/fonts";
import "./globals.css";
import { DemoRibbon } from "@/components/states/demo-ribbon";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MHAI · Measured Health",
  description: "Evidence-checked clinical decision support",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${darker.variable} ${outfit.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={
          process.env.NEXT_PUBLIC_USE_MOCK === "true"
            ? ({ "--demo-h": "44px" } as React.CSSProperties)
            : undefined
        }
      >
        <Providers>
          <DemoRibbon />
          {children}
        </Providers>
      </body>
    </html>
  );
}
