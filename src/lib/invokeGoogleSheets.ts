import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

/** Extrae el mensaje útil cuando la Edge Function devuelve 4xx/5xx con JSON `{ error: "..." }`. */
async function messageFromInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json() as { error?: string };
      if (typeof body?.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      try {
        const text = await error.context.clone().text();
        if (text?.trim()) return text.trim().slice(0, 800);
      } catch {
        /* ignore */
      }
    }
  }
  if (error instanceof Error) return error.message;
  return "Error al llamar a la función";
}

/**
 * Invoca `google-sheets`. Si el servidor responde `{ success: false, error }` (HTTP 200),
 * también lanza para unificar el manejo en la app.
 */
export async function invokeGoogleSheets(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("google-sheets", { body });

  if (error) {
    throw new Error(await messageFromInvokeError(error));
  }

  const d = data as Record<string, unknown> | null;
  if (!d) {
    throw new Error("Respuesta vacía del servidor");
  }
  if (d.success === false) {
    throw new Error(typeof d.error === "string" ? d.error : "Error desconocido");
  }
  return d;
}
