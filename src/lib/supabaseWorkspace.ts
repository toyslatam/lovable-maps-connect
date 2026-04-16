import { supabase } from "@/integrations/supabase/client";

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

const WORKSPACE_ID_STORAGE_KEY = "geotrack_workspace_id";

/**
 * Resuelve el workspace actual.
 * - Prioridad: VITE_WORKSPACE_SLUG (para despliegues por cliente) o localStorage.
 * - Si no existe el workspace, lo crea (requiere políticas permisivas o auth).
 */
export async function resolveWorkspaceId(): Promise<string> {
  const cached = localStorage.getItem(WORKSPACE_ID_STORAGE_KEY);
  if (cached?.trim()) return cached.trim();

  const slug = (import.meta as any).env?.VITE_WORKSPACE_SLUG?.trim?.() || "default";
  const name = (import.meta as any).env?.VITE_WORKSPACE_NAME?.trim?.() || "Default workspace";

  const { data: existing, error: selErr } = await supabase
    .from("workspaces")
    .select("id, slug, name, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (selErr) {
    console.warn("[supabase] select workspaces:", selErr.message);
  }

  if (existing?.id) {
    localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, existing.id);
    return existing.id;
  }

  const { data: created, error: insErr } = await supabase
    .from("workspaces")
    .insert([{ slug, name }])
    .select("id, slug, name, created_at")
    .single();

  if (insErr) {
    console.warn("[supabase] insert workspaces:", insErr.message);
    // fallback: keep app usable; but tenant isolation won't work.
    return "";
  }

  localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, created.id);
  return created.id;
}

