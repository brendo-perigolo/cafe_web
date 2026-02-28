import { Building2, Headphones, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { MASTER_EMAIL } from "@/constants/master";

export default function SelectEmpresa() {
  const { companies, companiesLoading, selectCompany, signOut, user } = useAuth();
  const navigate = useNavigate();
  const isMaster = user?.email?.toLowerCase() === MASTER_EMAIL.toLowerCase();

  const handleSelect = (empresaId: string) => {
    selectCompany(empresaId);
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/30 to-background p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Selecionar empresa</p>
          <h1 className="mt-2 text-3xl font-bold">Escolha a operação que deseja acessar</h1>
          <p className="mt-2 text-muted-foreground">
            Vinculamos seu acesso às empresas liberadas pelo administrador. Escolha uma para continuar.
          </p>
        </div>

        {companiesLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : companies.length === 0 ? (
          <Card className="border-destructive/60">
            <CardHeader>
              <CardTitle>Nenhuma empresa encontrada</CardTitle>
              <CardDescription>
                Seu e-mail ainda não está vinculado a uma empresa. Entre em contato com o suporte para receber acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Headphones className="h-4 w-4" />
                suporte@minhacolheitacafe.app
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {isMaster && (
                  <Button variant="default" onClick={() => navigate("/master")}>Painel master</Button>
                )}
                <Button variant="outline" onClick={signOut}>
                  Voltar para login
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((empresa) => (
              <Card key={empresa.id} className="shadow-coffee">
                <CardHeader className="space-y-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{empresa.nome}</CardTitle>
                    <Badge variant={empresa.ativa ? "default" : "secondary"}>{empresa.ativa ? "Ativa" : "Inativa"}</Badge>
                  </div>
                  {empresa.responsavel && (
                    <CardDescription>Responsável: {empresa.responsavel}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {empresa.email && <p>{empresa.email}</p>}
                    {empresa.telefone && <p>{empresa.telefone}</p>}
                  </div>
                  <Button onClick={() => handleSelect(empresa.id)}>
                    <Building2 className="mr-2 h-4 w-4" />
                    Entrar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
