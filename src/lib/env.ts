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
  // Default to the half-cascade live model which is stable and
  // available on the standard Gemini API tier. The native-audio-dialog
  // variant requires preview access and tends to disconnect on
  // accounts that haven't been opted in.
  geminiLiveModel: () =>
    process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview',
  geminiLiveVoice: () => process.env.GEMINI_LIVE_VOICE || 'Kore',
};
