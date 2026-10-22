# @mhai/tokens

The design v3 tokens (colours, fonts, card radius and shadow) as a Tailwind
`@theme` block in `theme.css`. Both apps import it with
`@import "@mhai/tokens/theme.css";` after `@import "tailwindcss";`.
Edit the tokens here only.

## Fonts

The fonts (Darker Grotesque, Outfit and JetBrains Mono, latin variable
files) are served from this repository in `fonts/`, not from Google, so
`next build` needs no network. Both apps import them from
`@mhai/tokens/fonts` (`fonts.ts`, which uses `next/font/local`). Do not use
`next/font/google`; `scripts/no-google-fonts.test.mjs` fails if it comes
back. All three are under the SIL Open Font License; the license texts are
next to the files. To update one, take the latin woff2 from the matching
`@fontsource-variable/*` npm package.
