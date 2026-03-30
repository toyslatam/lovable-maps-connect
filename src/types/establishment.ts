export interface Establishment {
  id: string;
  /** Fecha del registro (solo día), derivada de la columna A (YYYY-MM-DD). */
  recordDate: string;
  /** Encuestador en Google Sheets (columna D). */
  listaNombre: string;
  /** Nombre del establecimiento (columna AL en Sheets). */
  name: string;
  /** URL de la foto de fachada (columna AU en Sheets). */
  facadePhotoUrl: string;
  /** Ciudad (columna BI en Sheets). */
  city: string;
  /** Estado de localización (columna BV en Sheets). */
  localizedStatus: string;
  /** Usuario que localizó (columna BW en Sheets). */
  localizedBy: string;
  /** Estado contenido (columna BN en Sheets). */
  contentStatus: string;
  /** Total de harina reportada (columna M, texto libre). */
  flourTotalText: string;
  /** Elaborar panadería (columna N, texto libre). */
  bakeryQtyText: string;
  /** Elaborar pastelería (columna O, texto libre). */
  pastryQtyText: string;
  /** Cantidad estandarizada en kg (columna CD, si existe en la hoja). */
  flourKgStandardText: string;
  /** Datos de control (columna CG). */
  controlCGText: string;
  /** Datos de control (columna CH). */
  controlCHText: string;
  /** Estado regla DB (Cumple/Falla). */
  dbStatus: string;
  /** Estado regla DC (Cumple/Falla). */
  dcStatus: string;
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
