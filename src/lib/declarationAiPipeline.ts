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

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const base = getAiApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorDetail(res));
  }
  return (await res.json()) as TRes;
}

export async function requestDeclarationDocumentProcessing(shipmentId: string): Promise<void> {
  await postJson("/api/declaration/process-documents", { shipment_id: shipmentId });
}

export interface HsSuggestRequest {
  session_id?: string;
  shipment_id?: string;
  product_name: string;
  product_description: string;
  product_context?: string;
}

export interface HsSuggestResponse {
  best_hs_code: string | null;
  reasoning: string;
  confidence: number;
  hs_code_candidates: string[];
  legal_basis: string[];
  questions_missing: string[];
}

export async function requestHsSuggestion(payload: HsSuggestRequest): Promise<HsSuggestResponse> {
  return postJson("/api/hs/suggest", payload);
}

export interface HsConfirmRequest {
  shipment_id?: string;
  hs_code: string;
  legal_basis?: string[];
  note?: string;
}

export async function requestHsConfirm(payload: HsConfirmRequest): Promise<{ confirmed: boolean; stored: boolean; hs_code: string }> {
  return postJson("/api/hs/confirm", payload);
}

export interface GateScanRequest {
  shipment_id: string;
  detected_container_id?: string;
  detected_license_plate?: string;
  vision_status?: string;
  vision_confidence?: number;
  scan_details?: Record<string, unknown>;
}

export interface GateScanResponse {
  ok: boolean;
  shipment_id: string;
  decision: "pass" | "hold";
  reasons: string[];
  scan_id?: string | null;
}

export async function requestGateScan(payload: GateScanRequest): Promise<GateScanResponse> {
  return postJson("/api/gate/scan", payload);
}

export interface TrajectoryAnalyzeRequest {
  shipment_id: string;
  lookback_points?: number;
}

export interface TrajectoryAnalyzeResponse {
  ok: boolean;
  shipment_id: string;
  analyzed_points: number;
  anomalies: Array<{
    type: string;
    score: number;
    severity: string;
    message: string;
    ts: string;
  }>;
}

export async function requestTrajectoryAnalyze(
  payload: TrajectoryAnalyzeRequest
): Promise<TrajectoryAnalyzeResponse> {
  return postJson("/api/trajectory/analyze", payload);
}
