export interface Establishment {
  id: string;
  /** Fecha del registro (solo día), derivada de la columna A (YYYY-MM-DD). */
  recordDate: string;
  /** Valor del desplegable "Nombre" en Google Sheets (columna D). */
  listaNombre: string;
  /** Nombre del establecimiento (columna AL en Sheets). */
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  contactName: string;
  notes: string;
}
