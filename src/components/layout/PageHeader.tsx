import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-semibold tracking-[0.2em] text-primary mb-2 uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
