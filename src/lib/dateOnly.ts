/**
 * Normaliza la primera columna (fecha con hora) a YYYY-MM-DD solo para filtros y orden.
 */
export function parseDateOnlyFromCell(value: string | undefined | null): string {
  const s = (value ?? "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = m[3];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }

  return "";
}

export function formatRecordDateEs(recordDate: string): string {
  if (!recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return "—";
  const [y, m, d] = recordDate.split("-");
  return `${d}/${m}/${y}`;
}
