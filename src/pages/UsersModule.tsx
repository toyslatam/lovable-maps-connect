import { useAuth } from "@/context/AuthContext";
import { Users, Shield, User } from "lucide-react";

const MOCK_USERS = [
  { email: "admin@demo.com", name: "Administrador", role: "admin" },
  { email: "user@demo.com", name: "Usuario", role: "user" },
  { email: "maria@demo.com", name: "María López", role: "user" },
];

const UsersModule = () => {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="font-medium text-lg">Acceso restringido</p>
        <p className="text-sm mt-1">Solo los administradores pueden ver esta sección</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra los usuarios del sistema</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 reveal-up reveal-up-delay-1">
        {MOCK_USERS.map((u) => (
          <div key={u.email} className="p-5 rounded-xl border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                {u.role === "admin" ? (
                  <Shield className="w-5 h-5 text-primary" />
                ) : (
                  <User className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                u.role === "admin"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {u.role === "admin" ? "Administrador" : "Usuario"}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border border-dashed reveal-up reveal-up-delay-2">
        <p className="text-sm text-muted-foreground">
          💡 La gestión completa de usuarios estará disponible al conectar con Lovable Cloud para autenticación real.
        </p>
      </div>
    </div>
  );
};

export default UsersModule;
