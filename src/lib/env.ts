function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  storageBucket: () => process.env.SUPABASE_STORAGE_BUCKET || 'companybrain',
  geminiApiKey: () => required('GEMINI_API_KEY'),
  geminiTextModel: () => process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash',
  geminiEmbeddingModel: () =>
    process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  heygenApiKey: () => required('HEYGEN_API_KEY'),
};
