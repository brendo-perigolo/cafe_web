import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_EMAIL } from "@/constants/master";
import { LoadingScreen } from "@/components/LoadingScreen";

const LAST_OK_PATH_KEY = "safra:last_ok_path";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresCompany?: boolean;
  requireMaster?: boolean;
}

export const ProtectedRoute = ({ children, requiresCompany = true, requireMaster = false }: ProtectedRouteProps) => {
  const { user, loading, companiesLoading, companyReady, selectedCompany } = useAuth();
  const location = useLocation();

  const canCheckCompany = useMemo(() => {
    if (!requiresCompany) return true;
    return companyReady;
  }, [requiresCompany, companyReady]);

  if (loading) {
    return <LoadingScreen title="Carregando..." detail="Validando sessão" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiresCompany && (companiesLoading || !companyReady)) {
    return <LoadingScreen title="Carregando..." detail="Buscando empresas" />;
  }

  if (requireMaster && user.email?.toLowerCase() !== MASTER_EMAIL.toLowerCase()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!requireMaster && requiresCompany && canCheckCompany && !selectedCompany) {
    return <Navigate to="/selecionar-empresa" replace />;
  }

  try {
    // Mark this route as last known-good so we can return to it if a future page stalls.
    if (location.pathname && location.pathname !== "/auth") {
      window.localStorage.setItem(LAST_OK_PATH_KEY, location.pathname);
    }
  } catch {
    // ignore
  }

  return <>{children}</>;
};
