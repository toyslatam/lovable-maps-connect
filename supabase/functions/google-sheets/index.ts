import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * A=fecha, B=dirección, C=latitud, D="Nombre" (lista desplegable), E–H=longitud…notas, AL=nombre del establecimiento
 */
const COL_DATE = 0;
const COL_ADDRESS = 1;
const COL_LAT = 2;
const COL_LISTA_NOMBRE = 3; // D (desplegable)
const COL_LNG = 4;
const COL_PHONE = 5;
const COL_CONTACT = 6;
const COL_NOTES = 7;
const COL_NAME = 37; // AL
const LAST_COL_BLOCK = "H";

interface SheetRow {
  recordDate: string;
  listaNombre: string;
  name: string;
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

    /** Valores crudos A:AL (misma lectura que read, sin filtrar ni mapear) — para vista previa en la app */
    if (action === "readPreview") {
      const rangeA1 = tabRange(sheetTab || undefined, "A:AL");
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
        tabRange(sheetTab || undefined, "A:AL"),
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
          name: cell(r, COL_NAME),
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
      const clearAH = encodeURIComponent(
        tabRange(sheetTab || undefined, `A2:${LAST_COL_BLOCK}${lastRow}`),
      );
      const clearAL = encodeURIComponent(
        tabRange(sheetTab || undefined, `AL2:AL${lastRow}`),
      );
      await fetch(`${baseUrl}/values/${clearAH}:clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await fetch(`${baseUrl}/values/${clearAL}:clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const headerAH = encodeURIComponent(
        tabRange(sheetTab || undefined, `A1:${LAST_COL_BLOCK}1`),
      );
      await fetch(`${baseUrl}/values/${headerAH}?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [[
            "Fecha",
            "Dirección",
            "Latitud",
            "Nombre",
            "Longitud",
            "Teléfono",
            "Contacto",
            "Notas",
          ]],
        }),
      });

      const headerAL = encodeURIComponent(tabRange(sheetTab || undefined, "AL1:AL1"));
      await fetch(`${baseUrl}/values/${headerAL}?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [["Nombre establecimiento"]],
        }),
      });

      if (rows.length > 0) {
        const valuesAH = rows.map((r) => [
          r.recordDate || "",
          r.address || "",
          String(r.latitude ?? ""),
          r.listaNombre || "",
          String(r.longitude ?? ""),
          r.phone || "",
          r.contactName || "",
          r.notes || "",
        ]);
        const valuesAL = rows.map((r) => [r.name || ""]);

        const dataAH = encodeURIComponent(
          tabRange(sheetTab || undefined, `A2:${LAST_COL_BLOCK}${lastRow}`),
        );
        const writeAH = await fetch(
          `${baseUrl}/values/${dataAH}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values: valuesAH }),
          }
        );
        const writeAHJson = await writeAH.json();
        if (!writeAH.ok) {
          throw new Error(`Sheets write error [${writeAH.status}]: ${JSON.stringify(writeAHJson)}`);
        }

        const dataAL = encodeURIComponent(
          tabRange(sheetTab || undefined, `AL2:AL${lastRow}`),
        );
        const writeAL = await fetch(
          `${baseUrl}/values/${dataAL}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values: valuesAL }),
          }
        );
        const writeALJson = await writeAL.json();
        if (!writeAL.ok) {
          throw new Error(`Sheets write error [${writeAL.status}]: ${JSON.stringify(writeALJson)}`);
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
