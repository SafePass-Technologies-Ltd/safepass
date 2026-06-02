// Run this script to apply migrations: tsx src/db/migrate.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '../env';

const runMigrations = async () => {
  const connection = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(connection);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations completed successfully.');

  await connection.end();
  process.exit(0);
};

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
