import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_EMAIL } from "@/constants/master";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresCompany?: boolean;
  requireMaster?: boolean;
}

export const ProtectedRoute = ({ children, requiresCompany = true, requireMaster = false }: ProtectedRouteProps) => {
  const { user, loading, companiesLoading, companyReady, selectedCompany } = useAuth();

  const canCheckCompany = useMemo(() => {
    if (!requiresCompany) return true;
    return companyReady;
  }, [requiresCompany, companyReady]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiresCompany && (companiesLoading || !companyReady)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (requireMaster && user.email?.toLowerCase() !== MASTER_EMAIL.toLowerCase()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!requireMaster && requiresCompany && canCheckCompany && !selectedCompany) {
    return <Navigate to="/selecionar-empresa" replace />;
  }

  return <>{children}</>;
};
