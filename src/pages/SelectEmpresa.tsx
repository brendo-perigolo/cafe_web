import { Building2, Headphones, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { MASTER_EMAIL } from "@/constants/master";
import { useEffect, useState } from "react";

export default function SelectEmpresa() {
  const { companies, companiesLoading, selectCompany, signOut, user } = useAuth();
  const navigate = useNavigate();
  const isMaster = user?.email?.toLowerCase() === MASTER_EMAIL.toLowerCase();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnlineChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnlineChange);
    window.addEventListener("offline", handleOnlineChange);
    return () => {
      window.removeEventListener("online", handleOnlineChange);
      window.removeEventListener("offline", handleOnlineChange);
    };
  }, []);

  const getReturnPath = () => {
    const stored = window.localStorage.getItem("safra:last_path") || window.sessionStorage.getItem("safra:last_path");
    if (!stored || stored === "/auth" || stored === "/selecionar-empresa") return "/dashboard";
    return stored;
  };

  const handleSelect = (empresaId: string) => {
    selectCompany(empresaId);
    navigate(getReturnPath(), { replace: true });
  };

  useEffect(() => {
    if (companiesLoading) return;
    if (companies.length !== 1) return;
    handleSelect(companies[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesLoading, companies.length]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/30 to-background p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold sm:text-2xl">Selecione a empresa</h1>
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
                {isOnline ? (
                  <Button variant="outline" onClick={signOut}>
                    Voltar para login
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {companies.map((empresa) => (
              <Card key={empresa.id} className="shadow-coffee flex h-full flex-col">
                <CardHeader className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base leading-tight sm:text-lg">{empresa.nome}</CardTitle>
                    <Badge
                      className="shrink-0"
                      variant={empresa.ativa ? "default" : "secondary"}
                    >
                      {empresa.ativa ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <CardDescription className="min-h-4 text-xs sm:text-sm">
                      {empresa.responsavel ? `Responsável: ${empresa.responsavel}` : "\u00A0"}
                    </CardDescription>
                    {empresa.cnpj ? (
                      <CardDescription className="text-xs sm:text-sm">CNPJ: {empresa.cnpj}</CardDescription>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="mt-auto flex items-end justify-end p-4 pt-0">
                  <Button size="sm" className="shrink-0" onClick={() => handleSelect(empresa.id)}>
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
