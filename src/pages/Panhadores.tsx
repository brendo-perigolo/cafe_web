import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const panhadorSchema = z.object({
  nome: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  apelido: z.string().trim().max(120, "Apelido deve ter no máximo 120 caracteres").optional(),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos numéricos").optional(),
  telefone: z
    .string()
    .min(8, "Telefone deve ter pelo menos 8 caracteres")
    .max(20, "Telefone deve ter no máximo 20 caracteres")
    .optional(),
});

interface Panhador {
  id: string;
  nome: string;
  apelido: string | null;
  cpf: string | null;
  telefone: string | null;
  created_at: string;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default function Panhadores() {
  const [panhadores, setPanhadores] = useState<Panhador[]>([]);
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [panhadoresLoading, setPanhadoresLoading] = useState(false);
  const [panhadorFilter, setPanhadorFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { user, selectedCompany } = useAuth();

  useEffect(() => {
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setPanhadoresLoading(false);
      return;
    }

    setPanhadoresLoading(true);

    const { data, error } = await supabase
      .from("panhadores")
      .select("*")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar panhadores:", error);
      setPanhadoresLoading(false);
      return;
    }

    setPanhadores(data || []);
    setPanhadoresLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de cadastrar um panhador",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const normalizedCpf = cpf.replace(/\D/g, "");
      const trimmedTelefone = telefone.trim();

      const validated = panhadorSchema.parse({
        nome,
        apelido: apelido.trim() || undefined,
        cpf: normalizedCpf ? normalizedCpf : undefined,
        telefone: trimmedTelefone || undefined,
      });

      const { error } = await supabase.from("panhadores").insert({
        nome: validated.nome,
        apelido: validated.apelido ?? null,
        cpf: validated.cpf ?? null,
        telefone: validated.telefone ?? null,
        user_id: user.id,
        empresa_id: selectedCompany.id,
      });

      if (error) throw error;

      toast({
        title: "Panhador cadastrado",
        description: "Cadastro realizado com sucesso",
      });

      setNome("");
      setApelido("");
      setCpf("");
      setTelefone("");
      setDialogOpen(false);
      loadPanhadores();
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Dados inválidos",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao cadastrar",
          description: "Tente novamente",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente desativar este panhador?")) return;

    const { error } = await supabase
      .from("panhadores")
      .update({ ativo: false })
      .eq("id", id);

    if (error) {
      toast({
        title: "Erro ao desativar",
        description: "Tente novamente",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Panhador desativado",
      description: "O panhador foi removido da lista",
    });

    loadPanhadores();
  };

  const formatCpf = (value: string | null) => {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 11) return value;
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const filteredPanhadores = useMemo(() => {
    const term = panhadorFilter.trim().toLowerCase();
    if (!term) return panhadores;

    const numericTerm = term.replace(/\D/g, "");

    return panhadores.filter((p) => {
      const nomeMatch = p.nome.toLowerCase().includes(term);
      const apelidoMatch = p.apelido?.toLowerCase().includes(term) ?? false;
      const cpfMatch = numericTerm
        ? (p.cpf ?? "").includes(numericTerm)
        : p.cpf?.toLowerCase().includes(term) ?? false;
      return nomeMatch || apelidoMatch || cpfMatch;
    });
  }, [panhadores, panhadorFilter]);

  return (
    <div className="min-h-screen bg-[hsl(210_45%_97%)]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Equipe</p>
            <h1 className="text-3xl font-bold text-[hsl(24_25%_18%)]">Gestão de panhadores</h1>
            <p className="text-sm text-muted-foreground">Cadastre e acompanhe toda a equipe de campo</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                Novo panhador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar panhador</DialogTitle>
                <DialogDescription>Informe os dados pessoais do panhador</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apelido">Apelido (opcional)</Label>
                  <Input
                    id="apelido"
                    value={apelido}
                    onChange={(e) => setApelido(e.target.value)}
                    placeholder="Joãozinho"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF (opcional)</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone (opcional)</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(18) 99999-8888"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl">Lista de panhadores</CardTitle>
              <CardDescription>Visualize e filtre os registros cadastrados</CardDescription>
            </div>
            <Input
              placeholder="Filtrar por nome, apelido ou CPF"
              value={panhadorFilter}
              onChange={(e) => setPanhadorFilter(e.target.value)}
              className="w-full sm:w-72"
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Nome</TableHead>
                    <TableHead>Apelido</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panhadoresLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando panhadores...
                      </TableCell>
                    </TableRow>
                  ) : filteredPanhadores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        {panhadores.length === 0
                          ? "Nenhum panhador cadastrado ainda"
                          : "Nenhum resultado para o filtro aplicado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPanhadores.map((panhador) => (
                      <TableRow key={panhador.id}>
                        <TableCell className="font-medium text-[hsl(24_25%_20%)]">{panhador.nome}</TableCell>
                        <TableCell>{panhador.apelido ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCpf(panhador.cpf) ?? "Não informado"}
                        </TableCell>
                        <TableCell>{panhador.telefone ?? "Não informado"}</TableCell>
                        <TableCell>{dateFormatter.format(new Date(panhador.created_at))}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(panhador.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
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
