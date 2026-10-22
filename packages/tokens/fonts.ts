import localFont from "next/font/local";

// Self-hosted latin variable fonts (SIL Open Font License; licenses are in
// ./fonts). They replace the Google fonts loader so builds never fetch from the
// network. Both apps import these; CSS variable names are what theme.css uses.
export const darker = localFont({
  src: "./fonts/darker-grotesque-latin-wght-normal.woff2",
  variable: "--font-darker",
  weight: "300 900",
  display: "swap",
});
export const outfit = localFont({
  src: "./fonts/outfit-latin-wght-normal.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});
export const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});
