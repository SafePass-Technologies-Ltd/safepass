import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema/index';

const connectionString = env.DATABASE_URL;

// For query purposes
const queryClient = postgres(connectionString, { max: 20 });
export const db = drizzle(queryClient, { schema });

// Simple export: use this to create a new connection for transactions
export const createQueryClient = () => postgres(connectionString, { max: 1 });
