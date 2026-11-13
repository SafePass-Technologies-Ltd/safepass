# SafePass — Delivery Coordination

## Source of Truth

`docs/SafePass/` and `docs/SafePassLanding/` are the product spec (private vault, gitignored by design — business strategy). This file and `CONTRACTS.md` / `ASSETS.md` are coordination only: how the team builds, who owns what, and the current task state. They are the only writers' files; the Tech Lead is the sole writer of all three.

## Team & File Ownership

| Agent | Owns | Read-only |
|---|---|---|
| tech-lead | `DELIVERY.md`, `CONTRACTS.md`, `ASSETS.md`, root integration glue, `main` merges/tags | everything |
| product-shaper | `docs/` (spec; never edited by anyone else) | repo |
| infra-engineer | Root build/config: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `.github/workflows/`, `terraform/`, `AGENTS.md` | `apps/`, `packages/` |
| backend-engineer | `apps/api/src`, `packages/shared/src`, `apps/api/drizzle/` | `CONTRACTS.md` (read), shared modules |
| frontend-engineer | `apps/mobile/lib`, `apps/admin-dashboard/src`, `apps/corporate-dashboard/src`, `apps/transport-dashboard/src`, `apps/landing/src` | `CONTRACTS.md` (read), shared modules |
| qa-engineer | Tests and integration suites across `apps/`, QA scratch dirs | everything (never commits code) |
| image-artist | Asset files under `apps/*/public`, `apps/mobile/assets`, root brand assets | `ASSETS.md` |

Rules: no two agents work the same directory in parallel; each engineer gets a private scratch dir for tool intermediates; only the Tech Lead writes the three coordination files; nobody but product-shaper writes `docs/`.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Monorepo | Turborepo | 2.9.16 |
| Package manager | pnpm | 10.32 |
| Backend | Node.js + Hono + TypeScript (strict) | 4.12 / 6.0 |
| ORM | Drizzle ORM (PostgreSQL migrations) | 0.45.2 |
| Mobile | Flutter (iOS + Android) | 3.44 |
| Mobile state/routing/models | flutter_bloc / go_router / equatable | 9.1 / 17.2 / 2.0 |
| Mobile HTTP | dio | 5.9 |
| Mobile auth | google_sign_in / sign_in_with_apple / firebase_auth | 7.2 / 8.1 / latest |
| Dashboards | Next.js (App Router), Tailwind + shadcn/ui | 16.2 / 4.3 |
| Backend auth | firebase-admin (Firebase ID token verification) | latest |
| Database / cache | PostgreSQL 16 (AWS RDS) / Redis 7 (Upstash) | 16 / 7 |
| Real-time state | DynamoDB (live positions, 60s TTL) | — |
| Validation | Zod | 3.25 |
| JWT | jose | 6.2 |
| Maps | Google Maps Platform | — |
| Payments | Paystack / Flutterwave | — |
| Push / email | Firebase Cloud Messaging / Resend | — |
| Storage | AWS S3 (evidence, documents) | — |

## Project Structure

```
safepass/
├── apps/
│   ├── api/                  # Hono backend (src/routes, src/services, src/db, src/jobs)
│   ├── mobile/               # Flutter app (lib/app, lib/features, lib/core)
│   ├── admin-dashboard/      # Next.js operations dashboard
│   ├── corporate-dashboard/  # Next.js corporate dashboard
│   ├── transport-dashboard/  # Next.js transport partner dashboard
│   └── landing/              # Next.js marketing site (docs/SafePassLanding)
├── packages/shared/          # Shared TS types + Zod schemas (@safepass/shared)
├── terraform/                # bootstrap, modules, environments/production
├── docker-compose.yml        # PostgreSQL 16 + Redis 7 local dev
└── AGENTS.md                 # Repo conventions (owned by infra-engineer)
```

Naming conventions: files kebab-case; TS types PascalCase; TS functions camelCase; Dart classes PascalCase, files snake_case; DB tables snake_case, columns camelCase; API routes `/v1/<plural-noun>`; branches `feature/<id>-<desc>`.

## Contracts

`CONTRACTS.md` freezes the API surface, derived from the implemented backend. Every endpoint is `Frozen`; a change is a change request (revision + re-dispatch). Request/response shapes are canonical in `packages/shared/src/schemas/`.

## Theme & Token Map

Source: `docs/SafePass/branding.md` (Standard, Cross-platform) and `docs/SafePassLanding/branding.md` (Creative, Web).

| Spec token | Implementation home | Status |
|---|---|---|
| `primary` #0EA5E9 | `apps/mobile/lib/app/theme.dart` `AppColors.primary`; dashboards `tailwind.config.ts` `primary.DEFAULT` | Mapped |
| `success` #0D904F | `AppColors.safetyGreen`; Tailwind `safety.green` | Mapped |
| `warning` #F5A623 | `AppColors.alertAmber`; Tailwind `safety.amber` | Mapped |
| `error` #D93025 | `AppColors.emergencyRed`; Tailwind `safety.red` | Mapped |
| `ink`/slate #1E293B | `AppColors.darkSlate`; Tailwind `slate.dark` | Mapped |
| surface #F8FAFC | `AppColors.lightGrey`; Tailwind `grey-50` | Mapped |
| 9-shade scales, dark-mode values | not implemented (light-only code) | Spec-only, reconcile |
| Inter + JetBrains Mono type scale | platform defaults in code | Spec-only, reconcile |
| Shadow/elevation tokens | partially in Tailwind configs | Reconcile |

Landing creative/motion tokens live in `apps/landing/src/lib/content/brand.ts` and `globals.css`.

## Asset Ledger

`ASSETS.md` records every asset: existing repo assets (logo, app icons, landing imagery) and spec-declared needs (empty-state illustrations, hero imagery), each with slot, path, origin, tool, prompt, status, and family/variant.

## Coding Style & Conventions

Per role, from `AGENTS.md`:
- **TypeScript (backend + dashboards + shared):** strict mode; no `any`; async/await; structured error envelope; Zod validation before business logic; env via validated `env.ts`; pino JSON logs; Vitest co-located tests; `import type` for type-only imports.
- **Flutter:** BLoC/Cubit per logical unit; go_router only (no `Navigator.push`); Dio client with auth interceptors; `json_serializable`; StatelessWidget by default; theme via `AppTheme` only, no hardcoded colors/spacing; every async screen has loading/error/empty states.
- **React/Next.js:** functional components; Server Components default, `'use client'` only when needed; no `useEffect` for initial fetch; SWR for mutations; Tailwind utility classes only.
- **Docs:** product spec never holds implementation detail (that belongs in DELIVERY/CONTRACTS/ASSETS). All user-facing copy humanized via the `humanizer` skill, deferring to branding tone.

## Behavior Rules

1. Never commit secrets — `.env` gitignored; `.env.example` placeholders only.
2. Run tests and lint before committing (`pnpm test`, `dart analyze`, `flutter test`).
3. Conventional Commits with an `Implements: <FEAT-###>` footer; one feature slice per PR.
4. Never write to `docs/` — spec corrections route to product-shaper.
5. Style only through theme tokens; no hardcoded colors in components.
6. Pin exact dependency versions; document any range.
7. Additive Drizzle migrations only; never edit applied migrations.
8. Emergency/panic/security-critical paths carry an inline safety-rationale comment.
9. Humanize any user-facing copy you author (defer to branding tone).
10. API changes update `packages/shared` schemas in the same change.

## Document Map

| Document | Who reads it, for what |
|---|---|
| `docs/SafePass/README.md` | All — product concept, scope, SWOT |
| `docs/SafePass/user_personas.md` | Frontend (UI depth), features traceability |
| `docs/SafePass/branding.md` | Frontend + image-artist — tokens, asset style |
| `docs/SafePass/features.md` | All — FEAT-### IDs, priorities, deps, acceptance criteria |
| `docs/SafePass/roadmap.md` | Tech-lead (phases), infra (timing) |
| `docs/SafePass/architecture.md` | Backend + infra — logical components, data flow |
| `docs/SafePass/monetization.md` | Backend (billing gates), frontend (paywall UI) |
| `docs/SafePass/risk_log.md` | All — mitigations assigned to roles |
| `docs/SafePass/user_flow.md` | Frontend + QA — navigation, validation, flows |
| `docs/SafePass/screens.md` + `screens/` | Frontend — every screen, state, component |
| `docs/SafePass/schema.md` | Backend — canonical data model |
| `docs/SafePassLanding/*` | Frontend (landing) + image-artist — Creative-tier site |
| `CONTRACTS.md` | Frontend + backend + QA — frozen API surface |
| `ASSETS.md` | image-artist + frontend — asset sourcing |
| `AGENTS.md` | All — repo conventions |

## Task Board

Mission 1: reconcile implemented code with the regenerated spec. Mission 2: roadmap Phase 6 backlog. Verified column filled by QA.

| Task | Feature | Owner | Status | Depends On | Contract | Verified |
|---|---|---|---|---|---|---|
| T-001 | Recreate `AGENTS.md` as a general agent file: reference ASSETS/CONTRACTS/DELIVERY as the coordination home and the two doc sets as spec | infra | Done | none | — | — |
| T-002 | Sync Flutter theme to spec tokens (scales; dark mode noted spec-only) | frontend | Done | T-001 | — | — |
| T-003 | Sync dashboard Tailwind configs to spec token names | frontend | Done (admin + landing) | T-001 | — | — |
| T-003b | Fix off-spec colors in corporate/transport `globals.css` (Tailwind v4 CSS-first) | frontend | Done | T-001 | — | — |
| T-004 | Replace stale M/A/C/T feature refs and old doc paths with FEAT-### in `apps/api/src` comments | backend | Done | none | — | — |
| T-004f | Same stale-ref cleanup in `apps/mobile/lib` and dashboard/landing comments | frontend | Done | none | — | — |
| T-006 | Fix pre-existing lint error in `apps/landing/src/components/layout/mobile-nav-drawer.tsx` (setState in effect) | frontend | Done | none | — | — |
| T-007 | Fix pre-existing Flutter test failures (`Firebase.initializeApp` missing in `auth_cubit_test`) | frontend | Done | none | — | — |
| T-005 | QA sweep: CONTRACTS.md matches code; spec/code parity; DoD gate | qa | Done (Verified: PASS) | T-001..T-007 | all | 2026-09-15 |
| T-022 | Restore landing drawer focus tests (T-006 regression: focus-on-open + focus trap) | frontend | Done | T-006 | — | — |
| T-023 | Migrate 4 dashboard map components to spec tokens (off-spec hex literals) | frontend | Done | T-003 | — | — |
| T-024 | Clean 24 stale feature-ID comments in the three dashboards | frontend | Done | T-004f | — | — |
| T-025 | Document upload: pipe file to storage backend instead of discarding it | backend | Done | none | — | — |
| T-026 | Payment webhook: validate gateway HMAC signature (security-critical) | backend | Done | none | — | — |
| T-027 | Tokenize `verify.routes.ts` / `join.routes.ts` page CSS; remove emoji glyphs | backend | Done | none | — | — |
| T-029 | Infra: provision `DOCUMENTS_BUCKET_NAME` in Terraform + ECS env + IAM `s3:PutObject` | infra | **Blocked — never applied** | T-025 | — | — |
| T-028a | Coverage: FEAT-038 marker bulk-import route+service tests (53 tests) | backend | Done (Verified via T-031) | T-005 | — | 2026-09-15 |
| T-028b | Coverage: vitest smoke tests for corporate + transport dashboards; trip-route-map legend token sweep | frontend | Done (Verified via T-031) | T-005 | — | 2026-09-15 |
| T-030 | Fix bulk-import audit miscount: `skipped` from actual rows, not client `skipRows` (T-028a finding) | backend | Done (Verified via T-031) | T-028a | — | 2026-09-15 |
| T-031 | QA gate for backlog batch (T-028a/b, T-029, T-030) — suite + DoD before main | qa | Done (Verified: PASS) | T-028a/b, T-029, T-030 | — | 2026-09-15 |
| T-032 | Frontend follow-up (backlog): `BulkImportMarkersModal` confirm copy should derive split server-side semantics | frontend | Backlog | T-030 | — | — |
| T-033 | Coverage follow-up (backlog): FEAT-038 AC1 manual marker CRUD (place/edit/remove) route tests | backend | Backlog | T-028a | — | — |
| T-010 | FEAT-050 Emergency live streaming + dual camera | backend + frontend | Backlog | — | C-010/C-011 | — |
| T-011 | FEAT-051 Silent/secret emergency triggers | frontend | Backlog | — | C-010 | — |
| T-012 | FEAT-052 Offline recording + low-battery audio mode | frontend | Backlog | — | C-011 | — |
| T-013 | FEAT-053 Turn-by-turn navigation | frontend | Backlog | — | C-005/C-006 | — |
| T-014 | FEAT-054 SOS to emergency contacts | backend + frontend | Backlog | — | C-010 | — |
| T-015 | FEAT-055 Journey sharing link | backend + frontend | Backlog | — | C-005 | — |
| T-016 | FEAT-058 Advanced analytics dashboard | backend + frontend | Backlog | T-004 | — | — |
| T-017 | FEAT-059 Automated escalation rules | backend | Backlog | — | admin escalations | — |
| T-018 | FEAT-061 Rate limit & security management UI | backend + frontend | Backlog | — | — | — |
| T-019 | FEAT-065 Passenger safety reports | backend + frontend | Backlog | — | — | — |
| T-020 | FEAT-066 Custom alert rules | backend + frontend | Backlog | — | — | — |
| T-021 | FEAT-067/068 Simulation & training (dev/staging) | backend + frontend | Backlog | — | — | — |
| T-040 | DB credential cache: invalidate + one forced refresh on 28P01 (stale fallback masked rotation) | backend | Done | — | — | 2026-11-13 PASS, live :79 |
| T-041 | `GET /health/ready` DB-aware readiness (503 on DB fault); `/health` stays static liveness | backend | Done | — | H-001 | 2026-11-13 PASS, live :79 |
| T-042 | Token-exchange: stage-tagged failure logging + real `FirebaseAuthError` classification | backend | Done | — | C-001 | 2026-11-13 PASS, live :79 |
| T-043 | Post-account-closure infra: reconcile Terraform state with restored RDS; fix Upstash provider 401 blocking Apply | infra | Blocked (Upstash provider credential) | — | — | — |
| T-044 | Decide whether the ALB target group moves to `/health/ready` (currently static `/health`) | infra | Done (decision: keep `/health`, D-013) | T-041 | — | 2026-11-13 |
| T-045 | Source spec-declared assets (empty states, hero) | image-artist | Backlog | ASSETS.md | — | — |
| T-046 | `POST /v1/auth/refresh` maps every failure to 401; mobile `api_client` then wipes the session on any refresh failure, so a DB blip logs every user out permanently | backend + frontend | Done | T-042 | C-002 rev 2 | 2026-11-13 PASS, live :81 |
| T-047 | No correlation-id middleware; `requestId` in auth logs falls back to `x-request-id`/`x-amzn-trace-id` or null | backend | Backlog | T-042 | — | — |
| T-048 | Restore DynamoDB `safepass-production-realtime-state` (live status **ARCHIVED**; `GetItem` → ResourceNotFoundException) and re-point `DYNAMODB_TABLE_NAME`; enable PITR | infra | Done (Verified via targeted apply) | T-043 | — | 2026-11-13 |
| T-049 | Re-scope T-029: create `safepass-production-documents` and inject `DOCUMENTS_BUCKET_NAME` — bucket and hardening now exist; the task-def env and `DocumentsBucketAccess` IAM statement still need `module.ecs`/`module.iam` | infra | Blocked (partially landed) | T-043 | — | — |
| T-050 | Live-position writes to DynamoDB are swallowed to a `console.warn`, so live tracking degrades silently | backend | Done | — | — | 2026-11-13 PASS, live :81 |
| T-051 | Assert `GET /health/ready` after each deploy in `deploy-api.yml` | infra | Done | T-041, T-043 | — | 2026-11-13 PASS (deploy step 14) |
| T-052 | **No consumer for `/health/ready`** — no `aws_cloudwatch_metric_alarm` exists anywhere in `terraform/`, so a repeat of 2026-11-13 stays invisible. Alarm or canary → on-call; do not drain the ALB. Activation needs repo variable `ONCALL_EMAILS` and a confirmed SNS email subscription | infra | Done (code; inert until activated) | T-041 | — | 2026-11-13 PASS (code only, apply pending T-043) |
| T-053 | CI starts no database, so the live-PostgreSQL tests (highest-risk coverage for T-040) skip with a warning instead of running | infra | Done | T-040 | — | 2026-11-13 PASS (CI green, live PG) |
| T-054 | Readiness probe shares the 20-slot app pool; a timed-out probe holds a connect slot for the driver timeout and can starve recovery | backend | Done | T-041 | H-001 | 2026-11-13 PASS, live :81 |
| T-055 | Firebase classification holes: `auth/invalid-credential` (server misconfiguration) returns 401 → sign-in loop; a JWKS fetch failure maps to `auth/argument-error` → 401, which is the Google-outage case the set exists to prevent | backend | Done | T-042 | C-001 | 2026-11-13 PASS, live :81 |
| T-056 | `markTripArrived` (`trip.service.ts` ~618) still swallows failures to `console.warn` — same anti-pattern T-050 removed from the live-tracking path | backend | Backlog | T-050 | — | — |
| T-057 | `terraform-apply.yml` force-deploys tasks **outside** the new CI readiness gate, so an infra-driven deploy can bypass the check T-051 added | infra | Backlog | T-051 | — | — |
| T-058 | Alarm on token-exchange 5xx rate — operational backstop for the residual Firebase classifications that message-matching cannot attribute | infra | Backlog | T-052, T-055 | — | — |

Status: Backlog / Ready / In Progress / Blocked / Done.

## Decisions Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D-001 | Spec docs are pure product spec; implementation detail lives in DELIVERY/CONTRACTS/ASSETS | Implementation in a spec is untraceable and goes stale | 2026-09-14 |
| D-002 | Vanguard team (tech-lead + engineers) owns all build work going forward | Team flow with frozen contracts and role ownership | 2026-09-14 |
| D-003 | Doc sets renamed to final names: `docs/SafePass/`, `docs/SafePassLanding/` | Product names, not working names | 2026-09-14 |
| D-004 | `docs/` stays gitignored (private business strategy); coordination files are git-tracked | Strategy stays private; build coordination is repo-visible | 2026-09-14 |
| D-005 | Core tier/platform: Standard + Cross-platform; Landing tier/platform: Creative + Web | Decided once in branding; downstream docs restate | 2026-09-14 |
| D-006 | CONTRACTS.md frozen from implemented code, not spec-only | The real API surface is the contract | 2026-09-14 |
| D-007 | First mission: reconcile code to spec, then roadmap Phase 6 backlog | Code predates the regenerated spec | 2026-09-14 |
| D-008 | `AGENTS.md` is a general agent file referencing ASSETS/CONTRACTS/DELIVERY, not oriented to a single-agent build flow | Agents read coordination files, not implementation-specific conventions | 2026-09-14 |
| D-012 | Production RDS restored from the 2026-11-05 final snapshot after the AWS account closure deleted the instance; restored single-AZ | That snapshot is the only restore point available — data written after 2026-11-05 19:11Z is unrecoverable. Single-AZ controls cost until the Multi-AZ posture is revisited | 2026-11-13 |
| D-013 | `/health` remains a static liveness probe; the DB-aware check is a separate `/health/ready` and is not wired to the ALB until explicitly decided | Pointing the target group at a DB probe would drain every task during a database fault, converting a partial failure into a total API outage on an emergency-response platform | 2026-11-13 |
| D-014 | RDS master-password management is pinned: `lifecycle.ignore_changes = [manage_master_user_password]` plus a committed `.terraform.lock.hcl`, and `rds_master_user_secret_arn` is supplied explicitly | A snapshot restore drops the instance's managed-secret association, so any apply that acts on that drift would mint a new secret and rotate the password while ECS still points at the old one. Re-enabling AWS-managed rotation must be one coordinated change with `DB_SECRET_ARN` | 2026-11-13 |
| D-015 | Blocked modules may be recovered with a targeted apply scoped to modules that cannot reach the blocked provider (`-target=module.dynamodb -target=module.s3_evidence`) | The Upstash credential failure makes the full graph unappliable; a reduced graph never reads the RDS/ECS/secrets resources, so the master-password invariants cannot be reached. Reaching `module.secrets` or `module.ecs` was verified to drag in the failing provider, so the target set must stay exactly those two modules | 2026-11-13 |
| D-016 | Readiness alerting is a standalone Route53 HTTPS health check (string-match on `"ok":true`) → CloudWatch alarm → SNS email, deliberately not a Synthetics canary and not the ALB target group. The monitoring module is pinned to a `us-east-1` provider alias | Route53 publishes health-check metrics only in us-east-1, so an alarm on the default regional provider would watch a metric that never arrives. Cost is ≈$1.60–2.85/mo against ≈$10.37/mo for a 5-minute canary, and a single readiness assertion needs no scripted multi-step canary. The target group stays on `/health` for the reason in D-013 | 2026-11-13 |

## Definition of Done

Enforced by QA at every phase gate:
- Every feature acceptance criterion has a passing test (unit, widget, or integration).
- Every screen state defined in `screens/` is implemented (loading, empty, error, loaded, offline, validation).
- Build, lint, and test are green for all affected workspaces.
- No hardcoded colors or spacing outside theme tokens.
- No prototype placeholders, stubs, or mock-only flows in production surfaces.
- Requests and responses conform to the Frozen contracts in `CONTRACTS.md`.
- Commits use Conventional Commits with `Implements:` footers; PRs are one feature slice.

## Key Commands

```bash
pnpm install                    # install all workspace deps
docker compose up -d            # PostgreSQL + Redis
cp .env.example .env            # fill values
pnpm dev                        # all apps (Turborepo)
pnpm --filter @safepass/api dev # backend only (:3000)
pnpm --filter @safepass/admin-dashboard dev  # admin dashboard (:3001)
cd apps/mobile && flutter run   # mobile app
pnpm test                       # backend + dashboard tests
pnpm lint                       # TS lint
dart analyze                    # Flutter static analysis
pnpm --filter @safepass/api db:generate  # new Drizzle migration
pnpm --filter @safepass/api db:migrate   # apply migrations
pnpm build                      # build all apps
```