import { AlertTriangle, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QuantityCardParseStatus } from "@/lib/contentConversions";
import { FLOUR_UNIT_OPTIONS } from "@/lib/contentConversions";

export type LineStatus = "ok" | "warn" | "error";

export type CantidadesCardProps = {
  title: string;
  num: string;
  unit: string;
  onNumChange: (v: string) => void;
  onUnitChange: (v: string) => void;
  kg: number | null;
  parseStatus: QuantityCardParseStatus;
  lineStatus: LineStatus;
  footerHint?: string;
};

function StatusIcon({ status }: { status: LineStatus }) {
  if (status === "ok") return <Check className="size-3.5 text-emerald-600" aria-hidden />;
  if (status === "warn") return <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />;
  return <X className="size-3.5 text-destructive" aria-hidden />;
}

function statusLabel(status: LineStatus, parseStatus: QuantityCardParseStatus): string {
  if (status === "error") return "Error";
  if (parseStatus === "formato ambiguo") return "Revisar formato";
  if (parseStatus === "sin dato") return "Sin dato";
  if (status === "ok") return "OK";
  return "Revisar";
}

export function CantidadesCard({
  title,
  num,
  unit,
  onNumChange,
  onUnitChange,
  kg,
  parseStatus,
  lineStatus,
  footerHint,
}: CantidadesCardProps) {
  const border =
    lineStatus === "ok"
      ? "border-emerald-500/25 bg-emerald-500/[0.03]"
      : lineStatus === "warn"
        ? "border-amber-500/30 bg-amber-500/[0.04]"
        : "border-destructive/35 bg-destructive/[0.04]";

  return (
    <div className={cn("rounded-lg border p-3 shadow-sm transition-all duration-200", border)}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={num}
          onChange={(e) => onNumChange(e.target.value)}
          placeholder="0"
          className="h-9 max-w-[7rem] font-mono text-sm tabular-nums"
          aria-label={`${title} cantidad`}
        />
        <Select value={unit} onValueChange={onUnitChange}>
          <SelectTrigger className="h-9 w-[6.5rem] shrink-0 text-xs" aria-label={`${title} unidad`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLOUR_UNIT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        ≈{" "}
        <span className="font-medium text-foreground">
          {kg === null ? "—" : `${kg.toFixed(2)} kg`}
        </span>{" "}
        equiv.
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <StatusIcon status={lineStatus} />
        <span
          className={cn(
            "font-medium",
            lineStatus === "ok" && "text-emerald-700 dark:text-emerald-400",
            lineStatus === "warn" && "text-amber-700 dark:text-amber-400",
            lineStatus === "error" && "text-destructive",
          )}
        >
          {statusLabel(lineStatus, parseStatus)}
        </span>
      </div>
      {footerHint ? <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{footerHint}</p> : null}
    </div>
  );
}
