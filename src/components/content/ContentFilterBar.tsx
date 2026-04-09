import { useMemo, useState } from "react";
import { Building2, CalendarRange, Check, ChevronDown, RotateCcw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function normalizeSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ContentFilterBarProps = {
  surveyors: string[];
  selectedSurveyors: string[];
  onSelectedSurveyorsChange: (next: string[]) => void;
  establishmentSearch: string;
  onEstablishmentSearchChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  activeFilterCount: number;
  onClearAll: () => void;
};

export function ContentFilterBar({
  surveyors,
  selectedSurveyors,
  onSelectedSurveyorsChange,
  establishmentSearch,
  onEstablishmentSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  activeFilterCount,
  onClearAll,
}: ContentFilterBarProps) {
  const [surveyorOpen, setSurveyorOpen] = useState(false);
  const [surveyorQuery, setSurveyorQuery] = useState("");

  const visibleSurveyors = useMemo(() => {
    const q = normalizeSearch(surveyorQuery);
    if (!q) return surveyors;
    return surveyors.filter((s) => normalizeSearch(s).includes(q));
  }, [surveyors, surveyorQuery]);

  const toggleSurveyor = (name: string) => {
    const has = selectedSurveyors.includes(name);
    onSelectedSurveyorsChange(has ? selectedSurveyors.filter((x) => x !== name) : [...selectedSurveyors, name]);
  };

  const surveyorTriggerLabel =
    selectedSurveyors.length === 0
      ? "Todos los encuestadores"
      : selectedSurveyors.length === 1
        ? selectedSurveyors[0]
        : `${selectedSurveyors.length} encuestadores`;

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-card/50 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        {/* Encuestador */}
        <Popover open={surveyorOpen} onOpenChange={setSurveyorOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-9 min-w-[min(100%,220px)] flex-1 justify-between gap-2 font-normal shadow-sm lg:max-w-[260px]",
                selectedSurveyors.length > 0 && "border-primary/40 bg-primary/[0.04]",
              )}
              aria-label="Filtrar encuestadores"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-left text-sm">{surveyorTriggerLabel}</span>
              </span>
              {selectedSurveyors.length > 0 ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium tabular-nums">
                  {selectedSurveyors.length}
                </Badge>
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(calc(100vw-2rem),20rem)] p-0 shadow-md" align="start">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={surveyorQuery}
                  onChange={(e) => setSurveyorQuery(e.target.value)}
                  placeholder="Buscar encuestador…"
                  className="h-8 pl-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1" role="listbox">
              {visibleSurveyors.map((s) => {
                const checked = selectedSurveyors.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors",
                      checked ? "bg-primary/10 text-primary" : "hover:bg-muted/80",
                    )}
                    onClick={() => toggleSurveyor(s)}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background">
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s}</span>
                  </button>
                );
              })}
              {visibleSurveyors.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sin coincidencias.</p>
              ) : null}
            </div>
            <div className="flex gap-2 border-t bg-muted/20 p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 flex-1 text-xs"
                onClick={() => onSelectedSurveyorsChange([])}
              >
                Quitar todos
              </Button>
              <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={() => setSurveyorOpen(false)}>
                Listo
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Establecimiento — debounce en el padre */}
        <div className="relative min-w-[min(100%,200px)] flex-[1.2] lg:min-w-[240px]">
          <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={establishmentSearch}
            onChange={(e) => onEstablishmentSearchChange(e.target.value)}
            placeholder="Establecimiento…"
            className="h-9 pl-9 text-sm shadow-sm"
            aria-label="Buscar por nombre de establecimiento"
          />
        </div>

        {/* Rango fechas compacto */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
          <div className="relative min-w-[8.5rem] flex-1 sm:flex-initial">
            <CalendarRange className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-70" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className={cn(
                "h-9 pl-8 pr-2 text-xs shadow-sm",
                dateFrom && "border-primary/30 bg-primary/[0.03]",
              )}
              aria-label="Fecha desde"
            />
          </div>
          <span className="hidden text-muted-foreground sm:inline">—</span>
          <div className="relative min-w-[8.5rem] flex-1 sm:flex-initial">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className={cn(
                "h-9 px-2 text-xs shadow-sm",
                dateTo && "border-primary/30 bg-primary/[0.03]",
              )}
              aria-label="Fecha hasta"
            />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {activeFilterCount > 0 ? (
            <Badge variant="outline" className="h-7 border-dashed px-2 text-[11px] font-normal tabular-nums text-muted-foreground">
              {activeFilterCount} activo{activeFilterCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClearAll}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Fechas según columna A (Respuesta iniciada). La búsqueda de establecimiento se aplica al escribir (ligero retraso).
      </p>
    </div>
  );
}
