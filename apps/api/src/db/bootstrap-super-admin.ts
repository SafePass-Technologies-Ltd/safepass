// Promote an existing user to super_admin by email.
// The user must have already signed up via the app — this script only
// promotes, it does not create accounts.
// Usage: tsx src/db/bootstrap-super-admin.ts <email>
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { env } from '../env';
import { users } from './schema';

const email = process.argv[2];

if (!email) {
  console.error('Usage: tsx src/db/bootstrap-super-admin.ts <email>');
  process.exit(1);
}

const run = async () => {
  const connection = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(connection);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length === 0) {
    console.error(`No user found with email '${email}'. The user must sign up via the app first.`);
    await connection.end();
    process.exit(1);
  }

  const [updated] = await db
    .update(users)
    .set({ role: 'super_admin', updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning();

  console.log(`Promoted ${updated.email} to role 'super_admin'`);
  await connection.end();
  process.exit(0);
};

run().catch((err) => {
  console.error('Failed to bootstrap super admin:', err);
  process.exit(1);
});
