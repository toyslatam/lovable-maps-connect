import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatYeastSheetCell, parseYeastQtyPrice } from "@/lib/yeastFieldFormat";

export type YeastRowDef = {
  id: string;
  label: string;
  /** Multiplicador para total ponderado (p.ej. 3 en “otras”) */
  weightMult: number;
  group: "fresca" | "seca";
};

const ROWS: YeastRowDef[] = [
  { id: "levapan", label: "Levapan", weightMult: 1, group: "fresca" },
  { id: "fleischman", label: "Fleischman", weightMult: 1, group: "fresca" },
  { id: "levasaf", label: "Levasaf", weightMult: 1, group: "fresca" },
  { id: "otherFresh", label: "Otra marca fresca", weightMult: 3, group: "fresca" },
  { id: "angel", label: "Angel", weightMult: 1, group: "seca" },
  { id: "panificador", label: "El Panificador", weightMult: 1, group: "seca" },
  { id: "fermipan", label: "Fermipan", weightMult: 1, group: "seca" },
  { id: "gloripan", label: "Gloripan", weightMult: 1, group: "seca" },
  { id: "instaferm", label: "Instaferm", weightMult: 1, group: "seca" },
  { id: "instantSucc", label: "Instant Succ", weightMult: 1, group: "seca" },
  { id: "mauripan", label: "Mauripan", weightMult: 1, group: "seca" },
  { id: "safInstant", label: "SAF Instant", weightMult: 1, group: "seca" },
  { id: "santillana", label: "Santillana", weightMult: 1, group: "seca" },
  { id: "otherDry", label: "Otra marca seca", weightMult: 3, group: "seca" },
];

export type YeastValues = Record<string, string>;

export type LevadurasGridProps = {
  values: YeastValues;
  onChange: (id: string, sheetText: string) => void;
  getKgFromText: (text: string) => number | null;
  flourKg: number | null;
  yeastTotalWeightedKg: number;
};

function YeastRow({
  def,
  text,
  onTextChange,
  getKgFromText,
  flourKg,
  yeastTotalWeightedKg,
}: {
  def: YeastRowDef;
  text: string;
  onTextChange: (t: string) => void;
  getKgFromText: (text: string) => number | null;
  flourKg: number | null;
  yeastTotalWeightedKg: number;
}) {
  const { qty, price } = parseYeastQtyPrice(text);
  const [q, setQ] = useState(qty);
  const [p, setP] = useState(price);

  useEffect(() => {
    const pr = parseYeastQtyPrice(text);
    setQ(pr.qty);
    setP(pr.price);
  }, [text]);

  const commit = (nextQ: string, nextP: string) => {
    onTextChange(formatYeastSheetCell(nextQ, nextP));
  };

  const baseKg = getKgFromText(formatYeastSheetCell(q, p)) ?? 0;
  const contribKg = baseKg * def.weightMult;
  const ratioImpact =
    flourKg && flourKg > 0 && yeastTotalWeightedKg > 0
      ? (contribKg / flourKg) * 100
      : null;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 rounded-md border bg-background/80 p-2.5 text-xs shadow-sm sm:grid-cols-[minmax(0,7rem)_1fr_1fr_minmax(0,140px)] sm:items-center",
      )}
    >
      <span className="font-medium text-foreground">{def.label}</span>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-[10px] text-muted-foreground">Cant.</span>
        <Input
          className="h-8 font-mono text-xs"
          inputMode="decimal"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            commit(v, p);
          }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-[10px] text-muted-foreground">Precio</span>
        <Input
          className="h-8 font-mono text-xs"
          inputMode="numeric"
          value={p}
          onChange={(e) => {
            const v = e.target.value;
            setP(v);
            commit(q, v);
          }}
        />
      </div>
      <div className="space-y-0.5 text-[10px] text-muted-foreground sm:text-right">
        <p>
          → Eq:{" "}
          <span className="font-medium text-foreground">
            {contribKg > 0 ? `${contribKg.toFixed(2)} kg` : "—"}
          </span>
          {def.weightMult !== 1 ? ` (×${def.weightMult})` : ""}
        </p>
        <p>
          → Sobre harina:{" "}
          <span className="font-medium text-foreground">
            {ratioImpact === null ? "—" : `${ratioImpact.toFixed(2)}%`}
          </span>
        </p>
      </div>
    </div>
  );
}

export function LevadurasGrid({ values, onChange, getKgFromText, flourKg, yeastTotalWeightedKg }: LevadurasGridProps) {
  const [showEmpty, setShowEmpty] = useState(false);

  const visibleRows = useMemo(() => {
    if (showEmpty) return ROWS;
    return ROWS.filter((r) => (values[r.id] || "").trim());
  }, [showEmpty, values]);

  const fresh = visibleRows.filter((r) => r.group === "fresca");
  const dry = visibleRows.filter((r) => r.group === "seca");

  const renderGroup = (title: string, list: YeastRowDef[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="space-y-2">
          {list.map((def) => (
            <YeastRow
              key={def.id}
              def={def}
              text={values[def.id] || ""}
              onTextChange={(t) => onChange(def.id, t)}
              getKgFromText={getKgFromText}
              flourKg={flourKg}
              yeastTotalWeightedKg={yeastTotalWeightedKg}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-3 shadow-inner sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Levaduras</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="show-empty-yeast" className="text-[11px] font-normal text-muted-foreground">
            Mostrar vacíos
          </Label>
          <Switch id="show-empty-yeast" checked={showEmpty} onCheckedChange={setShowEmpty} />
        </div>
      </div>
      {renderGroup("Levadura fresca", showEmpty ? ROWS.filter((r) => r.group === "fresca") : fresh)}
      <div className="border-t border-border/60 pt-3">
        {renderGroup("Levadura seca", showEmpty ? ROWS.filter((r) => r.group === "seca") : dry)}
      </div>
      {!showEmpty && fresh.length === 0 && dry.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">No hay levaduras con datos. Activa “Mostrar vacíos” para editar.</p>
      ) : null}
    </div>
  );
}

export { ROWS as YEAST_ROW_DEFS };
