export interface Establishment {
  id: string;
  /** Fecha del registro (solo día), derivada de la columna A (YYYY-MM-DD). */
  recordDate: string;
  /** Valor del desplegable "Nombre" en Google Sheets (columna D). */
  listaNombre: string;
  /** Nombre del establecimiento (columna AL en Sheets). */
  name: string;
  /** URL de la foto de fachada (columna AU en Sheets). */
  facadePhotoUrl: string;
  /** Ciudad (columna BI en Sheets). */
  city: string;
  /** Dirección (columna AM en Sheets). */
  address: string;
  /** Latitud (columna AY en Sheets). */
  latitude: number;
  /** Longitud (columna AZ en Sheets). */
  longitude: number;
  phone: string;
  contactName: string;
  notes: string;
}
