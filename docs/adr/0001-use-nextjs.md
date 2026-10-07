# 0001. Use Next.js for the frontend

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

The Phase 1 build guide suggests React with Vite: a single-workflow app with
no server-side rendering needs. It also says Next.js is fine. Later phases
add authentication, role-based views, an admin dashboard and audit views.

## Decision

Use Next.js (App Router) with TypeScript, Tailwind and ESLint, scaffolded
with `create-next-app`.

## Consequences

The project has routing, layouts and a server runtime for later phases
(for example, keeping tokens server-side), with one framework for every
phase. It's heavier than Vite for Phase 1. The guide's Vite-specific
details (`VITE_USE_MOCK`, the Nginx static build) map to Next.js
equivalents (`NEXT_PUBLIC_USE_MOCK`, `next start` or static export).
