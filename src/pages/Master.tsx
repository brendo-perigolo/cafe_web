import { useMemo, useState, FormEvent } from "react";
import { Building2, Factory, RefreshCw, Search, ShieldCheck, UserPlus, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { MASTER_EMAIL } from "@/constants/master";

interface FormState {
  nome: string;
  cnpj: string;
  responsavel: string;
  email: string;
  telefone: string;
  plano: string;
  userEmails: string;
}

type Empresa = Tables<"empresas">;
type CreateEmpresaInput = {
  payload: TablesInsert<"empresas">;
  emails: string[];
};
type UpdateEmpresaEmailsInput = {
  empresaId: string;
  emails: string[];
};
type LinkResult = { linked: number; pending: string[]; invited: string[] };

const initialFormState: FormState = {
  nome: "",
  cnpj: "",
  responsavel: "",
  email: "",
  telefone: "",
  plano: "free",
  userEmails: "",
};

const sanitizeEmailList = (raw: string) => {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 3 && email.includes("@"))
    )
  );
};

const fetchProfilesByEmails = async (emails: string[]) => {
  if (emails.length === 0) return [] as Tables<"profiles">[];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .in("email", emails);
  if (error) throw error;
  return (data ?? []) as Tables<"profiles">[];
};

const ensureProfilesForEmails = async (emails: string[]) => {
  const existing = await fetchProfilesByEmails(emails);
  const existingEmails = new Set(existing.map((profile) => profile.email.toLowerCase()));
  const missing = emails.filter((email) => !existingEmails.has(email));
  const invited: string[] = [];

  for (const email of missing) {
    const username = email.split("@")[0];
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        username,
        full_name: email,
      },
    });
    if (error) throw error;
    invited.push(email);
  }

  let combined = existing;

  if (missing.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const invitedProfiles = await fetchProfilesByEmails(missing);
    combined = [...combined, ...invitedProfiles];
  }

  const normalizedCombined = new Set(
    combined.map((profile) => profile.email.toLowerCase())
  );

  const pending = emails.filter((email) => !normalizedCombined.has(email));

  return { profiles: combined, invited, pending };
};

const linkUsersToEmpresa = async (empresaId: string, emails: string[]): Promise<LinkResult> => {
  if (emails.length === 0) {
    return { linked: 0, pending: [], invited: [] };
  }

  const normalizedEmails = Array.from(new Set(emails.map((email) => email.toLowerCase())));
  const { profiles, invited, pending } = await ensureProfilesForEmails(normalizedEmails);

  if (profiles.length === 0) {
    return { linked: 0, pending, invited };
  }

  const payload: TablesInsert<"empresas_usuarios">[] = profiles.map((profile) => ({
    empresa_id: empresaId,
    user_id: profile.id,
    ativo: true,
  }));

  const { error: linkError } = await supabase
    .from("empresas_usuarios")
    .upsert(payload, { onConflict: "empresa_id,user_id" });

  if (linkError) throw linkError;

  return {
    linked: payload.length,
    pending,
    invited,
  };
};

const fetchEmpresas = async (): Promise<Empresa[]> => {
  const { data, error } = await supabase.from("empresas").select("*").order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
};

export default function Master() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [linkedEmails, setLinkedEmails] = useState<string[]>([]);
  const [manageEmailsLoading, setManageEmailsLoading] = useState(false);
  const [newEmailsInput, setNewEmailsInput] = useState("");
  const [profilesDirectory, setProfilesDirectory] = useState<Tables<"profiles">[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");

  const { data: empresas = [], isLoading, isFetching } = useQuery({
    queryKey: ["empresas"],
    queryFn: fetchEmpresas,
  });

  const createEmpresa = useMutation<Empresa, Error, CreateEmpresaInput>({
    mutationFn: async ({ payload }) => {
      const { data, error } = await supabase.from("empresas").insert(payload).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (empresa, variables) => {
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      setFormState(initialFormState);
      setIsDialogOpen(false);
      toast({
        title: "Empresa cadastrada",
        description: `${empresa.nome} adicionada ao portfólio`,
      });

      try {
        const uniqueEmails = Array.from(
          new Set([...variables.emails, MASTER_EMAIL.toLowerCase()])
        );
        const { linked, invited, pending } = await linkUsersToEmpresa(empresa.id, uniqueEmails);

        if (linked > 0) {
          toast({
            title: linked === 1 ? "Usuário vinculado" : "Usuários vinculados",
            description: `${linked} acesso(s) liberado(s) para esta empresa`,
          });
        }

        if (invited.length > 0) {
          toast({
            title: invited.length === 1 ? "Convite enviado" : "Convites enviados",
            description: `Os seguintes e-mails receberam instruções para ativar a conta: ${invited.join(", ")}`,
          });
        }

        if (pending.length > 0) {
          toast({
            title: "Aguardando criação do perfil",
            description: `Ainda não localizados: ${pending.join(", ")}. Tente novamente em instantes.`,
          });
        }
      } catch (error) {
        toast({
          title: "Falha ao vincular usuários",
          description: error instanceof Error ? error.message : "Erro inesperado",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Erro ao cadastrar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addEmailsMutation = useMutation<LinkResult, Error, UpdateEmpresaEmailsInput>({
    mutationFn: ({ empresaId, emails }) => linkUsersToEmpresa(empresaId, emails),
    onSuccess: ({ linked, pending, invited }, variables) => {
      loadLinkedEmails(variables.empresaId);
      setNewEmailsInput("");

      if (linked > 0) {
        toast({
          title: linked === 1 ? "Usuário vinculado" : "Usuários vinculados",
          description: `${linked} novo(s) acesso(s) liberado(s)`,
        });
      }

      if (invited.length > 0) {
        toast({
          title: invited.length === 1 ? "Convite enviado" : "Convites enviados",
          description: invited.join(", "),
        });
      }

      if (pending.length > 0) {
        toast({
          title: "E-mails não encontrados",
          description: `Aguardando criação do perfil: ${pending.join(", ")}`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Falha ao vincular usuários",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleEmpresa = useMutation<unknown, Error, { id: string; ativa: boolean }>({
    mutationFn: async ({ id, ativa }) => {
      const { error } = await supabase.from("empresas").update({ ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      toast({
        title: variables.ativa ? "Empresa ativada" : "Empresa desativada",
        description: "Status atualizado com sucesso",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredEmpresas = useMemo(() => {
    return empresas.filter((empresa) => {
      const matchesSearch = empresa.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (empresa.cnpj?.includes(searchTerm) ?? false) ||
        (empresa.responsavel?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "active" ? empresa.ativa : !empresa.ativa;

      return matchesSearch && matchesStatus;
    });
  }, [empresas, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = empresas.length;
    const ativos = empresas.filter((empresa) => empresa.ativa).length;
    const inativos = total - ativos;
    return { total, ativos, inativos };
  }, [empresas]);

  const filteredProfiles = useMemo(() => {
    const normalizedLinked = new Set(linkedEmails.map((email) => email.toLowerCase()));
    const searchTermLower = profileSearch.trim().toLowerCase();

    return profilesDirectory
      .filter((profile) => profile.email)
      .filter((profile) => !normalizedLinked.has(profile.email!.toLowerCase()))
      .filter((profile) => {
        if (!searchTermLower) return true;
        const matchEmail = profile.email?.toLowerCase().includes(searchTermLower);
        const matchName = profile.full_name?.toLowerCase().includes(searchTermLower);
        return Boolean(matchEmail || matchName);
      })
      .slice(0, 10);
  }, [profilesDirectory, linkedEmails, profileSearch]);

  const loadLinkedEmails = async (empresaId: string) => {
    setManageEmailsLoading(true);
    try {
      const { data, error } = await supabase
        .from("empresas_usuarios")
        .select("profiles:profiles!inner(email)")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const emails = Array.from(
        new Set(
          (data ?? [])
            .map((registro) => {
              const profile = registro.profiles as Tables<"profiles"> | null;
              return profile?.email?.toLowerCase() ?? null;
            })
            .filter((email): email is string => Boolean(email))
        )
      );

      setLinkedEmails(emails);
    } catch (error) {
      console.error("Erro ao carregar usuários da empresa", error);
      toast({
        title: "Falha ao carregar usuários",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setManageEmailsLoading(false);
    }
  };

  const openManageDialog = (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    setManageDialogOpen(true);
    setNewEmailsInput("");
    loadLinkedEmails(empresa.id);
    if (profilesDirectory.length === 0 && !profilesLoading) {
      loadProfilesDirectory();
    }
  };

  const closeManageDialog = () => {
    setManageDialogOpen(false);
    setSelectedEmpresa(null);
    setLinkedEmails([]);
    setNewEmailsInput("");
    setProfileSearch("");
  };

  const loadProfilesDirectory = async () => {
    setProfilesLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email", { ascending: true });

      if (error) throw error;

      setProfilesDirectory(data ?? []);
    } catch (error) {
      console.error("Erro ao listar usuários", error);
      toast({
        title: "Falha ao carregar usuários",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleCreateEmpresa = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.nome.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Informe o nome fantasia da empresa",
        variant: "destructive",
      });
      return;
    }

    const parsedEmails = sanitizeEmailList(formState.userEmails);

    const payload: TablesInsert<"empresas"> = {
      nome: formState.nome.trim(),
      cnpj: formState.cnpj.trim() || null,
      responsavel: formState.responsavel.trim() || null,
      email: formState.email.trim() || null,
      telefone: formState.telefone.trim() || null,
      plano: formState.plano,
      metadata: { origem: "master-panel" },
    };

    createEmpresa.mutate({ payload, emails: parsedEmails });
  };

  const handleAddEmails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmpresa) return;

    const sanitized = sanitizeEmailList(newEmailsInput).filter(
      (email) => !linkedEmails.includes(email)
    );

    if (sanitized.length === 0) {
      toast({
        title: "Nenhum e-mail novo",
        description: "Verifique se os e-mails foram preenchidos corretamente ou se já possuem acesso",
      });
      return;
    }

    addEmailsMutation.mutate({ empresaId: selectedEmpresa.id, emails: sanitized });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/30 to-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Painel Master</p>
            <h1 className="text-3xl font-bold">Orquestração de Empresas</h1>
            <p className="text-muted-foreground max-w-2xl">
              Cadastre novas operações, acompanhe status de ativação e mantenha a saúde da rede de empresas em dia.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["empresas"] })} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Nova empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Registrar empresa</DialogTitle>
                  <DialogDescription>Organize aqui empresas que terão acesso ao ecossistema.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreateEmpresa}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome fantasia</Label>
                      <Input
                        id="nome"
                        value={formState.nome}
                        onChange={(event) => setFormState((prev) => ({ ...prev, nome: event.target.value }))}
                        placeholder="Fazenda Horizonte"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <Input
                        id="cnpj"
                        value={formState.cnpj}
                        onChange={(event) => setFormState((prev) => ({ ...prev, cnpj: event.target.value }))}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="responsavel">Responsável</Label>
                      <Input
                        id="responsavel"
                        value={formState.responsavel}
                        onChange={(event) => setFormState((prev) => ({ ...prev, responsavel: event.target.value }))}
                        placeholder="Maria Andrade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        value={formState.telefone}
                        onChange={(event) => setFormState((prev) => ({ ...prev, telefone: event.target.value }))}
                        placeholder="(11) 99999-0000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail de contato</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formState.email}
                        onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="contato@empresa.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select
                        value={formState.plano}
                        onValueChange={(value) => setFormState((prev) => ({ ...prev, plano: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um plano" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Gratuito</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="userEmails">E-mails autorizados</Label>
                      <Textarea
                        id="userEmails"
                        value={formState.userEmails}
                        onChange={(event) => setFormState((prev) => ({ ...prev, userEmails: event.target.value }))}
                        placeholder="usuario@fazenda.com; financeiro@empresa.com"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Informe todos os e-mails que terão acesso (use vírgula, ponto e vírgula ou quebras de linha). O e-mail master é incluído automaticamente.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createEmpresa.isPending}>
                      {createEmpresa.isPending ? "Cadastrando..." : "Cadastrar"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-coffee">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Total de empresas</CardTitle>
                <CardDescription>Portfólio completo</CardDescription>
              </div>
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="shadow-coffee">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Operações ativas</CardTitle>
                <CardDescription>Com acesso liberado</CardDescription>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.ativos}</p>
            </CardContent>
          </Card>
          <Card className="shadow-coffee">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Em preparação</CardTitle>
                <CardDescription>Inativas aguardando ativação</CardDescription>
              </div>
              <Factory className="h-6 w-6 text-amber-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.inativos}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-coffee">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Empresas cadastradas</CardTitle>
              <CardDescription>Filtre por status, busque por nome ou responsável.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome, CNPJ ou responsável"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <div className="flex rounded-md border bg-muted/50 p-1">
                <Button
                  variant={statusFilter === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  Todas
                </Button>
                <Button
                  variant={statusFilter === "active" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("active")}
                >
                  Ativas
                </Button>
                <Button
                  variant={statusFilter === "inactive" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inativas
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : filteredEmpresas.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center text-muted-foreground">
                <Building2 className="mb-3 h-10 w-10" />
                <p>Nenhuma empresa encontrada com os filtros aplicados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmpresas.map((empresa) => {
                      const isUpdating = toggleEmpresa.isPending && toggleEmpresa.variables?.id === empresa.id;
                      return (
                        <TableRow key={empresa.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{empresa.nome}</span>
                              <span className="text-xs text-muted-foreground">
                                Criada em {new Date(empresa.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{empresa.responsavel ?? "—"}</span>
                            {empresa.email && (
                              <span className="block text-xs text-muted-foreground">{empresa.email}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{empresa.cnpj ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {empresa.plano}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={empresa.ativa ? "default" : "secondary"}>
                              {empresa.ativa ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openManageDialog(empresa)}>
                                Usuários
                              </Button>
                              <Switch
                                checked={empresa.ativa}
                                onCheckedChange={(checked) => toggleEmpresa.mutate({ id: empresa.id, ativa: checked })}
                                disabled={isUpdating}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={manageDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeManageDialog();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Usuários autorizados</DialogTitle>
            <DialogDescription>
              {selectedEmpresa
                ? `Gerencie quem pode acessar ${selectedEmpresa.nome}`
                : "Selecione uma empresa para gerenciar os acessos."}
            </DialogDescription>
          </DialogHeader>

          {manageEmailsLoading ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="rounded-md border p-3">
                {linkedEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário vinculado ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {linkedEmails.map((email) => (
                      <Badge key={email} variant="outline" className="font-mono text-xs">
                        {email}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="profileSearch">Adicionar usuário existente</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={loadProfilesDirectory}
                      disabled={profilesLoading}
                    >
                      {profilesLoading ? "Atualizando..." : "Atualizar lista"}
                    </Button>
                  </div>
                  <Input
                    id="profileSearch"
                    placeholder="Busque por e-mail ou nome"
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                  />
                </div>
                {profilesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando usuários...
                  </div>
                ) : filteredProfiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário disponível para adicionar.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{profile.full_name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            selectedEmpresa &&
                            profile.email &&
                            addEmailsMutation.mutate({
                              empresaId: selectedEmpresa.id,
                              emails: [profile.email.toLowerCase()],
                            })
                          }
                          disabled={addEmailsMutation.isPending || !selectedEmpresa}
                        >
                          Adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form className="space-y-4" onSubmit={handleAddEmails}>
                <div className="space-y-2">
                  <Label htmlFor="newEmails">Adicionar novos e-mails</Label>
                  <Textarea
                    id="newEmails"
                    value={newEmailsInput}
                    onChange={(event) => setNewEmailsInput(event.target.value)}
                    placeholder="novousuario@empresa.com"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Os usuários precisam ter cadastro ativo. Informe apenas e-mails novos; acessos existentes serão mantidos.
                  </p>
                </div>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={closeManageDialog}>
                    Fechar
                  </Button>
                  <Button type="submit" disabled={addEmailsMutation.isPending}>
                    {addEmailsMutation.isPending ? "Adicionando..." : "Adicionar acessos"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
