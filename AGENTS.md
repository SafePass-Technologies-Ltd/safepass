# SafePass — AGENTS.md

> Quick-reference for AI agents working on SafePass. Read this file first, then the coordination files and the spec it points to.

---

## Source of Truth

- `docs/SafePass/` and `docs/SafePassLanding/` are the **product spec** (requirements, features, flows, screens, data model, branding, monetization, risks). The spec is pure product content: it never holds implementation detail.
- `docs/` is a private vault, gitignored by design. Treat it as read-only; spec corrections go through the product-shaper role.
- `DELIVERY.md` is the **coordination file**: team, file ownership, stack, conventions, task board, decisions, definition of done.
- `CONTRACTS.md` is the **frozen API surface** the frontend and backend build against.
- `ASSETS.md` is the **asset ledger**: what exists, what is pending, and the exact generation prompts.
- All three coordination files are written only by the Tech Lead; every other agent reads them.

---

## Team

| Role | Owns |
|---|---|
| tech-lead | `DELIVERY.md`, `CONTRACTS.md`, `ASSETS.md`, integration glue, `main` merges |
| product-shaper | `docs/` |
| infra-engineer | Root config, CI/CD, `terraform/`, `AGENTS.md` |
| backend-engineer | `apps/api/src`, `packages/shared/src` |
| frontend-engineer | `apps/mobile/lib`, dashboard apps, `apps/landing/src` |
| qa-engineer | Test suites, integration tests, definition-of-done enforcement |
| image-artist | Asset files per `ASSETS.md` |

---

## Tech Stack

- **Monorepo:** Turborepo + pnpm (workspaces)
- **Backend:** Node.js + Hono + TypeScript (strict), Drizzle ORM, PostgreSQL + Redis, DynamoDB for live state
- **Mobile:** Flutter (iOS + Android), flutter_bloc, go_router, dio
- **Dashboards + landing:** Next.js (App Router), Tailwind CSS, shadcn/ui
- **Auth:** Firebase Auth (social + phone) with token exchange; JWT session tokens
- **Maps:** Google Maps Platform · **Payments:** Paystack / Flutterwave · **Push:** FCM · **Email:** Resend
- **Storage:** AWS S3 · **Infra:** AWS (ECS, RDS, DynamoDB) + Vercel (web apps) + Terraform

Pinned versions live in `DELIVERY.md` → Tech Stack.

---

## Behavior Rules

1. Never commit secrets — `.env` is gitignored; `.env.example` has placeholders only.
2. Run tests and lint before committing (`pnpm test`, `dart analyze`, `flutter test`).
3. Conventional Commits with an `Implements: <FEAT-###>` footer; one feature slice per PR.
4. Never write to `docs/` — spec corrections route to product-shaper.
5. Style only through theme tokens; no hardcoded colors or spacing in components.
6. Pin exact dependency versions.
7. Additive Drizzle migrations only; never edit applied migrations.
8. Emergency, panic, and security-critical paths carry an inline safety-rationale comment.
9. Humanize any user-facing copy you author, deferring to the branding tone in the spec.
10. Any API change updates `packages/shared` schemas and `CONTRACTS.md` in the same change.

---

## Key Commands

```bash
pnpm install                          # install all workspace deps
docker compose up -d                  # start PostgreSQL + Redis
cp .env.example .env                  # create env file
pnpm dev                              # start all apps (Turborepo)
pnpm --filter @safepass/api dev       # backend only (:3000)
cd apps/mobile && flutter run         # mobile app
pnpm test                             # backend + dashboard tests
pnpm lint                             # TypeScript lint
dart analyze                          # Flutter static analysis
pnpm --filter @safepass/api db:generate  # new Drizzle migration
pnpm --filter @safepass/api db:migrate   # apply migrations
pnpm build                            # build all apps
```

For anything not covered here, read `DELIVERY.md`, `CONTRACTS.md`, and `ASSETS.md` before acting.