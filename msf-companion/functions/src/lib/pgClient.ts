import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new pg.Pool({
      connectionString,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
