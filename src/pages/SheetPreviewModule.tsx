import { useCallback, useState } from "react";
import { useData } from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Table2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { columnIndexToLetter } from "@/lib/sheetColumns";

export default function SheetPreviewModule() {
  const {
    fetchSheetPreview,
    connectedSheetId,
    connectedSheetTab,
    isSyncing,
  } = useData();

  const [range, setRange] = useState<string>("");
  const [values, setValues] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchSheetPreview();
      setRange(res.range);
      setValues(res.values);
    } catch (e: unknown) {
      setValues([]);
      setRange("");
      setError(e instanceof Error ? e.message : "Error al cargar la hoja");
    } finally {
      setLoading(false);
    }
  }, [fetchSheetPreview]);

  const maxCols = values.reduce((m, row) => Math.max(m, row.length), 0);
  const columnLabels = Array.from({ length: maxCols }, (_, i) => columnIndexToLetter(i));

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 reveal-up">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Table2 className="w-7 h-7 text-primary" />
            Vista de Google Sheets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Muestra el rango <span className="font-mono text-foreground">A:BW</span> tal como está en tu hoja
            (solo lectura). La columna <span className="font-mono">AL</span> es el nombre del establecimiento y{" "}
            <span className="font-mono">AU</span> la foto de fachada (URL); <span className="font-mono">BI</span> es ciudad y{" "}
            <span className="font-mono">BV/BW</span> localización.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void load()}
          disabled={loading || !connectedSheetId || isSyncing}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Cargando…" : "Actualizar desde Sheets"}
        </Button>
      </div>

      {!connectedSheetId ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">No hay hoja conectada</p>
            <p className="text-muted-foreground mt-1">
              Configura el ID del libro y la pestaña en{" "}
              <Link to="/connections" className="text-primary underline underline-offset-2">
                Conexiones
              </Link>{" "}
              y vuelve aquí para ver los datos.
            </p>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Libro:</span>{" "}
            <span className="font-mono break-all">{connectedSheetId}</span>
          </p>
          {connectedSheetTab ? (
            <p>
              <span className="font-medium text-foreground">Pestaña:</span>{" "}
              <span className="font-mono">{connectedSheetTab}</span>
            </p>
          ) : (
            <p>Pestaña: (predeterminada del servidor o primera hoja)</p>
          )}
          {range ? (
            <p>
              <span className="font-medium text-foreground">Rango cargado:</span>{" "}
              <span className="font-mono">{range}</span>
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {connectedSheetId && values.length === 0 && !loading && !error ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          Pulsa <strong className="text-foreground">Actualizar desde Sheets</strong> para cargar las filas.
        </div>
      ) : null}

      {values.length > 0 ? (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden reveal-up reveal-up-delay-1">
          <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur shadow-sm">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="sticky left-0 z-20 bg-muted/95 w-12 text-center font-mono text-xs text-muted-foreground border-r">
                    #
                  </TableHead>
                  {columnLabels.map((letter) => (
                    <TableHead
                      key={letter}
                      className="font-mono text-xs whitespace-nowrap min-w-[7rem] text-muted-foreground"
                    >
                      {letter}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.map((row, rowIndex) => (
                  <TableRow
                    key={rowIndex}
                    className={rowIndex % 2 === 1 ? "bg-muted/15" : undefined}
                  >
                    <TableCell className="sticky left-0 z-[1] bg-background font-mono text-xs text-muted-foreground text-center border-r border-border">
                      {rowIndex + 1}
                    </TableCell>
                    {columnLabels.map((letter, colIndex) => (
                      <TableCell
                        key={`${rowIndex}-${letter}`}
                        className={`text-xs max-w-[280px] align-top whitespace-pre-wrap break-words ${rowIndex % 2 === 1 ? "bg-muted/15" : "bg-background"}`}
                      >
                        {(row[colIndex] ?? "").trim() === ""
                          ? "—"
                          : (row[colIndex] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground px-4 py-2 border-t bg-muted/20">
            {values.length} fila{values.length === 1 ? "" : "s"} · {maxCols} columna
            {maxCols === 1 ? "" : "s"} visibles (A…{maxCols ? columnIndexToLetter(maxCols - 1) : ""})
          </p>
        </div>
      ) : null}
    </div>
  );
}
