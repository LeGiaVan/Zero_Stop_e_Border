import { useCallback, useMemo, useState, useEffect, useRef } from "react";
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
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { requestDeclarationDocumentProcessing } from "@/lib/declarationAiPipeline";
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
  if (lower.includes("row-level security") || lower.includes("violates row-level")) {
    return "This action could not be completed due to account permissions or security policies. Contact your administrator.";
  }
  if (lower.includes("policy") || lower.includes("permission") || lower.includes("rls")) {
    return "You don’t have permission to complete this action. Contact your administrator.";
  }
  if (lower.includes("pdf")) {
    return "Supporting documents must be PDF files. Remove non-PDF attachments and try again.";
  }
  if (lower.includes("storage") || lower.includes("upload")) {
    return "One or more files could not be uploaded. Check your connection and try again.";
  }
  return "Something went wrong while saving. Please try again in a moment.";
}

interface ShipmentForm {
  shipment_number: string;
  exporter_name: string;
  importer_name: string;
  product_description: string;
  origin_country: string;
  destination_country: string;
  status: (typeof SHIPMENT_STATUSES)[number];
  hs_code: string;
  customs_regime: string;
  customs_department: string;
  transport_method: string;
  bl_number: string;
  total_packages: string;
  total_gross_weight: string;
  estimated_departure_date: string;
  incoterms: string;
  invoice_currency: string;
  total_invoice_value: string;
  payment_method: string;
  container_id: string;
}

function emptyShipment(): ShipmentForm {
  return {
    shipment_number: genShipmentNumber(),
    exporter_name: "",
    importer_name: "",
    product_description: "",
    origin_country: "",
    destination_country: "",
    status: "pending",
    hs_code: "",
    customs_regime: "",
    customs_department: "",
    transport_method: "",
    bl_number: "",
    total_packages: "",
    total_gross_weight: "",
    estimated_departure_date: "",
    incoterms: "",
    invoice_currency: "",
    total_invoice_value: "",
    payment_method: "",
    container_id: "",
  };
}

interface DocRow {
  id: string;
  doc_type: DocType;
  file: File | null;
  document_ref_number: string;
  document_date: string;
}

interface ItemRow {
  id: string;
  item_name: string;
  hs_code: string;
  quantity: string;
  quantity_unit: string;
  unit_value: string;
  taxable_value: string;
  country_of_origin: string;
  legal_references: string;
}

export default function Declaration() {
  useAuth();
  type ChatMessage = {
    id: string;
    role: "user" | "ai";
    text: string;
    buttons?: { label: string; action: string }[];
    buttonsHidden?: boolean;
  };

  const N8N_WEBHOOK_URL = "https://vanle044.app.n8n.cloud/webhook/6568dd1c-79bc-4110-a71f-733a9825d29a";
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      text: "Xin chào! Tôi là trợ lý AI. Vui lòng nhập tên và mô tả mặt hàng nông sản bạn cần tra cứu mã HS.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let storedSession = localStorage.getItem("chatbot_session_id");
    if (!storedSession) {
      storedSession = "session_" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("chatbot_session_id", storedSession);
    }
    setSessionId(storedSession);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping]);

  const sendDataToServer = useCallback(async (type: "text" | "button", payloadData: string, displayText: string) => {
    if (isTyping) return;

    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: displayText }]);
    setIsTyping(true);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          type: type,
          data: payloadData,
        }),
      });

      if (!response.ok) {
        throw new Error("Lỗi phản hồi từ server");
      }

      const responseData = await response.json();

      if (responseData.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "_bot",
            role: "ai",
            text: responseData.reply,
            buttons: responseData.buttons || []
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString() + "_err", role: "ai", text: 'Đã nhận phản hồi nhưng thiếu key "reply". Vui lòng kiểm tra lại n8n.' },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString() + "_err2", role: "ai", text: "Xin lỗi, không thể kết nối tới server. Vui lòng kiểm tra lại Webhook URL." },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, sessionId]);

  const handleSendText = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    void sendDataToServer("text", text, text);
  }, [inputText, sendDataToServer]);

  const handleButtonClick = useCallback((msgId: string, action: string, label: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, buttonsHidden: true } : m));
    void sendDataToServer("button", action, `[Đã chọn: ${label}]`);
  }, [sendDataToServer]);

  const [shipment, setShipment] = useState<ShipmentForm>(() => emptyShipment());
  const [documents, setDocuments] = useState<DocRow[]>([
    { id: newRowId(), doc_type: "invoice", file: null, document_ref_number: "", document_date: "" },
  ]);
  const [items, setItems] = useState<ItemRow[]>([
    {
      id: newRowId(),
      item_name: "",
      hs_code: "",
      quantity: "",
      quantity_unit: "",
      unit_value: "",
      taxable_value: "",
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
    setDocuments((d) => [
      ...d,
      { id: newRowId(), doc_type: "invoice", file: null, document_ref_number: "", document_date: "" },
    ]);

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
        quantity_unit: "",
        unit_value: "",
        taxable_value: "",
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
      toast.error("Saving requires an active workspace connection.");
      return;
    }

    const num = shipment.shipment_number.trim();
    if (!num) {
      toast.error("Enter a shipment reference to continue.");
      return;
    }

    const attachments = documents.filter((d) => d.file);
    for (const doc of attachments) {
      const fn = doc.file!.name.toLowerCase();
      if (!fn.endsWith(".pdf")) {
        toast.error("Supporting documents must be PDF files.");
        return;
      }
    }

    if (mode === "submit") {
      if (attachments.length === 0) {
        toast.error("Attach at least one PDF before submitting.");
        return;
      }
      const hasLineItem = items.some((i) => i.item_name.trim() && i.hs_code.trim());
      if (!hasLineItem) {
        toast.error("Add at least one line item with product name and HS code before submitting.");
        return;
      }
      const req = [
        [!shipment.exporter_name.trim(), "Enter the exporter name."],
        [!shipment.importer_name.trim(), "Enter the importer / consignee name."],
        [!shipment.customs_regime.trim(), "Select or enter the customs regime."],
        [!shipment.transport_method.trim(), "Enter the mode of transport."],
        [!shipment.incoterms.trim(), "Enter Incoterms (e.g. CIF, FOB)."],
        [!shipment.invoice_currency.trim(), "Enter invoice currency (e.g. USD)."],
      ] as const;
      for (const [fail, msg] of req) {
        if (fail) {
          toast.error(msg);
          return;
        }
      }
      const tiv = parseFloat(shipment.total_invoice_value.replace(/,/g, ""));
      if (!Number.isFinite(tiv) || tiv <= 0) {
        toast.error("Enter a valid total invoice amount greater than zero.");
        return;
      }
    }

    setSaving(true);
    let shipmentId: string | null = null;
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("unavailable");

      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      const authUid = session?.user?.id ?? null;
      if (sessionErr || !authUid) {
        toast.error("Your session could not be verified. Please sign in again.");
        return;
      }

      const pkg = parseFloat(shipment.total_packages.replace(/,/g, ""));
      const gw = parseFloat(shipment.total_gross_weight.replace(/,/g, ""));
      const tivNum = parseFloat(shipment.total_invoice_value.replace(/,/g, ""));
      const depDate = shipment.estimated_departure_date.trim();

      const statusOnSave =
        mode === "draft"
          ? "pending"
          : shipment.status === "pending"
            ? "in_review"
            : shipment.status;

      const shipPayload = {
        user_id: authUid,
        shipment_number: num,
        exporter_name: shipment.exporter_name.trim() || null,
        importer_name: shipment.importer_name.trim() || null,
        product_description: shipment.product_description.trim(),
        origin_country: shipment.origin_country.trim(),
        destination_country: shipment.destination_country.trim(),
        status: statusOnSave,
        risk_score: 0,
        risk_level: "low" as const,
        risk_explanation: "",
        clearance_time_hours: 0,
        hs_code: shipment.hs_code.trim(),
        container_id: shipment.container_id.trim() || "—",
        license_plate: "",
        seal_status: "intact" as const,
        current_lat: 0,
        current_lng: 0,
        customs_regime: shipment.customs_regime.trim() || null,
        customs_department: shipment.customs_department.trim() || null,
        transport_method: shipment.transport_method.trim() || null,
        bl_number: shipment.bl_number.trim() || null,
        total_packages: Number.isFinite(pkg) ? pkg : null,
        total_gross_weight: Number.isFinite(gw) ? gw : null,
        estimated_departure_date: depDate || null,
        incoterms: shipment.incoterms.trim() || null,
        invoice_currency: shipment.invoice_currency.trim() || null,
        total_invoice_value: Number.isFinite(tivNum) ? tivNum : null,
        payment_method: shipment.payment_method.trim() || null,
      };

      const { data: shipRow, error: shipErr } = await supabase
        .from("shipments")
        .insert(shipPayload)
        .select("id")
        .single();

      if (shipErr) throw shipErr;
      shipmentId = shipRow.id as string;

      const documentRows: Array<{
        shipment_id: string;
        user_id: string;
        doc_type: DocType;
        file_name: string;
        file_url: string;
        document_ref_number: string | null;
        document_date: string | null;
        extracted_data: Record<string, never>;
        verification_status: string;
        mismatch_fields: unknown[];
      }> = [];

      for (const doc of documents) {
        if (!doc.file) continue;
        const { file_name, file_url } = await uploadDeclarationDocument(authUid, doc.file);
        const ref = doc.document_ref_number.trim();
        const ddat = doc.document_date.trim();
        documentRows.push({
          shipment_id: shipmentId,
          user_id: authUid,
          doc_type: doc.doc_type,
          file_name,
          file_url,
          document_ref_number: ref || null,
          document_date: ddat || null,
          extracted_data: {},
          verification_status: "pending",
          mismatch_fields: [],
        });
      }

      if (documentRows.length > 0) {
        const { error: docErr } = await supabase.from("documents").insert(documentRows);
        if (docErr) throw docErr;
      }

      const filledItems = items.filter((i) => i.item_name.trim() && i.hs_code.trim());
      const itemRows = filledItems.map((row) => {
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
        const qtyUnit = row.quantity_unit.trim();
        const tvRaw = row.taxable_value.replace(/,/g, "").trim();
        const taxableParsed = tvRaw === "" ? null : parseFloat(tvRaw);
        return {
          shipment_id: shipmentId,
          item_name: row.item_name.trim(),
          hs_code: row.hs_code.trim(),
          quantity: parseFloat(row.quantity) || 0,
          quantity_unit: qtyUnit || null,
          unit_value: parseFloat(row.unit_value) || 0,
          taxable_value:
            taxableParsed !== null && Number.isFinite(taxableParsed) ? taxableParsed : null,
          country_of_origin: row.country_of_origin.trim(),
          legal_references: legal,
        };
      });

      if (itemRows.length > 0) {
        const { error: itemErr } = await supabase.from("declaration_items").insert(itemRows);
        if (itemErr) throw itemErr;
      }

      if (mode === "submit") {
        if (documentRows.length === 0 || itemRows.length === 0) {
          throw new Error("Submit did not persist documents and line items.");
        }
      }

      toast.success(mode === "draft" ? "Draft saved." : "Declaration submitted.");

      if (documentRows.length > 0) {
        void requestDeclarationDocumentProcessing(shipmentId).catch((err: unknown) => {
          console.warn("[declaration] Automated verification:", err);
          toast.warning("Declaration saved", {
            description:
              "Automated document verification did not finish. You can retry from Document Verification when convenient.",
          });
        });
      }

      setShipment(emptyShipment());
      setDocuments([{ id: newRowId(), doc_type: "invoice", file: null, document_ref_number: "", document_date: "" }]);
      setItems([
        {
          id: newRowId(),
          item_name: "",
          hs_code: "",
          quantity: "",
          quantity_unit: "",
          unit_value: "",
          taxable_value: "",
          country_of_origin: "",
          legal_references: "",
        },
      ]);
    } catch (e: unknown) {
      let suffix = "";
      if (shipmentId) {
        const rollback = getSupabaseBrowserClient();
        const { error: rollbackErr } = await rollback
          .from("shipments")
          .delete()
          .eq("id", shipmentId);
        if (rollbackErr) {
          suffix =
            " Related records may need to be reviewed by your administrator if this submission partially saved.";
        }
      }
      toast.error(friendlySaveError(e) + suffix);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Declarations"
        title="Customs declaration"
        description="Structured customs declaration: parties, regime and commercial terms, line items, and PDF attachments."
      />

      {!workspaceReady && (
        <p className="mb-6 text-sm text-muted-foreground rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          Saving requires an active workspace connection. You may continue reviewing the form below.
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
                    Reference, exporter / importer, customs regime, commercial terms, and cargo totals needed for an
                    import / export declaration.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8 pt-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Package className="h-4 w-4 text-muted-foreground" />
                Reference and parties
              </div>
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
                  <p className="text-xs text-muted-foreground">Unique per workspace.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exporter_name">Exporter / shipper</Label>
                  <Input
                    id="exporter_name"
                    value={shipment.exporter_name}
                    onChange={(e) => patchShipment({ exporter_name: e.target.value })}
                    placeholder="Legal name on commercial documents"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importer_name">Importer / consignee</Label>
                  <Input
                    id="importer_name"
                    value={shipment.importer_name}
                    onChange={(e) => patchShipment({ importer_name: e.target.value })}
                    placeholder="Legal name of buyer / consignee"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="product_description">Goods description (summary)</Label>
                  <Textarea
                    id="product_description"
                    rows={3}
                    value={shipment.product_description}
                    onChange={(e) => patchShipment({ product_description: e.target.value })}
                    placeholder="Overall description of the consignment"
                    className="resize-y min-h-[88px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="origin_country">Country of origin</Label>
                  <Input
                    id="origin_country"
                    value={shipment.origin_country}
                    onChange={(e) => patchShipment({ origin_country: e.target.value })}
                    placeholder="e.g. Korea"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination_country">Destination country / region</Label>
                  <Input
                    id="destination_country"
                    value={shipment.destination_country}
                    onChange={(e) => patchShipment({ destination_country: e.target.value })}
                    placeholder="e.g. Vietnam"
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
                  <Label htmlFor="hs_code">Header HS code (optional)</Label>
                  <Input
                    id="hs_code"
                    value={shipment.hs_code}
                    onChange={(e) => patchShipment({ hs_code: e.target.value })}
                    placeholder="e.g. 84213920"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Customs and commercial terms
              </div>
              <p className="text-xs text-muted-foreground -mt-4">
                Required for final submission: regime, transport, Incoterms, currency, and invoice total.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customs_regime">Customs regime</Label>
                  <Input
                    id="customs_regime"
                    value={shipment.customs_regime}
                    onChange={(e) => patchShipment({ customs_regime: e.target.value })}
                    placeholder="e.g. Import for production"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customs_department">Customs office / department</Label>
                  <Input
                    id="customs_department"
                    value={shipment.customs_department}
                    onChange={(e) => patchShipment({ customs_department: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transport_method">Mode of transport</Label>
                  <Input
                    id="transport_method"
                    value={shipment.transport_method}
                    onChange={(e) => patchShipment({ transport_method: e.target.value })}
                    placeholder="e.g. Sea, Air, Road"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl_number">B/L or AWB reference</Label>
                  <Input
                    id="bl_number"
                    value={shipment.bl_number}
                    onChange={(e) => patchShipment({ bl_number: e.target.value })}
                    placeholder="Bill of lading or airway bill number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="incoterms">Incoterms</Label>
                  <Input
                    id="incoterms"
                    value={shipment.incoterms}
                    onChange={(e) => patchShipment({ incoterms: e.target.value })}
                    placeholder="e.g. CIF, FOB"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment terms</Label>
                  <Input
                    id="payment_method"
                    value={shipment.payment_method}
                    onChange={(e) => patchShipment({ payment_method: e.target.value })}
                    placeholder="e.g. L/C, T/T"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice_currency">Invoice currency</Label>
                  <Input
                    id="invoice_currency"
                    value={shipment.invoice_currency}
                    onChange={(e) => patchShipment({ invoice_currency: e.target.value })}
                    placeholder="e.g. USD"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_invoice_value">Total invoice value</Label>
                  <Input
                    id="total_invoice_value"
                    type="text"
                    inputMode="decimal"
                    value={shipment.total_invoice_value}
                    onChange={(e) => patchShipment({ total_invoice_value: e.target.value })}
                    placeholder="e.g. 100000.00"
                  />
                </div>
              </div>

              <Separator />

              <div className="text-sm font-medium text-foreground">Cargo totals and logistics</div>
              <p className="text-xs text-muted-foreground -mt-4">
                Optional unless your procedure requires packages, gross weight, or equipment IDs.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_packages">Total packages</Label>
                  <Input
                    id="total_packages"
                    type="text"
                    inputMode="decimal"
                    value={shipment.total_packages}
                    onChange={(e) => patchShipment({ total_packages: e.target.value })}
                    placeholder="e.g. 120"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_gross_weight">Total gross weight</Label>
                  <Input
                    id="total_gross_weight"
                    type="text"
                    inputMode="decimal"
                    value={shipment.total_gross_weight}
                    onChange={(e) => patchShipment({ total_gross_weight: e.target.value })}
                    placeholder="kg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimated_departure_date">Estimated departure / shipment date</Label>
                  <Input
                    id="estimated_departure_date"
                    type="date"
                    value={shipment.estimated_departure_date}
                    onChange={(e) => patchShipment({ estimated_departure_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="container_id">Container / equipment ID</Label>
                  <Input
                    id="container_id"
                    value={shipment.container_id}
                    onChange={(e) => patchShipment({ container_id: e.target.value })}
                    placeholder="Leave blank if not applicable"
                  />
                  <p className="text-xs text-muted-foreground">
                    Saved as “—” when empty to satisfy required equipment fields on some deployments.
                  </p>
                </div>
              </div>
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
                      Attach PDF invoices, packing lists, certificates, or transport documents. Optionally record each
                      document&apos;s reference number and date to align with customs filings.
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
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border/60 bg-background/50 p-4 flex flex-col lg:flex-row lg:items-end gap-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-w-0">
                    <div className="space-y-2 md:col-span-2">
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
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Document reference no.</Label>
                      <Input
                        value={doc.document_ref_number}
                        onChange={(e) =>
                          updateDocRow(doc.id, { document_ref_number: e.target.value })
                        }
                        placeholder="Invoice / B/L number"
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Document date</Label>
                      <Input
                        type="date"
                        value={doc.document_date}
                        onChange={(e) =>
                          updateDocRow(doc.id, { document_date: e.target.value })
                        }
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-muted-foreground">PDF file</Label>
                      <Input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="cursor-pointer bg-background"
                        onChange={(e) =>
                          updateDocRow(doc.id, {
                            file: e.target.files?.[0] ?? null,
                          })
                        }
                      />
                    </div>
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
                      Each saved row includes product description and tariff code. Quantity unit and taxable value are
                      optional; extended totals derive from quantity × unit value where applicable.
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
                      <Label>Quantity unit</Label>
                      <Input
                        value={row.quantity_unit}
                        onChange={(e) => updateItemRow(row.id, { quantity_unit: e.target.value })}
                        placeholder="e.g. PCS, kg"
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
                    <div className="space-y-2">
                      <Label>Taxable value (optional)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.taxable_value}
                        onChange={(e) => updateItemRow(row.id, { taxable_value: e.target.value })}
                        placeholder="Per local rules"
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


            <CardContent
              ref={chatContainerRef}
              className="space-y-4 pt-4 pb-2 h-[380px] xl:h-[450px] overflow-y-auto"
            >
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex flex-col w-full ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`flex gap-2 max-w-[88%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {m.role === "ai" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/10 mt-0.5">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 min-w-0">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user"
                          ? "bg-white text-primary-deep shadow-sm"
                          : "bg-white/12 text-white ring-1 ring-white/10"
                          }`}
                        dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br>') }}
                      />

                      {m.role === "ai" && m.buttons && m.buttons.length > 0 && !m.buttonsHidden && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {m.buttons.map((btn, bIdx) => (
                            <button
                              key={bIdx}
                              onClick={() => handleButtonClick(m.id, btn.action, btn.label)}
                              className="bg-white/95 text-primary px-3 py-1.5 rounded-xl text-[13px] font-semibold hover:bg-white transition-colors border border-white/20 shadow-sm text-left"
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2 w-full">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/10">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-white/12 text-white/60 ring-1 ring-white/10 italic">
                    Hệ thống đang xử lý...
                  </div>
                </div>
              )}
            </CardContent>

            <div className="p-4 pt-2 border-t border-white/10">
              <div className="flex gap-2 rounded-xl bg-white/10 p-1.5 ring-1 ring-white/10">
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSendText();
                    }
                  }}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 bg-transparent outline-none px-2.5 text-sm placeholder:text-white/45 text-white/90"
                />
                <Button
                  size="sm"
                  disabled={isTyping || !inputText.trim()}
                  onClick={handleSendText}
                  className="h-9 shrink-0 bg-white/95 text-primary hover:bg-white disabled:opacity-50"
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
