import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen } from "@/components/auth/RouteGuards";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { requestDeclarationDocumentProcessing } from "@/lib/declarationAiPipeline";
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { toast } from "sonner";

type DbVerificationStatus = "pending" | "valid" | "warning" | "fraud_risk";

interface DocumentRow {
  id: string;
  shipment_id: string | null;
  user_id?: string;
  file_name: string;
  doc_type: string | null;
  verification_status: DbVerificationStatus | string | null;
  mismatch_fields: unknown;
  extracted_data: unknown;
  created_at: string | null;
  shipments: { shipment_number: string } | null;
}

type MatchLevel = "valid" | "warning" | "fraud";

interface ComparisonRow {
  label: string;
  declared: string | null;
  extracted: string | null;
  match: MatchLevel;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Commercial invoice",
  packing_list: "Packing list",
  certificate: "Certificate",
  bill_of_lading: "Bill of lading",
  other: "Other",
};

function docTypeLabel(dt: string | null): string {
  if (!dt) return "Document";
  return DOC_TYPE_LABELS[dt] ?? dt.replace(/_/g, " ");
}

function normalizeMatch(m: unknown): MatchLevel {
  if (m === "fraud") return "fraud";
  if (m === "warning") return "warning";
  return "valid";
}

function parseMismatchFields(raw: unknown): ComparisonRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ComparisonRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    out.push({
      label,
      declared: o.declared === undefined || o.declared === null ? null : String(o.declared),
      extracted: o.extracted === undefined || o.extracted === null ? null : String(o.extracted),
      match: normalizeMatch(o.match),
    });
  }
  return out;
}

function badgeStatus(db: string | null | undefined): "valid" | "warning" | "pending" | "fraud" {
  const s = (db ?? "pending").toLowerCase();
  if (s === "fraud_risk") return "fraud";
  if (s === "valid") return "valid";
  if (s === "warning") return "warning";
  return "pending";
}

function badgeLabel(db: string | null | undefined): string {
  const s = (db ?? "pending").toLowerCase();
  if (s === "fraud_risk") return "Fraud risk";
  if (s === "valid") return "Valid";
  if (s === "warning") return "Warning";
  return "Pending";
}

function extractionHeadline(data: unknown): string {
  if (!data || typeof data !== "object") return "No extraction yet";
  const o = data as Record<string, unknown>;
  const inferred =
    typeof o.inferred_document_type === "string" ? o.inferred_document_type.replace(/_/g, " ") : null;
  const pages = typeof o.pages === "number" ? o.pages : typeof o.pages === "string" ? o.pages : null;
  const parts = [inferred ? inferred.charAt(0).toUpperCase() + inferred.slice(1) : null, pages ? `${pages} page(s)` : null].filter(
    Boolean
  );
  return parts.length ? parts.join(" · ") : "Extracted payload";
}

/** Prefer nested invoice-style payload from AI pipeline (`raw_json`). */
function getStructuredExtractPayload(extracted: unknown): Record<string, unknown> | null {
  if (!extracted || typeof extracted !== "object") return null;
  const o = extracted as Record<string, unknown>;
  const raw = o.raw_json;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  const canon = o.canonical_json;
  if (canon && typeof canon === "object" && !Array.isArray(canon)) return canon as Record<string, unknown>;
  return null;
}

function formatExtractedPrimitive(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

const PRIMARY_EXTRACT_FIELDS: { key: string; label: string }[] = [
  { key: "invoice_number", label: "Invoice number" },
  { key: "invoice_date", label: "Invoice date" },
  { key: "seller_name", label: "Seller" },
  { key: "seller_address", label: "Seller address" },
  { key: "buyer_name", label: "Buyer" },
  { key: "buyer_address", label: "Buyer address" },
  { key: "goods_description", label: "Goods description" },
  { key: "quantity", label: "Quantity" },
  { key: "unit_price", label: "Unit price" },
  { key: "total_amount", label: "Total amount" },
  { key: "total_in_words", label: "Amount in words" },
  { key: "bl_number", label: "B/L number" },
  { key: "vessel_name", label: "Vessel" },
  { key: "container_number", label: "Container" },
  { key: "shipment_date", label: "Shipment date" },
  { key: "port_of_loading", label: "Port of loading" },
  { key: "port_of_discharge", label: "Port of discharge" },
  { key: "price_term", label: "Price term" },
  { key: "contract_number", label: "Contract" },
  { key: "lc_details", label: "L/C details" },
  { key: "beneficiary_bank_details", label: "Bank details" },
];

function buildExtractionTableRows(extracted: unknown): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (!extracted || typeof extracted !== "object") return rows;
  const root = extracted as Record<string, unknown>;
  const pages = formatExtractedPrimitive(root.pages);
  if (pages) rows.push({ label: "Pages", value: `${pages}` });

  const payload = getStructuredExtractPayload(extracted);
  if (!payload) return rows;

  for (const { key, label } of PRIMARY_EXTRACT_FIELDS) {
    const v = formatExtractedPrimitive(payload[key]);
    if (v) rows.push({ label, value: v });
  }
  return rows;
}

function normalizeShipmentJoin(raw: unknown): { shipment_number: string } | null {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && first !== null && "shipment_number" in first) {
      return { shipment_number: String((first as { shipment_number: unknown }).shipment_number) };
    }
    return null;
  }
  if (raw && typeof raw === "object" && "shipment_number" in raw) {
    return { shipment_number: String((raw as { shipment_number: unknown }).shipment_number) };
  }
  return null;
}

async function fetchVerificationDocuments(): Promise<DocumentRow[]> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Workspace is not configured.");
  const { data, error } = await sb
    .from("documents")
    .select("id, shipment_id, file_name, doc_type, verification_status, mismatch_fields, extracted_data, created_at, shipments(shipment_number)")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({
    ...row,
    shipments: normalizeShipmentJoin(row.shipments),
  })) as DocumentRow[];
}

export default function Verification() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspaceReady = isSupabaseConfigured();

  const { data = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["verification", "documents"],
    queryFn: fetchVerificationDocuments,
    enabled: workspaceReady,
  });

  const selected = useMemo(() => data.find((d) => d.id === selectedId) ?? data[0] ?? null, [data, selectedId]);

  const comparisonRows = useMemo(() => parseMismatchFields(selected?.mismatch_fields), [selected]);

  const rowStats = useMemo(() => {
    const valid = comparisonRows.filter((r) => r.match === "valid").length;
    const warning = comparisonRows.filter((r) => r.match === "warning").length;
    const fraud = comparisonRows.filter((r) => r.match === "fraud").length;
    return { valid, warning, fraud };
  }, [comparisonRows]);

  const extractHeadline = useMemo(() => extractionHeadline(selected?.extracted_data), [selected]);
  const extractionRows = useMemo(() => buildExtractionTableRows(selected?.extracted_data), [selected]);

  async function handleRescan() {
    const sid = selected?.shipment_id;
    if (!sid) {
      toast.error("No shipment linked to this document.");
      return;
    }
    try {
      await requestDeclarationDocumentProcessing(sid);
      await queryClient.invalidateQueries({ queryKey: ["verification", "documents"] });
      toast.success("Re-processing complete.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Re-scan failed.", { description: msg.slice(0, 280) });
    }
  }

  if (!workspaceReady) {
    return (
      <>
        <PageHeader
          eyebrow="AI Verification"
          title="Document Verification"
          description="Connect your workspace to load documents from Supabase."
        />
        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to view verification results.
        </p>
      </>
    );
  }

  if (isLoading) return <AuthLoadingScreen />;

  return (
    <>
      <PageHeader
        eyebrow="AI Verification"
        title="Document Verification"
        description="Live data from documents: verification status, comparison rows, and extracted payloads."
        actions={
          <Button
            type="button"
            className="bg-gradient-ocean shadow-glow gap-2"
            disabled={!selected?.shipment_id || isFetching}
            onClick={() => void handleRescan()}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Re-scan
          </Button>
        }
      />

      {isError && (
        <p className="mb-6 text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          {error instanceof Error ? error.message : "Could not load documents."}
        </p>
      )}

      <div className="flex justify-end mb-4">
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh list
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Documents</div>
          <div className="text-3xl font-bold mt-1.5">{data.length}</div>
        </div>
        <div className="bg-success-soft border border-success/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-success font-semibold">Matches (selection)</div>
          <div className="text-3xl font-bold mt-1.5 text-success">{selected ? rowStats.valid : "—"}</div>
        </div>
        <div className="bg-warning-soft border border-warning/30 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-warning-foreground font-semibold">Warnings</div>
          <div className="text-3xl font-bold mt-1.5 text-warning-foreground">{selected ? rowStats.warning : "—"}</div>
        </div>
        <div className="bg-destructive-soft border border-destructive/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-destructive font-semibold">Critical</div>
          <div className="text-3xl font-bold mt-1.5 text-destructive">{selected ? rowStats.fraud : "—"}</div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          No documents yet. Operators can submit declarations with PDFs; after the AI pipeline runs, rows appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {data.map((doc) => {
            const active = selected?.id === doc.id;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedId(doc.id)}
                className={cn(
                  "text-left bg-card rounded-2xl border shadow-card overflow-hidden transition-base hover:border-primary/40",
                  active ? "border-primary ring-2 ring-primary/20" : "border-border/60"
                )}
              >
                <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{doc.file_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {docTypeLabel(doc.doc_type)}
                        {doc.shipments?.shipment_number ? ` · ${doc.shipments.shipment_number}` : ""}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={badgeStatus(doc.verification_status)} label={badgeLabel(doc.verification_status)} />
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono">{extractionHeadline(doc.extracted_data)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {doc.created_at ? new Date(doc.created_at).toLocaleString() : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
        <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <div className="p-6 border-b border-border/60">
            <h3 className="text-base font-semibold">Comparison</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              From <code className="text-xs bg-muted px-1 rounded">mismatch_fields</code> on the selected document.
            </p>
          </div>
          {!selected ? (
            <p className="p-6 text-sm text-muted-foreground">Select a document above.</p>
          ) : comparisonRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No comparison rows stored yet. Use Re-scan after the declaration pipeline has run.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-semibold px-6 py-3">Field</th>
                    <th className="text-left font-semibold px-6 py-3">Declaration</th>
                    <th className="text-left font-semibold px-6 py-3">Extracted</th>
                    <th className="text-left font-semibold px-6 py-3">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((f) => (
                    <tr
                      key={`${f.label}-${f.declared}-${f.extracted}`}
                      className={cn(
                        "border-b border-border/40",
                        f.match === "fraud" ? "bg-destructive-soft/40" : f.match === "warning" ? "bg-warning-soft/40" : ""
                      )}
                    >
                      <td className="px-6 py-4 font-medium text-foreground">{f.label}</td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{f.declared ?? "—"}</td>
                      <td
                        className={cn(
                          "px-6 py-4 font-mono text-xs",
                          f.match === "fraud"
                            ? "text-destructive font-semibold"
                            : f.match === "warning"
                              ? "text-warning-foreground font-semibold"
                              : "text-muted-foreground"
                        )}
                      >
                        {f.extracted ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        {f.match === "valid" ? (
                          <div className="inline-flex items-center gap-1.5 text-success text-xs font-semibold">
                            <CheckCircle2 className="h-4 w-4" /> Match
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs font-semibold",
                              f.match === "fraud" ? "text-destructive" : "text-warning-foreground"
                            )}
                          >
                            <AlertCircle className="h-4 w-4" />
                            {f.match === "fraud" ? "Critical mismatch" : "Minor variance"}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden flex flex-col min-h-[280px]">
          <div className="p-6 border-b border-border/60">
            <h3 className="text-base font-semibold">Extracted data</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{extractHeadline}</p>
          </div>
          <div className="p-0 flex-1 overflow-auto max-h-[480px]">
            {!selected ? (
              <p className="p-4 text-sm text-muted-foreground">Select a document.</p>
            ) : extractionRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No key fields yet. Save a declaration with PDFs and run the AI pipeline, or re-scan after processing.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left font-semibold px-4 py-3 w-[32%]">Field</th>
                      <th className="text-left font-semibold px-4 py-3">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractionRows.map((row, idx) => (
                      <tr key={`${idx}-${row.label}`} className="border-b border-border/40 align-top">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{row.label}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs leading-relaxed break-words">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
