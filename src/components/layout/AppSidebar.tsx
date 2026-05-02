import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  MapPin,
  AlertTriangle,
  ScanLine,
  Settings,
  Container,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Smart Declaration", url: "/declaration", icon: FileText },
  { title: "Document Verification", url: "/verification", icon: ShieldCheck },
  { title: "Shipment Tracking", url: "/tracking", icon: MapPin },
  { title: "Risk Analysis", url: "/risk", icon: AlertTriangle },
  { title: "Border Gate", url: "/gate", icon: ScanLine },
  { title: "Admin Panel", url: "/admin", icon: Settings },
];

export function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 h-16 flex items-center gap-3 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-xl bg-gradient-ocean flex items-center justify-center shadow-glow">
          <Container className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">Zero-Stop</div>
          <div className="text-[11px] text-sidebar-foreground/70 tracking-wider">E-BORDER · AI</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/50">
          OPERATIONS
        </div>
        {items.map((item) => {
          const active = pathname === item.url;
          return (
            <NavLink
              key={item.url}
              to={item.url}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-base",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
              )}
            >
              <item.icon className={cn("h-4.5 w-4.5 shrink-0", active ? "text-sidebar-primary-foreground" : "")} />
              <span>{item.title}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/90" />}
            </NavLink>
          );
        })}
      </nav>

      <div className="m-3 p-4 rounded-xl bg-sidebar-accent/60 border border-sidebar-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-semibold text-white">AI Engine Online</span>
        </div>
        <p className="text-[11px] text-sidebar-foreground/70 leading-relaxed">
          Models v4.2 · 99.7% uptime · Last sync 2s ago
        </p>
      </div>
    </aside>
  );
}
