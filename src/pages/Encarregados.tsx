import { useEffect, useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { MASTER_EMAIL } from "@/constants/master";

type Encarregado = {
  id: string;
  user_id: string;
  cargo: string | null;
  ativo: boolean;
  profile: {
    email: string;
    full_name: string;
    username: string;
  } | null;
};

type EmpresasUsuarioWithProfile = Tables<"empresas_usuarios"> & {
  profiles: Tables<"profiles"> | null;
};

const normalizeCargo = (cargo: string | null): "admin" | "user" => (cargo === "admin" ? "admin" : "user");

export default function Encarregados() {
  const { user, selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [encarregados, setEncarregados] = useState<Encarregado[]>([]);
  const [myCargo, setMyCargo] = useState<"admin" | "user">("user");

  const isMaster = useMemo(() => {
    const email = user?.email ?? "";
    return Boolean(email) && email.toLowerCase() === MASTER_EMAIL.toLowerCase();
  }, [user?.email]);

  const isAdmin = isMaster || myCargo === "admin";

  const loadEncarregados = async () => {
    if (!user || !selectedCompany) {
      setEncarregados([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: myLink, error: myLinkError }, { data, error }] = await Promise.all([
        supabase
          .from("empresas_usuarios")
          .select("cargo")
          .eq("empresa_id", selectedCompany.id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("empresas_usuarios")
          .select("id, user_id, cargo, ativo, profiles(email, full_name, username)")
          .eq("empresa_id", selectedCompany.id)
          .order("created_at", { ascending: true }),
      ]);

      if (myLinkError) throw myLinkError;
      if (error) throw error;

      setMyCargo(normalizeCargo(myLink?.cargo ?? null));

      const normalized: Encarregado[] = ((data ?? []) as EmpresasUsuarioWithProfile[]).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        cargo: row.cargo,
        ativo: Boolean(row.ativo),
        profile: row.profiles
          ? {
              email: row.profiles.email,
              full_name: row.profiles.full_name,
              username: row.profiles.username,
            }
          : null,
      }));

      setEncarregados(normalized);
    } catch (err) {
      console.error("Erro ao carregar encarregados:", err);
      toast({ title: "Erro", description: "Não foi possível carregar os encarregados.", variant: "destructive" });
      setEncarregados([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEncarregados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedCompany?.id]);

  const handleChangeCargo = async (id: string, nextCargo: "admin" | "user") => {
    if (!user || !selectedCompany) return;

    if (!isAdmin) {
      toast({
        title: "Sem permissão",
        description: "Apenas administradores podem alterar o cargo.",
        variant: "destructive",
      });
      return;
    }

    const previous = encarregados;
    setSavingId(id);
    setEncarregados((prev) => prev.map((row) => (row.id === id ? { ...row, cargo: nextCargo } : row)));

    try {
      const { error } = await supabase
        .from("empresas_usuarios")
        .update({ cargo: nextCargo })
        .eq("id", id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      toast({ title: "Cargo atualizado", description: "Permissões atualizadas com sucesso." });
    } catch (err) {
      console.error("Erro ao atualizar cargo:", err);
      setEncarregados(previous);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o cargo. Verifique suas permissões.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Encarregados</h1>
            <p className="text-muted-foreground">Usuários vinculados à empresa e seus cargos</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>
              {selectedCompany ? `Empresa: ${selectedCompany.nome}` : "Selecione uma empresa"}
              {!isAdmin && selectedCompany ? " • Apenas admins podem alterar cargos" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-[200px]">Cargo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : encarregados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        Nenhum usuário encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    encarregados.map((row) => {
                      const cargoValue = normalizeCargo(row.cargo);
                      const disabled = !isAdmin || savingId === row.id;
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{row.profile?.email ?? "—"}</TableCell>
                          <TableCell>{row.profile?.full_name || row.profile?.username || "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={cargoValue}
                              disabled={disabled}
                              onValueChange={(value) => handleChangeCargo(row.id, value as "admin" | "user")}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">admin</SelectItem>
                                <SelectItem value="user">user</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
