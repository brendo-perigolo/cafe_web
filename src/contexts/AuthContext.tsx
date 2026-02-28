import { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthApiError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { MASTER_EMAIL } from "@/constants/master";

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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Tables<"empresas">[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Tables<"empresas"> | null>(null);
  const navigate = useNavigate();

  const resetCompanies = () => {
    setCompanies([]);
    setSelectedCompany(null);
    setCompaniesLoading(false);
    localStorage.removeItem(COMPANY_STORAGE_KEY);
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

      const storedId = localStorage.getItem(COMPANY_STORAGE_KEY);
      const storedCompany = lista.find((empresa) => empresa.id === storedId);

      if (storedCompany) {
        setSelectedCompany(storedCompany);
        return;
      }

      if (lista.length === 1) {
        setSelectedCompany(lista[0]);
        localStorage.setItem(COMPANY_STORAGE_KEY, lista[0].id);
      } else {
        setSelectedCompany(null);
        localStorage.removeItem(COMPANY_STORAGE_KEY);
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
      loadCompanies(user.id, user.email);
    } else {
      resetCompanies();
    }
  }, [user]);

  const signIn = async (email: string, password: string) => {
    try {
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
      localStorage.setItem(COMPANY_STORAGE_KEY, company.id);
    } else {
      localStorage.removeItem(COMPANY_STORAGE_KEY);
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
