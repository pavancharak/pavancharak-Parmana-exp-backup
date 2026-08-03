import { Pool } from "pg";

/**
 * Lazy, process-wide singleton Postgres connection pool. Mirrors
 * SupabaseClientFactory.ts's own singleton pattern, but connects
 * directly to Postgres (via `pg`) instead of going through
 * supabase-js's REST-based client.
 *
 * Introduced as the stopgap direct-Postgres path for
 * SupabaseCallerAuditSink / SupabaseRazorpayWebhookAuditSink (see
 * those files for why) — not itself tied to that workaround, so any
 * other call site needing a raw Postgres connection to the same
 * database should reuse this factory rather than opening its own
 * pool.
 *
 * SSL: relies on DATABASE_URL's own `sslmode` query parameter (`pg`
 * parses it via `pg-connection-string`); Supabase connection strings
 * already include `sslmode=require`.
 */
export class PostgresPoolFactory {
  private static pool: Pool | undefined;

  static create(): Pool {
    if (this.pool) {
      return this.pool;
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }

    this.pool = new Pool({ connectionString });
    return this.pool;
  }
}
