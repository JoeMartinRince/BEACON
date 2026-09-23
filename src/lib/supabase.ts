import { createClient } from "@supabase/supabase-js";

// Safe retrieval across client Vite (import.meta.env) and server/Node (process.env)
const supabaseUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_SUPABASE_URL"]) ||
  (typeof process !== "undefined" && (process.env?.["VITE_SUPABASE_URL"] || process.env?.["SUPABASE_URL"])) ||
  "";

const supabaseAnonKey =
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_SUPABASE_ANON_KEY"]) ||
  (typeof process !== "undefined" && (process.env?.["VITE_SUPABASE_ANON_KEY"] || process.env?.["SUPABASE_ANON_KEY"])) ||
  "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://your-project.supabase.co" &&
    !supabaseUrl.includes("placeholder"),
);

// Fallback dummy client if credentials aren't set yet, avoiding runtime breaks
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder-project.supabase.co",
  isSupabaseConfigured ? supabaseAnonKey : "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
