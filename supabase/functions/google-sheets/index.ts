import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SheetRow {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  contactName: string;
  notes: string;
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const key = JSON.parse(serviceAccountKey);
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
    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
    }

    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!sheetId) {
      throw new Error("GOOGLE_SHEET_ID is not configured");
    }

    const accessToken = await getAccessToken(serviceAccountKey);
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

    const { action, data } = await req.json();

    if (action === "read") {
      // Read all rows. Expected columns: A=name, B=address, C=latitude, D=longitude, E=phone, F=contactName, G=notes
      const range = "A:G";
      const res = await fetch(`${baseUrl}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(`Sheets read error [${res.status}]: ${JSON.stringify(json)}`);
      }

      const rows: string[][] = json.values || [];
      // Skip header row if present
      const dataRows = rows.length > 0 && rows[0][0]?.toLowerCase().includes("nombre")
        ? rows.slice(1)
        : rows;

      const establishments: SheetRow[] = dataRows
        .filter((r) => r[0])
        .map((r) => ({
          name: r[0] || "",
          address: r[1] || "",
          latitude: parseFloat(r[2]) || 0,
          longitude: parseFloat(r[3]) || 0,
          phone: r[4] || "",
          contactName: r[5] || "",
          notes: r[6] || "",
        }));

      return new Response(JSON.stringify({ success: true, data: establishments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "write") {
      const rows: SheetRow[] = data;
      if (!rows || !Array.isArray(rows)) {
        throw new Error("data must be an array of establishments");
      }

      // Clear existing data (keep header)
      await fetch(`${baseUrl}/values/A2:G:clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Ensure header exists
      await fetch(`${baseUrl}/values/A1:G1?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [["Nombre", "Dirección", "Latitud", "Longitud", "Teléfono", "Contacto", "Notas"]],
        }),
      });

      // Write data
      const values = rows.map((r) => [
        r.name,
        r.address,
        String(r.latitude),
        String(r.longitude),
        r.phone,
        r.contactName,
        r.notes,
      ]);

      if (values.length > 0) {
        const writeRes = await fetch(
          `${baseUrl}/values/A2:G${values.length + 1}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values }),
          }
        );

        const writeJson = await writeRes.json();
        if (!writeRes.ok) {
          throw new Error(`Sheets write error [${writeRes.status}]: ${JSON.stringify(writeJson)}`);
        }
      }

      return new Response(JSON.stringify({ success: true, updated: values.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    console.error("Google Sheets error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
