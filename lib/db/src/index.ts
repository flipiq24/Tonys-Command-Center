import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// SUPABASE_DATABASE_URL overrides the Helium default when set.
// To roll back to Helium: delete the SUPABASE_DATABASE_URL env var and restart.
let pool: pg.Pool;

if (process.env.SUPABASE_DATABASE_URL) {
  // Parse manually so URL-encoded chars in password (e.g. %40 → @) are decoded correctly.
  // Node's URL parser returns the raw encoded value; pg's connection-string does the same.
  const raw = process.env.SUPABASE_DATABASE_URL;
  const parsed = new URL(raw);
  pool = new Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  });
  console.log("[DB] Connected to: Supabase");
} else if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log("[DB] Connected to: Helium (Replit)");
} else {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export { pool };
export const db = drizzle(pool, { schema });

export * from "./schema";
