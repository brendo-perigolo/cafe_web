import { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthApiError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { MASTER_EMAIL } from "@/constants/master";
import {
  clearSupabaseAuthFromLocalStorage,
  getKeepConnectedPreference,
  getPreferredStorage,
  removeFromBothStorages,
} from "@/lib/authStorage";
import { cacheKey, writeJson } from "@/lib/offline";
import { clearEncryptedLoginState, saveEncryptedLoginState } from "@/lib/secureLogin";

const LAST_PATH_STORAGE_KEY = "safra:last_path";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    username: string,
    fullName: string,
    password: string
  ) => Promise<{ error: Error | null; requiresConfirmation: boolean }>;
  signOut: () => Promise<void>;
  companies: Tables<"empresas">[];
  selectedCompany: Tables<"empresas"> | null;
  companiesLoading: boolean;
  companyReady: boolean;
  refreshCompanies: () => Promise<void>;
  selectCompany: (empresaId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const COMPANY_STORAGE_KEY = "safra:selected_empresa";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [companies, setCompanies] = useState<Tables<"empresas">[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyReady, setCompanyReady] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Tables<"empresas"> | null>(() => {
    try {
      const storedId = window.localStorage.getItem(COMPANY_STORAGE_KEY);
      return storedId ? ({ id: storedId, nome: "Carregando..." } as Tables<"empresas">) : null;
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Guarda a última rota visitada (para voltar após reload)
    const path = location.pathname;
    if (!path || path === "/auth") return;
    getPreferredStorage().setItem(LAST_PATH_STORAGE_KEY, path);
  }, [location.pathname]);

  const ensureProfileExists = async (currentUser: User) => {
    try {
      const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (selectError) throw selectError;
      if (existing?.id) return;

      const email = currentUser.email;
      if (!email) {
        throw new Error("Usuário autenticado sem e-mail; não é possível criar profile.");
      }

      const rawUsername =
        (currentUser.user_metadata?.username as string | undefined) ||
        email.split("@")[0] ||
        `user_${currentUser.id.slice(0, 8)}`;

      const baseUsername = rawUsername
        .toLowerCase()
        .replace(/[^a-z0-9_\.\-]/g, "_")
        .slice(0, 32) || `user_${currentUser.id.slice(0, 8)}`;

      const fullName =
        (currentUser.user_metadata?.full_name as string | undefined) ||
        baseUsername;

      let username = baseUsername;

      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: currentUser.id,
          email,
          username,
          full_name: fullName,
        });

        if (!insertError) return;

        const isUsernameConflict =
          (insertError as { code?: string; message?: string }).code === "23505" ||
          (insertError as { message?: string }).message?.toLowerCase().includes("profiles_username") ||
          (insertError as { message?: string }).message?.toLowerCase().includes("duplicate") ||
          false;

        if (isUsernameConflict && attempt < 2) {
          username = `${baseUsername}_${Math.random().toString(16).slice(2, 6)}`;
          continue;
        }

        throw insertError;
      }
    } catch (error) {
      console.error("Falha ao garantir profile do usuário:", error);
    }
  };

  const resetCompanies = () => {
    setCompanies([]);
    setSelectedCompany(null);
    setCompaniesLoading(false);
    setCompanyReady(false);
    removeFromBothStorages(COMPANY_STORAGE_KEY);
    window.localStorage.removeItem(COMPANY_STORAGE_KEY);
  };

  const loadCompanies = async (userId: string, userEmail?: string | null) => {
    try {
      let lista: Tables<"empresas">[] = [];

      if (userEmail && userEmail.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
        const { data, error } = await supabase
          .from("empresas")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) throw error;
        lista = data ?? [];
      } else {
        const { data, error } = await supabase
          .from("empresas_usuarios")
          .select("empresa_id, empresas!inner(*)")
          .eq("user_id", userId)
          .eq("ativo", true)
          .eq("empresas.ativa", true)
          .order("created_at", { ascending: true });

        if (error) throw error;

        lista = (data ?? [])
          .map((registro) => registro.empresas)
          .filter((empresa): empresa is Tables<"empresas"> => Boolean(empresa?.id));
      }

      setCompanies(lista);

      // Empresa selecionada precisa persistir em reload, então usamos localStorage.
      const storedId = window.localStorage.getItem(COMPANY_STORAGE_KEY);

      const preferredId = storedId ?? selectedCompany?.id;

      const preferredCompany = preferredId
        ? lista.find((empresa) => empresa.id === preferredId)
        : undefined;

      if (preferredCompany) {
        setSelectedCompany(preferredCompany);
        window.localStorage.setItem(COMPANY_STORAGE_KEY, preferredCompany.id);
        return;
      }

      if (lista.length === 1) {
        setSelectedCompany(lista[0]);
        window.localStorage.setItem(COMPANY_STORAGE_KEY, lista[0].id);
      } else {
        setSelectedCompany(null);
        window.localStorage.removeItem(COMPANY_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Erro ao carregar empresas vinculadas:", error);
      // Importante: não derruba a empresa selecionada em falhas transitórias (reload/offline/intermitência).
      // Mantém o que já temos e deixa o usuário seguir.
      setCompanies([]);
    }
  };

  useEffect(() => {
    // Setup auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Mantém loading enquanto carregamos empresas/empresa selecionada para evitar
        // o ProtectedRoute abrir o seletor durante reload.
        setLoading(false);
        setAuthInitialized(true);
      }
    );

    let cancelled = false;

    // Check existing session (must never leave the app stuck in loading on offline/edge cases)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.warn("Falha ao recuperar sessão do Supabase (seguindo sem sessão):", error);
      } finally {
        if (cancelled) return;
        setLoading(false);
        setAuthInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Importante: durante reload, o `user` começa null antes de recuperarmos a sessão.
    // Não podemos apagar a empresa selecionada nesse momento, senão o app pede seleção toda hora.
    if (!authInitialized) {
      return;
    }

    if (!user) {
      resetCompanies();
      return;
    }

    // Ao recarregar, pode haver um "flash" do seletor antes do loadCompanies concluir.
    // Garantimos companiesLoading=true durante esse bootstrap.
    setCompaniesLoading(true);
    setCompanyReady(false);
    (async () => {
      try {
        await ensureProfileExists(user);
        await loadCompanies(user.id, user.email);
      } finally {
        setCompaniesLoading(false);
        setCompanyReady(true);
      }
    })();
  }, [user, authInitialized]);

  useEffect(() => {
    if (!user) return;
    if (getKeepConnectedPreference()) return;

    let timeoutId: number | undefined;

    const scheduleLogout = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        // Best-effort sign out on inactivity
        supabase.auth
          .signOut()
          .catch(() => {
            // ignore
          })
          .finally(() => {
            resetCompanies();
            navigate("/auth");
          });
      }, INACTIVITY_TIMEOUT_MS);
    };

    const handleActivity = () => scheduleLogout();

    scheduleLogout();

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];

    events.forEach((eventName) => window.addEventListener(eventName, handleActivity));

    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [user, navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      // Default behavior is NOT to keep the session across browser close.
      // The UI can set this preference before calling signIn.
      if (!getKeepConnectedPreference()) {
        clearSupabaseAuthFromLocalStorage();
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };

      // Após login, acelera o bootstrap: garante profile, carrega empresas e dispara prefetch.
      // (O listener de auth também fará isso, mas aqui reduz o tempo até o cache ficar pronto.)
      const loggedUser = data?.user ?? null;
      if (loggedUser) {
        await ensureProfileExists(loggedUser);
        await loadCompanies(loggedUser.id, loggedUser.email);

        const empresaId =
          window.localStorage.getItem(COMPANY_STORAGE_KEY) ||
          selectedCompany?.id ||
          "";
        if (empresaId) {
          // Não bloqueia navegação: apenas dispara para popular o cache.
          prefetchEmpresaData(empresaId);
        }
      }

      // Após login, tenta voltar para a última rota útil, senão vai para dashboard.
      const storage = getPreferredStorage();
      const lastPath = storage.getItem(LAST_PATH_STORAGE_KEY);
      const safeLast = lastPath && lastPath !== "/auth" ? lastPath : "/dashboard";
      navigate(safeLast);

      // Salva metadados de login localmente (criptografado). Não armazena senha.
      saveEncryptedLoginState({
        email,
        user_id: loggedUser?.id,
        selected_empresa_id: window.localStorage.getItem(COMPANY_STORAGE_KEY) ?? undefined,
      });
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, username: string, fullName: string, password: string) => {
    try {
      const redirectUrl = `${window.location.origin}/dashboard`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullName,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error instanceof AuthApiError) {
          if (error.status === 429 || error.message.toLowerCase().includes("rate limit")) {
            return {
              error: new Error("Muitas solicitações de cadastro. Aguarde alguns instantes antes de tentar novamente."),
              requiresConfirmation: false,
            };
          }

          if (error.status === 400 && error.message.toLowerCase().includes("already registered")) {
            return {
              error: new Error("Este e-mail já possui cadastro. Utilize a tela de login."),
              requiresConfirmation: false,
            };
          }
        }

        return { error, requiresConfirmation: false };
      }

      if (data?.session) {
        navigate("/dashboard");
        return { error: null, requiresConfirmation: false };
      }

      return {
        error: null,
        requiresConfirmation: true,
      };
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 429) {
        return {
          error: new Error("Muitas tentativas de cadastro. Aguarde um momento e tente novamente."),
          requiresConfirmation: false,
        };
      }
      return { error: error as Error, requiresConfirmation: false };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearEncryptedLoginState();
    resetCompanies();
    navigate("/auth");
  };

  const prefetchEmpresaData = async (empresaId: string) => {
    if (!empresaId.trim()) return;
    if (!navigator.onLine) return;

    // Panhadores (tela + lançamento)
    try {
      const primary = await supabase
        .from("panhadores")
        .select("id, nome, apelido, cpf, telefone, bag_numero, bag_semana, bag_atualizado_em, created_at")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("created_at", { ascending: false });

      if (!primary.error) {
        writeJson(cacheKey("panhadores_list", empresaId), {
          cachedAt: new Date().toISOString(),
          bagFieldsSupported: true,
          panhadores: primary.data ?? [],
        });
      } else {
        const message = (primary.error as { message?: string }).message?.toLowerCase() ?? "";
        const looksLikeMissingColumn =
          message.includes("column") || message.includes("bag_numero") || message.includes("bag_semana") || message.includes("bag_atualizado_em");

        if (looksLikeMissingColumn) {
          const fallback = await supabase
            .from("panhadores")
            .select("id, nome, apelido, cpf, telefone, created_at")
            .eq("empresa_id", empresaId)
            .eq("ativo", true)
            .order("created_at", { ascending: false });
          if (!fallback.error) {
            writeJson(cacheKey("panhadores_list", empresaId), {
              cachedAt: new Date().toISOString(),
              bagFieldsSupported: false,
              panhadores: (fallback.data ?? []).map((p) => ({ ...p, bag_numero: null })),
            });
          }
        }
      }
    } catch {
      // ignore
    }

    // Propriedades + Lavouras (lançamento)
    try {
      const props = await supabase
        .from("propriedades")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .order("nome", { ascending: true, nullsFirst: true });

      if (!props.error) {
        writeJson(cacheKey("propriedades_list", empresaId), {
          cachedAt: new Date().toISOString(),
          supported: true,
          propriedades: props.data ?? [],
        });
      } else {
        const message = (props.error as { message?: string }).message?.toLowerCase() ?? "";
        const looksLikeMissingTable =
          (props.error as { code?: string }).code === "42P01" || message.includes("relation") || message.includes("does not exist");
        if (looksLikeMissingTable) {
          writeJson(cacheKey("propriedades_list", empresaId), {
            cachedAt: new Date().toISOString(),
            supported: false,
            propriedades: [],
          });
        }
      }

      const lavouras = await supabase
        .from("lavouras")
        .select("id, nome, propriedade_id")
        .eq("empresa_id", empresaId)
        .order("nome", { ascending: true });

      if (!lavouras.error) {
        writeJson(cacheKey("lavouras_list", empresaId), {
          cachedAt: new Date().toISOString(),
          supported: true,
          lavouras: lavouras.data ?? [],
        });
      } else {
        const message = (lavouras.error as { message?: string }).message?.toLowerCase() ?? "";
        const looksLikeMissingTable =
          (lavouras.error as { code?: string }).code === "42P01" || message.includes("relation") || message.includes("does not exist");
        if (looksLikeMissingTable) {
          writeJson(cacheKey("lavouras_list", empresaId), {
            cachedAt: new Date().toISOString(),
            supported: false,
            lavouras: [],
          });
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user || !session) return;
    saveEncryptedLoginState({
      email: user.email ?? undefined,
      user_id: user.id,
      selected_empresa_id: selectedCompany?.id ?? undefined,
    });
  }, [user?.id, session?.access_token, selectedCompany?.id]);

  useEffect(() => {
    if (!user || !selectedCompany?.id) return;
    // Pré-carrega dados essenciais após login/seleção de empresa.
    prefetchEmpresaData(selectedCompany.id);
  }, [user?.id, selectedCompany?.id]);

  const selectCompany = (empresaId: string) => {
    const company = companies.find((empresa) => empresa.id === empresaId) ?? null;
    setSelectedCompany(company);
    if (company) {
      window.localStorage.setItem(COMPANY_STORAGE_KEY, company.id);
    } else {
      removeFromBothStorages(COMPANY_STORAGE_KEY);
    }
  };

  const refreshCompanies = async () => {
    if (user) {
      setCompaniesLoading(true);
      setCompanyReady(false);
      await loadCompanies(user.id, user.email);
      setCompaniesLoading(false);
      setCompanyReady(true);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        companies,
        selectedCompany,
        companiesLoading,
        companyReady,
        refreshCompanies,
        selectCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
