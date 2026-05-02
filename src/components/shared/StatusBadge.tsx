import { cn } from "@/lib/utils";

type Status = "valid" | "warning" | "fraud" | "pending" | "cleared" | "hold";

const styles: Record<Status, string> = {
  valid: "bg-success-soft text-success border-success/20",
  cleared: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning-foreground border-warning/30",
  pending: "bg-warning-soft text-warning-foreground border-warning/30",
  fraud: "bg-destructive-soft text-destructive border-destructive/20",
  hold: "bg-destructive-soft text-destructive border-destructive/20",
};

const labels: Record<Status, string> = {
  valid: "Valid",
  cleared: "Cleared",
  warning: "Warning",
  pending: "Pending",
  fraud: "Fraud Risk",
  hold: "On Hold",
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
      styles[status]
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === "valid" || status === "cleared" ? "bg-success" :
        status === "warning" || status === "pending" ? "bg-warning" : "bg-destructive"
      )} />
      {label ?? labels[status]}
    </span>
  );
}
