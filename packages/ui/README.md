# @mhai/ui

Design v3 components, hooks and sign-in inputs shared by the clinical and
platform admin apps. The package is TypeScript source; each app compiles it
(`transpilePackages` in its `next.config.ts`). Import a module by its path:

| Import                  | What it holds                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@mhai/ui/cn`           | `cn` (joins class names, skipping empty ones)                                                                      |
| `@mhai/ui/<component>`  | `button`, `banner`, `chip`, `dialog`, `sheet`, `side-panel`, `skeleton`, `switch`, `toast`, `reason-form`, `brand` |
| `@mhai/ui/hooks/<hook>` | `use-escape`, `use-focus-trap`, `modal-dialog`, `use-media`, `use-idle`, `use-now`, `use-online`                   |
| `@mhai/ui/auth/<input>` | `code-input`, `backup-code-toggle`, `password-fields`, `qr-code`, `backup-codes`, `auth-heading`                   |

What each app provides:

- **Styles.** The components use Tailwind classes, the `@mhai/tokens` theme,
  and the motion tokens and keyframes in the app's `globals.css`
  (`--t-*`, `--e-*`, `toastIn`, `.skeleton-shimmer`). Tailwind must scan this
  package: add `@source "../../../packages/ui/src";` to the app's
  `globals.css`.
- **Brand images.** `brand` loads `/brand/logo.png`, `/brand/mark.svg` and
  `/brand/bhai-logo.png` from the app's `public/` folder.
- **Toasts.** `useToast` (and `backup-codes`) need a `ToastProvider` above
  them.

Peer dependencies: `react`, `lucide-react`, `qrcode` and `clsx`, at the
versions the apps pin. Packages never import from an app.

Tests: `npm test -w @mhai/ui` (Vitest, jsdom).
