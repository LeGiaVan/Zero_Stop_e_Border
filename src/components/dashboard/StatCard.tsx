import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive?: boolean };
  variant?: "default" | "success" | "warning" | "danger" | "primary";
}

const variantStyles = {
  default: "bg-card",
  success: "bg-card",
  warning: "bg-card",
  danger: "bg-card",
  primary: "bg-gradient-primary text-white",
};

const iconStyles = {
  default: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  primary: "bg-white/15 text-white",
};

export function StatCard({ label, value, icon: Icon, trend, variant = "default" }: StatCardProps) {
  const isPrimary = variant === "primary";
  return (
    <div className={cn(
      "rounded-2xl p-5 shadow-card border border-border/60 transition-base hover:shadow-elegant hover:-translate-y-0.5",
      variantStyles[variant]
    )}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <span className={cn("text-xs font-medium uppercase tracking-wider", isPrimary ? "text-white/80" : "text-muted-foreground")}>
          {label}
        </span>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className={cn("text-3xl font-bold tracking-tight", isPrimary ? "text-white" : "text-foreground")}>
          {value}
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md",
            isPrimary ? "bg-white/15 text-white" :
            trend.positive ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
          )}>
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
