import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_EMAIL } from "@/constants/master";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresCompany?: boolean;
  requireMaster?: boolean;
}

export const ProtectedRoute = ({ children, requiresCompany = true, requireMaster = false }: ProtectedRouteProps) => {
  const { user, loading, companiesLoading, selectedCompany, companies, selectCompany, signOut } = useAuth();

  const hasCompanies = useMemo(() => companies.length > 0, [companies.length]);

  if (loading || (requiresCompany && companiesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requireMaster && user.email?.toLowerCase() !== MASTER_EMAIL.toLowerCase()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!requireMaster && requiresCompany && !selectedCompany) {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              Escolha a empresa para continuar. Você pode digitar para buscar.
            </DialogDescription>
          </DialogHeader>

          {hasCompanies ? (
            <Command>
              <CommandInput placeholder="Digite o nome da empresa..." />
              <CommandList>
                <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                <CommandGroup>
                  {companies.map((empresa) => (
                    <CommandItem key={empresa.id} value={empresa.nome} onSelect={() => selectCompany(empresa.id)}>
                      {empresa.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Seu e-mail ainda não está vinculado a uma empresa.
              </p>
              <Button variant="outline" onClick={signOut}>
                Voltar para login
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
};
