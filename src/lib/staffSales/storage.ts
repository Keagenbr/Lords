function db(): SupabaseClient {
  if (client) return client;

  // TEMPORARY DEBUG - Hardcode your actual service role key here
  const url = "https://your-project-id.supabase.co"; // Replace with your URL
  const key = "eyJhbGciOiJIUzI1NiIs..."; // Replace with your full service role key

  console.log("Using hardcoded credentials");
  console.log("URL:", url);
  console.log("Key length:", key?.length);

  if (!url || !key) {
    throw new StorageError("Missing Supabase credentials");
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
