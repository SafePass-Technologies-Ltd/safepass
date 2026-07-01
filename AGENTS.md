# SafePass — AGENTS.md

> Quick-reference for AI coding agents working on SafePass. See `docs/SafePass/` for product requirements, features, and design.

---

## Source of Truth

- `docs/SafePass/` is the **primary source of truth** for product requirements, features, user flows, data models, screens, and monetization.
- `docs/SafePass/schema.md` defines all data entities in JSON Schema 2020-12.
- `docs/SafePass/features.md` defines all features with IDs and priorities.
- This file (`AGENTS.md`) is a **complementary quick-reference** for development conventions only.

---

## Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Monorepo** | Turborepo | 2.9.16 | Build orchestration |
| **Package Manager** | pnpm | 10.32 | Workspace-based monorepo |
| **Backend** | Node.js + Hono | 4.12 | REST + WebSocket API |
| **Backend Language** | TypeScript | 6.0 | Strict mode |
| **Backend ORM** | Drizzle ORM | 0.45.2 | PostgreSQL migrations + queries |
| **Mobile App** | Flutter | 3.44 | iOS + Android |
| **Mobile State** | flutter_bloc | 9.1 | BLoC pattern: Cubit + Bloc |
| **Mobile Routing** | go_router | 17.2 | Declarative, typed routes |
| **Mobile Models** | equatable | 2.0 | Value equality for Bloc states/events |
| **Mobile HTTP** | dio | 5.9 | HTTP client with interceptors |
| **Mobile Auth SDKs** | google_sign_in / sign_in_with_apple / firebase_auth | 7.2 / 8.1 / latest | Native social auth + Firebase Auth (social + phone) |
| **Admin Dashboard** | Next.js (App Router) | 16.2 | SSR + Edge |
| **Dashboard Auth** | firebase (Firebase Auth Web SDK) | latest | Client-side social + phone sign-in |
| **Backend Auth** | firebase-admin | latest | Firebase ID token verification |
| **Dashboard UI** | Tailwind CSS + shadcn/ui | 4.3 / latest | Utility-first CSS |
| **Database** | PostgreSQL | 16 | AWS RDS in production |
| **Cache** | Redis | 7 | Upstash in production |
| **Validation** | Zod | 3.25 | Runtime + type inference |
| **JWT** | jose | 6.2 | Lightweight JWT signing/verification |
| **Maps** | Google Maps Platform | — | GCP |
| **Payments** | Paystack / Flutterwave | — | Nigerian gateways |
| **Push** | Firebase Cloud Messaging | — | Cross-platform push |
| **Storage** | AWS S3 | — | Evidence + documents |

---

## Auth Architecture

SafePass uses a **single unified auth mechanism** for all clients:

### All Clients (Mobile + Web Dashboards) — Firebase Auth + Token Exchange

1. User signs in via social provider (Google, Facebook, Apple) or phone number (SMS OTP) through Firebase Auth
   - **Mobile**: Native SDK (`google_sign_in`, `sign_in_with_apple`) obtains platform credential → `firebase_auth` wraps it → Firebase ID token. Phone auth: Firebase handles OTP send/verify → Firebase ID token with `phone_number` claim.
   - **Web**: Firebase Auth Web SDK handles OAuth popup/redirect (social) → Firebase ID token. Phone auth: Firebase Web SDK handles phone number input + OTP verification → Firebase ID token.
2. Client sends Firebase ID token to `POST /v1/auth/token-exchange` on the Hono backend
3. Backend verifies the token with **Firebase Admin SDK** (single verification path for all providers: social and phone)
4. For phone auth tokens, backend extracts the `phone_number` claim from the verified token and auto-populates the user's phone field
5. Backend creates or finds the user in PostgreSQL
   - **Phone auth users**: phone is pre-populated from `phone_number` claim — no additional onboarding step needed
   - **Social auth users**: phone is set to `NULL` initially — user MUST provide a phone number during onboarding
6. Returns a **JWT access token** (15min) + **refresh token** (7 days)
7. Client stores tokens and attaches `Authorization: Bearer <access_token>` to all API calls
8. Refresh flow: `POST /v1/auth/refresh` with the refresh token to get a new pair

> **Key simplification**: No more dual auth mechanism (previously Auth.js for web + provider-specific token verification for mobile). Firebase Auth unifies the sign-in experience and Firebase Admin SDK provides a single token verification path regardless of which provider (social or phone) the user chose. Phone is required for ALL users — phone auth users get it automatically from the verified token; social auth users must provide it during onboarding.

---

## Project Structure

```
safepass/
├── apps/
│   ├── api/                    # Hono backend (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers (per domain)
│   │   │   ├── services/       # Business logic (auth, user, trip, etc.)
│   │   │   ├── middleware/      # Auth, rate limiting, error handling
│   │   │   ├── db/             # DB client, Drizzle schema, queries
│   │   │   ├── env.ts          # Environment variable validation (Zod)
│   │   │   └── index.ts        # App entry point — Hono server
│   │   ├── drizzle/            # Drizzle ORM migration files (auto-generated)
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mobile/                 # Flutter mobile app
│   │   ├── lib/
│   │   │   ├── app/            # App-level config (theme, router, providers)
│   │   │   ├── features/       # Feature-first modules (auth, trips, wallet, etc.)
│   │   │   ├── core/           # Shared utils, API client (Dio), models, constants
│   │   │   └── main.dart       # Entry point
│   │   ├── test/
│   │   ├── pubspec.yaml
│   │   └── analysis_options.yaml
│   └── admin-dashboard/        # Next.js admin web app
│       ├── src/
│       │   ├── app/            # App Router pages + layouts + API routes
│       │   ├── components/     # React components (shadcn/ui based)
│       │   ├── lib/            # API client, auth helpers, utils
│       │   └── hooks/          # Custom React hooks
│       ├── public/
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── packages/
│   └── shared/                 # Shared TypeScript types + Zod schemas
│       ├── src/
│       │   ├── schemas/        # Zod schemas mirroring schema.md entities
│       │   ├── types/          # Re-exported inferred TypeScript types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml          # PostgreSQL 16 + Redis 7 for local dev
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml
├── package.json                # Root workspace config
├── .env.example                # Template for environment variables
├── .gitignore
└── AGENTS.md                   # This file
```

> **Future apps**: `apps/corporate-dashboard/` and `apps/transport-dashboard/` will be added as separate Next.js apps in Week 2 (per roadmap). Each follows the same structure as `admin-dashboard/`.

### Naming Conventions

| Context | Convention | Example |
|---|---|---|
| **Files** | kebab-case | `user-service.ts`, `trip-registration-form.tsx` |
| **TypeScript types** | PascalCase | `User`, `TripStatus`, `EmergencyContact` |
| **TypeScript functions** | camelCase | `getCurrentUser()`, `exchangeSocialToken()` |
| **Dart classes** | PascalCase | `AuthService`, `TripRegistrationScreen` |
| **Dart files** | snake_case | `auth_service.dart`, `trip_registration_screen.dart` |
| **Dart variables** | camelCase | `userId`, `isLoading`, `emergencyContacts` |
| **React components** | PascalCase filename = component name | `TripMap.tsx` exports `TripMap` |
| **API routes** | `/v1/<plural-noun>` | `/v1/users`, `/v1/trips`, `/v1/auth/token-exchange` |
| **Database tables** | snake_case | `users`, `user_vehicles`, `emergency_events` |
| **DB columns** | camelCase (Drizzle default) | `fullName`, `authProviderId`, `createdAt` |
| **Git branches** | `feature/<id>-<desc>` | `feature/m-01-auth-screens`, `fix/m-02-phone-validation` |

---

## Coding Style & Conventions

### TypeScript (Backend + Dashboard + Shared)

- **Strict mode**: `strict: true` in every tsconfig — no exceptions
- **No `any`**: Use `unknown` with type guards; if a type truly can't be narrowed, document why
- **Async/await**: Always prefer over raw `.then()` chains
- **Error handling**:
  - Backend: Hono's `onError` middleware catches all — returns structured `{ error: { code, message } }`
  - Never expose stack traces in production (`NODE_ENV=production`)
  - Use `HTTPException` for known HTTP errors (400, 401, 403, 404, 409, 429)
- **Validation**: All API inputs validated with Zod schemas from `@safepass/shared` BEFORE any business logic
- **Environment**: All config via environment variables, validated with Zod at startup (`env.ts`); never hardcode secrets, URLs, or API keys
- **Logging**: Structured JSON via `pino` (Hono logger middleware); use child loggers with context
- **Testing**: Vitest; co-locate `*.test.ts` files next to the source; aim for service-level integration tests
- **Imports**: Use `import type` for type-only imports to avoid runtime overhead

### Flutter (Mobile)

- **State management**: BLoC pattern via `flutter_bloc` — one Cubit/Bloc per logical unit; prefer `Cubit` for simple state, `Bloc` for complex event-driven state
- **Routing**: go_router with typed `GoRoute` definitions in a single `app_router.dart`; never use `Navigator.push` directly
- **API client**: Dio instance configured in `core/api_client.dart` with base URL, interceptors for auth token injection + refresh on 401
- **Serialization**: `json_serializable` code generation — every model has `fromJson`/`toJson`
- **Widgets**: Prefer `StatelessWidget`; use `BlocBuilder`/`BlocConsumer`/`BlocListener` for reactive UI; only use `StatefulWidget` when local ephemeral state is truly needed
- **Theme**: `AppTheme` class in `app/theme.dart` — defines all colours (from branding.md palette), text styles, spacing; never hardcode `Color(0x...)` or `EdgeInsets` in widgets
- **Error states**: Every async screen must handle loading, error (with retry), and empty states
- **Testing**: `flutter_test` for widgets, `bloc_test` for BLoC/Cubit logic, unit tests in `test/`, integration tests in `integration_test/`

### React / Next.js (Admin Dashboard)

- **Components**: Functional components with hooks; no class components
- **Server/Client split**: Default to Server Components; add `'use client'` only when using hooks, event handlers, or browser APIs
- **Data fetching**: Server Components fetch data directly (no `useEffect` for initial load); SWR for client-side mutations, polling, and refetch
- **Auth**: Firebase Auth Web SDK handles client-side sign-in. API calls use JWT tokens from token-exchange. Protected routes check for valid token client-side; backend enforces auth at API level.
- **Styling**: Tailwind CSS utility classes only; use shadcn/ui components for consistent design; no custom `.css` files (except Tailwind directives in `globals.css`)
- **API calls**: Use a shared `api-client.ts` utility that attaches the session JWT automatically
- **Testing**: Vitest + React Testing Library for component tests

---

## Behavior Rules

1. **Never commit secrets** — `.env` is gitignored; `.env.example` has placeholder values only
2. **Lint before push**: `pnpm lint` (TypeScript), `dart analyze` (Flutter)
3. **Test before push**: `pnpm test` (backend + dashboard), `flutter test` (mobile — unit + widget + bloc)
4. **Feature branches**: `feature/<feature-id>-<short-desc>` — lowercase, hyphen-separated
5. **Small PRs**: One feature slice per PR; avoid mega-PRs spanning multiple features
6. **API contract**: Any API change MUST update `packages/shared` schemas — backend + frontend stay synced
7. **Exact dependency versions**: Pin exact versions in `package.json` (no `^` or `~`); document why if a range is needed
8. **Additive migrations**: Always create a new Drizzle migration file (`drizzle/`); never edit an existing migration
9. **Emergency code paths**: Every panic button, escalation, or security-critical path must have an inline comment explaining the safety rationale
10. **Platform agnostic**: Avoid `dart:io` platform checks in Flutter; use Flutter's cross-platform APIs (`Platform.isAndroid` is acceptable when the API difference is real)
11. **Docker first**: Local development always uses `docker compose up -d` for PostgreSQL + Redis; no manual DB installs

---

## Infrastructure & CI/CD

### Terraform Structure

```
terraform/
├── bootstrap/                  # One-time, LOCAL-state config that creates the S3 state bucket + DynamoDB lock table. Apply manually, once, before anything else.
├── modules/                    # Reusable modules — no environment-specific values
│   ├── networking/             # Dedicated VPC, 2 AZs, public+private subnets, single NAT
│   ├── ecs/                    # Fargate cluster, ALB, /health target group, rolling-deploy service
│   ├── rds/                    # PostgreSQL 16 Multi-AZ
│   ├── dynamodb/               # Real-time trip/session state table (60s GPS TTL)
│   ├── s3/                     # Evidence bucket — Object Lock (GOVERNANCE mode), KMS encryption, Glacier lifecycle
│   ├── ecr/                    # API container image registry
│   ├── cloudfront/             # CDN in front of the ALB
│   ├── iam-ecs/                 # ECS task execution + task roles only — GitHub Actions OIDC is pre-existing, not managed here
│   └── secrets/                # Secrets Manager containers (placeholder values only — never real secrets in Terraform)
└── environments/
    └── production/              # Wires all modules together; only environment today. A `staging/` folder can be added later by copying this directory, changing `environment = "staging"`, and pointing backend.tf's state `key` at `staging/terraform.tfstate` (same state bucket/lock table — no re-bootstrap needed).
```

Terraform CLI `>= 1.15.7`, `hashicorp/aws` provider `~> 6.52` — pinned in each config's `required_version`/`required_providers` block.

### Bootstrapping the State Backend (one-time, manual)

The S3 bucket + DynamoDB table that hold Terraform's own remote state cannot be created by the Terraform config that uses them (chicken-and-egg). Run once, manually, with AWS admin credentials:

```bash
cd terraform/bootstrap
terraform init
terraform apply -var="aws_region=eu-west-2" -var="project=safepass"
# note the state_bucket_name / lock_table_name outputs — they must match
# terraform/environments/production/backend.tf
```

The very first `terraform apply` of `terraform/environments/production` (which creates the GitHub OIDC role that CI itself needs) must also be run manually by a human with AWS credentials — every apply after that goes through GitHub Actions.

### Plan/Apply Gating

- `terraform-plan.yml`: runs on every PR touching `terraform/environments/production/**` or `terraform/modules/**`. Runs `fmt -check`, `validate`, `plan`, posts the plan as a PR comment. Never applies.
- `terraform-apply.yml`: runs on push to `main` for the same paths. Targets the GitHub Environment named `production`. **A repo admin must manually create this Environment in GitHub Settings > Environments and add required reviewers** — this cannot be expressed in YAML. Until that's configured, the environment reference is a no-op pass-through.

### OIDC Auth Model

GitHub Actions never uses static AWS access keys. Each workflow calls `aws-actions/configure-aws-credentials` with `role-to-assume: ${{ vars.AWS_ROLE_ARN }}`, which assumes a **pre-existing** IAM role via a **pre-existing** OIDC identity provider — both already configured in AWS outside this repo's Terraform. This Terraform config deliberately does NOT create or manage the OIDC provider or the CI deploy role: AWS allows only one `aws_iam_openid_connect_provider` per URL per account, so a second one for `https://token.actions.githubusercontent.com` would conflict with the one that already exists. The role's ARN is supplied to workflows purely via the `AWS_ROLE_ARN` GitHub repo variable.

Terraform only manages the ECS task execution role and ECS task role (via `terraform/modules/iam-ecs`) — these are assumed by the ECS service itself at runtime, unrelated to OIDC/CI auth.

Minimum permissions the existing external CI role needs (for reference/audit by whoever owns that role — not enforced by this repo):
- Terraform state access (all `terraform plan`/`apply` workflows): `s3:GetObject`, `s3:PutObject`, `s3:ListBucket` on the TF state bucket; `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem` on the TF lock table.
- Infra-provisioning (`terraform-apply.yml`'s `terraform apply` path): `ecs:*`, `ecr:*`, `rds:*`, `dynamodb:*`, `s3:*`, `cloudfront:*`, `secretsmanager:*`, `elasticloadbalancing:*`, ec2 networking actions (vpc/subnet/route-table/internet-gateway/nat-gateway/security-group/describe*), and `iam:PassRole` for the two roles this module creates (`ecs_task_execution` and `ecs_task`).
- Deploy-only (the narrower path used by `deploy-api.yml`): ECR push actions (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:BatchGetImage`) plus `ecs:RegisterTaskDefinition` and `ecs:UpdateService` (with `iam:PassRole` scoped to `iam:PassedToService = ecs-tasks.amazonaws.com`).

### API Deployment

`deploy-api.yml` runs after CI passes on `main` for changes under `apps/api/` or `packages/shared/`: builds `apps/api/Dockerfile` (multi-stage, pnpm workspace-aware — build context is the repo root), pushes to ECR, renders a new ECS task definition revision with the new image, and deploys with `force-new-deployment`. The ECS service's rolling-deploy settings (`minimum_healthy_percent=100`, `maximum_percent=200`) guarantee new tasks are healthy before old ones drain — required for the safety-critical WebSocket/panic-alert path (see `docs/SafePass/risk_log.md` R-001).

### Dashboards Deploy via Vercel, Not This Pipeline

`apps/admin-dashboard`, `apps/corporate-dashboard`, `apps/transport-dashboard` deploy via **Vercel's native Git integration** (preview deploys per PR, production deploy on merge to `main`) — configured entirely in the Vercel project settings, outside this repo's CI/CD code. `ci.yml` only runs lint/test/build for these apps as required PR checks; no workflow here deploys them, and there is no Vercel Terraform provider or CLI deploy step anywhere in this repo.

---

## Document Map

| Document | Use When |
|---|---|
| `docs/SafePass/README.md` | Understanding product concept, target audience, tech stack, MVP scope |
| `docs/SafePass/features.md` | Implementing any feature; reference feature IDs (M-xx, A-xx, C-xx, T-xx) |
| `docs/SafePass/architecture.md` | Changing data models, API routes, system design, deployment config, auth flow |
| `docs/SafePass/schema.md` | Defining/modifying any database entity; this is the canonical data model (JSON Schema) |
| `docs/SafePass/roadmap.md` | Prioritizing work; reference the Gantt chart and week-by-week deliverables |
| `docs/SafePass/screens.md` | Building UI screens; reference exact elements, states, and interactions per screen |
| `docs/SafePass/user_flow.md` | Implementing user journeys; sequence diagrams define exact request/response behaviour |
| `docs/SafePass/branding.md` | Styling decisions: colour hex codes, typography, messaging voice and tone |
| `docs/SafePass/user_personas.md` | Understanding who each feature is built for and their specific needs |
| `docs/SafePass/monetization.md` | Payment flows, pricing logic (₦2,000/trip), wallet auto-deduction, corporate plans |
| `docs/SafePass/risk_log.md` | Security decisions, reliability requirements, known risks with mitigations |

---

## Key Commands

```bash
# === First-Time Setup ===
pnpm install                          # Install all workspace dependencies
docker compose up -d                  # Start PostgreSQL + Redis
cp .env.example .env                  # Create env file (fill values for OAuth, payments, etc.)
pnpm --filter @safepass/api db:generate  # Generate Drizzle migration from schema.ts
pnpm --filter @safepass/api db:migrate   # Apply migration to PostgreSQL

# === Development ===
pnpm dev                              # Start all apps (Turborepo orchestrates)
pnpm --filter @safepass/api dev       # Backend only (Hono on :3000)
pnpm --filter @safepass/admin-dashboard dev  # Admin dashboard only (Next.js on :3001)
cd apps/mobile && flutter run         # Mobile app (requires emulator/device)

# === Testing ===
pnpm test                             # Run all tests (backend + dashboard)
pnpm --filter @safepass/api test      # Backend tests only
pnpm --filter @safepass/admin-dashboard test  # Dashboard tests only
flutter test                          # Mobile app unit + widget tests
flutter test --tags bloc              # Mobile app Bloc tests only

# === Code Quality ===
pnpm lint                             # TypeScript linting (all workspaces)
dart analyze                          # Flutter static analysis
pnpm format                           # Prettier format all files

# === Database ===
pnpm --filter @safepass/api db:generate  # Generate new migration after schema changes
pnpm --filter @safepass/api db:migrate   # Apply pending migrations
pnpm --filter @safepass/api db:studio    # Open Drizzle Studio (browser GUI) on :4983

# === Docker ===
docker compose up -d                  # Start PostgreSQL + Redis
docker compose down                   # Stop services
docker compose down -v                # Stop and delete volumes (reset all data)

# === Production ===
pnpm build                            # Build all apps
docker compose down                   # Stop local dev services
```
