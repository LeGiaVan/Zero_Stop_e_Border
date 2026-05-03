import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AuthLoadingScreen } from "@/components/auth/RouteGuards";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { requestDeclarationDocumentProcessing } from "@/lib/declarationAiPipeline";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";

type DbVerificationStatus = "pending" | "valid" | "warning" | "fraud_risk";

/** Shipment row joined for filters and display (basic fields). */
interface ShipmentSummary {
  id: string;
  shipment_number: string;
  product_description: string | null;
  origin_country: string | null;
  destination_country: string | null;
  status: string | null;
  hs_code: string | null;
  container_id: string | null;
  license_plate: string | null;
  created_at: string | null;
}

interface DocumentRow {
  id: string;
  shipment_id: string | null;
  user_id: string;
  department_label: string;
  /** Set when submitter profile role is operator; used for department dropdown filter only. */
  operator_department_filter: string | null;
  file_name: string;
  doc_type: string | null;
  verification_status: DbVerificationStatus | string | null;
  mismatch_fields: unknown;
  extracted_data: unknown;
  created_at: string | null;
  shipments: ShipmentSummary | null;
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
  const pages = typeof o.pages === "number" ? o.pages : typeof o.pages === "string" ? o.pages : null;
  return pages != null && pages !== "" ? `${pages} page(s)` : "Extracted payload";
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

/** UI labels for known extraction keys (canonical / raw); unknown keys use Title Case from snake_case. */
const EXTRACTION_FIELD_LABELS: Record<string, string> = {
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  seller_name: "Seller",
  seller_address: "Seller address",
  buyer_name: "Buyer",
  buyer_address: "Buyer address",
  goods_description: "Goods description",
  quantity: "Quantity",
  unit_price: "Unit price",
  total_amount: "Total amount",
  total_in_words: "Amount in words",
  bl_number: "B/L number",
  vessel_name: "Vessel",
  vessel: "Vessel",
  container_number: "Container",
  container_no: "Container",
  shipment_date: "Shipment date",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  price_term: "Price term",
  contract_number: "Contract",
  lc_details: "L/C details",
  beneficiary_bank_details: "Bank details",
  carrier: "Carrier",
  bl_date: "B/L date",
  shipper_name: "Shipper",
  shipper_address: "Shipper address",
  consignee: "Consignee",
  notify_party_name: "Notify party",
  notify_party_address: "Notify party address",
  voyage_number: "Voyage number",
  seal_no: "Seal number",
  cargo_description: "Cargo description",
  hs_code: "HS code",
  origin: "Origin",
  container_type_quantity: "Container type / quantity",
  package_quantity: "Package quantity",
  product_quantity: "Product quantity",
  net_weight: "Net weight",
  gross_weight: "Gross weight",
  freight_terms: "Freight terms",
  place_of_issue: "Place of issue",
  packing_list_number: "Packing list number",
  date: "Date",
  year_of_manufacture: "Year of manufacture",
  total_gross_weight: "Total gross weight",
  packaging_details: "Packaging details",
};

/** Omit from extraction table (metadata / duplicates of columns user asked to hide). */
const EXTRACTION_SKIP_KEYS = new Set(["model", "source_file", "inferred_document_type"]);

function humanizeExtractKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function segmentDisplayLabel(segment: string): string {
  if (/^\d+$/.test(segment)) return `Row ${segment}`;
  return EXTRACTION_FIELD_LABELS[segment] ?? humanizeExtractKey(segment);
}

function pathToRowLabel(segments: string[]): string {
  return segments.map(segmentDisplayLabel).join(" · ");
}

function buildExtractionTableRows(extracted: unknown): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (!extracted || typeof extracted !== "object") return rows;

  const root = extracted as Record<string, unknown>;
  const pages = formatExtractedPrimitive(root.pages);
  if (pages) rows.push({ label: "Pages", value: pages });

  const seenPaths = new Set<string>();
  const payloads: unknown[] = [root.canonical_json, root.standardized_json, root.raw_json].filter(
    (p) => p != null && typeof p === "object" && !Array.isArray(p)
  );

  function pushLeaf(segments: string[], value: string): void {
    if (segments.length === 0) return;
    const pathKey = segments.join(".");
    if (seenPaths.has(pathKey)) return;
    seenPaths.add(pathKey);
    rows.push({ label: pathToRowLabel(segments), value });
  }

  function walk(node: unknown, segments: string[]): void {
    if (node === undefined || node === null) return;

    if (typeof node === "object" && !Array.isArray(node)) {
      const o = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(o)) {
        if (EXTRACTION_SKIP_KEYS.has(k.toLowerCase())) continue;
        walk(v, [...segments, k]);
      }
      return;
    }

    if (Array.isArray(node)) {
      if (node.length === 0) return;
      const allPrimitiveLeaves = node.every((el) => {
        if (el === undefined || el === null) return true;
        if (typeof el === "object") return false;
        return formatExtractedPrimitive(el) !== null;
      });
      if (allPrimitiveLeaves) {
        const parts = node
          .map((el) => formatExtractedPrimitive(el))
          .filter((s): s is string => s !== null);
        if (parts.length > 0) pushLeaf(segments, parts.join(", "));
        return;
      }
      node.forEach((el, idx) => {
        walk(el, [...segments, String(idx + 1)]);
      });
      return;
    }

    const prim = formatExtractedPrimitive(node);
    if (prim !== null && segments.length > 0) pushLeaf(segments, prim);
  }

  for (const payload of payloads) {
    walk(payload, []);
  }

  rows.sort((a, b) => {
    if (a.label === "Pages") return -1;
    if (b.label === "Pages") return 1;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

function documentsLoadErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Unable to load documents. Please try again.";
  const m = err.message.toLowerCase();
  if (m.includes("not configured")) return "Workspace connection is not available. Contact your administrator.";
  if (m.includes("jwt") || m.includes("session")) return "Your session could not be validated. Sign in again and retry.";
  if (m.includes("permission") || m.includes("policy") || m.includes("rls") || m.includes("row-level"))
    return "You do not have permission to view these documents.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Network error. Check your connection and try again.";
  return "Unable to load documents. Please try again.";
}

function nullableString(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function shipmentStatusLabel(raw: string | null): string {
  if (!raw) return "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Nested `shipments(...)` from documents select; `id` filled from row.shipment_id in mapper. */
function normalizeShipmentJoinPayload(raw: unknown): Omit<ShipmentSummary, "id"> | null {
  const fromObject = (o: Record<string, unknown>): Omit<ShipmentSummary, "id"> | null => {
    const shipment_number = nullableString(o.shipment_number);
    if (!shipment_number) return null;
    return {
      shipment_number,
      product_description: nullableString(o.product_description),
      origin_country: nullableString(o.origin_country),
      destination_country: nullableString(o.destination_country),
      status: nullableString(o.status),
      hs_code: nullableString(o.hs_code),
      container_id: nullableString(o.container_id),
      license_plate: nullableString(o.license_plate),
      created_at: typeof o.created_at === "string" ? o.created_at : null,
    };
  };
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && first !== null) return fromObject(first as Record<string, unknown>);
    return null;
  }
  if (raw && typeof raw === "object") return fromObject(raw as Record<string, unknown>);
  return null;
}

/** Canonical label for profile department (empty → Unassigned). */
function departmentDisplayLabel(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return t.length ? t : "Unassigned";
}

const ALL_DEPARTMENTS = "__all__";
const ALL_SHIPMENTS = "__all_shipments__";

interface VerificationPageData {
  documents: DocumentRow[];
  /** Dropdown: distinct departments from user_profiles where role = operator. */
  operatorDepartments: string[];
}

async function fetchVerificationPageData(): Promise<VerificationPageData> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Workspace is not configured.");

  const [docsRes, profilesRes] = await Promise.all([
    sb
      .from("documents")
      .select(
        "id, shipment_id, user_id, file_name, doc_type, verification_status, mismatch_fields, extracted_data, created_at, shipments(id, shipment_number, product_description, origin_country, destination_country, status, hs_code, container_id, license_plate, created_at)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    sb.from("user_profiles").select("user_id, department, role"),
  ]);

  if (docsRes.error) throw docsRes.error;
  if (profilesRes.error) {
    console.warn("[verification] Could not load user_profiles:", profilesRes.error.message);
  }

  type ProfileRow = { user_id: string; department: string | null; role: string | null };
  const profileByUserId = new Map<string, ProfileRow>();
  const operatorDeptOptions = new Set<string>();

  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    if (!p.user_id) continue;
    profileByUserId.set(p.user_id, p);
    if ((p.role ?? "").toLowerCase() === "operator") {
      operatorDeptOptions.add(departmentDisplayLabel(p.department));
    }
  }

  const rawRows = (docsRes.data ?? []) as Record<string, unknown>[];
  const documents: DocumentRow[] = rawRows.map((row) => {
    const uid = String(row.user_id ?? "");
    const prof = profileByUserId.get(uid);
    const deptLabel = departmentDisplayLabel(prof?.department ?? null);
    const isOperator = (prof?.role ?? "").toLowerCase() === "operator";
    const operator_department_filter = isOperator ? deptLabel : null;

    const shipmentId = (row.shipment_id as string | null) ?? null;
    const shipPayload = normalizeShipmentJoinPayload(row.shipments);
    const shipments: ShipmentSummary | null =
      shipmentId && shipPayload ? { id: shipmentId, ...shipPayload } : null;

    return {
      id: String(row.id),
      shipment_id: shipmentId,
      user_id: uid,
      department_label: deptLabel,
      operator_department_filter,
      file_name: String(row.file_name ?? ""),
      doc_type: (row.doc_type as string | null) ?? null,
      verification_status: (row.verification_status as DocumentRow["verification_status"]) ?? null,
      mismatch_fields: row.mismatch_fields,
      extracted_data: row.extracted_data,
      created_at: (row.created_at as string | null) ?? null,
      shipments,
    };
  });

  const operatorDepartments = Array.from(operatorDeptOptions).sort((a, b) => a.localeCompare(b));

  return { documents, operatorDepartments };
}

function ShipmentFilterMenuDetails({ s }: { s: ShipmentSummary }) {
  const route =
    s.origin_country || s.destination_country
      ? [s.origin_country, s.destination_country].filter(Boolean).join(" → ")
      : null;
  const metaLine = [
    s.status ? shipmentStatusLabel(s.status) : null,
    s.hs_code ? `HS ${s.hs_code}` : null,
    s.container_id ? `Container ${s.container_id}` : null,
    s.license_plate ? s.license_plate : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 text-left w-full min-w-0">
      <span className="font-semibold text-foreground">{s.shipment_number}</span>
      {route ? <span className="text-xs text-muted-foreground">{route}</span> : null}
      {s.product_description ? (
        <span className="text-xs text-muted-foreground line-clamp-2">{s.product_description}</span>
      ) : null}
      {metaLine.length > 0 ? (
        <span className="text-[11px] text-muted-foreground">{metaLine.join(" · ")}</span>
      ) : null}
    </div>
  );
}

export default function Verification() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL_DEPARTMENTS);
  const [shipmentFilter, setShipmentFilter] = useState<string>(ALL_SHIPMENTS);
  const workspaceReady = isSupabaseConfigured();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["verification", "documents"],
    queryFn: fetchVerificationPageData,
    enabled: workspaceReady,
  });

  const documents = data?.documents ?? [];
  const departmentOptions = data?.operatorDepartments ?? [];

  const deptFilteredDocuments = useMemo(() => {
    if (departmentFilter === ALL_DEPARTMENTS) return documents;
    return documents.filter(
      (d) => d.operator_department_filter !== null && d.operator_department_filter === departmentFilter
    );
  }, [documents, departmentFilter]);

  const shipmentOptions = useMemo(() => {
    const byId = new Map<string, ShipmentSummary>();
    for (const d of deptFilteredDocuments) {
      if (!d.shipment_id || !d.shipments) continue;
      if (!byId.has(d.shipment_id)) byId.set(d.shipment_id, d.shipments);
    }
    return Array.from(byId.values()).sort((a, b) => a.shipment_number.localeCompare(b.shipment_number));
  }, [deptFilteredDocuments]);

  useEffect(() => {
    if (shipmentFilter !== ALL_SHIPMENTS && !shipmentOptions.some((s) => s.id === shipmentFilter)) {
      setShipmentFilter(ALL_SHIPMENTS);
    }
  }, [shipmentFilter, shipmentOptions]);

  const filteredDocuments = useMemo(() => {
    if (shipmentFilter === ALL_SHIPMENTS) return deptFilteredDocuments;
    return deptFilteredDocuments.filter((d) => d.shipment_id === shipmentFilter);
  }, [deptFilteredDocuments, shipmentFilter]);

  const selectedShipmentTrigger = useMemo(() => {
    if (shipmentFilter === ALL_SHIPMENTS) return null;
    return shipmentOptions.find((s) => s.id === shipmentFilter) ?? null;
  }, [shipmentFilter, shipmentOptions]);

  useEffect(() => {
    setSelectedId(null);
  }, [departmentFilter, shipmentFilter]);

  const selected = useMemo(
    () => filteredDocuments.find((d) => d.id === selectedId) ?? filteredDocuments[0] ?? null,
    [filteredDocuments, selectedId]
  );

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
      toast.error("This document is not linked to a shipment.", {
        description: "Submit it from Customs declaration with supporting files attached.",
      });
      return;
    }
    try {
      await requestDeclarationDocumentProcessing(sid);
      await queryClient.invalidateQueries({ queryKey: ["verification", "documents"] });
      toast.success("Document verification updated.");
    } catch (e: unknown) {
      console.warn("[verification] Re-scan:", e);
      toast.error("Unable to re-run verification.", {
        description: "Please try again shortly or contact support if the issue persists.",
      });
    }
  }

  if (!workspaceReady) {
    return (
      <>
        <PageHeader
          eyebrow="Document verification"
          title="Document Verification"
          description="Review extracted fields and compare them with declared values."
        />
        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          This screen requires your organization&apos;s workspace to be configured. Contact your administrator if you
          expected access here.
        </p>
      </>
    );
  }

  if (isLoading) return <AuthLoadingScreen />;

  return (
    <>
      <PageHeader
        eyebrow="Document verification"
        title="Document Verification"
        description="Filter by operator department and shipment; non-operator uploads appear under All departments."
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
          {documentsLoadErrorMessage(error)}
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-stretch sm:items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="gap-2 justify-between min-w-[220px]" disabled={isFetching}>
                <span className="truncate">
                  {departmentFilter === ALL_DEPARTMENTS
                    ? "All departments"
                    : `Department: ${departmentFilter}`}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              <DropdownMenuItem onClick={() => setDepartmentFilter(ALL_DEPARTMENTS)}>
                All departments
                {departmentFilter === ALL_DEPARTMENTS ? " ✓" : ""}
              </DropdownMenuItem>
              {departmentOptions.length > 0 && <DropdownMenuSeparator />}
              {departmentOptions.map((dept) => (
                <DropdownMenuItem key={dept} onClick={() => setDepartmentFilter(dept)}>
                  <span className="truncate">{dept}</span>
                  {departmentFilter === dept ? " ✓" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="gap-2 justify-between min-w-[240px]" disabled={isFetching}>
                <span className="truncate">
                  {shipmentFilter === ALL_SHIPMENTS
                    ? "All shipments"
                    : selectedShipmentTrigger
                      ? selectedShipmentTrigger.shipment_number
                      : "Shipment"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[280px] max-w-[340px] max-h-[min(70vh,420px)] overflow-y-auto">
              <DropdownMenuItem
                onClick={() => setShipmentFilter(ALL_SHIPMENTS)}
                className="flex flex-row items-start gap-2 cursor-pointer py-2.5"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                  <span className="font-medium">All shipments</span>
                  <span className="text-xs text-muted-foreground font-normal leading-snug">
                    Show documents from every shipment in the current department filter.
                  </span>
                </div>
                {shipmentFilter === ALL_SHIPMENTS ? (
                  <span className="shrink-0 text-xs text-muted-foreground pt-0.5">✓</span>
                ) : null}
              </DropdownMenuItem>
              {shipmentOptions.length > 0 && <DropdownMenuSeparator />}
              {shipmentOptions.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => setShipmentFilter(s.id)}
                  className="flex flex-row items-start gap-2 cursor-pointer py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <ShipmentFilterMenuDetails s={s} />
                  </div>
                  {shipmentFilter === s.id ? (
                    <span className="shrink-0 text-xs text-muted-foreground pt-0.5">✓</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh list
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Documents</div>
          <div className="text-3xl font-bold mt-1.5">{filteredDocuments.length}</div>
          {departmentFilter !== ALL_DEPARTMENTS || shipmentFilter !== ALL_SHIPMENTS ? (
            <p className="text-[11px] text-muted-foreground mt-1">{documents.length} total in workspace</p>
          ) : null}
        </div>
        <div className="bg-success-soft border border-success/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-success font-semibold">Matching fields</div>
          <div className="text-3xl font-bold mt-1.5 text-success">{selected ? rowStats.valid : "—"}</div>
        </div>
        <div className="bg-warning-soft border border-warning/30 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-warning-foreground font-semibold">Variances</div>
          <div className="text-3xl font-bold mt-1.5 text-warning-foreground">{selected ? rowStats.warning : "—"}</div>
        </div>
        <div className="bg-destructive-soft border border-destructive/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-destructive font-semibold">Critical issues</div>
          <div className="text-3xl font-bold mt-1.5 text-destructive">{selected ? rowStats.fraud : "—"}</div>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          No supporting documents yet. Results appear here after declarations are submitted with PDF attachments and
          verification completes.
        </div>
      ) : deptFilteredDocuments.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          No documents for this department. Choose another department or &quot;All departments&quot;.
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          No documents for this shipment with the current filters. Choose &quot;All shipments&quot; or another shipment.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {filteredDocuments.map((doc) => {
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
                        {doc.department_label}
                        {" · "}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10 xl:items-stretch">
        <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden flex flex-col min-h-[280px] xl:h-[min(70vh,560px)] xl:max-h-[min(70vh,560px)]">
          <div className="p-6 border-b border-border/60 shrink-0">
            <h3 className="text-base font-semibold">Declaration comparison</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Declared values versus values read from the selected document.
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {!selected ? (
              <p className="p-6 text-sm text-muted-foreground">Select a document above.</p>
            ) : comparisonRows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No comparison data for this document yet. Use Re-scan after submitting supporting documents, or try again
                in a moment if verification is still running.
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
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden flex flex-col min-h-[280px] xl:h-[min(70vh,560px)] xl:max-h-[min(70vh,560px)]">
          <div className="p-6 border-b border-border/60 shrink-0">
            <h3 className="text-base font-semibold">Extracted data</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{extractHeadline}</p>
          </div>
          <div className="p-0 flex-1 min-h-0 overflow-auto">
            {!selected ? (
              <p className="p-4 text-sm text-muted-foreground">Select a document.</p>
            ) : extractionRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No extracted fields available yet. Submit a declaration with PDF attachments, then use Re-scan if
                needed.
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
