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
| `docs/SafePassLanding/branding.md` | Theme, tokens, dark mode, accessibility, motion tokens, asset direction. §1 is the authoritative Experience Tier (`Creative`) and Target Platform (`Web`). **§1 Tone of Voice "never reaches for abstraction" is now relaxed for the owned category and the certainty promise** (Road Journey Assurance Platform) — see §6a |
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
| `screens/01` | Hero subheadline: "safety-focused satnav…" | "Plan your journey. Travel with confidence…" + added `marketLine` ("Designed for inter-city travel, high-risk routes, business travel and passenger transport.") | Client copy pass (post-launch). "Why this exists" before "what it does"; the market line names the segments so a visitor knows instantly whether SafePass is for them. |
| `screens/01` | Hero CTA label "Get SafePass on your phone"; secondary "See pricing for travellers" | `ctaLabel` "Get the App"; secondary "View Plans & Pricing" | Client copy pass. "Get the App" is store-agnostic (a visitor deciding which store is a second decision that adds friction); pricing link name matches the polished register. |
| `screens/01` | Hero pins for 150% (already descended to 75%) | Unchanged here | See row above — recorded for completeness; not changed in this pass. |
| `screens/01` How It Works | Step 2 "Fund your wallet" / Step 3 "A real officer watches the trip" / Step 5 "Escalate an emergency" | "Activate monitoring" / "Live human monitoring" / "Rapid emergency response" | Client copy pass. Money-before-value is a psychological misstep; "Live human monitoring" sharpens the differentiator; "Rapid emergency response" is stronger and reads as the outcome. |
| `screens/01` How It Works step 5 body | "begins silent background audio recording so evidence is preserved" | "…where permitted by law — the app can securely preserve background audio as evidence" | Client copy pass. Softened to avoid an absolute legal claim; jurisdiction language keeps flexibility. |
| `screens/05` credibility copy | "seeds its map" | "builds its safety map" | Client copy pass. "Builds" is simpler and refers to an ongoing, verifiable process rather than a one-off seed. |
| `screens/01` Audience Entry Cards | "Find your path"; business blurb "Responsible for staff who travel…"; transport blurb "Offer monitored trips…" | "Choose how you use SafePass"; business blurb "Protect employees travelling for work, monitor journeys in real time, and receive actionable reporting…"; transport blurb "Differentiate your transport business by offering monitored passenger journeys…" | Client copy pass. The new title tells the visitor what follows; the blurbs are enterprise-grade and commercial rather than internal/tentative. |
| `screens.md` navigation map | Header carries audience selector + one cross-cutting page (`/how-we-verify`) | `PRIMARY_NAV` now also carries `About` (`/about`) | Client request. Investors, partners, government, and media reach About in one click rather than hunting the footer; the header's audience-routing job is unchanged. |
| `screens/01` section order | Hero → How It Works → Credibility Preview → Audience Entry Cards | Hero → **Trust** → How It Works → … | Client-requested trust section added between Hero and How It Works (see `sections/trust/trust-section.tsx`). Communicates operating principles before the visitor reaches price. Not carried by a feature ID. |
| `screens/05` intro | "This page explains, in public, how SafePass builds its safety map before the first journey is ever taken…" | "Transparency matters. This page explains exactly how SafePass builds its safety map, where information comes from, how reports are verified, and how every marker earns its level of confidence." | Client copy pass. Leads with the transparency commitment and names what the page answers ("where does the information come from") before the technique. |
| `screens/05` intro | "Where we have no figure yet, we say so rather than estimate." | "Where data is not yet available, we say so rather than estimate or speculate." | Client copy pass. "Speculate" is the stronger word and matches the no-claims posture. |
| `screens/05` stats | `SAFETY_DATA_STATS` carried `journey-fee` (₦2,000) and `wallet-minimum` (₦2,000) | Both **removed** from this page; only `verification-tiers` (5) and `confirmations-to-verified` (5+) remain | Client feedback. This page is about verification, not pricing — a cost stat interrupts the trust story. Pricing still appears on the Individual page's `PricingBlock` (FEAT-006) and in How It Works step 2. **No replacement operational stats were added**: "average review time", "states covered", "checkpoints mapped", "number of data sources" are operational metrics SafePass has not published, and R-007 forbids publishing them. The grid intentionally carries the two verification methodology stats only. |
| `screens/05` Layer 1 | "the map is populated by hand" / "Admin pre-seeding, before launch" / "Known kidnapping corridors" / "Permanent police, military, and FRSC checkpoints" | "the map is curated by SafePass analysts using publicly available security information and verified institutional sources" / "Analyst curation, before launch" / "Areas with repeated publicly reported kidnapping incidents" / "Known official police, military, and FRSC checkpoints, where publicly verifiable" | Client copy pass + legal hardening. "Curated" reads professional rather than amateur; "permanent" avoided because checkpoints move; the kidnapping phrasing stops implying SafePass officially classifies a road as a kidnapping corridor. |
| `screens/05` Layer 2 | "Travellers report what they encounter on the road" | "Travellers can report incidents they personally observe during monitored journeys" | Client copy pass. Wording subtly discourages false reports (reports only what was personally observed) without adding friction. |
| `screens/05` Layer 3 | "Verification weighting" | "Confidence scoring" | Client copy pass. "Confidence scoring" is the more common modern-platform term; body/points now reference "confidence levels" rather than "tiers". |
| `screens/05` tiers | Unverified / Verified / Rejected descriptions | Reworded — "Reported by one traveller but not yet independently confirmed…", "Confirmed by SafePass administrators, or independently corroborated by five or more travellers…", "Determined to be false, duplicated, malicious, or otherwise unreliable after review…" | Client copy pass. Clearer at each level; "judged" dropped from Rejected (less emotional, matches a review outcome). |
| `screens/05` | (no "How quickly information changes" section) | Added — "How quickly information changes" (stay alert, markers may be updated/downgraded/removed) | Client request. Legally protective (cannot guarantee real-time accuracy) and trust-building. New content block in `lib/content/credibility.ts` (`INFORMATION_CHANGES`). |
| `screens/05` | (no "Our sources" section) | Added — "Where the information comes from" with a 9-item source-type list (NPF public statements, FRSC advisories, NEMA, news, partners, Monitoring Centre, traveller reports, emergency services, community intelligence) | Client request. Answers "where does this come from" concretely. Source *types*, not quantities — no figure, so nothing needs a source/as-of date (R-007). New content block `SOURCES`. |
| `screens/05` stat-callout | "As of 27 July 2026" | "Last reviewed 27 July 2026" | Client copy pass. "Last reviewed" reads as an actively maintained page. Applies to all stat figcaptions. |
| footer | (Trust Centre link) | **Not added** | Client flagged it as "eventually"; there is **no Trust Centre route** in the site, and a footer link to a nonexistent page would be a 404. Deferred until the Trust Centre page (or a decision to point it at `/how-we-verify`) exists. |
| `screens/02` hero heading/lead | "Someone is watching your journey. An actual person." / old lead | "Every journey deserves someone watching over it." / "…a trained SafePass monitoring officer follows it live from departure to arrival — providing real human oversight, not just automated alerts after something goes wrong." | Client copy pass. Elevates from monitoring service to reassurance service; aligns with the "Every Journey Matters" tagline. |
| `screens/02` use cases | Two use cases (inter-city, high-risk corridor) | Four: + "Local journeys" + "When someone is waiting for you"; subtitle "Some of the journeys where SafePass makes the biggest difference." | Client feedback. Positions SafePass for journeys that matter wherever they happen, not only "dangerous roads"; opens the market to everyday city travel, ride-hailing, and the emotional safety-of-loved-ones case. |
| `screens/02` pricing | "What it costs" heading, minimal cards, "Minimum wallet funding" | "Simple, transparent pricing"; reassurance badges (No subscription / Pay per journey / No hidden charges / Transparent pricing); "Every monitored journey includes" value box; "Minimum wallet top-up"; new footnote | Client feedback. Leads with value and reassurance before the price, so the visitor asks "this is exactly what I need — how much?" rather than "why should I pay ₦2,000?". See §3a note below on the value box. |
| `screens/02` pricing | "Wallet never expires" badge (client-hedged "if that remains your policy") | **Not included** | The wallet-expiry policy is not confirmed in the docs; asserting it would invent a claim. Flagged for product-shaper/business to confirm before adding. |
| `screens/03` hero | "Know your people got there." / old lead | "Know every employee arrived safely." / enterprise lead ("…a complete audit trail for management.") | Client copy pass (chose Option A). More corporate; the lead now names oversight, arrival confirmations, escalation, and the audit trail. |
| `screens/03` use cases | Two use cases | Three: + "Executive & VIP travel" | Client feedback. "Yes… our CEO travels" widens enterprise appeal without claiming any industry as a customer. |
| `screens/03` dashboard | "Staff management" capability, 5 items | "People & team management"; + "Journey analytics" (6 items) | Client feedback. "People & team" sounds larger than "staff"; analytics is what executives look for and supports duty-of-care reporting. |
| `screens/03` data posture | 3 cards | + "Access is role-based" (4 cards) | Client feedback. Enterprises ask about access control immediately; no compliance certification claimed. |
| `screens/03` | Credibility module below the dashboard | **Moved above** the dashboard capability section | Client feedback ("safety data you can check" moved higher): the "we don't invent security" proof lands before the capability claims. |
| `screens/03` | "Take this to your team" / "Request a demo" | "Build your internal business case" / "Let's discuss your travel operations" | Client feedback. Psychologically stronger for the person convincing procurement; the demo heading reads less like a sales form. |
| `screens/03` | (no suitability / comparison sections) | Added "Suitable for organisations like…" (9 industries) and "Why organisations choose SafePass" comparison table (6 rows) | Client feedback. The industry list lets a visitor recognise "built for companies like ours"; the comparison is the single most persuasive element. Both are qualitative — no figures, so nothing needs a source/as-of date (R-007). |
| `screens/03` | (case-study numbers: 324 journeys, 4-min response) | **Added as an explicitly-illustrative case study** | Implemented on client confirmation. The figures are labelled "Illustrative example" with a note ("Illustrative figures shown to demonstrate the reporting a monitored operation produces") so they are never read as published SafePass operational data (R-007). Set to swap in real pilot numbers before the site treats it as evidence (calls to light). Data lives in `CORPORATE_CONTENT.caseStudy`. |
| `screens/03` | (compliance strip: "GDPR aligned", "NDPA compliant") | **Feature/behaviour items rendered; legal certifications gated** | Implemented on client confirmation. The assurance strip renders the feature items (corporate dashboards, audit logs, role-based access, journey history) immediately. The two legal-certification claims are held in `CORPORATE_CONTENT.assurance` behind `renderLegalCertifications: false` — they do NOT render until counsel signs off, because compliance-certification claims are assertions only the business and counsel can make (existing `dataPosture` docs forbid an engineer asserting them). One-line switch after legal sign-off. |
| `screens/03` | (dashboard screenshot numbered callouts ①-⑤) | **Added as a numbered call-out legend** | Implemented on client confirmation. Delivered as a legend under the dashboard image rather than overlay markers: the image is a placeholder mockup, so overlays could not be reliably positioned, and a legend survives the swap to a real screenshot. Five items: active journeys, emergency alerts, live officer monitoring, incident history, messaging. |
| `branding.md` §1 Tone of Voice ("never reaches for abstraction") | Abstraction disallowed | **Abstraction now allowed for the owned category + certainty promise** | Client repositioning: SafePass is a **Road Journey Assurance Platform** — not a tracker, satnav, or "monitoring app" — and the promise is **certainty**. This relaxes the no-abstraction tone rule for the category name and the certainty promise specifically. Requires product-shaper to reconcile `branding.md` §1. |
| `branding.md` / all pages | "Road safety monitoring for Nigeria"; "For traveller/business/transport" eyebrows | Homepage hero eyebrow → "Road Journey Assurance Platform"; audience eyebrows → "Road Journey Assurance — for …"; leads reframed around certainty | Client repositioning (full). A new `lib/content/brand.ts` holds the category name + two-sided promise in ONE place so it cannot drift; the hero and audience eyebrows echo that category. Tagline "Every Journey Matters." unchanged. |
| `screens/02` "When someone is waiting for you" | "provides peace of mind" | "provides the certainty that someone is watching your trip" | Decided during product-shaper reconciliation: "certainty" is the one owned promise, so a competing abstraction ("peace of mind") was removed rather than left to compete. `branding.md` §1 now permits abstraction only for the owned category + promise, and reserves it against other standalone abstraction words ("confidence" survives only as the data-verification term). |
| `branding.md` / footer | Public contact address "hello@safepass-tech.com" | **"support@safepass-tech.com"** | Client-supplied: the public support address is `support@safepass-tech.com`. Flows through `fallbackContactEmail` (env default) into the footer, form Submission Error state, legal pages, and the business-overview print page. `.env.example` template updated. |
| `branding.md` / FEAT-002 | Social/press links | **Capability added; no URLs rendered until supplied** | Client confirmed social links should be on the site, but did not supply any handles/platform URL. Per the existing documented decision (README "Open Decisions Blocking Launch Facts", features.md FEAT-002) a URL is never invented — a fabricated handle would link to an account that may not exist. `navigation.ts` now exports a `SOCIAL_LINKS` array (deliberately empty) and the footer renders a "Follow us" column only when it is non-empty, so real URLs drop in without touching the component. |
| `screens/04` hero | "Make “monitored” something you can advertise." / old lead | "Become Nigeria’s most trusted transport operator." / "…build passenger trust through verified vehicles, verified drivers and live monitored journeys handled by real SafePass officers — not just GPS tracking." | Client copy pass. Leads with the outcome the operator wants, not what SafePass does; the lead no longer repeats "a reason to choose you" because the heading says that. |
| `screens/04` fleet | 6 capabilities | + "Driver Verification History" (7) — **then removed** (6) | Client feedback proposed it ("passengers can see whether the assigned driver matches the verified driver"). **Not shipped:** the QR verification page (`apps/api/src/routes/verify.routes.ts`) explicitly never exposes driver data, and no driver-verification-history view exists in the transport dashboard. The claim is unbacked → removed (Non-Negotiable 5). Recorded as a product gap to build if commissioned. |
| `screens/04` differentiator | "A safety claim you can actually back" | "Why passengers trust monitored operators"; + "Emergency response starts immediately" (4 points) | Client feedback. Renamed to lead with the passenger-trust outcome; the added card differentiates SafePass — officers already hold journey/passenger/vehicle detail, so escalation starts without waiting. |
| `screens/04` cost | 2 questions | + "Will passengers have to install SafePass?" (3) | Client feedback. Operators worry about customer friction; the answer ("No. …works without changing your existing booking process") addresses it head-on. |
| `screens/04` | (no QR / benefits / suitability sections) | Added "Every vehicle gets its own SafePass identity" (QR), "Why operators partner with SafePass" (7 benefits), "Suitable for" (10 fleet types) | Client feedback. The per-vehicle QR is a top selling point, now its own section; the operator-benefits summary is persuasive; the suitability list widens the market beyond buses (ride-hailing, shuttles, logistics, etc.). All qualitative — no metrics, so nothing needs a source/as-of date (R-007). |
| `screens/04` (partnership form) | (no "current challenges" question) | **Added a "What challenges are you facing?" select** | Client feedback. Helps sales frame the first call around the operator's own stated problem. **Cross-cutting contract change** (AGENTS.md rule 6): `PartnerChallengeEnum` + `currentChallenges` added to `@safepass/shared` `PartnerInquiryInputSchema`, a native `Select` added to `components/ui`, the landing form field wired, and the API `leads` table + route mapped. **Migration shipped:** `0019_partner_challenges.sql` (hand-written additive migration + journal entry with `when` strictly after `0018`) — applied and verified on the local DB (`current_challenges` column exists). See §7 note on the pre-existing snapshot gap. |
| `screens/04` / admin | (no leads read path — no admin dashboard leads page for ANY lead type) | **Added `/dashboard/leads`** (admin dashboard) — list, filter by type + status, click-through detail showing the full record (incl. `currentChallenges`, fleet size, message), and triage (PATCH status + notes) | Product-shaper decision (Option 1): the "current challenges" field is only worth shipping if the sales team can read the answer. A leads admin view was the hard prerequisite, and it covers all three lead types (partner inquiry, demo request, waitlist) since none had a read path before. Mirrors the role-upgrades review-queue pattern. |
| `screens/04` | (operator testimonials) | **Not added** | Client referenced operator testimonials ("Passengers started asking specifically for our monitored departures"), but these are invented quotes operating as social proof — R-007 forbids unverifiable claims, and a fabricated testimonial is the same class of unverifiable claim. Deferred until a real operator can be quoted. |
| `screens/04` | (SafePass Verified Operator certification) | **Not implemented** | Client's "one idea that genuinely excites me" — a verified-operator badge + public verification page is a future product/trust-standard feature, not a landing-page copy change. Recorded as a roadmap idea, implemented when the feature ships. |
| `screens/06` warning box | "This document is being finalised… wording is still under legal review and is provided for information only." | "This Privacy Policy is currently undergoing **final legal review**. The principles, scope and obligations described below are substantially complete and reflect how SafePass handles information… Any future revisions are expected to clarify legal wording rather than change these commitments." | Client feedback — the old notice "slightly undermines confidence". Reworded to be confidence-inspiring while still stating the review is ongoing (kept "legal review" so R-011's visibility requirement holds; avoided the client's stronger "accurately reflect" because the prose is still placeholder awaiting counsel — asserting legal accuracy of unreviewed text would be a false claim). |
| `screens/06` Who We Are | "SafePass operates this website…" | "**SafePass Technologies Ltd** operates this website and acts as the data controller…" + registered-company details block | Client feedback — stronger data-controller framing + transparency. Entity name is client-supplied. **RC number and registered office are NOT supplied → rendered as "to be confirmed"** (never invented). Email + Country (Nigeria) are set. |
| `screens/06` Information We Collect | Single bullet list | **Two visual groups** ("Information you provide" / "Information collected automatically") rendered as cards | Client feedback — "much easier to skim". New `listGroups` field on `LegalSection` + renderer. |
| `screens/06` How We Use | "We do not sell your personal information." as plain paragraph | Rendered as an **emphasised trust line** (border + bold) | Client feedback — "Many users skim. Seeing this immediately creates trust." New `emphasis` field on `LegalSection`. |
| `screens/06` Sharing | (no sell/rent sentence) | Added "We never sell or rent personal information to advertisers or data brokers." | Client feedback — "a sentence people actively look for". |
| `screens/06` Security | "No method is completely secure…" (limitation-first) | "We protect information using encryption, access controls, authentication, logging…" then "Although no system can guarantee absolute security…" | Client feedback — "Lead with strength. End with limitation." |
| `screens/06` Your Rights | Plain bullet list | **Check-style list** (✔ Access / Correction / Deletion / Restriction / Withdrawal / Portability / Complaint) | Client feedback — "Very easy to scan." New `listStyle: 'check'` on `LegalSection`. |
| `screens/06` Contact | No response time | Added "We aim to respond to privacy enquiries within 30 days." | Client feedback — "Makes the company appear operational." Deliberately NOT `needsLegalReview` (it's an operational promise, not a legal disclosure). |
| `screens/06` | (no trust statement) | **New "Our Privacy Commitment" section** — "SafePass exists to improve personal safety — not to exploit personal information…" | Client feedback — "That's not legal. That's trust. And SafePass is selling trust." Rendered with no legal-review flag (it's a commitment statement, not a legal disclosure). |
| `screens/06` sticky TOC / cookie banner / Trust Centre | (not present) | **Deferred** | Client said "eventually" for the cookie banner (Accept/Reject/manage preferences) and Trust Centre page, and sticky TOC needs a layout change. Recorded as follow-ups; not built in this pass. |
| `screens/06` + `screens/07` | LegalReviewNotice hardcoded "This Privacy Policy…" | **Now title-driven** (`{title} is currently undergoing final legal review…`) | Bug fix: the notice is a SHARED component rendered on both Privacy and Terms, so the Terms page was mislabelling itself as the Privacy Policy. Now uses each document's own title. Also reworded to the confidence-inspiring framing for both. |
| `screens/07` Use of Site | No scraping/interference clause | Added "You must not attempt to reverse engineer, scrape, interfere with, or disrupt the operation or security of this website." | Client feedback — "Very common." |
| `screens/07` Information You Submit | No confidential-info clause | Added "You agree not to submit confidential information unless specifically requested." | Client feedback — protects SafePass from being treated as a secure channel for confidential material. |
| `screens/07` Intellectual Property | Prose only | Added list of protected categories: text/graphics/design, SafePass name + brand marks, software, database rights | Client feedback — "Investors like seeing IP clearly protected." Still `needsLegalReview` (no licence terms stated). |
| `screens/07` Disclaimers | "This section sets out…" | Added standard "as is" and "as available" warranty disclaimer | Client feedback — standard wording. Still `needsLegalReview`. |
| `screens/07` Governing Law | "This section states…" | **"These Terms are governed by the laws of the Federal Republic of Nigeria."** | Client-directed — states the law explicitly (client gave the wording). Dispute-resolution forum still awaits counsel. |
| `screens/07` Contact | "Contact Us" + plain route | Heading → **"Questions?"** with warmer copy + "We aim to respond to enquiries within 30 days." | Client feedback — "a little humanity on the legal pages" + response-time commitment. Section id stays `contact`. |
| `screens/07` | (no trust statement) | **New "Our Commitment" section** — "SafePass is committed to providing accurate information about our services… users should rely on the SafePass platform itself for live monitoring, alerts, and operational information." | Client feedback — trust statement matching the Privacy Policy's commitment. No legal-review flag (it's a commitment, not a legal disclosure). |
| `screens/08` | (no problem-statement section) | **New "Why SafePass Exists" section** — "Every year, millions of journeys across Nigeria begin without anyone knowing whether the road ahead is safe… SafePass was created to change that. Our goal is simple: make every journey safer…" | Client feedback — "Investors don't invest in products… They invest in companies." Leads the About page with the problem, not company history. |
| `screens/08` Where We Operate | "Nigeria is our initial market…" | Added "We chose Nigeria first because it presents one of the world's most demanding road safety environments. Building for Nigeria means building for some of the toughest operational conditions anywhere." | Client feedback — makes the Nigeria-first choice sound deliberate rather than incidental. |
| `screens/08` How We Are Different | Text-only pillar list | **Icon beside each pillar** (navigation / human / intelligence / evidence) | Client feedback — "break up the reading without diluting the professionalism." New `listIcons` field on `LegalSection` + renderer (`LIST_ICONS` map: MapPin / Eye / Radar / ShieldCheck). |
| `screens/08` timeline | (not present) | **Not added** | Client's "eventually" suggestion with concrete dates (2024 founded, 2025 first ops…). **Blocked:** the About page's own discipline (and Non-Negotiable 5) forbids inventing incorporation dates/history not recorded in the docs. Needs real company dates from the client before it can ship. |
| `screens/08` leadership | (not present) | **Not added** | Client's "eventually" (Founder & CEO + photo). Needs a real person + photograph + consent. Flagged. |
| `screens/08` advisory board / partners / press / awards / careers / investors | (not present) | **Not added** | Client's "eventually / future" list. All require real data (real advisors, real partners, real press). Flagged. |
| all pages | "Road Safety" category framing | **"Safety" framing** | Client direction: "Road Safety" → "Safety" (e.g. "Safety Monitoring for Nigeria"). Applied to the visible copy where "road safety" was used as a category descriptor — the About page's "people who need safety in Nigeria" and "world's most demanding safety environments". Descriptive "road travel"/"road journeys" (the activity) are unchanged, and the owned category name "Road Journey Assurance Platform" is unchanged. |
| all pages | Em dashes in user-visible copy | **Removed** | Client direction: de-AI the site copy, remove em dashes. Every em dash in user-facing strings was replaced with natural punctuation (period, comma, colon, or parentheses) per context. Metadata titles now use a colon ("SafePass for business: staff road travel monitoring"); audience eyebrows drop the dash ("Road Journey Assurance for travellers"); legal rights lists and differentiator lists use colons; parenthetical asides use parentheses. Developer comments, test `describe`/`it` labels, and the intentional "…" ellipses (e.g. "Suitable for organisations like…", "Sending…") are unchanged. Curly apostrophes are unchanged (standard typography, not an AI tell on their own). |

_§3a note — the pricing "Every monitored journey includes" box lists six capabilities (live SafePass monitoring officer, real-time journey tracking, route monitoring, emergency escalation if required, arrival confirmation, a secure journey record). The first five are documented SafePass capabilities; "a secure journey record" is a capability assertion added on client feedback and should be confirmed against the app's actual journey-record feature before launch._

## 7. Build Progress

| Phase | Features | Status |
|---|---|---|
| Foundation | Scaffold, theme, motion pipeline, contracts, lead intake, routing skeleton | **Complete** |
| Phase 1 — Launch Essentials | FEAT-001, 002, 003, 004, 005, 006, 007, 009, 010, 011, 012, 015 | **Complete & verified** — all 12 features; full-phase verification passed (routes, link integrity, flows, lead round trip, secret-leak check) |
| Phase 2 — Trust & Discovery | FEAT-008, 013, 014 | Not started |
| Phase 3 — Future Cycle | FEAT-016, 017 | Deferred (P3 — not in build scope) |

**Post-launch copy & trust pass (client feedback, no phase):** hero copy/CTA, How It Works titles + softened audio copy, credibility "builds its safety map", audience card title/blurbs, `About` added to the header nav, and a new `TrustSection` between Hero and How It Works. All deviations are recorded in §6a, above. The hero motion contract (`data-hero-line` / `data-hero-supporting`) was untouched — the added `marketLine` carries the same `data-hero-supporting` attribute, so the reveal animation still works without touching animation code (R-005). Deferred by decision: statistics and testimonials are **not** added — SafePass has published no genuine figures/quotes, and R-007 forbids publishing unverifiable claims; both are queued for when real launch data exists.

**How We Verify page pass (client feedback, no phase):** `screens/05` intro copy, Layer 1/2/3 copy + legal hardening, the five-tier descriptions, new "How quickly information changes" and "Our sources" sections, stat-callout "Last reviewed", and removal of the two pricing stats from this page. All recorded in §6a. The two pricing stats still appear on the Individual page's `PricingBlock`; no operational replacement stats were added (R-007). **Deferred:** the "Trust Centre" footer link — no route exists yet and a footer link to a 404 would ship broken; the Trust Centre page (or a decision to point it at `/how-we-verify`) is a follow-up.

**Individual page pass (client feedback, no phase):** hero heading/lead, use cases expanded from two to four (added "Local journeys" and "When someone is waiting for you"), and the pricing section restructured to lead with value (reassurance badges + "Every monitored journey includes" box) before the price. All recorded in §6a. **Flagged:** the "wallet never expires" reassurance badge was deliberately omitted (policy not confirmed); "a secure journey record" in the includes box needs confirmation against the app's actual feature set.

**Corporate page pass (client feedback, no phase):** hero heading/lead, +"Executive & VIP travel" use case, "People & team management" + "Journey analytics" capability, +"Access is role-based" data card, credibility module moved above the dashboard, overview/demo renames, and the new "Suitable for organisations like…" + "Why organisations choose SafePass" comparison sections. All recorded in §6a. **Follow-up items now shipped (client-confirmed):** the illustrative case study (labelled so its figures are never read as published data — R-007), the assurance strip (feature items render; legal certifications gated behind `renderLegalCertifications` until counsel sign-off), and the dashboard numbered call-out legend. **Outstanding:** the Road Journey Assurance Platform Repositioning (site-wide brand shift) is scoped separately, pending confirmation.

**Road Journey Assurance Platform pass (client repositioning, no phase):** the owned category name is now the homepage hero eyebrow ("Road Journey Assurance Platform") and appears as "Road Journey Assurance — for …" on the three audience pages, with leads reframed around the certainty promise and a new `lib/content/brand.ts` as the single source of the category + two-sided promise. Tagline "Every Journey Matters." unchanged. Requires `product-shaper` to reconcile `branding.md` §1 (abstraction now permitted for the category and certainty promise) and the affected `screens/*.md` copy.

**Docs reconciliation (product-shaper):** `branding.md` §1 Tone of Voice amended to permit abstraction for the owned category + certainty promise (with a guardrail reserving it against other standalone abstraction words); `README.md`, `screens/01`, `screens/02`, `screens/03`, `screens/04` hero/audience copy repositioned. Code follow-up made: the "When someone is waiting for you" use case aligned from "peace of mind" → "certainty" so code matches the authoritative docs.

**Transport Partner page pass (client feedback, no phase):** hero copy, differentiator rename + "Emergency response starts immediately", +"Will passengers have to install SafePass?", and three new sections (QR identity, operator benefits, suitability). All recorded in §6a. **Also shipped:** the "What challenges are you facing?" select on the partnership form — a cross-cutting contract change across `@safepass/shared`, the landing form, and the API (leads schema + route). **Leads admin view shipped (product-shaper Option 1):** `/dashboard/leads` reads + triages all three lead types, closing the read-path gap the client's "current challenges" question exposed. **Migration shipped:** `0019_partner_challenges.sql` applied and verified. **"Driver Verification History" REMOVED:** the client-proposed card was not backed by the product (QR verification never exposes driver data), so it was removed rather than shipped as an unverified claim. **Snapshot-chain repair (done):** `drizzle/meta` snapshots `0006–0018` were never committed (repo practice — even the `0018_landing_leads` commit carried no snapshot). This made `drizzle-kit generate` fall back to the stale `0005` snapshot and prompt about unrelated columns. Fixed by adding a **schema-derived `0019_snapshot.json`** (generated from the current schema — the source of truth — chained `prevId` → `0005`) so `generate` diffs against the true current state. Verified: `drizzle-kit generate` now reports "No schema changes, nothing to migrate" (no phantom prompts, no destructive diff). Note: DB introspection was NOT used for the baseline because the local DB has drifted from the schema (introspection produced a destructive drop/recreate diff) — the schema is the source of truth. `db:migrate` (production) is unaffected by snapshots; it uses journal + SQL. **Deferred (flagged):** operator testimonials (invented social proof, R-007) and the SafePass Verified Operator certification (future feature).

**Privacy Policy pass (client feedback, no phase):** confidence-inspiring warning box, data-controller framing + registered-company details block, "Information We Collect" split into two visual groups, emphasised "We do not sell" line, "never sell/rent to advertisers or data brokers" sentence, security lead-with-strength, check-style rights list, 30-day contact response time, and the new "Our Privacy Commitment" trust section. All in §6a. **Pending client data:** RC number + registered office (rendered "to be confirmed"). **Deferred:** sticky TOC, cookie banner (Accept/Reject/manage), Trust Centre page — client flagged "eventually".

**Terms of Service pass (client feedback, no phase):** title-driven legal-review notice (bug fix — the shared notice was mislabelling the Terms page as the Privacy Policy), reverse-engineer/scrape prohibition, confidential-info clause, expanded IP categories, standard "as is / as available" disclaimer, explicit Nigerian governing law, "Questions?" contact with 30-day response, and the new "Our Commitment" trust section. All in §6a. **Deferred:** sticky TOC, expanded liability cap/warranty wording (counsel), the broader governance pages (Security / Compliance / Status / Press) — client flagged "eventually".

**About page pass (client feedback, no phase):** new "Why SafePass Exists" problem-statement section, the deliberate Nigeria-first sentence in Where We Operate, and icons beside the four differentiator pillars (new `listIcons` on `LegalSection`). All in §6a. **Blocked on real data (flagged, not invented):** the company timeline (2024 founded / 2025 ops — dates not in docs), leadership (real person + photo), advisory board / strategic partners / press / awards / certifications / careers / investors — all client "eventually/future" items requiring real facts.

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
| `NEXT_PUBLIC_FALLBACK_CONTACT_EMAIL` | Public support address (`support@safepass-tech.com`). Shown in the form Submission Error state so a lead is never left with no path forward, and rendered as the footer contact + legal-page contact. |

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
