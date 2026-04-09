export function parseYeastQtyPrice(text: string): { qty: string; price: string } {
  const raw = (text || "").toLowerCase();
  const qMatch = raw.match(/cantidad\s*semanal\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const pMatch = raw.match(/precio\s*de\s*compra\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const qty = qMatch ? qMatch[1].replace(",", ".") : "";
  const price = pMatch ? pMatch[1].replace(",", ".") : "";
  if (!qty && !price && String(text || "").trim()) {
    const loose = text.match(/-?\d+(?:[.,]\d+)?/);
    return { qty: loose ? loose[0].replace(",", ".") : "", price: "" };
  }
  return { qty, price };
}

export function formatYeastSheetCell(qty: string, price: string): string {
  const q = String(qty || "").trim();
  const p = String(price || "").trim();
  if (!q && !p) return "";
  const qn = q || "0";
  const pn = p || "0";
  return `Cantidad semanal:${qn},Precio de compra:${pn}`;
}
