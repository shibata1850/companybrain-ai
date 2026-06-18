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
  didApiKey: () => process.env.DID_API_KEY || '',
  didVoiceId: () => process.env.DID_VOICE_ID || 'ja-JP-NanamiNeural',
  heygenApiKey: () => process.env.HEYGEN_API_KEY || '',
  heygenInteractiveAvatarId: () =>
    process.env.HEYGEN_INTERACTIVE_AVATAR_ID || 'Wayne_20240711',
  heygenInteractiveLanguage: () =>
    process.env.HEYGEN_INTERACTIVE_LANGUAGE || 'ja',
  // Gemini Live API — the real-time voice conversation engine.
  // Available voices (multi-lingual incl. Japanese):
  //   Aoede / Charon / Fenrir / Kore / Leda / Orus / Puck / Zephyr.
  // The Live API has two model families served on two API versions:
  //   - v1main / v1beta: gemini-2.0-flash-live-001, etc.
  //   - v1alpha       : gemini-2.5-flash-preview-native-audio-dialog,
  //                     gemini-live-2.5-flash-preview
  // Ephemeral tokens are only served on v1alpha, so the model has to
  // be one of the v1alpha entries.
  geminiLiveModel: () =>
    process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest',
  geminiLiveVoice: () => process.env.GEMINI_LIVE_VOICE || 'Kore',
  // Shared secret for the external ingestion API (/api/ingest/*).
  // Empty = ingestion endpoints are disabled.
  ingestApiKey: () => process.env.INGEST_API_KEY || '',
};
