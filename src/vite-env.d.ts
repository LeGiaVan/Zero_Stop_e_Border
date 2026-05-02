/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Storage bucket for verification PDFs (default: verification-documents) */
  readonly VITE_SUPABASE_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
