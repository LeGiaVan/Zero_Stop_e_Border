/** Calls ai-service after Declaration save (extract + compare → updates `documents`). */

async function parseApiErrorDetail(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) =>
          typeof item === "object" && item !== null && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : String(item)
        )
        .join("; ");
    }
    return text;
  } catch {
    return text;
  }
}

export function getAiApiBaseUrl(): string {
  const raw = import.meta.env.VITE_AI_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "http://127.0.0.1:8000";
}

export async function requestDeclarationDocumentProcessing(shipmentId: string): Promise<void> {
  const base = getAiApiBaseUrl();
  const res = await fetch(`${base}/api/declaration/process-documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipment_id: shipmentId }),
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorDetail(res));
  }
}
