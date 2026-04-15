import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense } from "react";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PwaCacheGuard } from "@/components/PwaCacheGuard";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Lancamento = lazy(() => import("@/pages/Lancamento"));
const Panhadores = lazy(() => import("./pages/Panhadores"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Master = lazy(() => import("./pages/Master"));
const SelectEmpresa = lazy(() => import("./pages/SelectEmpresa"));
const Movimentacoes = lazy(() => import("./pages/Movimentacoes"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Aparelhos = lazy(() => import("./pages/Aparelhos"));
const PropriedadesLavouras = lazy(() => import("./pages/PropriedadesLavouras"));
const Encarregados = lazy(() => import("./pages/Encarregados"));
const Despesas = lazy(() => import("./pages/Despesas"));
const PlanosContas = lazy(() => import("./pages/PlanosContas"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
);

const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) return <RouteFallback />;

  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PwaInstallBanner />
        <PwaCacheGuard />
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lancamento"
                element={
                  <ProtectedRoute>
                    <Lancamento />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/panhadores"
                element={
                  <ProtectedRoute>
                    <Panhadores />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/movimentacoes"
                element={
                  <ProtectedRoute>
                    <Movimentacoes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/aparelhos"
                element={
                  <ProtectedRoute>
                    <Aparelhos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute>
                    <Configuracoes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/despesas"
                element={
                  <ProtectedRoute>
                    <Despesas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/planos-contas"
                element={
                  <ProtectedRoute>
                    <PlanosContas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/propriedades"
                element={
                  <ProtectedRoute>
                    <PropriedadesLavouras />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/encarregados"
                element={
                  <ProtectedRoute>
                    <Encarregados />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/master"
                element={
                  <ProtectedRoute requiresCompany={false} requireMaster>
                    <Master />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/selecionar-empresa"
                element={
                  <ProtectedRoute requiresCompany={false}>
                    <SelectEmpresa />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
