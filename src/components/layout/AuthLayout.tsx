import { Outlet } from "react-router-dom";
import { Container } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-muted/30 to-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-6 h-16 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-ocean flex items-center justify-center shadow-glow">
            <Container className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <span className="text-sm font-bold tracking-tight">Zero-Stop E-Border</span>
            <p className="text-[11px] text-muted-foreground">Secure workspace access</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <Outlet />
      </main>
    </div>
  );
}
