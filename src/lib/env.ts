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
  // The "answer" model is what speaks as the persona — quality matters
  // more than speed here, so default to Pro. Override per deployment via
  // GEMINI_ANSWER_MODEL.
  geminiAnswerModel: () =>
    process.env.GEMINI_ANSWER_MODEL ||
    process.env.GEMINI_TEXT_MODEL ||
    'gemini-2.5-pro',
  // The "transcribe" model handles video → text. Flash is plenty for
  // transcription and significantly cheaper / faster.
  geminiTranscribeModel: () =>
    process.env.GEMINI_TRANSCRIBE_MODEL ||
    process.env.GEMINI_TEXT_MODEL ||
    'gemini-2.5-flash',
  geminiEmbeddingModel: () =>
    process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  // Gemini Live API — the real-time voice conversation engine.
  // Available voices (multi-lingual incl. Japanese):
  //   Aoede / Charon / Fenrir / Kore / Leda / Orus / Puck / Zephyr.
  // 既定は gemini-3.8-live(2026-09 GA)。旧既定の
  // gemini-2.5-flash-native-audio 系は 2026-10-16 に提供終了のため移行済み。
  // 3.8-live はアバター映像出力(Live Avatar)にも対応する。
  // Ephemeral tokens are only served on v1alpha; the token route walks a
  // fallback list if the requested model is rejected at mint time.
  geminiLiveModel: () =>
    process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
  geminiLiveVoice: () => process.env.GEMINI_LIVE_VOICE || 'Kore',
  // Shared secret for the external ingestion API (/api/ingest/*).
  // Empty = ingestion endpoints are disabled.
  ingestApiKey: () => process.env.INGEST_API_KEY || '',
};
