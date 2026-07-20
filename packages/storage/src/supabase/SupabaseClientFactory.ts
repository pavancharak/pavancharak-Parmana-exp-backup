import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseClientFactory {
  private static client: SupabaseClient | undefined;

  static create(): SupabaseClient {
    if (this.client) {
      return this.client;
    }

    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url) {
      throw new Error("SUPABASE_URL environment variable is missing.");
    }

    const key = serviceRoleKey ?? anonKey;

    if (!key) {
      throw new Error(
        "Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is defined."
      );
    }

    this.client = createClient(url, key);
    return this.client;
  }
}