import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCORDION_VALUE = "advanced";

export type ContentAdvancedFiltersProps = {
  brStates: string[];
  phoneStates: string[];
  brStateFilter: string;
  phoneStateFilter: string;
  onBrStateChange: (value: string) => void;
  onPhoneStateChange: (value: string) => void;
  openSection: "" | typeof ACCORDION_VALUE;
  onOpenSectionChange: (value: "" | typeof ACCORDION_VALUE) => void;
  secondaryActiveCount: number;
};

export function ContentAdvancedFilters({
  brStates,
  phoneStates,
  brStateFilter,
  phoneStateFilter,
  onBrStateChange,
  onPhoneStateChange,
  openSection,
  onOpenSectionChange,
  secondaryActiveCount,
}: ContentAdvancedFiltersProps) {
  return (
    <Accordion
      type="single"
      collapsible
      value={openSection === ACCORDION_VALUE ? ACCORDION_VALUE : ""}
      onValueChange={(v) => onOpenSectionChange(v === ACCORDION_VALUE ? ACCORDION_VALUE : "")}
      className="bg-card/30 px-3 sm:px-4"
    >
      <AccordionItem value={ACCORDION_VALUE} className="border-0">
        <AccordionTrigger
          className={cn(
            "py-2.5 text-sm font-medium hover:no-underline [&[data-state=open]>svg]:rotate-180",
            secondaryActiveCount > 0 && "text-foreground",
          )}
        >
          <span className="flex items-center gap-2">
            Más filtros
            <span className="text-xs font-normal text-muted-foreground">Estado contenido · Estado telefónico</span>
            {secondaryActiveCount > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium tabular-nums">
                {secondaryActiveCount}
              </Badge>
            ) : null}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-1">
          <div className="grid gap-3 rounded-lg border border-border/80 bg-background/60 p-3 shadow-sm sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estado contenido</Label>
              <Select value={brStateFilter} onValueChange={onBrStateChange}>
                <SelectTrigger className="h-9 bg-background text-sm shadow-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="__empty__">Sin dato</SelectItem>
                  {brStates.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estado telefónico</Label>
              <Select value={phoneStateFilter} onValueChange={onPhoneStateChange}>
                <SelectTrigger className="h-9 bg-background text-sm shadow-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="__empty__">Sin dato</SelectItem>
                  {phoneStates.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
