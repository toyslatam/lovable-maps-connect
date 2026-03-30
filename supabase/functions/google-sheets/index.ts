import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * A=fecha, D=encuestador, M/N/O=contenido, AL=nombre establecimiento, AM=dirección, AU=foto, AY=latitud, AZ=longitud, BI=ciudad, BN=estado contenido, BV/BW=localizado, CD/CG/CH/DB/DC=validaciones
 */
const COL_DATE = 0;
const COL_LISTA_NOMBRE = 3; // D (desplegable)
const COL_PHONE = 5;
const COL_CONTACT = 6;
const COL_NOTES = 7;
const COL_FLOUR_TOTAL = 12; // M
const COL_BAKERY_QTY = 13; // N
const COL_PASTRY_QTY = 14; // O
const COL_NAME = 37; // AL
const COL_ADDRESS = 38; // AM
const COL_FACADE_PHOTO = 46; // AU
const COL_LAT = 50; // AY
const COL_LNG = 51; // AZ
const COL_CITY = 60; // BI
const COL_CONTENT_STATUS = 65; // BN
const COL_FLOUR_KG_STANDARD = 81; // CD
const COL_CONTROL_CG = 84; // CG
const COL_CONTROL_CH = 85; // CH
const COL_STATUS_DB = 105; // DB
const COL_STATUS_DC = 106; // DC
const COL_LOCALIZED_STATUS = 73; // BV
const COL_LOCALIZED_BY = 74; // BW

interface SheetRow {
  recordDate: string;
  listaNombre: string;
  name: string;
  city: string;
  contentStatus: string;
  facadePhotoUrl: string;
  localizedStatus: string;
  localizedBy: string;
  flourTotalText: string;
  bakeryQtyText: string;
  pastryQtyText: string;
  flourKgStandardText: string;
  controlCGText: string;
  controlCHText: string;
  dbStatus: string;
  dcStatus: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  contactName: string;
  notes: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseDateOnly(cell: string): string {
  const s = (cell || "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = m[3];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return "";
}

function cell(r: string[], i: number): string {
  return (r[i] ?? "").trim();
}

function isProbablyHeaderRow(r: string[]): boolean {
  const a = cell(r, COL_DATE).toLowerCase().trim();
  const al = cell(r, COL_NAME).toLowerCase().trim();
  if (a === "fecha" || a === "date" || a === "fecha y hora") return true;
  if (
    al.includes("nombre establecimiento") ||
    (al.includes("establecimiento") && al.includes("comercio"))
  ) return true;
  return false;
}

/** A1 notation for a named tab inside the workbook (escapes quotes in tab title). */
function tabRange(tabName: string | undefined, a1Suffix: string): string {
  const t = tabName?.trim();
  if (!t) return a1Suffix;
  const escaped = t.replace(/'/g, "''");
  return `'${escaped}'!${a1Suffix}`;
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  let key: Record<string, string>;
  try {
    key = JSON.parse(serviceAccountKey);
  } catch {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON format");
  }
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const payload = btoa(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const toSign = `${header}.${payload}`;

  // Import the private key
  const pemContents = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(toSign)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let parsedBody: Record<string, unknown> = {};

    if (rawBody.trim()) {
      const normalizedBody = rawBody.trim();
      try {
        parsedBody = JSON.parse(normalizedBody);
      } catch {
        // Some clients can send escaped JSON: {\"k\":\"v\"}
        // or double-encoded JSON strings.
        try {
          const deescaped = normalizedBody
            .replace(/^"|"$/g, "")
            .replace(/\\"/g, "\"")
            .replace(/\\n/g, "\n");
          parsedBody = JSON.parse(deescaped);
        } catch {
          try {
            const decoded = JSON.parse(normalizedBody);
            if (typeof decoded === "string") {
              parsedBody = JSON.parse(decoded);
            } else {
              throw new Error("Invalid request payload");
            }
          } catch {
            const preview = rawBody.slice(0, 80).replace(/\s+/g, " ");
            throw new Error(`Invalid JSON body. Preview: ${preview}`);
          }
        }
      }
    }

    const action = typeof parsedBody.action === "string" ? parsedBody.action : "";
    const data = parsedBody.data;
    const sheetIdFromBody = typeof parsedBody.sheetId === "string" ? parsedBody.sheetId : "";
    const sheetTabFromBody = typeof parsedBody.sheetTab === "string" ? parsedBody.sheetTab : "";

    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
    }

    const sheetId = (
      typeof sheetIdFromBody === "string" && sheetIdFromBody.trim()
        ? sheetIdFromBody.trim()
        : Deno.env.get("GOOGLE_SHEET_ID")
    );
    if (!sheetId) {
      throw new Error("GOOGLE_SHEET_ID is not configured and no sheetId was provided");
    }

    const accessToken = await getAccessToken(serviceAccountKey);
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

    const sheetTab = sheetTabFromBody.trim() || Deno.env.get("GOOGLE_SHEET_TAB") || "";

    if (action === "listTabs") {
      const fields = encodeURIComponent("sheets(properties(sheetId,title))");
      const metaRes = await fetch(`${baseUrl}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meta = await metaRes.json();
      if (!metaRes.ok) {
        throw new Error(`Sheets metadata error [${metaRes.status}]: ${JSON.stringify(meta)}`);
      }
      const sheets = (meta.sheets || []) as Array<{
        properties?: { sheetId?: number; title?: string };
      }>;
      const tabs = sheets.map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? "",
      }));
      return new Response(JSON.stringify({ success: true, tabs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /** Valores crudos A:DC (misma lectura que read, sin filtrar ni mapear) — para vista previa en la app */
    if (action === "readPreview") {
      const rangeA1 = tabRange(sheetTab || undefined, "A:DC");
      const range = encodeURIComponent(rangeA1);
      const res = await fetch(`${baseUrl}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(`Sheets read error [${res.status}]: ${JSON.stringify(json)}`);
      }
      const values: string[][] = (json.values || []).map((row: unknown) =>
        (Array.isArray(row) ? row : []).map((c: unknown) => String(c ?? ""))
      );
      return new Response(
        JSON.stringify({ success: true, range: rangeA1, values }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "read") {
      const range = encodeURIComponent(
        tabRange(sheetTab || undefined, "A:DC"),
      );
      const res = await fetch(`${baseUrl}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(`Sheets read error [${res.status}]: ${JSON.stringify(json)}`);
      }

      const rows: string[][] = json.values || [];
      const dataRows = rows.filter((r) => !isProbablyHeaderRow(r));

      const establishments: SheetRow[] = dataRows
        .filter((r) => cell(r, COL_NAME))
        .map((r) => ({
          recordDate: parseDateOnly(cell(r, COL_DATE)),
          listaNombre: cell(r, COL_LISTA_NOMBRE),
          flourTotalText: cell(r, COL_FLOUR_TOTAL),
          bakeryQtyText: cell(r, COL_BAKERY_QTY),
          pastryQtyText: cell(r, COL_PASTRY_QTY),
          name: cell(r, COL_NAME),
          city: cell(r, COL_CITY),
          contentStatus: cell(r, COL_CONTENT_STATUS),
          facadePhotoUrl: cell(r, COL_FACADE_PHOTO),
          localizedStatus: cell(r, COL_LOCALIZED_STATUS),
          localizedBy: cell(r, COL_LOCALIZED_BY),
          flourKgStandardText: cell(r, COL_FLOUR_KG_STANDARD),
          controlCGText: cell(r, COL_CONTROL_CG),
          controlCHText: cell(r, COL_CONTROL_CH),
          dbStatus: cell(r, COL_STATUS_DB),
          dcStatus: cell(r, COL_STATUS_DC),
          address: cell(r, COL_ADDRESS),
          latitude: parseFloat(cell(r, COL_LAT)) || 0,
          longitude: parseFloat(cell(r, COL_LNG)) || 0,
          phone: cell(r, COL_PHONE),
          contactName: cell(r, COL_CONTACT),
          notes: cell(r, COL_NOTES),
        }));

      return new Response(JSON.stringify({ success: true, data: establishments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "write") {
      const rows = data as SheetRow[];
      if (!rows || !Array.isArray(rows)) {
        throw new Error("data must be an array of establishments");
      }

      const lastRow = rows.length + 1;
      // Solo columnas gestionadas por la app; M/N/O y reglas de Contenido se leen pero no se pisan.
      const columns = ["A", "D", "F", "G", "H", "AL", "AM", "AU", "AY", "AZ", "BI", "BN", "BV", "BW"];

      for (const col of columns) {
        const clearRange = encodeURIComponent(
          tabRange(sheetTab || undefined, `${col}2:${col}`),
        );
        await fetch(`${baseUrl}/values/${clearRange}:clear`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      const headersToWrite: Array<[string, string]> = [
        ["A1:A1", "Fecha"],
        ["D1:D1", "Encuestador"],
        ["F1:F1", "Teléfono"],
        ["G1:G1", "Contacto"],
        ["H1:H1", "Notas"],
        ["AL1:AL1", "Nombre establecimiento"],
        ["AM1:AM1", "Dirección"],
        ["AU1:AU1", "Foto fachada URL"],
        ["AY1:AY1", "Latitud"],
        ["AZ1:AZ1", "Longitud"],
        ["BI1:BI1", "Ciudad"],
        ["BN1:BN1", "Estado contenido"],
        ["BV1:BV1", "Localización"],
        ["BW1:BW1", "Localización por"],
      ];
      for (const [rangeSuffix, header] of headersToWrite) {
        const range = encodeURIComponent(tabRange(sheetTab || undefined, rangeSuffix));
        await fetch(`${baseUrl}/values/${range}?valueInputOption=RAW`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [[header]] }),
        });
      }

      if (rows.length > 0) {
        const singleColWrites: Array<[string, string[]]> = [
          ["A", rows.map((r) => r.recordDate || "")],
          ["D", rows.map((r) => r.listaNombre || "")],
          ["F", rows.map((r) => r.phone || "")],
          ["G", rows.map((r) => r.contactName || "")],
          ["H", rows.map((r) => r.notes || "")],
          ["AL", rows.map((r) => r.name || "")],
          ["AM", rows.map((r) => r.address || "")],
          ["AU", rows.map((r) => r.facadePhotoUrl || "")],
          ["AY", rows.map((r) => String(r.latitude ?? ""))],
          ["AZ", rows.map((r) => String(r.longitude ?? ""))],
          ["BI", rows.map((r) => r.city || "")],
          ["BN", rows.map((r) => r.contentStatus || "")],
          ["BV", rows.map((r) => r.localizedStatus || "")],
          ["BW", rows.map((r) => r.localizedBy || "")],
        ];

        for (const [col, values] of singleColWrites) {
          const dataRange = encodeURIComponent(
            tabRange(sheetTab || undefined, `${col}2:${col}${lastRow}`),
          );
          const writeRes = await fetch(
            `${baseUrl}/values/${dataRange}?valueInputOption=RAW`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: values.map((v) => [v]) }),
            }
          );
          const writeJson = await writeRes.json();
          if (!writeRes.ok) {
            throw new Error(`Sheets write error [${writeRes.status}]: ${JSON.stringify(writeJson)}`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, updated: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error("Google Sheets error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    // HTTP 200 para que el cliente reciba el JSON y muestre `error` (evita solo "non-2xx" del SDK).
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
