# SafePassLanding — IMPLEMENTATION.md

> Quick-reference for AI coding agents working on `apps/landing`. Complements `docs/SafePassLanding/`.
> For monorepo-wide conventions (auth, Terraform, CI/CD, naming), see the root `AGENTS.md`.

---

## 1. Source of Truth

- **`docs/SafePassLanding/` is the primary source of truth** for product requirements, features, flows, screens, design tokens, and data contracts. This file is a complementary quick-reference only — never contradict the docs from here.
- **`docs/` is read-only.** Never create, edit, or delete anything under `docs/SafePassLanding/`. If a doc is wrong or incomplete, report it; it is routed through `product-shaper`.
- `docs/SafePass/` (the core product) is context only — this site describes that product, never reimplements it.
- **Non-goals, enforced in code review:** no auth, no tracking/monitoring, no payments, no lead persistence on this site, no content gated behind signup.

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.12 | SSR/SSG — all content crawlable, motion is additive on hydration |
| UI | React / React DOM | 19.1.0 | Server Components by default |
| Language | TypeScript | 5.8.3 | `strict: true`, no `any` |
| Styling | Tailwind CSS | 4.3.0 | `@theme` in `globals.css` — no `tailwind.config.ts` |
| Dark mode | next-themes | 0.4.0 | `class` strategy, matches sibling dashboards |
| Smooth scroll | lenis | 1.3.25 | Single smoothed scroll-progress source (branding.md §6) |
| Animation | gsap (+ ScrollTrigger) | 3.15.0 | One `gsap.ticker` loop, driven by Lenis |
| Icons | lucide-react | 0.474.0 | Outlined, 1.5–2px stroke (branding.md §2) |
| Validation | zod | 3.23.8 | Shared contracts in `@safepass/shared` |
| Class utils | clsx + tailwind-merge | 2.1.1 / 2.6.0 | `cn()` helper |
| Testing | vitest + @testing-library/react + jsdom | 4.1.10 / 16.3.2 / 30.0.0 | `pnpm --filter @safepass/landing test` |
| Test matchers | @testing-library/jest-dom | 7.0.0 | v6 is incompatible with Vitest 4's expect internals — matchers silently fail to register |
| Vite plugin | @vitejs/plugin-react | 5.2.0 | v6 requires Vite 8; Vitest 4 ships Vite 7 |
| Lint | eslint + eslint-config-next | 9.39.4 / 16.2.10 | |
| Hosting | Vercel | — | Git integration, same as sibling dashboards |
| Port (dev) | 3004 | — | 3000 api / 3001 admin / 3002 corporate / 3003 transport |

**Exact versions only** — no `^` or `~`, per root `AGENTS.md` rule 7.

**Deferred by decision (risk_log R-005):** Lottie, Rive, three.js/`.glb` 3D shield. Route-line and radar-sweep motifs are Canvas 2D. Do not add a rendering or animation library without an explicit scope change.

---

## 3. Project Structure

```
apps/landing/
├── src/
│   ├── app/
│   │   ├── (site)/                 # Creative-tier pages (Navbar w/ audience selector)
│   │   │   ├── page.tsx                        /
│   │   │   ├── individual/page.tsx             /individual
│   │   │   ├── business/page.tsx               /business
│   │   │   ├── transport-partners/page.tsx     /transport-partners
│   │   │   └── how-we-verify/page.tsx          /how-we-verify
│   │   ├── (legal)/                # Standard Static Page Layout (non-audience Navbar)
│   │   │   ├── privacy/page.tsx  terms/page.tsx  about/page.tsx
│   │   ├── api/leads/route.ts      # Lead Intake Service — validate, tag, forward, never persist
│   │   ├── layout.tsx  globals.css  error.tsx  not-found.tsx
│   │   └── sitemap.ts  robots.ts
│   ├── sections/                   # One folder per page section; owns its copy + motion
│   │   ├── hero/ how-it-works/ credibility/
│   │   └── individual/ corporate/ transport/
│   ├── components/
│   │   ├── layout/                 # Navbar, AudienceSelector, MobileNavDrawer, Footer
│   │   ├── ui/                     # Button, Input, Textarea, Badge, Stat, Container, VerificationTierBadge
│   │   ├── forms/                  # LeadForm shell + Waitlist/Demo/Partner variants
│   │   └── motion/                 # Reveal, Parallax, RouteLineCanvas, RadarSweepCanvas, CountUp
│   ├── lib/
│   │   ├── motion/                 # scroll-provider.tsx, use-scroll-progress.ts, gsap-setup.ts
│   │   ├── leads/                  # client.ts, payloads.ts
│   │   ├── content/                # copy blocks, safety-data-stats.ts
│   │   ├── audience/               # audience context + session persistence
│   │   └── utils.ts env.ts
│   └── hooks/
├── public/
├── vitest.config.ts  vitest.setup.ts
├── next.config.ts  postcss.config.mjs  eslint.config.mjs  tsconfig.json
└── package.json
```

### Naming Conventions
| Context | Convention | Example |
|---|---|---|
| Files | kebab-case | `audience-selector.tsx`, `lead-form.tsx` |
| React components | PascalCase, filename matches | `hero-section.tsx` exports `HeroSection` |
| Types | PascalCase | `LeadType`, `SafetyDataStat` |
| Functions/vars | camelCase | `buildLeadPayload()` |
| Section folders | kebab-case, one per screens/ section | `sections/how-it-works/` |

---

## 3a. Theme & Token Map

**Theme lives in `src/app/globals.css`.** Tailwind v4 `@theme` block only — there is no `tailwind.config.ts` and no second token file. Every token is declared once and consumed as a Tailwind utility.

**Light/dark mechanism.** Tailwind v4 `@theme` has no native light/dark pair, so each dual-valued token is a two-level indirection: raw values live in `:root` and `.dark` as `--sp-*` custom properties; `@theme` maps the Tailwind namespace onto them. Dark mode toggles via `next-themes` (`class` strategy) on `<html>`. Result: `bg-surface` and `text-text-primary` are correct in both modes with no `dark:` variant at any call site.

```css
:root      { --sp-primary: #0EA5E9; --sp-surface: #FFFFFF; /* ...light values... */ }
.dark      { --sp-primary: #38BDF8; --sp-surface: #0B1220; /* ...dark values...  */ }
@theme inline {
  --color-primary: var(--sp-primary);
  --color-surface: var(--sp-surface);
  /* ... */
}
```

| branding.md source | Tailwind namespace | Status |
|---|---|---|
| §3.1 all 15 colors (primary, primary-hover, primary-light, surface, surface-secondary, surface-elevated, text-primary, text-secondary, border, success, warning, error, info, ink) | `--color-*` | **Mapped**, light + dark |
| `accent-text` (16th token, added post-launch) | `--color-accent-text` | **Mapped**, light + dark. Accent colour for TEXT only — `primary` is 2.77:1 on white and cannot carry text at AA. Use `text-accent-text` for eyebrows, inline links and stat readouts; keep `primary` for fills, borders, focus rings and decorative icons. **Never use it on the hero**, which is dark in both modes — the light-mode value is a dark blue and drops to 2.47:1 there. |
| §3.2 type scale (display, h1, h2, h3, body-large, body, body-small, caption, stat) | `--text-*` + `--text-*--line-height` / `--font-weight` | **Mapped** |
| §3.2 fonts (Inter variable, JetBrains Mono) | `--font-sans`, `--font-mono` | **Mapped** via `next/font` |
| §3.3 spacing xs–4xl | `--spacing-*` | **Mapped** |
| §3.3 radii sm/md/lg/full | `--radius-*` | **Mapped** |
| §3.3 button-height, input-height, icon-sm/md/lg | `--size-*` | **Mapped** |
| §3.4 shadows none/sm/md/lg/glow-primary | `--shadow-*` | **Mapped**, light + dark |
| §6 easing tokens (5) | `--ease-*` | **Mapped** (native Tailwind v4 namespace) |
| §6 timing scale (6) | `--duration-*` | **Extended** — not a native v4 namespace; declared in `@theme`, consumed via `duration-[--duration-normal]` and by GSAP through `durationMs()`. **Tailwind tree-shakes theme vars no utility references**, so `--duration-slow`, `-cinematic` and `-ambient` do not exist at runtime today; `durationMs()`'s fallback table is what keeps GSAP correct. Never read a duration token with a bare `getComputedStyle` — use `durationMs()`/`durationSec()`. |
| §3.1 gradients (hero, route-line, scrim) | `--gradient-*` custom props + `.gradient-hero` etc. utility classes | **Extended** — no native slot |
| §3.1 blend modes (multiply, screen) | Tailwind built-ins `mix-blend-multiply` / `mix-blend-screen` | **Mapped** (built-in) |
| §3.5 component tokens (button/input/audience-selector variants) | Composed in `components/ui/*` from the tokens above | **Mapped** — variants, not new tokens |
| §8 parallax multipliers (0.2 / 0.5 / 1.0) | `lib/motion/constants.ts` | **Extended** — motion config, not a style token |

**Skipped:** none. If a token ever proves unusable, record it here and report it — **never inline its raw value at a call site.**

### ⚠️ Never use a t-shirt-size sizing utility (`max-w-3xl`, `w-lg`, `h-2xl`, …)

`branding.md`'s spacing tokens are named `xs … 4xl`, and they are mapped into Tailwind's `--spacing-*` namespace. Those names **collide** with Tailwind's default `--container-*` scale, which `max-w-*` and friends resolve against. When the container key is absent, the utility silently falls back to the spacing value:

- `max-w-3xl` → **64px** (`--spacing-3xl`), not 48rem
- `max-w-2xl` → **48px** (`--spacing-2xl`), not 42rem

This produces a one-word-per-line column and **no error, no warning, and no failing test** — it shipped through lint, 207 unit tests, and a production build, and was caught only by looking at the rendered page in a browser.

**Use an explicit token instead:** `max-w-(--container-prose)` (800px, reading measure) or `max-w-(--container-content)` (1200px, section width). Padding, gaps, and margins (`p-md`, `gap-lg`, `mt-3xl`) are unaffected and correct — the collision only bites *sizing* utilities.

Audit with:
```bash
grep -rnoE "\b(max-w|min-w|w|max-h|min-h|h|size|basis)-(xs|sm|md|lg|xl|2xl|3xl|4xl)\b" src --include=*.tsx
```
It must return nothing.

### ⚠️ Register every new type/colour token in `cn()`

`tailwind-merge` classifies unknown `text-*` utilities as **colours**. Our type scale (`text-h1`) and colours (`text-text-primary`) therefore both looked like colours, "conflicted", and the size was silently dropped — `cn('text-h1','text-text-primary')` returned only the colour, rendering headings at 16px body size. `lib/utils.ts` extends tailwind-merge with our font-size, text-colour, and spacing scales to fix this.

**When you add a token to `globals.css`, add it to the extension in `lib/utils.ts`** — otherwise `cn()` will delete it at some call site. `src/lib/utils.test.ts` guards the existing pairs.

### ⚠️ Never use ScrollTrigger `pin: true` in this app

Pinning wraps the target in a `.pin-spacer` div, **re-parenting a node React owns**. React then calls `removeChild` on a node whose parent it no longer is and throws *"The node to be removed is not a child of this node"* — which took down **every client-side navigation away from the homepage** into the error boundary.

The hero's hold is CSS instead: `.hero-track` (taller than the viewport) with a `sticky top-0` stage inside, in `globals.css`. Visually identical, and GSAP never restructures the DOM. Pin length lives in `--hero-pin-vh`.

If you need another hold, use the same sticky-track pattern. `src/sections/hero/hero-stage.test.tsx` and `hero-section.test.tsx` both assert no trigger pins.

### ⚠️ GSAP cannot parse `cubic-bezier(...)` strings

Use `gsapEase('outSmooth')` from `lib/motion/constants.ts` for any GSAP `ease`. Passing a CSS cubic-bezier string does **not** throw — GSAP silently falls back to `power1.out`, so every tween runs on the wrong curve while looking fine. CSS transitions are unaffected and may use the `ease-*` theme tokens directly.

**The one sanctioned raw-hex exception:** `app/layout.tsx`'s `viewport.themeColor`. Next.js emits this as a `<meta>` value for browser chrome before any stylesheet is parsed, so a CSS custom property cannot resolve there. The two literals mirror `surface` light and `ink` dark and must be updated together with them. This is the only place in the app a hex may appear — a `grep` for `#RRGGBB` in `src/**/*.tsx` should return these two lines and nothing else.

**Accessibility is baked into the base layer**, so every section inherits it: `:focus-visible` = 2px `primary` outline at 2px offset (never removed, including mid-animation); min touch target 44px with CTAs at `button-height` 48px; `.sr-only` present; all decorative motion `aria-hidden`; verification badges always pair color + icon + text label.

---

## 4. Coding Style & Conventions

- **Server Components by default.** Add `'use client'` only for hooks, event handlers, or browser APIs — i.e. motion components, forms, audience selector. Page content must be server-rendered and readable before hydration (architecture.md).
- **Never import a VALUE from a `'use client'` module into a Server Component.** `'use client'` turns every value export into a client reference in the RSC graph, so the Server Component receives a proxy rather than the object and the build fails at prerender (`X.map is not a function`). `tsc` and the test suite both pass — only `next build` catches it. Keep shared DATA in a plain module and React state in the `'use client'` one: `lib/audience/audience-config.ts` (data, server-safe) vs. `lib/audience/audience-context.tsx` (state, client-only, re-exports the data for client callers). `import type` is always safe, being erased at compile time.
- **Styling: Tailwind utilities referencing named tokens only.** No raw hex, no arbitrary px for spacing/radius/duration, no custom `.css` files beyond `globals.css`. `bg-primary` — never `bg-[#0EA5E9]`.
- **No `dark:` variants** for the token palette — the theme resolves both modes. Use `dark:` only for genuinely mode-specific structural choices.
- **Motion rules (non-negotiable, branding.md §6):**
  - **One scroll source.** `ScrollProvider` owns the single Lenis instance and feeds `gsap.ticker`. Never add a `window.addEventListener('scroll')` or a second `requestAnimationFrame` loop.
  - **Scroll-indexed, not scroll-triggered** — animation *state* is a function of scroll progress (0–1); scrubbing up reverses it exactly.
  - Easing/duration come from tokens; never inline a cubic-bezier or a ms number.
  - Reveal threshold 82% of viewport height. Parallax 0.2x / 0.5x / 1.0x.
  - Every motion component must render its static composed state under `prefers-reduced-motion` — hard requirement, not a nicety.
  - Motion is separable from content (R-005): a copy edit must never require touching animation code.
- **Forms:** Zod schema → client validation → `POST /api/leads`. All five states implemented every time: Default, Validation Error, Submitting (fields locked, prevents double-submit), Submission Error (data preserved + Retry + fallback contact), Confirmed (form replaced, never a blank refresh).
- **Lead Intake route handler** validates, tags with `leadType`/`sourcePage`/`submittedAt`/`submissionId`, forwards to `LEAD_INTAKE_URL`, logs the attempt, and **stores nothing**. A failed forward returns a clear error — never a silent drop (R-004).
- **Data contracts** live in `@safepass/shared` as Zod schemas mirroring `docs/SafePassLanding/schema.md`. Types are inferred, never hand-written.
- **Content** (copy, stats) lives in `lib/content/` as typed data, not inlined in JSX — keeps FEAT-016 (CMS) a swap rather than a rewrite.
- **Every published stat carries `source` + `asOfDate` and renders them visibly** (FEAT-005, R-007). A stat without them does not ship.
- **Images:** `next/image`, WebP/AVIF, `srcset` at 480/768/1200/1920, below-the-fold lazy-loaded.
- Async/await over `.then()`. `import type` for type-only imports.

---

## 5. Behavior Rules

1. **Never write to `docs/`** — report doc errors, don't fix them.
2. **Never hardcode a token value at a call site** — no raw hex, easing, or duration literals.
3. **Never invent a requirement.** Not in the docs and not confirmed? Surface it as a question or a stated assumption.
4. **Never persist a lead** on this site. It forwards; the SafePass backend is the system of record.
5. **Never commit secrets.** All config through env vars; `.env.example` holds placeholders only.
6. **Never add a second render loop or scroll listener.**
7. **Every screen state in `screens/NN-*.md` gets implemented** — loading, empty, error, offline, submitting, validation error. No exceptions, no "obvious" omissions.
8. **Run `pnpm lint` and `pnpm --filter @safepass/landing test` before pushing.** Both green.
9. **Exact dependency versions** — no `^`/`~`.
10. **Check the Shared/Common Components section of `screens.md`** before building any new component — most patterns already exist.
11. **Feature branches:** `feature/feat-<id>-<short-desc>`.

---

## 6. Document Map

| Document | Use When |
|---|---|
| `docs/SafePassLanding/README.md` | Product concept, three audiences, scope boundaries and explicit non-goals |
| `docs/SafePassLanding/user_personas.md` | UX decisions — Amaka (mobile, fast, skims), Tunde (desktop, evaluative), Chidinma (desktop, forwards internally) |
| `docs/SafePassLanding/branding.md` | Theme, tokens, dark mode, accessibility, motion tokens, asset direction. §1 is the authoritative Experience Tier (`Creative`) and Target Platform (`Web`) |
| `docs/SafePassLanding/features.md` | Implementing a feature, writing tests, checking acceptance criteria, reading the dependency graph |
| `docs/SafePassLanding/roadmap.md` | Build order — Phase 1 launch scope, Phase 2 trust/discovery, Phase 3 deferred |
| `docs/SafePassLanding/monetization.md` | Pricing figures shown on the Individual page; lead-value framing behind form error handling |
| `docs/SafePassLanding/risk_log.md` | Resilience work — R-004 lead delivery, R-005 motion scope, R-006 perf budget, R-007 stat staleness, R-011 privacy gate |
| `docs/SafePassLanding/user_flow.md` | Navigation, validation, form behavior, audience persistence, reduced-motion/slow-network fallbacks |
| `docs/SafePassLanding/screens.md` + `screens/` | Building pages — index + navigation map + shared components in `screens.md`, full per-page detail (states, motion choreography, technical surface, asset plan) in `screens/NN-*.md` |
| `docs/SafePassLanding/architecture.md` | Lead Intake Service shape, SSR/hydration split, asset delivery, deployment topology |
| `docs/SafePassLanding/schema.md` | Zod contracts for LeadSubmission, WaitlistSignup, DemoRequest, PartnerInquiry, SafetyDataStat |
| Root `AGENTS.md` | Monorepo-wide conventions, the SafePass backend API, CI/CD |

---

## 6. Brand Assets

The real SafePass emblem is used everywhere branding.md §2 requires it. All four are generated from the repo-root master `safepass-logo.png` (674×578):

| File | Purpose |
|---|---|
| `public/safepass-logo.png` | 512² — the header and footer lockup, via `components/layout/logo.tsx` |
| `src/app/icon.png` | 512² — favicon (Next.js file convention) |
| `src/app/apple-icon.png` | 180² — iOS home-screen icon |
| `src/app/opengraph-image.png` (+ `.alt.txt`) | 1200×630 social card |

**The master has no transparency** — every pixel is opaque and the night-sky field, star glow, and red motion swooshes bleeding past the shield are part of the artwork. It is therefore presented as a rounded app-icon tile rather than a bare mark; keying the background out would clip the swooshes and halo the shield's emissive edge. In dark mode the tile's near-black navy (`rgb(1,5,17)`) sits almost invisibly on `ink`; in light mode it reads as a deliberate dark tile.

**Ask the brand owner for a transparent-background or SVG master** if the mark is ever needed inline in body copy or on a light surface at large size.

Never re-add a `lucide` shield as a stand-in for the logo — that was the Foundation placeholder and it is not the brand.

## 6a. Known Deviations from the Docs

Recorded here so they are visible rather than silently absorbed. Each is queued for `product-shaper` to reconcile in `docs/SafePassLanding/` — **do not "fix" the code back to the doc without re-reading the reasoning.**

| Doc | Says | Built | Why |
|---|---|---|---|
| `branding.md` §6, `screens/01` | Hero pins for **150%** of viewport height | **75%** (`HERO_PIN_VH = 0.75`) | Measured at 1440×900, 150% made the hero 2,250px of a 4,714px page — 48% of all scrolling before section 2 appeared, against branding.md's own stated intent ("efficient rather than heavy… audiences need to reach their CTA quickly"). At 75% the next section appears at 900px instead of 1,575px. |
| `branding.md` §6 | Route-line traversal uses `ease-out-expo` | **Linear** scrub | An ease-out applied to *scroll progress* front-loads everything: the line was 98% drawn at 50% of the pin, leaving ~675px of pinned scroll with no visible change — reading as a hung page. Linear is also what "scroll position is a timeline scrubber" and "scrubbing up reverses it exactly" actually describe. |
| `screens/01` | Headline line-wipe fires at 10% scroll into the pin | Plays **once on load** | A scrubbed wipe is invisible at scroll progress 0, breaking FEAT-003's "headline visible without scrolling" criterion. |
| `screens/03` | One-pager is a direct file download | Print-optimised `/business-overview` route | No designed PDF exists. One-line change to `href`/`download` when one does. |
| `screens.md` | Verification-Tier Badge lists 4 tiers | 4 badge variants + Rejected as plain text | FEAT-005 and `docs/SafePass` describe 5 tiers; `VerificationTierEnum` excludes `rejected` since a rejected report is never a live trust signal. |

## 7. Build Progress

| Phase | Features | Status |
|---|---|---|
| Foundation | Scaffold, theme, motion pipeline, contracts, lead intake, routing skeleton | **Complete** |
| Phase 1 — Launch Essentials | FEAT-001, 002, 003, 004, 005, 006, 007, 009, 010, 011, 012, 015 | **Complete & verified** — all 12 features; full-phase verification passed (routes, link integrity, flows, lead round trip, secret-leak check) |
| Phase 2 — Trust & Discovery | FEAT-008, 013, 014 | Not started |
| Phase 3 — Future Cycle | FEAT-016, 017 | Deferred (P3 — not in build scope) |

Update this table at each phase checkpoint. It is the authoritative record of what exists in code versus what is only documented.

---

## 8. Environment Variables

| Variable | Purpose |
|---|---|
| `LEAD_INTAKE_URL` | SafePass Backend `POST /v1/leads` endpoint. Mock in dev, staging API in staging. |
| `LEAD_INTAKE_API_KEY` | Service auth for the forward call (server-only, never `NEXT_PUBLIC_`). |
| `NEXT_PUBLIC_IOS_APP_URL` | App Store listing (FEAT-007). Placeholder until live. |
| `NEXT_PUBLIC_ANDROID_APP_URL` | Play Store listing (FEAT-007). Placeholder until live. |
| `NEXT_PUBLIC_APP_LIVE` | `true`/`false` — when false, App Store CTA is replaced by the waitlist prompt (Flow 1 Alt-B). |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata, sitemap, Open Graph. |
| `NEXT_PUBLIC_FALLBACK_CONTACT_EMAIL` | Shown in the form Submission Error state so a lead is never left with no path forward. |

---

## 9. Key Commands

```bash
# Setup
pnpm install
cp apps/landing/.env.example apps/landing/.env.local

# Development
pnpm --filter @safepass/landing dev        # Next.js on :3004
pnpm dev                                    # All apps via Turborepo

# Quality
pnpm --filter @safepass/landing test        # Vitest
pnpm --filter @safepass/landing test:watch
pnpm --filter @safepass/landing lint
pnpm format

# Build
pnpm --filter @safepass/landing build
pnpm --filter @safepass/landing start
```
