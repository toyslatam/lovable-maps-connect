import { Check, X, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ValidationPanelProps = {
  ratio: number | null;
  ratioRuleLabel: string;
  yeastQualityDetail: string;
  yeastQualityOk: boolean;
  yeastQualityWarn: boolean;
  priceDetail: string;
  priceOk: boolean;
  priceWarn: boolean;
  consistenciaDetail: string;
  consistenciaOk: boolean;
  consistenciaWarn: boolean;
  dbDetail: string;
  dbOk: boolean;
  dbWarn: boolean;
  phoneCompareDetail: string;
  phoneCompareOk: boolean;
  phoneCompareWarn: boolean;
};

function Row({
  title,
  ok,
  warn,
  detail,
}: {
  title: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border bg-background/60 px-3 py-2.5">
      <span className="mt-0.5 shrink-0">
        {ok ? (
          <Check className="size-4 text-emerald-600" aria-hidden />
        ) : warn ? (
          <AlertTriangle className="size-4 text-amber-600" aria-hidden />
        ) : (
          <X className="size-4 text-destructive" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{detail}</p>
      </div>
    </div>
  );
}

export function ValidationPanel({
  ratio,
  ratioRuleLabel,
  yeastQualityDetail,
  yeastQualityOk,
  yeastQualityWarn,
  priceDetail,
  priceOk,
  priceWarn,
  consistenciaDetail,
  consistenciaOk,
  consistenciaWarn,
  dbDetail,
  dbOk,
  dbWarn,
  phoneCompareDetail,
  phoneCompareOk,
  phoneCompareWarn,
}: ValidationPanelProps) {
  return (
    <div className="space-y-2 rounded-xl border border-primary/15 bg-gradient-to-b from-primary/[0.04] to-transparent p-3 shadow-sm sm:p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Validación</span>
        <Info className="size-3.5 text-muted-foreground" aria-hidden />
      </div>

      <div className="rounded-md border border-border/80 bg-card/90 p-3">
        <p className="text-xs font-medium text-muted-foreground">Harina vs levadura (ratio)</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {ratio === null ? "—" : ratio.toFixed(4)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{ratioRuleLabel}</p>
      </div>

      <div className="grid gap-2">
        <Row
          title="Ratio levadura / harina"
          ok={yeastQualityOk}
          warn={yeastQualityWarn}
          detail={yeastQualityDetail}
        />
        <Row
          title="Precios de compra"
          ok={priceOk}
          warn={priceWarn}
          detail={priceDetail}
        />
        <Row
          title="Consistencia M ≈ N + O"
          ok={consistenciaOk}
          warn={consistenciaWarn}
          detail={consistenciaDetail}
        />
        <Row
          title="Control DB (CG vs CD)"
          ok={dbOk}
          warn={dbWarn}
          detail={dbDetail}
        />
        <Row
          title="Comparación telefónico vs hoja"
          ok={phoneCompareOk}
          warn={phoneCompareWarn}
          detail={
            phoneCompareDetail === "Coincide"
              ? "Cantidades alineadas (±15%)."
              : phoneCompareDetail === "No coincide"
                ? "Diferencias por encima del umbral."
                : "Sin datos comparables."
          }
        />
      </div>
    </div>
  );
}

export function GlobalOutcomeBadge({ status }: { status: "cumple" | "revisar" | "no_cumple" }) {
  const cfg = {
    cumple: {
      emoji: "🟢",
      label: "Cumple",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
    },
    revisar: {
      emoji: "🟡",
      label: "Revisar",
      className: "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
    },
    no_cumple: {
      emoji: "🔴",
      label: "No cumple",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition-colors",
        cfg.className,
      )}
    >
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </span>
  );
}
