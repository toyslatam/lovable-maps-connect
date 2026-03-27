import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    await new Promise((r) => setTimeout(r, 600));

    if (login(email, password)) {
      navigate("/");
    } else {
      setError("Credenciales incorrectas. Intenta con admin@demo.com / admin123");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border border-sidebar-primary" />
          <div className="absolute bottom-32 right-16 w-48 h-48 rounded-full border border-sidebar-primary" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full border border-sidebar-primary" />
        </div>
        <div className="relative z-10 text-center max-w-md" style={{ animation: 'slideInLeft 800ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#5EA2F2]/20 mb-8">
            <img src="/service.png" alt="SRQ" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-[#9CC5F5] mb-1" style={{ lineHeight: '1.1' }}>
            SRQ
          </h1>
          <p className="text-[#9CC5F5]/90 text-sm mb-4">Strategee Research Quality</p>
          <p className="text-sidebar-foreground/70 text-lg leading-relaxed">
            Gestiona tus establecimientos, localización y contactos en un solo lugar.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm reveal-up">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-[#5EA2F2]/20 flex items-center justify-center">
              <img src="/service.png" alt="SRQ" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <p className="text-xl font-bold leading-tight text-[#4A8FE6]">SRQ</p>
              <p className="text-[10px] leading-tight text-muted-foreground">Strategee Research Quality</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-2">Iniciar sesión</h2>
          <p className="text-muted-foreground mb-8">Ingresa tus credenciales para continuar</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@demo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Ingresando...
                </span>
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>

          <div className="mt-8 p-4 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground font-medium mb-2">Credenciales de prueba:</p>
            <p className="text-xs text-muted-foreground">Admin: admin@demo.com / admin123</p>
            <p className="text-xs text-muted-foreground">Usuario: user@demo.com / user123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
