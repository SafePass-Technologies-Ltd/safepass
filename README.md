# SafePass

Road safety, trip monitoring, and incident intelligence platform.

## Apps

| App | Path | Description |
|-----|------|-------------|
| API | `apps/api` | Hono + Drizzle + PostgreSQL backend |
| Mobile | `apps/mobile` | Flutter Android/iOS app |
| Admin Dashboard | `apps/admin-dashboard` | Next.js admin panel |
| Corporate Dashboard | `apps/corporate-dashboard` | Next.js org dashboard |

---

## Database

### Run migrations

```bash
cd apps/api
pnpm tsx src/db/migrate.ts
```


## Role Management

Users must already have an account before running these scripts. Both scripts read `DATABASE_URL` from the root `.env` file.

### Promote to super_admin (recommended)

```bash
cd apps/api
npx tsx src/db/bootstrap-super-admin.ts user@example.com
```

Errors early with a clear message if the user is not found.

### Promote to any role

```bash
cd apps/api
npx tsx src/db/promote-admin.ts user@example.com <role>
```

Valid roles: `admin`, `monitoring_officer`, `super_admin`
