import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Upload, FileText, Send, Bot, Lightbulb, BookOpen, Check } from "lucide-react";

export default function Declaration() {
  const [messages] = useState([
    { role: "ai", text: "Hi! I'm your AI Customs Assistant. Describe your goods and I'll suggest HS codes, duties, and required permits." },
    { role: "user", text: "We're importing wireless bluetooth headphones, 500 units." },
    { role: "ai", text: "Recommended HS Code: 8518.30.20 — Headphones with built-in microphone. Suggested duty: 5%. ⚠️ Requires CE conformity certificate." },
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Declarations"
        title="Smart Declaration"
        description="Submit a new shipment with AI-assisted classification, validation, and document checks."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-card">
            <h3 className="text-base font-semibold text-foreground mb-1">Shipment Information</h3>
            <p className="text-sm text-muted-foreground mb-6">All fields validated in real time by the AI engine.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="exp">Exporter</Label>
                <Input id="exp" placeholder="Acme Trading Co. Ltd." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp">Importer</Label>
                <Input id="imp" placeholder="Caspian Imports LLC" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin">Country of Origin</Label>
                <Input id="origin" placeholder="China" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest">Destination</Label>
                <Input id="dest" placeholder="Azerbaijan — Baku Port" />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="desc">Product Description</Label>
                <Textarea id="desc" rows={4} placeholder="Describe goods in detail (material, use, specifications)…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val">Declared Value (USD)</Label>
                <Input id="val" type="number" placeholder="24,500" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hs">HS Code <span className="text-primary text-xs ml-1">(AI suggested)</span></Label>
                <Input id="hs" placeholder="8518.30.20" defaultValue="8518.30.20" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-card">
            <h3 className="text-base font-semibold text-foreground mb-4">Supporting Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: "Commercial Invoice", uploaded: true },
                { name: "Packing List", uploaded: true },
                { name: "Bill of Lading", uploaded: false },
                { name: "Certificate of Origin", uploaded: false },
              ].map((d) => (
                <div key={d.name} className={`rounded-xl border-2 border-dashed p-4 transition-base cursor-pointer ${
                  d.uploaded ? "border-success/40 bg-success-soft/40" : "border-border hover:border-primary hover:bg-accent/40"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      d.uploaded ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {d.uploaded ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.uploaded ? "invoice_8821.pdf · 1.2 MB" : "Click to upload"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline">Save Draft</Button>
            <Button className="bg-gradient-ocean shadow-glow gap-2">
              <Send className="h-4 w-4" /> Submit Declaration
            </Button>
          </div>
        </div>

        {/* AI Assistant */}
        <div className="bg-gradient-primary text-white rounded-2xl border border-primary-deep shadow-elegant overflow-hidden flex flex-col h-[700px] sticky top-20">
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center animate-pulse-glow">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-semibold">AI Customs Assistant</div>
                <div className="text-xs text-white/70 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online · GPT-Customs v4
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-white/10 grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-lg p-2.5">
              <Lightbulb className="h-4 w-4 text-warning mb-1" />
              <div className="text-[10px] uppercase text-white/60 tracking-wider">HS Suggest</div>
              <div className="text-sm font-semibold">8518.30.20</div>
            </div>
            <div className="bg-white/10 rounded-lg p-2.5">
              <BookOpen className="h-4 w-4 text-primary-glow mb-1" />
              <div className="text-[10px] uppercase text-white/60 tracking-wider">Legal Refs</div>
              <div className="text-sm font-semibold">3 articles</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "ai" && (
                  <div className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%] ${
                  m.role === "user" ? "bg-white text-primary-deep" : "bg-white/10 text-white"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2 bg-white/10 rounded-xl p-1.5">
              <input
                placeholder="Ask the AI assistant…"
                className="flex-1 bg-transparent outline-none px-2 text-sm placeholder:text-white/50"
              />
              <Button size="sm" className="bg-white text-primary hover:bg-white/90 h-8">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
