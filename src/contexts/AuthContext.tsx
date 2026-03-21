import { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthApiError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { MASTER_EMAIL } from "@/constants/master";
import {
  clearSupabaseAuthFromLocalStorage,
  getKeepConnectedPreference,
  getPreferredStorage,
  removeFromBothStorages,
} from "@/lib/authStorage";

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
  const [companies, setCompanies] = useState<Tables<"empresas">[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Tables<"empresas"> | null>(null);
  const navigate = useNavigate();

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
    removeFromBothStorages(COMPANY_STORAGE_KEY);
  };

  const loadCompanies = async (userId: string, userEmail?: string | null) => {
    setCompaniesLoading(true);
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

      const storage = getPreferredStorage();
      const storedId = storage.getItem(COMPANY_STORAGE_KEY);

      const currentSelectedId = selectedCompany?.id;
      const preferredId = storedId ?? currentSelectedId;

      const preferredCompany = preferredId
        ? lista.find((empresa) => empresa.id === preferredId)
        : undefined;

      if (preferredCompany) {
        setSelectedCompany(preferredCompany);
        storage.setItem(COMPANY_STORAGE_KEY, preferredCompany.id);
        return;
      }

      if (lista.length === 1) {
        setSelectedCompany(lista[0]);
        storage.setItem(COMPANY_STORAGE_KEY, lista[0].id);
      } else {
        setSelectedCompany(null);
        storage.removeItem(COMPANY_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Erro ao carregar empresas vinculadas:", error);
      resetCompanies();
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    // Setup auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      (async () => {
        await ensureProfileExists(user);
        await loadCompanies(user.id, user.email);
      })();
    } else {
      resetCompanies();
    }
  }, [user]);

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

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };

      navigate("/dashboard");
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
    resetCompanies();
    navigate("/auth");
  };

  const selectCompany = (empresaId: string) => {
    const company = companies.find((empresa) => empresa.id === empresaId) ?? null;
    setSelectedCompany(company);
    if (company) {
      getPreferredStorage().setItem(COMPANY_STORAGE_KEY, company.id);
    } else {
      removeFromBothStorages(COMPANY_STORAGE_KEY);
    }
  };

  const refreshCompanies = async () => {
    if (user) {
      await loadCompanies(user.id, user.email);
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
