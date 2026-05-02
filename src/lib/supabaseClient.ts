import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in `.env` (root). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  if (!browserClient) {
    browserClient = createClient(url.trim(), key.trim());
  }
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseBrowserClient() !== null;
}

export function getVerificationBucket(): string {
  return import.meta.env.VITE_SUPABASE_BUCKET?.trim() || "documents";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "document.pdf";
}

/** Unique object key; avoids `crypto.randomUUID` missing on non-secure HTTP (e.g. LAN IP). */
function uniqueObjectKey(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Upload one PDF to Supabase Storage and return a 1-hour signed URL
 * the AI backend can fetch.
 */
export async function uploadPdfGetSignedUrl(
  file: File,
  slotLabel: string
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
    );
  }

  const bucket = getVerificationBucket();
  const safe = sanitizeFilename(file.name);
  const path = `${uniqueObjectKey()}_${slotLabel}_${safe}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    throw new Error(
      `Supabase upload failed: ${uploadError.message}. ` +
        `Check bucket "${bucket}" and its Storage policies.`
    );
  }

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (signError || !data?.signedUrl) {
    throw new Error(
      signError?.message ??
        "Could not create signed URL (check Storage SELECT policy)."
    );
  }

  return data.signedUrl;
}

export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
}

/**
 * Returns current auth user id, or signs in anonymously so RLS (`auth.uid()`)
 * passes for shipments/documents inserts. Enable Anonymous sign-in in Supabase Auth.
 */
export async function ensureAuthUserId(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase chưa cấu hình (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Đăng nhập ẩn danh thất bại: ${error.message}. ` +
        "Trong Supabase: Authentication → Providers → bật Anonymous."
    );
  }
  if (!data.user?.id) {
    throw new Error("Không lấy được user id sau khi đăng nhập.");
  }
  return data.user.id;
}

/** Upload file chứng từ vào Storage; trả về URL công khai (bucket public) hoặc path URL cố định. */
export async function uploadDeclarationDocument(
  userId: string,
  file: File
): Promise<{ file_name: string; file_url: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase chưa cấu hình.");
  }
  const lower = file.name?.toLowerCase() ?? "";
  if (!lower.endsWith(".pdf")) {
    throw new Error("Declaration attachments must be PDF files.");
  }

  const bucket = getVerificationBucket();
  const safe = sanitizeFilename(file.name);
  const path = `declarations/${userId}/${uniqueObjectKey()}_${safe}`;
  const contentType = file.type?.trim() || "application/pdf";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(
      `Declaration upload failed (${bucket}): ${uploadError.message}. ` +
        "If this mentions RLS, row-level security, or policy, add Storage policies — see supabase/migrations/20260204150000_storage_declarations_bucket_policies.sql"
    );
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { file_name: file.name, file_url: data.publicUrl };
}
