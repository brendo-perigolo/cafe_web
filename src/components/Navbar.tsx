import { LogOut, Users, Plus, BarChart3, Building2, RefreshCcw, Settings, Smartphone, MapPinned, Menu, Coins, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_EMAIL } from "@/constants/master";
import { useNavigate, useLocation } from "react-router-dom";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const { signOut, selectedCompany, user, companies } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMaster = user?.email?.toLowerCase() === MASTER_EMAIL.toLowerCase();
  const canSwitchCompany = (companies?.length ?? 0) > 1;

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { label: "Dashboard", icon: BarChart3, path: "/dashboard" },
    { label: "Lançamento", icon: Plus, path: "/lancamento" },
    { label: "Panhadores", icon: Users, path: "/panhadores" },
    { label: "Movimentações", icon: RefreshCcw, path: "/movimentacoes" },
    { label: "Controle Financeiro", icon: Coins, path: "/despesas" },
    { label: "Plano de contas", icon: FileText, path: "/planos-contas" },
    { label: "Aparelhos", icon: Smartphone, path: "/aparelhos" },
    { label: "Propriedades", icon: MapPinned, path: "/propriedades" },
    { label: "Configurações", icon: Settings, path: "/configuracoes" },
  ] as const;

  return (
    <nav className="sticky top-0 z-50 border-b bg-card shadow-coffee">
      <div className="container mx-auto px-4 py-3">
        {/* Mobile header */}
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="flex items-center gap-2">
                  <img src="/logo_minha_cafe.png" alt="Logo" className="h-6 w-6 object-contain" />
                  <span className="truncate">Minha Colheita Café</span>
                </SheetTitle>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {selectedCompany ? `Operando como ${selectedCompany.nome}` : "Selecione uma empresa"}
                </p>
              </SheetHeader>

              <div className="px-2 py-3">
                {navItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <SheetClose asChild key={item.path}>
                      <button
                        type="button"
                        onClick={() => navigate(item.path)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors",
                          active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </button>
                    </SheetClose>
                  );
                })}

                {isMaster && (
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => navigate("/master")}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors",
                        isActive("/master") ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                      )}
                    >
                      <Building2 className="h-4 w-4" />
                      <span>Master</span>
                    </button>
                  </SheetClose>
                )}

                {canSwitchCompany && (
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => navigate("/selecionar-empresa")}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors",
                        isActive("/selecionar-empresa") ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                      )}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      <span>Trocar empresa</span>
                    </button>
                  </SheetClose>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selectedCompany?.nome ?? "Minha Colheita Café"}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedCompany ? "Operando" : "Selecione uma empresa"}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isActive("/lancamento") ? "default" : "secondary"}
              size="icon"
              onClick={() => navigate("/lancamento")}
              aria-label="Novo lançamento"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0 flex flex-col">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="flex min-w-0 items-center gap-2 text-left"
              title="Ir para o início"
            >
              <img src="/logo_minha_cafe.png" alt="Logo" className="h-6 w-6 object-contain" />
              <span className="truncate text-lg font-semibold text-foreground">Minha Colheita Café</span>
            </button>
            <span className="truncate text-xs text-muted-foreground">
              {selectedCompany ? `Operando como ${selectedCompany.nome}` : "Selecione uma empresa"}
            </span>
          </div>

          <div className="flex items-center gap-2" aria-label="Navegação">
            <Button variant={isActive("/dashboard") ? "default" : "ghost"} size="icon" onClick={() => navigate("/dashboard")}>
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button variant={isActive("/lancamento") ? "default" : "ghost"} size="icon" onClick={() => navigate("/lancamento")}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant={isActive("/panhadores") ? "default" : "ghost"} size="icon" onClick={() => navigate("/panhadores")}>
              <Users className="h-4 w-4" />
            </Button>
            <Button variant={isActive("/aparelhos") ? "default" : "ghost"} size="icon" onClick={() => navigate("/aparelhos")}>
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button variant={isActive("/propriedades") ? "default" : "ghost"} size="icon" onClick={() => navigate("/propriedades")}>
              <MapPinned className="h-4 w-4" />
            </Button>
            <Button variant={isActive("/configuracoes") ? "default" : "ghost"} size="icon" onClick={() => navigate("/configuracoes")}>
              <Settings className="h-4 w-4" />
            </Button>
            {isMaster && (
              <Button variant={isActive("/master") ? "default" : "ghost"} size="icon" onClick={() => navigate("/master")}>
                <Building2 className="h-4 w-4" />
              </Button>
            )}
            {canSwitchCompany && (
              <Button
                variant={isActive("/selecionar-empresa") ? "default" : "ghost"}
                size="icon"
                onClick={() => navigate("/selecionar-empresa")}
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};
