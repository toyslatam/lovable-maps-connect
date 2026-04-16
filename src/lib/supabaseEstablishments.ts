import { supabase } from "@/integrations/supabase/client";
import type { Establishment } from "@/types/establishment";

const CHUNK = 250;

export type EstablishmentRow = {
  id: string;
  spreadsheet_id: string;
  sheet_tab: string;
  sheet_row_number: number;
  payload: Record<string, unknown>;
  updated_at: string;
};

function payloadFromEstablishment(e: Establishment): Record<string, unknown> {
  const { id: _id, ...rest } = e;
  return rest as Record<string, unknown>;
}

function establishmentFromRow(row: EstablishmentRow): Establishment {
  const p = row.payload as Partial<Establishment>;
  return {
    ...p,
    id: row.id,
    sheetRowNumber: row.sheet_row_number,
  } as Establishment;
}

/** Lista establecimientos guardados para el libro y pestaña actual. */
export async function fetchEstablishmentsFromSupabase(
  spreadsheetId: string,
  sheetTab: string
): Promise<Establishment[]> {
  const sid = spreadsheetId.trim();
  const tab = sheetTab.trim();
  if (!sid) return [];

  const { data, error } = await supabase
    .from("establishments")
    .select("id, spreadsheet_id, sheet_tab, sheet_row_number, payload, updated_at")
    .eq("spreadsheet_id", sid)
    .eq("sheet_tab", tab)
    .order("sheet_row_number", { ascending: true });

  if (error) {
    console.warn("[supabase] fetch establishments:", error.message);
    return [];
  }

  return (data as EstablishmentRow[]).map(establishmentFromRow);
}

type UpsertResult = { id: string; sheet_row_number: number };

/** Upsert por fila de hoja y devuelve ids de fila para fusionar en memoria. */
export async function upsertEstablishmentsToSupabase(
  spreadsheetId: string,
  sheetTab: string,
  rows: Establishment[]
): Promise<UpsertResult[]> {
  const sid = spreadsheetId.trim();
  const tab = sheetTab.trim();
  if (!sid) return [];

  const withRow = rows.filter((r): r is Establishment & { sheetRowNumber: number } =>
    typeof r.sheetRowNumber === "number" && Number.isFinite(r.sheetRowNumber)
  );
  if (withRow.length === 0) return [];

  const results: UpsertResult[] = [];

  for (let i = 0; i < withRow.length; i += CHUNK) {
    const slice = withRow.slice(i, i + CHUNK);
    const payload = slice.map((e) => ({
      spreadsheet_id: sid,
      sheet_tab: tab,
      sheet_row_number: e.sheetRowNumber,
      payload: payloadFromEstablishment(e),
    }));

    const { data, error } = await supabase
      .from("establishments")
      .upsert(payload, {
        onConflict: "spreadsheet_id,sheet_tab,sheet_row_number",
      })
      .select("id, sheet_row_number");

    if (error) {
      console.warn("[supabase] upsert establishments:", error.message);
      continue;
    }
    if (data?.length) {
      results.push(
        ...(data as { id: string; sheet_row_number: number }[]).map((r) => ({
          id: r.id,
          sheet_row_number: r.sheet_row_number,
        }))
      );
    }
  }

  return results;
}

/** Elimina filas que ya no existen en la hoja importada (evita registros huérfanos). */
export async function deleteEstablishmentsNotInSheetRows(
  spreadsheetId: string,
  sheetTab: string,
  keptSheetRowNumbers: number[]
): Promise<void> {
  const sid = spreadsheetId.trim();
  const tab = sheetTab.trim();
  if (!sid) return;

  const set = new Set(keptSheetRowNumbers);
  const { data: existing, error: selErr } = await supabase
    .from("establishments")
    .select("id, sheet_row_number")
    .eq("spreadsheet_id", sid)
    .eq("sheet_tab", tab);

  if (selErr || !existing?.length) return;

  const toDelete = existing
    .filter((r) => typeof r.sheet_row_number === "number" && !set.has(r.sheet_row_number))
    .map((r) => r.id as string);

  if (toDelete.length === 0) return;

  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    const { error } = await supabase.from("establishments").delete().in("id", chunk);
    if (error) console.warn("[supabase] delete stale establishments:", error.message);
  }
}

/** Fusiona ids de Supabase en los registros importados desde Sheets. */
export function mergeEstablishmentIds(
  imported: Establishment[],
  ids: UpsertResult[]
): Establishment[] {
  const byRow = new Map(ids.map((r) => [r.sheet_row_number, r.id]));
  return imported.map((row) => {
    if (typeof row.sheetRowNumber !== "number") return row;
    const dbId = byRow.get(row.sheetRowNumber);
    return dbId ? { ...row, id: dbId } : row;
  });
}
