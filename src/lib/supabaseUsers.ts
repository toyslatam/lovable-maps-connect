import { supabase } from "@/integrations/supabase/client";

export type DirectoryUser = {
  id: string;
  workspace_id: string;
  name: string;
  name_key: string;
  created_at: string;
};

export async function fetchDirectoryUsers(workspaceId: string): Promise<DirectoryUser[]> {
  const wid = workspaceId.trim();
  if (!wid) return [];
  const { data, error } = await supabase
    .from("user_directory")
    .select("id, workspace_id, name, name_key, created_at")
    .eq("workspace_id", wid)
    .order("name", { ascending: true });

  if (error) {
    console.warn("[supabase] fetch user_directory:", error.message);
    return [];
  }
  return (data ?? []) as DirectoryUser[];
}

export async function upsertDirectoryUser(
  workspaceId: string,
  name: string,
  nameKey: string
): Promise<DirectoryUser | null> {
  const wid = workspaceId.trim();
  const cleanName = name.trim();
  const cleanKey = nameKey.trim();
  if (!wid || !cleanName || !cleanKey) return null;

  const { data, error } = await supabase
    .from("user_directory")
    .upsert(
      [{ workspace_id: wid, name: cleanName, name_key: cleanKey }],
      { onConflict: "workspace_id,name_key" },
    )
    .select("id, workspace_id, name, name_key, created_at")
    .single();

  if (error) {
    console.warn("[supabase] upsert user_directory:", error.message);
    return null;
  }
  return (data ?? null) as DirectoryUser | null;
}

export async function deleteDirectoryUser(workspaceId: string, id: string): Promise<boolean> {
  const wid = workspaceId.trim();
  const rid = id.trim();
  if (!wid || !rid) return false;

  const { error } = await supabase
    .from("user_directory")
    .delete()
    .eq("workspace_id", wid)
    .eq("id", rid);

  if (error) {
    console.warn("[supabase] delete user_directory:", error.message);
    return false;
  }
  return true;
}

