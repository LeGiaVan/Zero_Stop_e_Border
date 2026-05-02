import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, CheckCircle2, ScanLine } from "lucide-react";

const fields = [
  { label: "Exporter", declared: "Acme Trading Co.", extracted: "Acme Trading Co. Ltd.", match: "warning" as const },
  { label: "HS Code", declared: "8518.30.20", extracted: "8518.30.20", match: "valid" as const },
  { label: "Quantity", declared: "500 units", extracted: "500 units", match: "valid" as const },
  { label: "Declared Value", declared: "$24,500", extracted: "$31,200", match: "fraud" as const },
  { label: "Country of Origin", declared: "China", extracted: "China", match: "valid" as const },
  { label: "Net Weight", declared: "180 kg", extracted: "182.5 kg", match: "valid" as const },
];

export default function Verification() {
  return (
    <>
      <PageHeader
        eyebrow="AI Verification"
        title="Document Verification"
        description="OCR + ML cross-checks declaration data against uploaded documents to flag mismatches."
        actions={<Button className="bg-gradient-ocean shadow-glow gap-2"><ScanLine className="h-4 w-4" /> Re-scan</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Documents Scanned</div>
          <div className="text-3xl font-bold mt-1.5">4</div>
        </div>
        <div className="bg-success-soft border border-success/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-success font-semibold">Valid Fields</div>
          <div className="text-3xl font-bold mt-1.5 text-success">4</div>
        </div>
        <div className="bg-warning-soft border border-warning/30 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-warning-foreground font-semibold">Warnings</div>
          <div className="text-3xl font-bold mt-1.5 text-warning-foreground">1</div>
        </div>
        <div className="bg-destructive-soft border border-destructive/20 rounded-2xl p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-destructive font-semibold">Fraud Risks</div>
          <div className="text-3xl font-bold mt-1.5 text-destructive">1</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {[
          { name: "Commercial Invoice", page: "Page 1 of 2", status: "valid" as const },
          { name: "Packing List", page: "Page 1 of 1", status: "warning" as const },
        ].map((doc) => (
          <div key={doc.name} className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{doc.name}</div>
                  <div className="text-xs text-muted-foreground">{doc.page}</div>
                </div>
              </div>
              <StatusBadge status={doc.status} />
            </div>
            <div className="aspect-[4/3] bg-gradient-to-br from-muted to-secondary relative overflow-hidden">
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
              <div className="absolute inset-6 bg-card rounded-md shadow-inner p-4 space-y-2">
                {[90, 60, 80, 45, 70, 50, 65].map((w, i) => (
                  <div key={i} className="h-2 rounded bg-muted" style={{ width: `${w}%` }} />
                ))}
              </div>
              <div className="absolute bottom-3 right-3 bg-card/95 backdrop-blur px-2.5 py-1 rounded-md text-xs font-semibold text-primary border border-border">
                OCR Confidence 98.4%
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
        <div className="p-6 border-b border-border/60">
          <h3 className="text-base font-semibold">Side-by-side Comparison</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Declaration vs. extracted document data — mismatches highlighted.</p>
        </div>
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
              {fields.map((f) => (
                <tr key={f.label} className={`border-b border-border/40 ${
                  f.match === "fraud" ? "bg-destructive-soft/40" : f.match === "warning" ? "bg-warning-soft/40" : ""
                }`}>
                  <td className="px-6 py-4 font-medium text-foreground">{f.label}</td>
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{f.declared}</td>
                  <td className={`px-6 py-4 font-mono text-xs ${
                    f.match === "fraud" ? "text-destructive font-semibold" :
                    f.match === "warning" ? "text-warning-foreground font-semibold" : "text-muted-foreground"
                  }`}>{f.extracted}</td>
                  <td className="px-6 py-4">
                    {f.match === "valid" ? (
                      <div className="inline-flex items-center gap-1.5 text-success text-xs font-semibold">
                        <CheckCircle2 className="h-4 w-4" /> Match
                      </div>
                    ) : (
                      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        f.match === "fraud" ? "text-destructive" : "text-warning-foreground"
                      }`}>
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
      </div>
    </>
  );
}