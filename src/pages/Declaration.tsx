import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Send,
  Bot,
  Lightbulb,
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  Save,
  Package,
  Files,
  ListOrdered,
  MapPinned,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  uploadDeclarationDocument,
} from "@/lib/supabaseClient";

const SHIPMENT_STATUSES = [
  "pending",
  "in_review",
  "cleared",
  "held",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

const STATUS_LABELS: Record<(typeof SHIPMENT_STATUSES)[number], string> = {
  pending: "Pending",
  in_review: "In review",
  cleared: "Cleared",
  held: "Held",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const RISK_LEVELS = ["low", "medium", "high"] as const;
const RISK_LABELS: Record<(typeof RISK_LEVELS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const SEAL_STATUSES = ["intact", "broken", "verified"] as const;
const SEAL_LABELS: Record<(typeof SEAL_STATUSES)[number], string> = {
  intact: "Intact",
  broken: "Broken",
  verified: "Verified",
};

const DOC_TYPES = [
  "invoice",
  "packing_list",
  "certificate",
  "bill_of_lading",
  "other",
] as const;

type DocType = (typeof DOC_TYPES)[number];

const DOC_LABELS: Record<DocType, string> = {
  invoice: "Commercial invoice",
  packing_list: "Packing list",
  certificate: "Certificate",
  bill_of_lading: "Bill of lading",
  other: "Other",
};

function genShipmentNumber(): string {
  return `SHP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function newRowId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function friendlySaveError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("23505") || lower.includes("unique") || lower.includes("duplicate")) {
    return "This shipment reference is already in use. Choose a different reference.";
  }
  if (lower.includes("not configured") || lower.includes("vite_")) {
    return "Saving is unavailable. Your workspace needs to be connected.";
  }
  if (lower.includes("anonymous") || lower.includes("sign-in")) {
    return "We couldn’t verify your session. Please refresh the page and try again.";
  }
  if (lower.includes("policy") || lower.includes("permission") || lower.includes("rls")) {
    return "You don’t have permission to complete this action. Contact your administrator.";
  }
  if (lower.includes("storage") || lower.includes("upload")) {
    return "One or more files could not be uploaded. Check your connection and try again.";
  }
  return "Something went wrong while saving. Please try again in a moment.";
}

interface ShipmentForm {
  shipment_number: string;
  product_description: string;
  origin_country: string;
  destination_country: string;
  status: (typeof SHIPMENT_STATUSES)[number];
  risk_score: string;
  risk_level: (typeof RISK_LEVELS)[number];
  risk_explanation: string;
  clearance_time_hours: string;
  hs_code: string;
  container_id: string;
  license_plate: string;
  seal_status: (typeof SEAL_STATUSES)[number];
  current_lat: string;
  current_lng: string;
}

function emptyShipment(): ShipmentForm {
  return {
    shipment_number: genShipmentNumber(),
    product_description: "",
    origin_country: "",
    destination_country: "",
    status: "pending",
    risk_score: "0",
    risk_level: "low",
    risk_explanation: "",
    clearance_time_hours: "0",
    hs_code: "",
    container_id: "",
    license_plate: "",
    seal_status: "intact",
    current_lat: "0",
    current_lng: "0",
  };
}

interface DocRow {
  id: string;
  doc_type: DocType;
  file: File | null;
}

interface ItemRow {
  id: string;
  item_name: string;
  hs_code: string;
  quantity: string;
  unit_value: string;
  country_of_origin: string;
  legal_references: string;
}

export default function Declaration() {
  const { profile } = useAuth();
  const [messages] = useState([
    {
      role: "ai" as const,
      text: "Describe your goods and I can suggest tariff codes and compliance notes for each line.",
    },
    {
      role: "user" as const,
      text: "We’re importing wireless Bluetooth headphones — five hundred units.",
    },
    {
      role: "ai" as const,
      text: "Suggested tariff heading: 8518.30.20. Add a line item with quantity and unit value to capture it on the declaration.",
    },
  ]);

  const [shipment, setShipment] = useState<ShipmentForm>(() => emptyShipment());
  const [documents, setDocuments] = useState<DocRow[]>([
    { id: newRowId(), doc_type: "invoice", file: null },
  ]);
  const [items, setItems] = useState<ItemRow[]>([
    {
      id: newRowId(),
      item_name: "",
      hs_code: "",
      quantity: "",
      unit_value: "",
      country_of_origin: "",
      legal_references: "",
    },
  ]);
  const [saving, setSaving] = useState(false);

  const workspaceReady = useMemo(() => isSupabaseConfigured(), []);

  const patchShipment = useCallback((patch: Partial<ShipmentForm>) => {
    setShipment((s) => ({ ...s, ...patch }));
  }, []);

  const addDocRow = () =>
    setDocuments((d) => [...d, { id: newRowId(), doc_type: "invoice", file: null }]);

  const removeDocRow = (id: string) =>
    setDocuments((d) => (d.length <= 1 ? d : d.filter((x) => x.id !== id)));

  const updateDocRow = (id: string, patch: Partial<DocRow>) =>
    setDocuments((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addItemRow = () =>
    setItems((rows) => [
      ...rows,
      {
        id: newRowId(),
        item_name: "",
        hs_code: "",
        quantity: "",
        unit_value: "",
        country_of_origin: "",
        legal_references: "",
      },
    ]);

  const removeItemRow = (id: string) =>
    setItems((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));

  const updateItemRow = (id: string, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function persist(mode: "draft" | "submit") {
    if (!isSupabaseConfigured()) {
      toast.error("Saving isn’t available until your workspace is connected.");
      return;
    }

    const num = shipment.shipment_number.trim();
    if (!num) {
      toast.error("Enter a shipment reference to continue.");
      return;
    }

    setSaving(true);
    try {
      const userId = profile?.user_id;
      if (!userId) {
        toast.error("Your session could not be verified. Please sign in again.");
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("unavailable");

      const rs = Math.min(100, Math.max(0, parseFloat(shipment.risk_score) || 0));

      const statusOnSave =
        mode === "draft"
          ? "pending"
          : shipment.status === "pending"
            ? "in_review"
            : shipment.status;

      const shipPayload = {
        user_id: userId,
        shipment_number: num,
        product_description: shipment.product_description.trim(),
        origin_country: shipment.origin_country.trim(),
        destination_country: shipment.destination_country.trim(),
        status: statusOnSave,
        risk_score: rs,
        risk_level: shipment.risk_level,
        risk_explanation: shipment.risk_explanation.trim(),
        clearance_time_hours: parseFloat(shipment.clearance_time_hours) || 0,
        hs_code: shipment.hs_code.trim(),
        container_id: shipment.container_id.trim(),
        license_plate: shipment.license_plate.trim(),
        seal_status: shipment.seal_status,
        current_lat: parseFloat(shipment.current_lat) || 0,
        current_lng: parseFloat(shipment.current_lng) || 0,
      };

      const { data: shipRow, error: shipErr } = await supabase
        .from("shipments")
        .insert(shipPayload)
        .select("id")
        .single();

      if (shipErr) throw shipErr;
      const shipmentId = shipRow.id as string;

      for (const doc of documents) {
        if (!doc.file) continue;
        const { file_name, file_url } = await uploadDeclarationDocument(userId, doc.file);
        const { error: docErr } = await supabase.from("documents").insert({
          shipment_id: shipmentId,
          user_id: userId,
          doc_type: doc.doc_type,
          file_name,
          file_url,
          extracted_data: {},
          verification_status: "pending",
          mismatch_fields: [],
        });
        if (docErr) throw docErr;
      }

      const filledItems = items.filter((i) => i.item_name.trim() && i.hs_code.trim());
      for (const row of filledItems) {
        let legal: unknown[] = [];
        const raw = row.legal_references.trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            legal = Array.isArray(parsed) ? parsed : [];
          } catch {
            legal = [];
          }
        }
        const { error: itemErr } = await supabase.from("declaration_items").insert({
          shipment_id: shipmentId,
          item_name: row.item_name.trim(),
          hs_code: row.hs_code.trim(),
          quantity: parseFloat(row.quantity) || 0,
          unit_value: parseFloat(row.unit_value) || 0,
          country_of_origin: row.country_of_origin.trim(),
          legal_references: legal,
        });
        if (itemErr) throw itemErr;
      }

      toast.success(mode === "draft" ? "Draft saved." : "Declaration submitted.");

      setShipment(emptyShipment());
      setDocuments([{ id: newRowId(), doc_type: "invoice", file: null }]);
      setItems([
        {
          id: newRowId(),
          item_name: "",
          hs_code: "",
          quantity: "",
          unit_value: "",
          country_of_origin: "",
          legal_references: "",
        },
      ]);
    } catch (e: unknown) {
      toast.error(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Declarations"
        title="Customs declaration"
        description="Capture shipment details, supporting documents, and line-level tariff information in one structured workflow."
      />

      {!workspaceReady && (
        <p className="mb-6 text-sm text-muted-foreground rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          Saving is disabled until your workspace connection is active. You can still review the form layout below.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8">
        <div className="space-y-8 max-w-3xl xl:max-w-none">
          {/* Shipment */}
          <Card className="rounded-2xl border-border/60 shadow-card overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-lg font-semibold tracking-tight">
                    Shipment overview
                  </CardTitle>
                  <CardDescription>
                    Reference, routing, and goods description for this movement.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="shipment_number">Shipment reference</Label>
                  <Input
                    id="shipment_number"
                    value={shipment.shipment_number}
                    onChange={(e) => patchShipment({ shipment_number: e.target.value })}
                    placeholder="e.g. SHP-…"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Must be unique across your workspace.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="product_description">Goods description</Label>
                  <Textarea
                    id="product_description"
                    rows={4}
                    value={shipment.product_description}
                    onChange={(e) => patchShipment({ product_description: e.target.value })}
                    placeholder="Materials, use, specifications, packaging…"
                    className="resize-y min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="origin_country">Country of origin</Label>
                  <Input
                    id="origin_country"
                    value={shipment.origin_country}
                    onChange={(e) => patchShipment({ origin_country: e.target.value })}
                    placeholder="e.g. China"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination_country">Destination</Label>
                  <Input
                    id="destination_country"
                    value={shipment.destination_country}
                    onChange={(e) => patchShipment({ destination_country: e.target.value })}
                    placeholder="e.g. United States"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Workflow status</Label>
                  <Select
                    value={shipment.status}
                    onValueChange={(v) =>
                      patchShipment({ status: v as ShipmentForm["status"] })
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIPMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hs_code">Primary tariff code</Label>
                  <Input
                    id="hs_code"
                    value={shipment.hs_code}
                    onChange={(e) => patchShipment({ hs_code: e.target.value })}
                    placeholder="e.g. 8518.30.20"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPinned className="h-4 w-4 text-muted-foreground" />
                Logistics &amp; equipment
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="container_id">Container</Label>
                  <Input
                    id="container_id"
                    value={shipment.container_id}
                    onChange={(e) => patchShipment({ container_id: e.target.value })}
                    placeholder="Identifier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_plate">License plate</Label>
                  <Input
                    id="license_plate"
                    value={shipment.license_plate}
                    onChange={(e) => patchShipment({ license_plate: e.target.value })}
                    placeholder="Vehicle registration"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Seal condition</Label>
                  <Select
                    value={shipment.seal_status}
                    onValueChange={(v) =>
                      patchShipment({ seal_status: v as ShipmentForm["seal_status"] })
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEAL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SEAL_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <div className="space-y-2">
                    <Label htmlFor="current_lat">Latitude</Label>
                    <Input
                      id="current_lat"
                      type="number"
                      step="any"
                      value={shipment.current_lat}
                      onChange={(e) => patchShipment({ current_lat: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="current_lng">Longitude</Label>
                    <Input
                      id="current_lng"
                      type="number"
                      step="any"
                      value={shipment.current_lng}
                      onChange={(e) => patchShipment({ current_lng: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Risk band</Label>
                  <Select
                    value={shipment.risk_level}
                    onValueChange={(v) =>
                      patchShipment({ risk_level: v as ShipmentForm["risk_level"] })
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RISK_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="risk_score">Risk score</Label>
                  <Input
                    id="risk_score"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={shipment.risk_score}
                    onChange={(e) => patchShipment({ risk_score: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Scale from 0 to 100.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clearance_time_hours">Clearance time</Label>
                  <Input
                    id="clearance_time_hours"
                    type="number"
                    step={0.01}
                    value={shipment.clearance_time_hours}
                    onChange={(e) => patchShipment({ clearance_time_hours: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Hours from filing to release.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="risk_explanation">Risk narrative</Label>
                  <Textarea
                    id="risk_explanation"
                    rows={3}
                    value={shipment.risk_explanation}
                    onChange={(e) => patchShipment({ risk_explanation: e.target.value })}
                    placeholder="Summarize rationale for the assessed risk level."
                  />
                </div>
              </div> */}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="rounded-2xl border-border/60 shadow-card overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Files className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold tracking-tight">
                      Supporting documents
                    </CardTitle>
                    <CardDescription>
                      Attach invoices, lists, certificates, or transport documents for this shipment.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDocRow}
                  className="gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add attachment
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {documents.map((doc, index) => (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border/60 bg-background/50 p-4 flex flex-col lg:flex-row lg:items-end gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <Label className="text-muted-foreground">Document type</Label>
                    <Select
                      value={doc.doc_type}
                      onValueChange={(v) =>
                        updateDocRow(doc.id, { doc_type: v as DocType })
                      }
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {DOC_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex-[1.5] min-w-0">
                    <Label className="text-muted-foreground">
                      File {index + 1}
                    </Label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="cursor-pointer bg-background"
                      onChange={(e) =>
                        updateDocRow(doc.id, {
                          file: e.target.files?.[0] ?? null,
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDocRow(doc.id)}
                    disabled={documents.length <= 1}
                    aria-label="Remove attachment row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Line items */}
          <Card className="rounded-2xl border-border/60 shadow-card overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ListOrdered className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold tracking-tight">
                      Declaration line items
                    </CardTitle>
                    <CardDescription>
                      Rows that include both a product description and a tariff code are saved with your declaration.
                      Extended values are calculated automatically from quantity and unit value.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItemRow}
                  className="gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {items.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-border/60 bg-background/50 p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Line {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItemRow(row.id)}
                      disabled={items.length <= 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Product description</Label>
                      <Input
                        value={row.item_name}
                        onChange={(e) => updateItemRow(row.id, { item_name: e.target.value })}
                        placeholder="e.g. Wireless headphones"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tariff code</Label>
                      <Input
                        value={row.hs_code}
                        onChange={(e) => updateItemRow(row.id, { hs_code: e.target.value })}
                        placeholder="e.g. 85183020"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Country of origin</Label>
                      <Input
                        value={row.country_of_origin}
                        onChange={(e) =>
                          updateItemRow(row.id, { country_of_origin: e.target.value })
                        }
                        placeholder="e.g. Vietnam"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => updateItemRow(row.id, { quantity: e.target.value })}
                        placeholder="500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit value</Label>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={row.unit_value}
                        onChange={(e) => updateItemRow(row.id, { unit_value: e.target.value })}
                        placeholder="49.00"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Advisor citations (optional)</Label>
                      <Textarea
                        rows={2}
                        value={row.legal_references}
                        onChange={(e) =>
                          updateItemRow(row.id, { legal_references: e.target.value })
                        }
                        placeholder="Paste structured notes from your classification advisor when available."
                        className="resize-y text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <Button
              variant="outline"
              disabled={saving || !workspaceReady}
              className="gap-2 min-w-[140px]"
              onClick={() => void persist("draft")}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save draft
            </Button>
            <Button
              className="bg-gradient-ocean shadow-glow gap-2 min-w-[160px]"
              disabled={saving || !workspaceReady}
              onClick={() => void persist("submit")}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit declaration
            </Button>
          </div>
        </div>

        {/* Assistant */}
        <aside className="xl:sticky xl:top-24 h-fit">
          <Card className="rounded-2xl border-primary-deep/30 bg-gradient-to-br from-primary via-primary to-primary-deep text-primary-foreground shadow-elegant overflow-hidden">
            <CardHeader className="border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-white tracking-tight">
                    Classification assistant
                  </CardTitle>
                  <p className="text-xs text-white/75 mt-0.5">
                    Suggestions only — always verify with official tariff tools.
                  </p>
                </div>
              </div>
            </CardHeader>

            <div className="grid grid-cols-2 gap-2 px-6 pt-4">
              <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/10">
                <Lightbulb className="h-4 w-4 text-amber-200 mb-1.5" />
                <div className="text-[10px] uppercase tracking-wider text-white/60 font-medium">
                  Suggested code
                </div>
                <div className="text-sm font-semibold mt-0.5 tabular-nums">8518.30.20</div>
              </div>
              <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/10">
                <BookOpen className="h-4 w-4 text-sky-200 mb-1.5" />
                <div className="text-[10px] uppercase tracking-wider text-white/60 font-medium">
                  Compliance hints
                </div>
                <div className="text-sm font-semibold mt-0.5">Per line item</div>
              </div>
            </div>

            <CardContent className="space-y-3 pt-4 pb-2 max-h-[320px] overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                  {m.role === "ai" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/10">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[88%] ${
                      m.role === "user"
                        ? "bg-white text-primary-deep shadow-sm"
                        : "bg-white/12 text-white ring-1 ring-white/10"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </CardContent>

            <div className="p-4 pt-2 border-t border-white/10">
              <div className="flex gap-2 rounded-xl bg-white/10 p-1.5 ring-1 ring-white/10">
                <input
                  readOnly
                  placeholder="Assistant preview — chat coming soon."
                  className="flex-1 bg-transparent outline-none px-2.5 text-sm placeholder:text-white/45 text-white/90 cursor-not-allowed"
                />
                <Button
                  size="sm"
                  disabled
                  className="h-9 shrink-0 bg-white/95 text-primary hover:bg-white"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
