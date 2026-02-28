import { Coffee, LogOut, Users, Plus, BarChart3, Building2, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_EMAIL } from "@/constants/master";
import { useNavigate, useLocation } from "react-router-dom";

export const Navbar = () => {
  const { signOut, selectedCompany, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMaster = user?.email?.toLowerCase() === MASTER_EMAIL.toLowerCase();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 border-b bg-card shadow-coffee">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Coffee className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold text-foreground">Minha Colheita Café</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedCompany ? `Operando como ${selectedCompany.nome}` : "Selecione uma empresa"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isActive("/dashboard") ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/dashboard")}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button
            variant={isActive("/lancamento") ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/lancamento")}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant={isActive("/panhadores") ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/panhadores")}
          >
            <Users className="h-4 w-4" />
          </Button>
          {isMaster && (
            <Button
              variant={isActive("/master") ? "default" : "ghost"}
              size="sm"
              onClick={() => navigate("/master")}
            >
              <Building2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant={isActive("/selecionar-empresa") ? "default" : "ghost"}
            size="sm"
            onClick={() => navigate("/selecionar-empresa")}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
