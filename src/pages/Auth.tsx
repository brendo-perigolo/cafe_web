import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { getKeepConnectedPreference, setKeepConnectedPreference } from "@/lib/authStorage";
import { useNavigate } from "react-router-dom";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

const signupSchema = loginSchema.extend({
  username: z.string().min(3, "Usuário deve ter pelo menos 3 caracteres"),
  fullName: z.string().min(3, "Nome completo deve ter pelo menos 3 caracteres"),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepConnected, setKeepConnected] = useState(() => getKeepConnectedPreference());
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { signIn, signUp, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnlineChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnlineChange);
    window.addEventListener("offline", handleOnlineChange);
    return () => {
      window.removeEventListener("online", handleOnlineChange);
      window.removeEventListener("offline", handleOnlineChange);
    };
  }, []);

  useEffect(() => {
    // Se já existe sessão (mesmo offline), não faz sentido ficar na tela de login.
    if (!authLoading && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      toast({
        title: "Sem conexão",
        description: "Para o primeiro login/cadastro é necessário estar online.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const validated = loginSchema.parse({ email, password });
        setKeepConnectedPreference(keepConnected);
        const { error } = await signIn(validated.email, validated.password);
        
        if (error) {
          toast({
            title: "Erro ao entrar",
            description: error.message,
            variant: "destructive",
          });
        }
      } else {
        const validated = signupSchema.parse({ email, username, fullName, password });
        const { error, requiresConfirmation } = await signUp(
          validated.email,
          validated.username,
          validated.fullName,
          validated.password
        );
        
        if (error) {
          toast({
            title: "Erro ao cadastrar",
            description: error.message,
            variant: "destructive",
          });
        } else if (requiresConfirmation) {
          toast({
            title: "Verifique seu e-mail",
            description: "Enviamos um link para concluir a ativação da conta.",
          });
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Dados inválidos",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="flex min-h-[100dvh] flex-col md:grid md:min-h-screen md:grid-cols-2">
        <section className="flex flex-1 flex-col justify-center px-6 py-10 md:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-card">
                  <img src="/logo_minha_cafe.png" alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-display text-3xl font-bold leading-tight">Minha Colheita Café</h1>
                  <p className="text-sm text-muted-foreground">Acesso ao sistema</p>
                </div>
              </div>
            </div>

            {!isOnline && !session && (
              <div className="mb-4 rounded-md border bg-card p-3 text-sm text-muted-foreground">
                Você está offline. Conecte-se à internet para entrar ou cadastrar.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu_usuario"
                    required
                  />
                </div>
              )}

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="João Silva"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {isLogin && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="keepConnected"
                    checked={keepConnected}
                    onCheckedChange={(value) => setKeepConnected(Boolean(value))}
                  />
                  <Label htmlFor="keepConnected">Manter conectado</Label>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Carregando..." : isLogin ? "Entrar" : "Cadastrar"}
              </Button>
            </form>
          </div>
        </section>

        <section className="relative h-[10dvh] min-h-[56px] overflow-hidden bg-gradient-to-br from-indigo-700 via-purple-700 to-violet-800 md:h-auto">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-25 [background:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.16)_20%,transparent_40%,rgba(255,255,255,0.10)_60%,transparent_80%)]" />

          <div className="relative flex h-full items-center justify-center px-8 text-center text-white">
            <div className="hidden md:flex flex-col items-center justify-center">
              <div className="mb-7 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[28px] bg-white/10 ring-1 ring-white/20 backdrop-blur">
                <img
                  src="/logo_minha_cafe.png"
                  alt="Logo"
                  className="h-24 w-24 rounded-2xl object-contain"
                />
              </div>

              <p className="font-display text-4xl font-bold tracking-tight md:text-5xl">Minha Colheita Café</p>
              <p className="mt-3 max-w-sm text-sm text-white/80 md:text-base">
                Soluções completas para registrar colheitas e acompanhar movimentações, mesmo offline.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
