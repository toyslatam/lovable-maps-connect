import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BusinessKind = "panaderia" | "pasteleria" | "mixto" | "otro";

export function inferBusinessKind(raw: string): BusinessKind {
  const s = (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s.includes("mixt")) return "mixto";
  if (s.includes("pastel")) return "pasteleria";
  if (s.includes("panad")) return "panaderia";
  return "otro";
}

const kindStyles: Record<BusinessKind, { label: string; className: string }> = {
  panaderia: { label: "Panadería", className: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300" },
  pasteleria: { label: "Pastelería", className: "bg-violet-500/15 text-violet-800 border-violet-500/30 dark:text-violet-300" },
  mixto: { label: "Mixto", className: "bg-amber-500/15 text-amber-900 border-amber-500/35 dark:text-amber-200" },
  otro: { label: "Tipo negocio", className: "bg-muted text-muted-foreground border-border" },
};

export type HeaderContenidoProps = {
  name: string;
  address: string;
  city: string;
  businessTypeRaw: string;
  contentStatusOptions: readonly string[];
  contentStatus: string;
  onContentStatusChange: (v: string) => void;
  onSaveStatus: () => void;
  savingStatus: boolean;
  globalStatus: "cumple" | "revisar" | "no_cumple";
  kgInfoTooltip: ReactNode;
};

export function HeaderContenido({
  name,
  address,
  city,
  businessTypeRaw,
  contentStatusOptions,
  contentStatus,
  onContentStatusChange,
  onSaveStatus,
  savingStatus,
  globalStatus,
  kgInfoTooltip,
}: HeaderContenidoProps) {
  const statusSelectValue = (contentStatus || "").trim() || "__empty__";

  const kind = inferBusinessKind(businessTypeRaw);
  const badge = kindStyles[kind];
  const displayType = kind === "otro" && businessTypeRaw.trim() ? businessTypeRaw.trim() : badge.label;

  const globalRing =
    globalStatus === "cumple"
      ? "border-emerald-500/40 bg-emerald-500/[0.06]"
      : globalStatus === "revisar"
        ? "border-amber-500/40 bg-amber-500/[0.06]"
        : "border-destructive/40 bg-destructive/[0.06]";

  return (
    <div className={cn("rounded-xl border p-4 shadow-sm transition-colors duration-200", globalRing)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{name}</h2>
            <span
              className={cn(
                "inline-flex max-w-[min(100%,280px)] items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                badge.className,
              )}
              title={businessTypeRaw || "Columna H"}
            >
              <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
              <span className="truncate">{displayType}</span>
            </span>
            <span className="text-xs font-medium text-muted-foreground">Estado contenido</span>
            <Select
              value={statusSelectValue}
              onValueChange={(v) => onContentStatusChange(v === "__empty__" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-[min(100%,220px)] max-w-full text-xs">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">Sin estado</SelectItem>
                {contentStatusOptions
                  .filter((s) => s !== "__empty__")
                  .map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Ayuda conversión kg y levadura"
                >
                  <HelpCircle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-sm p-3 text-xs leading-relaxed">
                {kgInfoTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            {[city, address].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onSaveStatus} disabled={savingStatus}>
            {savingStatus ? "Guardando estado…" : "Guardar estado"}
          </Button>
        </div>
      </div>
    </div>
  );
}
