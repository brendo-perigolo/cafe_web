import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const panhadorSchema = z.object({
  nome: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  apelido: z.string().trim().max(120, "Apelido deve ter no máximo 120 caracteres").optional(),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos numéricos").optional(),
  bagNumero: z.string().trim().max(60, "Número da bag deve ter no máximo 60 caracteres").optional(),
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
  bag_numero: string | null;
  bag_semana?: string | null;
  bag_atualizado_em?: string | null;
  created_at: string;
}

interface BagHistoricoRow {
  id: string;
  alterado_em: string;
  bag_anterior: string | null;
  bag_nova: string | null;
  panhador_id: string;
  panhadores?: { nome?: string } | null;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default function Panhadores() {
  const [panhadores, setPanhadores] = useState<Panhador[]>([]);
  const [bagFieldsSupported, setBagFieldsSupported] = useState(true);
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bagNumero, setBagNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [panhadoresLoading, setPanhadoresLoading] = useState(false);
  const [panhadorFilter, setPanhadorFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bagDialogOpen, setBagDialogOpen] = useState(false);
  const [bagTarget, setBagTarget] = useState<Panhador | null>(null);
  const [bagTargetValue, setBagTargetValue] = useState("");
  const [bagSaving, setBagSaving] = useState(false);
  const [bagReportOpen, setBagReportOpen] = useState(false);
  const [bagHistorico, setBagHistorico] = useState<BagHistoricoRow[]>([]);
  const [bagHistoricoLoading, setBagHistoricoLoading] = useState(false);
  const [bagPanhadorReportOpen, setBagPanhadorReportOpen] = useState(false);
  const [bagPanhadorTarget, setBagPanhadorTarget] = useState<Panhador | null>(null);
  const [bagPanhadorHistorico, setBagPanhadorHistorico] = useState<BagHistoricoRow[]>([]);
  const [bagPanhadorHistoricoLoading, setBagPanhadorHistoricoLoading] = useState(false);
  const [bagConflictOpen, setBagConflictOpen] = useState(false);
  const [bagConflictMessage, setBagConflictMessage] = useState("");
  const [bagConflictConfirm, setBagConflictConfirm] = useState<null | (() => Promise<void>)>(null);
  const { user, selectedCompany } = useAuth();

  useEffect(() => {
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setPanhadoresLoading(false);
      setBagFieldsSupported(true);
      return;
    }

    setPanhadoresLoading(true);

    const primary = await supabase
      .from("panhadores")
      .select("id, nome, apelido, cpf, telefone, bag_numero, bag_semana, bag_atualizado_em, created_at")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (primary.error) {
      const message = (primary.error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingColumn =
        message.includes("column") || message.includes("bag_numero") || message.includes("bag_semana") || message.includes("bag_atualizado_em");

      if (looksLikeMissingColumn) {
        setBagFieldsSupported(false);
        const fallback = await supabase
          .from("panhadores")
          .select("id, nome, apelido, cpf, telefone, created_at")
          .eq("empresa_id", selectedCompany.id)
          .eq("ativo", true)
          .order("created_at", { ascending: false });

        if (fallback.error) {
          console.error("Erro ao carregar panhadores (fallback):", fallback.error);
          setPanhadoresLoading(false);
          return;
        }

        setPanhadores((fallback.data as unknown as Panhador[]) || []);
        toast({
          title: "Banco sem suporte a bag",
          description: "Aplique a migration de bag (bag_numero/bag_semana) no Supabase para usar este recurso.",
          variant: "destructive",
        });
        setPanhadoresLoading(false);
        return;
      }

      console.error("Erro ao carregar panhadores:", primary.error);
      setPanhadoresLoading(false);
      return;
    }

    setBagFieldsSupported(true);
    setPanhadores((primary.data as unknown as Panhador[]) || []);
    setPanhadoresLoading(false);
  };

  const loadBagHistorico = async () => {
    if (!user || !selectedCompany) {
      setBagHistorico([]);
      return;
    }

    setBagHistoricoLoading(true);
    try {
      const { data, error } = await supabase
        .from("panhadores_bag_historico")
        .select("id, alterado_em, bag_anterior, bag_nova, panhador_id, panhadores(nome)")
        .eq("empresa_id", selectedCompany.id)
        .order("alterado_em", { ascending: false })
        .limit(200);

      if (error) throw error;
      setBagHistorico((data as unknown as BagHistoricoRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar histórico de bags:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o relatório de bags.", variant: "destructive" });
    } finally {
      setBagHistoricoLoading(false);
    }
  };

  const loadBagHistoricoForPanhador = async (panhadorId: string) => {
    if (!user || !selectedCompany) {
      setBagPanhadorHistorico([]);
      return;
    }

    setBagPanhadorHistoricoLoading(true);
    try {
      const { data, error } = await supabase
        .from("panhadores_bag_historico")
        .select("id, alterado_em, bag_anterior, bag_nova, panhador_id")
        .eq("empresa_id", selectedCompany.id)
        .eq("panhador_id", panhadorId)
        .order("alterado_em", { ascending: false })
        .limit(200);

      if (error) throw error;
      setBagPanhadorHistorico((data as unknown as BagHistoricoRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar histórico de bags do panhador:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o histórico deste panhador.", variant: "destructive" });
      setBagPanhadorHistorico([]);
    } finally {
      setBagPanhadorHistoricoLoading(false);
    }
  };

  const insertBagHistorico = async (
    panhadorId: string,
    bagAnterior: string | null,
    bagNova: string | null,
    observacao?: string,
  ) => {
    if (!user || !selectedCompany) return;
    try {
      const { error } = await supabase.from("panhadores_bag_historico").insert({
        empresa_id: selectedCompany.id,
        panhador_id: panhadorId,
        bag_anterior: bagAnterior,
        bag_nova: bagNova,
        alterado_por: user.id,
        observacao: observacao ?? null,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Erro ao registrar histórico de bag:", error);
    }
  };

  const findBagOwner = async (bag: string, excludeId?: string) => {
    if (!selectedCompany) return null;
    if (!bagFieldsSupported) return null;
    let q = supabase
      .from("panhadores")
      .select("id, nome, bag_numero")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .eq("bag_numero", bag);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data as unknown as { id: string; nome: string; bag_numero: string | null } | null;
  };

  const detachBagFromOther = async (otherId: string, otherBag: string | null, observacao?: string) => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("panhadores")
      .update({ bag_numero: null, bag_semana: null, bag_atualizado_em: now, updated_at: now })
      .eq("id", otherId)
      .eq("empresa_id", selectedCompany.id);
    if (error) throw error;
    await insertBagHistorico(otherId, otherBag, null, observacao);
  };

  const setBagForPanhador = async (
    panhadorId: string,
    bagAnterior: string | null,
    bagNova: string | null,
    observacao?: string,
  ) => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("panhadores")
      .update({ bag_numero: bagNova, bag_atualizado_em: now, updated_at: now })
      .eq("id", panhadorId)
      .eq("empresa_id", selectedCompany.id);
    if (error) throw error;
    await insertBagHistorico(panhadorId, bagAnterior, bagNova, observacao);
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
      const trimmedBag = bagNumero.trim();

      const validated = panhadorSchema.parse({
        nome,
        apelido: apelido.trim() || undefined,
        cpf: normalizedCpf ? normalizedCpf : undefined,
        bagNumero: bagFieldsSupported ? trimmedBag || undefined : undefined,
        telefone: trimmedTelefone || undefined,
      });

      if (!bagFieldsSupported && trimmedBag) {
        toast({
          title: "Bag indisponível",
          description: "Seu banco ainda não tem as colunas de bag. Aplique a migration no Supabase e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      const create = async () => {
        const panhadorId = crypto.randomUUID();
        const payload = {
          id: panhadorId,
          nome: validated.nome,
          apelido: validated.apelido ?? null,
          cpf: validated.cpf ?? null,
          telefone: validated.telefone ?? null,
          bag_numero: validated.bagNumero ?? null,
          user_id: user.id,
          empresa_id: selectedCompany.id,
        };

        const { error } = await supabase.from("panhadores").insert(payload);
        if (error) throw error;

        if (validated.bagNumero) {
          await insertBagHistorico(panhadorId, null, validated.bagNumero, "Definição inicial");
        }
      };

      if (validated.bagNumero) {
        const owner = await findBagOwner(validated.bagNumero);
        if (owner) {
          setBagConflictMessage(
            `A bag ${validated.bagNumero} já está vinculada ao panhador ${owner.nome}. Deseja transferir esta bag para o novo panhador? Ao confirmar, a bag será removida do outro panhador.`,
          );
          setBagConflictConfirm(() => async () => {
            await detachBagFromOther(owner.id, owner.bag_numero, `Transferida para ${validated.nome}`);
            await create();
          });
          setBagConflictOpen(true);
          return;
        }
      }

      await create();

      toast({
        title: "Panhador cadastrado",
        description: "Cadastro realizado com sucesso",
      });

      setNome("");
      setApelido("");
      setCpf("");
      setTelefone("");
      setBagNumero("");
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
      const bagMatch = p.bag_numero?.toLowerCase().includes(term) ?? false;
      const cpfMatch = numericTerm
        ? (p.cpf ?? "").includes(numericTerm)
        : p.cpf?.toLowerCase().includes(term) ?? false;
      return nomeMatch || apelidoMatch || cpfMatch || bagMatch;
    });
  }, [panhadores, panhadorFilter]);

  const openBagDialog = (panhador: Panhador) => {
    setBagTarget(panhador);
    setBagTargetValue(panhador.bag_numero ?? "");
    setBagDialogOpen(true);
  };

  const openPanhadorHistoricoDialog = async (panhador: Panhador) => {
    setBagPanhadorTarget(panhador);
    setBagPanhadorReportOpen(true);
    await loadBagHistoricoForPanhador(panhador.id);
  };

  const handleSaveBag = async () => {
    if (!user || !selectedCompany || !bagTarget) return;
    if (!bagFieldsSupported) {
      toast({
        title: "Bag indisponível",
        description: "Seu banco ainda não tem as colunas de bag. Aplique a migration no Supabase e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    const next = bagTargetValue.trim();
    const nextBag = next ? next : null;
    const prevBag = bagTarget.bag_numero ?? null;

    if ((prevBag ?? "") === (nextBag ?? "")) {
      setBagDialogOpen(false);
      setBagTarget(null);
      return;
    }

    if (nextBag && nextBag.length > 60) {
      toast({ title: "Bag inválida", description: "Número da bag deve ter no máximo 60 caracteres.", variant: "destructive" });
      return;
    }

    setBagSaving(true);
    try {
      const run = async () => {
        await setBagForPanhador(bagTarget.id, prevBag, nextBag, "Troca de bag");
        toast({ title: "Bag atualizada", description: "Vínculo de bag atualizado com sucesso." });
        setBagDialogOpen(false);
        setBagTarget(null);
        await loadPanhadores();
      };

      if (nextBag) {
        const owner = await findBagOwner(nextBag, bagTarget.id);
        if (owner) {
          setBagConflictMessage(
            `A bag ${nextBag} já está vinculada ao panhador ${owner.nome}. Deseja transferir esta bag? Ao confirmar, a bag será removida do outro panhador.`,
          );
          setBagConflictConfirm(() => async () => {
            await detachBagFromOther(owner.id, owner.bag_numero, `Transferida para ${bagTarget.nome}`);
            await run();
          });
          setBagConflictOpen(true);
          return;
        }
      }

      await run();
    } catch (error) {
      console.error("Erro ao atualizar bag:", error);
      toast({ title: "Erro", description: "Não foi possível atualizar a bag.", variant: "destructive" });
    } finally {
      setBagSaving(false);
    }
  };

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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setBagReportOpen(true);
                loadBagHistorico();
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Relatório de bags
            </Button>
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

                <div className="space-y-2">
                  <Label htmlFor="bag">Bag vinculada (opcional)</Label>
                  <Input
                    id="bag"
                    value={bagNumero}
                    onChange={(e) => setBagNumero(e.target.value)}
                    placeholder="Ex: 20"
                    maxLength={60}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
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
                    <TableHead>Bag</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panhadoresLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando panhadores...
                      </TableCell>
                    </TableRow>
                  ) : filteredPanhadores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
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
                        <TableCell className="font-mono text-sm">{panhador.bag_numero ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCpf(panhador.cpf) ?? "Não informado"}
                        </TableCell>
                        <TableCell>{panhador.telefone ?? "Não informado"}</TableCell>
                        <TableCell>{dateFormatter.format(new Date(panhador.created_at))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPanhadorHistoricoDialog(panhador)}
                              title="Ver histórico"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openBagDialog(panhador)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(panhador.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={bagDialogOpen}
          onOpenChange={(open) => {
            setBagDialogOpen(open);
            if (!open) {
              setBagTarget(null);
              setBagTargetValue("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar bag</DialogTitle>
              <DialogDescription>
                {bagTarget ? `Atualize a bag vinculada do panhador ${bagTarget.nome}.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Bag vinculada</Label>
              <Input
                value={bagTargetValue}
                onChange={(e) => setBagTargetValue(e.target.value)}
                placeholder="Ex: 20"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para remover a bag.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBagDialogOpen(false)} disabled={bagSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveBag} disabled={bagSaving}>
                {bagSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={bagReportOpen} onOpenChange={setBagReportOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Relatório de bags utilizadas</DialogTitle>
              <DialogDescription>Histórico de alterações de bag (últimos 200 registros)</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Data</TableHead>
                    <TableHead>Panhador</TableHead>
                    <TableHead>Bag anterior</TableHead>
                    <TableHead>Bag nova</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bagHistoricoLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando histórico...
                      </TableCell>
                    </TableRow>
                  ) : bagHistorico.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhuma troca de bag registrada ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bagHistorico.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{dateFormatter.format(new Date(row.alterado_em))}</TableCell>
                          <TableCell>{row.panhadores?.nome ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{row.bag_anterior ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{row.bag_nova ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bagPanhadorReportOpen}
          onOpenChange={(open) => {
            setBagPanhadorReportOpen(open);
            if (!open) {
              setBagPanhadorTarget(null);
              setBagPanhadorHistorico([]);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {bagPanhadorTarget ? `Histórico de bags - ${bagPanhadorTarget.nome}` : "Histórico de bags"}
              </DialogTitle>
              <DialogDescription>Alterações registradas para este panhador (últimos 200 registros)</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Data</TableHead>
                    <TableHead>Bag anterior</TableHead>
                    <TableHead>Bag nova</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bagPanhadorHistoricoLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando histórico...
                      </TableCell>
                    </TableRow>
                  ) : bagPanhadorHistorico.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Nenhuma troca de bag registrada para este panhador.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bagPanhadorHistorico.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{dateFormatter.format(new Date(row.alterado_em))}</TableCell>
                        <TableCell className="font-mono text-sm">{row.bag_anterior ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{row.bag_nova ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={bagConflictOpen}
          onOpenChange={(open) => {
            setBagConflictOpen(open);
            if (!open) {
              setBagConflictMessage("");
              setBagConflictConfirm(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bag já vinculada</AlertDialogTitle>
              <AlertDialogDescription>{bagConflictMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const fn = bagConflictConfirm;
                    setBagConflictOpen(false);
                    setBagConflictConfirm(null);
                    if (fn) await fn();
                    await loadPanhadores();
                  } catch (error) {
                    console.error("Erro ao transferir bag:", error);
                    toast({
                      title: "Erro",
                      description: "Não foi possível transferir a bag. Tente novamente.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Sim, transferir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
