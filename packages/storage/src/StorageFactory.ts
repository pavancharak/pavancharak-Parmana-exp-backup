import { parseStorageProvider } from "@parmana/shared";

import { MemoryStorageProvider } from "./memory/MemoryStorageProvider.js";

import { SupabaseStorageProvider } from "./supabase/SupabaseStorageProvider.js";

import type { StorageProvider } from "./StorageProvider.js";

import type { StorageConfiguration } from "./StorageConfiguration.js";

function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY),
  );
}

/**
 * Creates Storage Providers.
 */
export class StorageFactory {
  /**
   * Creates a provider from configuration.
   */
  static create(configuration: StorageConfiguration): StorageProvider {
    switch (configuration.provider) {
      case "memory":
        return new MemoryStorageProvider();

      case "supabase":
        // G-15: name both knobs (PARMANA_STORAGE and the missing
        // SUPABASE_* var) before SupabaseClientFactory.create() would
        // otherwise fail with supabase-js's generic "supabaseUrl is
        // required." — or, worse, construct a client that only fails
        // on first use.
        if (!hasSupabaseConfig()) {
          throw new Error(
            "PARMANA_STORAGE=supabase requires SUPABASE_URL and a " +
              "Supabase key (SUPABASE_SERVICE_ROLE_KEY or " +
              "SUPABASE_ANON_KEY) to be configured. Refusing to " +
              "construct a Supabase storage provider with no credentials.",
          );
        }

        return new SupabaseStorageProvider();

      case "postgres":
        throw new Error("Postgres storage provider not implemented.");

      case "sqlite":
        throw new Error("SQLite storage provider not implemented.");
    }
  }

  /**
   * Creates a provider from environment.
   *
   * Test wiring (NODE_ENV=test): MemoryStorageProvider, unconditionally,
   * regardless of PARMANA_STORAGE — mirrors the production/test split
   * createNonceStore.ts and createCallerAuditSink.ts already established
   * (G-13). Closes G-15 (docs/VERIFICATION-GAPS.md): this method used to
   * construct whatever PARMANA_STORAGE named — a live Supabase client
   * included — purely as an import-time side effect
   * (packages/api/src/repositories.ts), crashing test collection with
   * supabase-js's generic "supabaseUrl is required." the moment
   * SUPABASE_* was unset, regardless of test intent.
   */
  static createFromEnvironment(): StorageProvider {
    if (process.env.NODE_ENV === "test") {
      return new MemoryStorageProvider();
    }

    return this.create({
      provider: parseStorageProvider(process.env.PARMANA_STORAGE),
    });
  }
}
