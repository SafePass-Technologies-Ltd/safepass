// Promote a user to an admin role by email.
// Usage: tsx src/db/promote-admin.ts <email> [admin|monitoring_officer|super_admin]
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { env } from '../env';
import { users } from './schema';

const email = process.argv[2];
const role = process.argv[3] ?? 'admin';

if (!email) {
  console.error('Usage: tsx src/db/promote-admin.ts <email> [admin|monitoring_officer|super_admin]');
  process.exit(1);
}

const validRoles = ['admin', 'monitoring_officer', 'super_admin'];
if (!validRoles.includes(role)) {
  console.error(`Invalid role '${role}'. Must be one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

const run = async () => {
  const connection = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(connection);

  const [updated] = await db
    .update(users)
    .set({ role: role as typeof users.$inferSelect['role'] })
    .where(eq(users.email, email))
    .returning();

  if (!updated) {
    console.error(`No user found with email '${email}'`);
    process.exit(1);
  }

  console.log(`Promoted ${updated.email} to role '${updated.role}'`);
  await connection.end();
  process.exit(0);
};

run().catch((err) => {
  console.error('Failed to promote user:', err);
  process.exit(1);
});
