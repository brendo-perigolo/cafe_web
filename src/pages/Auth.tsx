import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-coffee">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-background">
            <img src="/logo_minha_cafe.png" alt="Logo" className="h-24 w-24 object-contain" />
          </div>
          <CardTitle className="text-2xl">Minha Colheita Café</CardTitle>
          <CardDescription>
            {isLogin ? "Entre com suas credenciais" : "Cadastre-se para começar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isOnline && !session && (
            <div className="mb-4 rounded-md border bg-background p-3 text-sm text-muted-foreground">
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
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

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
