# SafePassLanding — Asset Manifest

> **What this is.** A runbook for making the site less text-heavy and more self-descriptive with visual assets. Each row names an asset, the **exact file path to place it** (relative to `apps/landing/public/`), its classification, and a **model-ready generation prompt** you paste straight into any image-generation model (tool-agnostic). Drop the generated file at the listed path and it is ready to wire in — no prompt re-derivation needed.
>
> **Scope.** Phase 1 build is already live with the two sanctioned motion assets (route-line, radar-sweep) and the logotype. This manifest is the asset work that turns the remaining text-first sections into visual statements.
>
> **Source of truth for style.** `docs/SafePassLanding/branding.md` §7 (Asset Style Guide) and §5 (mood keywords), and the `screens/*.md` Asset Plans. The docs are read-only; this manifest lives in the app and does not edit them. Client overrides of doc guardrails are called out inline (see "Client overrides" at the bottom).

---

## Where assets go

| Folder | Kind of asset | Notes |
|---|---|---|
| `apps/landing/public/images/` | Photographic + product-UI imagery | Master files. `next.config.ts` already sets `images.formats: ['image/avif','image/webp']`, so `next/image` serves AVIF/WebP `srcset` at the configured breakpoints (480/768/1200/1920) from a single master — **do not hand-generate variants**. |
| `apps/landing/public/images/` (also holds the line-art illustration) | Geometric line-art illustrations | The single illustration (A3) sits in `public/images/` with the other masters — no separate folder was created. A hand-authored SVG is acceptable for line art if you'd rather not run a model. |

**Grounding.** Every prompt references `branding.md`'s mood keywords (`night navy control room`, `cinematic low-key lighting`, `electric blue glow accent`, `route line on dark map`, `precision instrument panel`, `soft volumetric fog`, `minimalist high-contrast composition`, `restrained single-accent color`) and the actual token hexes (`primary` `#0EA5E9`/`#38BDF8`, `ink` `#1E293B`/`#0B1220`, `success` `#0D904F`/`#3FCB84`, `text-secondary` `#54647A`/`#9AA9BF`, `warning` `#F5A623`/`#FBC85B`).

---

## Group A — AI-generatable asset slots

`Status: Pending` — prompt ready; generate and drop at the path. These are the sanctioned (or client-overridden) visual wins.

| # | Route / Screen | Slot | Place file at | Type | Aspect / Res | Status |
|---|---|---|---|---|---|---|
| A1 | Homepage `/` | Hero environmental plate (mobile/reduced-motion static fallback) | `images/hero-road-dusk.webp` | Photograph | 16:9 · master 2400×1350 | Done — wired |
| A2 | `/individual` | Road-corridor supporting image | `images/individual-road-corridor.webp` | Photograph | 16:9 · master 2400×1350 | Done — wired |
| A3 | Homepage `/` — How It Works | "How monitoring works" route/checkpoint line-art diagram | `images/monitoring-route-diagram.webp` | Illustration (geometric line art) | 16:10 · master 1600×1000 | Done — wired |
| A4 | `/business` | Corporate dashboard preview | `images/business-dashboard-preview.webp` | Product-UI mockup (illustrative) | 16:10 · master 2400×1500 | Done — wired (client override) |
| A5 | `/transport-partners` | Fleet / vehicle imagery | `images/transport-fleet.webp` | Photograph (representative) | 16:9 · master 2400×1350 | Done — wired (client override) |

### A1 — Homepage hero environmental plate

```text
Documentary editorial photograph of a two-lane Nigerian highway corridor at dusk, wide environmental composition, natural fading daylight with deep navy-blue shadows (#0B1220) and a cool electric-blue ambient tint (#0EA5E9) at the horizon, a single vehicle in motion with slight motion blur, overcast atmospheric haze, no people in frame, deep depth of field, photojournalistic style, cinematic low-key lighting, minimalist high-contrast composition, soft volumetric fog, matte low-contrast grade designed to sit behind white text, no text, no logos, no watermark, 16:9 aspect ratio, high detail.
```

- Classification: **Photographic / environmental** — AI-generated, per `screens/01-homepage.md` Asset Plan (originally the mobile/reduced-motion static fallback; now also a background on every breakpoint per client request — see "Client overrides").
- Where it plugs in: `apps/landing/src/sections/hero/hero-stage.tsx`. Rendered in the hero **background layer** on every breakpoint (client override). `gradient-hero` (opacity-50) + `gradient-scrim` (opacity-70) are applied in the layer, not baked into the image, so the white hero text stays legible and the plate stays reusable.
- Delivery: above-the-fold LCP image → `next/image` with `priority` + `fill`. On `prefers-reduced-motion` and slow-network (`effectiveType` 2g/3g) it is the only hero visual — motion layers are skipped (branding §8).

### A2 — /individual road-corridor supporting image

```text
Documentary photograph of a Nigerian inter-city road corridor viewed from inside a moving vehicle at dusk, dashboard-level perspective looking through the windshield, dashed road centerline visible receding toward the horizon, cool navy-toned color grade with #0B1220 shadows and #0EA5E9 twilight accents, natural ambient lighting, photojournalistic realism, no visible faces, no passengers, no text, no logos, no watermark, 16:9 aspect ratio, high detail.
```

- Classification: **Photographic / environmental** — AI-generated, per `screens/02-individual-traveller-page.md` Asset Plan.
- Where it plugs in: `apps/landing/src/app/(site)/individual/page.tsx`. Rendered as the right column of the "When people use SafePass" **two-column header** (heading + intro left, photo right), with the use-case cards below. It is a single supporting image, not a carousel.
- Delivery: below-the-fold → lazy-load; `next/image` + `fill` inside the section, `sizes` set to the content column.

### A3 — How It Works line-art diagram

```text
Flat geometric line-art illustration, exactly 2px stroke weight, thin rounded line ends, minimal security-dashboard infographic style. A route line traced across a stylized dark corridor map: a dashed road centerline (cool slate #54647A) receding into perspective, three circular checkpoint markers along the route, one emitting a subtle concentric radar-scan arc, a small success-green (#0D904F) verified dot at the final checkpoint, and one electric-blue (#0EA5E9) route stroke with a soft glow. Monochrome line art, night-navy composition sense, generous clear negative space, isolated on a transparent background so it can sit on either a light or dark surface, clean vector-like edges, no text, no letters, no logo, no watermark, 16:10 aspect ratio.
```

- Classification: **Illustration** — grounded in `branding.md` §7 Illustration Direction ("how monitoring works step graphics"). Added per client approval (not an explicit per-screen Asset Plan line).
- Where it plugs in: `apps/landing/src/sections/how-it-works/how-it-works-section.tsx`. Render beside/above the 5-step `<ol>` (around line 52) as a diagram that makes the sequence self-descriptive at a glance.
- Note: transparent background preferred so it works on `bg-surface` (white, light mode) and the dark hero. If your generator can't do transparency, generate on a flat `#0B1220` base and composite it inside a rounded `bg-surface-elevated` tile in code.

### A4 — /business corporate dashboard preview

```text
Clean product-UI mockup of a corporate safety-monitoring dashboard, dark theme. Left sidebar with staff-management and fleet navigation, main panel showing a live map of a monitored route corridor with a few vehicle position markers and a small live-status feed, right column of summary stat cards (safe-arrival rate, active trips, alerts) rendered in a monospace numeral style. Night-navy control-room palette: background #0B1220, panel surfaces #151E2E, accent electric-blue #0EA5E9 for interactive elements, success-green #0D904F for safe-status pills, clean sans-serif text. Crisp, professional, realistic but clearly illustrative (not a specific vendor's product), soft shadows, subtle glow accents, 16:10 aspect ratio, high detail, no external logos, no watermark, no real-company identifiers, no actual personal data.
```

- Classification: **Product-UI mockup (illustrative)** — **client override** of `screens/03`'s "must be real product screenshots" guardrail (see bottom). Do NOT show real/verifiable figures — keep all data generic so it never reads as a published metric (branding §5 saturation-as-signal discipline).
- Where it plugs in: `apps/landing/src/app/(site)/business/page.tsx` lines 59–64, replacing `AssetPlaceholder label="Dashboard preview coming soon"`.
- ⚠️ Test impact: `apps/landing/src/app/(site)/audience-pages.test.tsx` asserts that placeholder label — it must be updated to assert the `<img>` when this lands.

### A5 — /transport-partners fleet imagery

```text
Documentary editorial photograph of a modern inter-city passenger bus fleet at a Nigerian depot at dusk, three to four buses parked in a row, one in motion with slight motion blur, natural fading daylight with deep navy shadow grade (#0B1220) and cool twilight tones, overcast atmospheric haze, photojournalistic realism, no people in frame, no visible route numbers or brand markings, no text, no logos, no watermark, 16:9 aspect ratio, high detail.
```

- Classification: **Photograph (representative)** — **client override** of `screens/04`'s "real partnered-vehicle photography" guardrail (see bottom). Keep vehicles un-branded so it reads as illustrative, not a specific operator's fleet.
- Where it plugs in: `apps/landing/src/app/(site)/transport-partners/page.tsx` lines 49–55, replacing `AssetPlaceholder label="Partner fleet imagery coming soon"`.
- ⚠️ Test impact: `audience-pages.test.tsx` asserts that placeholder label — update to assert the `<img>` when this lands.

---

## Group B — Real-asset / human-required slots

No generation prompt. These are **explicitly not AI-generatable** by the docs; generating them would undermine the credibility SafePass sells. Sourcing guidance only.

| # | Route / Screen | Slot | Place file at | Type | Recommendation | Status |
|---|---|---|---|---|---|---|
| B1 | `/how-we-verify` + embedded Credibility | Monitoring-officer human-centered photography | `images/officer-monitoring.jpg` (only once a real session is shot) | Photograph, human subject | Real photography of SafePass monitoring staff, briefed against branding §7 Photography Direction (natural light, shallow DOF, `ink`-graded post). An AI "officer" would undercut the page's authenticity claim. | Human-required — not sourced |
| B2 | Homepage `/` (hero, future) | 3D navy shield (logo-derived) | `models/safepass-shield.glb` — deferred; **not part of the current build** | 3D | Human-required — Blender or a freelance 3D artist. Brief against `safepass-logo.png` (project root) for the exact shield silhouette / road cut / pin position. Material: matte navy with an emissive electric-blue edge glow and a separate crimson (`#D93025`) pin. ≤15k tris, Draco/meshopt-compressed `.glb`, single centre pivot for the idle float + scroll-reactive Y rotation. Deferred per `risk_log.md` R-005/R-006 (motion cost / mobile perf); the hero ships with a static fallback until then. | Deferred |
| B3 | `/how-we-verify` + Homepage | Corridor / map aerial | — (do not place) | Photograph / map | **Blocked by docs.** `screens/05` says do not source until real corridor data exists or a purely illustrative (non-map) treatment is agreed — generating map-like imagery risks implying unverified coverage data (R-007). | Blocked — not shipped |
| B4 | Global (header, footer, OG, favicon) | Logo SVG / transparent master | `images/logo-master.svg` | Logo (vector) | Request from the brand owner. The current `safepass-logo.png` is a 512² opaque PNG; a transparent vector master is preferred (noted in `components/layout/logo.tsx`). Never substitute a `lucide` shield for the logo. | Human / brand asset |

---

## Client overrides of doc guardrails

Two slots (A4, A5) are generated **despite** the docs explicitly asking for real product/partner material:

- `screens/03-corporate-audience-page.md` Asset Plan: dashboard imagery "must come from the real product once it exists, never AI-generated or invented" → **client requested an AI prompt** for a fill-in until real screenshots exist.
- `screens/04-transport-partner-audience-page.md` Asset Plan: "a fabricated fleet photo undermines exactly the operational credibility Chidinma is evaluating" → **client requested an AI prompt** for a fill-in.

Both are treated as **illustrative placeholders**, not final: prompts deliberately keep all data generic, vehicles un-branded, and the dashboard clearly a mockup. Replace them with the real product screenshots / partnered-vehicle photography before launch. The docs are unchanged; this is a client decision recorded here only.

Untouched by the override (remain non-AI): monitoring-officer photos (B1), 3D shield (B2), credibility corridor/map (B3), and the logo master (B4).

---

## How to use

1. Copy a prompt from Group A, paste into your image-generation model or platform of choice.
2. Export to the listed **master** resolution; save to the exact `apps/landing/public/…` path shown.
3. Wire it in at the noted component (see "Where it plugs in"). All prompts are tool-agnostic — rerun with the same text to reproduce or tweak.

**Done here.** All five A-group images are generated and wired in (A1 `hero-stage.tsx`, A2 `individual/page.tsx`, A3 `how-it-works-section.tsx`, A4 `business/page.tsx`, A5 `transport-partners/page.tsx`), and `audience-pages.test.tsx` asserts them. Follow-up items: replace A4/A5 with real product/partner material before launch; source the Group B assets (officer photos, 3D shield, logo vector master).
