import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Shield, User, Trash2, Plus, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { resolveWorkspaceId } from "@/lib/supabaseWorkspace";
import { deleteDirectoryUser, fetchDirectoryUsers, upsertDirectoryUser } from "@/lib/supabaseUsers";

function normalizeForSearch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const UsersModule = () => {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="font-medium text-lg">Acceso restringido</p>
        <p className="text-sm mt-1">Solo los administradores pueden ver esta sección</p>
      </div>
    );
  }

  const workspaceSlug = ((import.meta as any).env?.VITE_WORKSPACE_SLUG as string | undefined) || "default";

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return users;
    return users.filter((u) => normalizeForSearch(u.name).includes(q));
  }, [users, query]);

  const load = async () => {
    setLoading(true);
    try {
      const wid = await resolveWorkspaceId();
      setWorkspaceId(wid);
      if (!wid) {
        toast.error("No se pudo resolver el workspace. Revisa migraciones y permisos de Supabase.");
        setUsers([]);
        return;
      }
      const data = await fetchDirectoryUsers(wid);
      setUsers(data.map((u) => ({ id: u.id, name: u.name })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!workspaceId) {
      toast.error("Workspace no disponible todavía.");
      return;
    }
    setSaving(true);
    try {
      const created = await upsertDirectoryUser(workspaceId, name, normalizeForSearch(name));
      if (!created) {
        toast.error("No se pudo crear el usuario");
        return;
      }
      setUsers((prev) =>
        Array.from(new Map([...prev, { id: created.id, name: created.name }].map((x) => [x.id, x])).values())
          .sort((a, b) => a.name.localeCompare(b.name, "es"))
      );
      setNewName("");
      toast.success("Usuario creado");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId) return;
    const ok = await deleteDirectoryUser(workspaceId, id);
    if (!ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast.success("Usuario eliminado");
  };

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Administra el directorio de usuarios para asignaciones
        </p>
      </div>

      <Card className="reveal-up reveal-up-delay-1">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="text-lg">Directorio de usuarios</CardTitle>
              <CardDescription>
                Workspace: <span className="font-medium text-foreground">{workspaceSlug}</span>
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-muted-foreground">
              {users.length} usuario{users.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Agregar usuario"
                className="h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
              <Button
                type="button"
                className="gap-2 shrink-0"
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim()}
              >
                <Plus className="w-4 h-4" />
                Crear
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar usuario…"
                className="h-10 pl-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {workspaceId ? "Conectado" : "Workspace no resuelto"}
              {loading ? " · cargando…" : ""}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Recargar
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(loading ? Array.from({ length: 6 }) : filtered).map((u, idx) => {
              if (loading) {
                return (
                  <div key={`sk-${idx}`} className="p-5 rounded-xl border bg-card animate-pulse">
                    <div className="h-4 w-1/2 bg-muted rounded mb-3" />
                    <div className="h-3 w-3/4 bg-muted rounded" />
                  </div>
                );
              }
              return (
                <div key={u.id} className="p-5 rounded-xl border bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">Directorio</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                      title="Eliminar"
                      onClick={() => void handleDelete(u.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
              No hay usuarios todavía. Crea el primero arriba.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersModule;
