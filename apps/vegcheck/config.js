// Supabase config (fill these in)
// IMPORTANT:
// - Use the ANON key here (safe for browser).
// - Do NOT put service_role key in any frontend file.
window.VEGCHECK_SUPABASE = {
  url: "",
  anonKey: "",
  // If true, the app will require auth (anonymous by default) and use RLS by user_id.
  // If false, it will still use Supabase but assumes your tables are publicly writable (NOT recommended).
  useAuth: true
};
