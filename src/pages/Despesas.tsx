import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type PagamentoMetodo = "dinheiro" | "pix" | "cartao";

interface PlanoContaRow {
  id: string;
  nome: string;
}

interface PropriedadeRow {
  id: string;
  nome: string | null;
}

interface LavouraRow {
  id: string;
  nome: string;
  propriedade_id: string;
}

interface DespesaRow {
  id: string;
  valor: number;
  data_vencimento: string; // date
  tipo_servico: string | null;
  plano_conta_id: string;
  pagamento_metodo: string | null;
  colheita_id: string | null;
  propriedade_id: string | null;
  lavoura_id: string | null;
  created_at: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type GastosResumo = {
  total: number;
  count: number;
};

const formatMetodo = (value: string | null) => {
  if (!value) return "-";
  if (value === "dinheiro") return "Dinheiro";
  if (value === "pix") return "Pix";
  if (value === "cartao") return "Cartão";
  if (value === "cheque") return "Cheque";
  return String(value);
};

export default function Despesas() {
  const { user, selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [despesas, setDespesas] = useState<DespesaRow[]>([]);
  const [planos, setPlanos] = useState<PlanoContaRow[]>([]);
  const [propriedades, setPropriedades] = useState<PropriedadeRow[]>([]);
  const [lavouras, setLavouras] = useState<LavouraRow[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DespesaRow | null>(null);
  const [form, setForm] = useState({
    valor: "",
    dataVencimento: "",
    tipoServico: "",
    planoContaId: "",
    pagamentoMetodo: "dinheiro" as PagamentoMetodo,
    propriedadeId: "",
    lavouraId: "",
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DespesaRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [planoModalOpen, setPlanoModalOpen] = useState(false);
  const [planoEditing, setPlanoEditing] = useState<PlanoContaRow | null>(null);
  const [planoNome, setPlanoNome] = useState("");
  const [planoSaving, setPlanoSaving] = useState(false);

  const [filterText, setFilterText] = useState("");

  const canLoad = Boolean(user && selectedCompany);

  const planosById = useMemo(() => {
    const map = new Map<string, PlanoContaRow>();
    planos.forEach((p) => map.set(p.id, p));
    return map;
  }, [planos]);

  const lavourasById = useMemo(() => {
    const map = new Map<string, LavouraRow>();
    (lavouras ?? []).forEach((l) => map.set(l.id, l));
    return map;
  }, [lavouras]);

  const propriedadesById = useMemo(() => {
    const map = new Map<string, PropriedadeRow>();
    (propriedades ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [propriedades]);

  const lavourasFiltradas = useMemo(() => {
    const propId = form.propriedadeId;
    if (!propId) return lavouras ?? [];
    return (lavouras ?? []).filter((l) => l.propriedade_id === propId);
  }, [lavouras, form.propriedadeId]);

  const gastosByPlano = useMemo(() => {
    const summary: Record<string, GastosResumo> = {};
    (despesas ?? []).forEach((row) => {
      const planoId = row.plano_conta_id;
      const valor = Number(row.valor) || 0;
      const current = summary[planoId] ?? { total: 0, count: 0 };
      current.total += valor;
      current.count += 1;
      summary[planoId] = current;
    });
    return summary;
  }, [despesas]);

  const planosComLancamentos = useMemo(() => {
    return (planos ?? []).filter((plano) => (gastosByPlano[plano.id]?.count ?? 0) > 0);
  }, [planos, gastosByPlano]);

  const cardVariants = [
    "border-primary/20 bg-primary/5",
    "border-secondary/20 bg-secondary/10",
    "border-accent/20 bg-accent/10",
    "border-muted bg-muted/40",
  ] as const;

  const totalDespesas = useMemo(() => (despesas ?? []).reduce((sum, it) => sum + (Number(it.valor) || 0), 0), [despesas]);

  const despesasFiltradas = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return despesas ?? [];

    return (despesas ?? []).filter((d) => {
      const planoNome = planosById.get(d.plano_conta_id)?.nome ?? "";
      const propriedadeNome = d.propriedade_id ? propriedadesById.get(d.propriedade_id)?.nome ?? "" : "";
      const lavouraNome = d.lavoura_id ? lavourasById.get(d.lavoura_id)?.nome ?? "" : "";

      const haystack = [
        d.data_vencimento,
        planoNome,
        d.tipo_servico ?? "",
        formatMetodo(d.pagamento_metodo),
        propriedadeNome ?? "",
        lavouraNome,
        String(d.valor ?? ""),
      ]
        .join(" | ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [despesas, filterText, planosById, propriedadesById, lavourasById]);

  const loadAll = async () => {
    if (!canLoad || !selectedCompany) {
      setPlanos([]);
      setDespesas([]);
      setPropriedades([]);
      setLavouras([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [planosRes, despesasRes, propriedadesRes, lavourasRes] = await Promise.all([
        supabase
          .from("planos_contas")
          .select("id, nome")
          .eq("empresa_id", selectedCompany.id)
          .order("nome", { ascending: true }),
        supabase
          .from("despesas")
          .select(
            "id, valor, data_vencimento, tipo_servico, plano_conta_id, pagamento_metodo, colheita_id, propriedade_id, lavoura_id, created_at"
          )
          .eq("empresa_id", selectedCompany.id)
          .order("data_vencimento", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("propriedades")
          .select("id, nome")
          .eq("empresa_id", selectedCompany.id)
          .order("nome", { ascending: true }),
        supabase
          .from("lavouras")
          .select("id, nome, propriedade_id")
          .eq("empresa_id", selectedCompany.id)
          .order("nome", { ascending: true }),
      ]);

      if (planosRes.error) throw planosRes.error;
      if (despesasRes.error) throw despesasRes.error;
      if (propriedadesRes.error) throw propriedadesRes.error;
      if (lavourasRes.error) throw lavourasRes.error;

      setPlanos((planosRes.data as unknown as PlanoContaRow[]) || []);
      setDespesas((despesasRes.data as unknown as DespesaRow[]) || []);
      setPropriedades((propriedadesRes.data as unknown as PropriedadeRow[]) || []);
      setLavouras((lavourasRes.data as unknown as LavouraRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar despesas:", error);
      toast({ title: "Erro", description: "Não foi possível carregar as despesas.", variant: "destructive" });
      setPlanos([]);
      setDespesas([]);
      setPropriedades([]);
      setLavouras([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedCompany?.id]);

  const openCreate = () => {
    const today = new Date();
    const isoDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);
    setEditTarget(null);
    setForm({
      valor: "",
      dataVencimento: isoDate,
      tipoServico: "",
      planoContaId: "",
      pagamentoMetodo: "dinheiro",
      propriedadeId: "",
      lavouraId: "",
    });
    setEditOpen(true);
  };

  const openEdit = (row: DespesaRow) => {
    setEditTarget(row);
    const lavouraId = row.lavoura_id ?? "";
    const propriedadeDerivada = lavouraId ? lavourasById.get(lavouraId)?.propriedade_id ?? "" : "";

    setForm({
      valor: row.valor != null ? String(row.valor) : "",
      dataVencimento: row.data_vencimento,
      tipoServico: row.tipo_servico ?? "",
      planoContaId: row.plano_conta_id,
      pagamentoMetodo: (row.pagamento_metodo as PagamentoMetodo) || "dinheiro",
      propriedadeId: row.propriedade_id ?? propriedadeDerivada,
      lavouraId,
    });
    setEditOpen(true);
  };

  const resetPlanoForm = () => {
    setPlanoEditing(null);
    setPlanoNome("");
  };

  const openPlanoCreate = () => {
    resetPlanoForm();
    setPlanoModalOpen(true);
  };

  const openPlanoEdit = () => {
    const planoId = form.planoContaId;
    if (!planoId) {
      openPlanoCreate();
      return;
    }

    const target = planosById.get(planoId);
    if (!target) {
      openPlanoCreate();
      return;
    }

    setPlanoEditing(target);
    setPlanoNome(target.nome);
    setPlanoModalOpen(true);
  };

  const handleSavePlano = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompany) return;

    const nome = planoNome.trim();
    if (!nome) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do plano de contas.", variant: "destructive" });
      return;
    }

    setPlanoSaving(true);
    try {
      if (planoEditing) {
        const { error } = await supabase
          .from("planos_contas")
          .update({ nome, updated_at: new Date().toISOString() })
          .eq("id", planoEditing.id)
          .eq("empresa_id", selectedCompany.id);

        if (error) throw error;

        setPlanos((prev) =>
          [...(prev ?? [])]
            .map((p) => (p.id === planoEditing.id ? { ...p, nome } : p))
            .sort((a, b) => a.nome.localeCompare(b.nome))
        );

        toast({ title: "Plano atualizado", description: "Alteração salva com sucesso." });
      } else {
        const { data, error } = await supabase
          .from("planos_contas")
          .insert({ empresa_id: selectedCompany.id, nome })
          .select("id, nome")
          .single();

        if (error) throw error;

        const created = data as unknown as PlanoContaRow;
        setPlanos((prev) => [...(prev ?? []), created].sort((a, b) => a.nome.localeCompare(b.nome)));
        setForm((p) => ({ ...p, planoContaId: created.id }));

        toast({ title: "Plano cadastrado", description: "Plano de contas incluído." });
      }

      setPlanoModalOpen(false);
      resetPlanoForm();
    } catch (error) {
      console.error("Erro ao salvar plano de contas:", error);
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        toast({ title: "Plano já existe", description: "Já existe um plano com este nome.", variant: "destructive" });
      } else {
        toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
      }
    } finally {
      setPlanoSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompany) return;

    const valorNumber = Number(String(form.valor).replace(",", "."));
    if (!Number.isFinite(valorNumber) || valorNumber <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }

    const dataVenc = form.dataVencimento.trim();
    if (!dataVenc) {
      toast({ title: "Data obrigatória", description: "Informe a data de vencimento.", variant: "destructive" });
      return;
    }

    const planoContaId = form.planoContaId;
    if (!planoContaId) {
      toast({ title: "Plano obrigatório", description: "Selecione o plano de contas.", variant: "destructive" });
      return;
    }

    let propriedadeId = form.propriedadeId.trim() ? form.propriedadeId.trim() : null;
    let lavouraId = form.lavouraId.trim() ? form.lavouraId.trim() : null;

    if (lavouraId) {
      const lav = lavourasById.get(lavouraId);
      if (lav) {
        if (!propriedadeId) propriedadeId = lav.propriedade_id;
        if (propriedadeId && lav.propriedade_id !== propriedadeId) {
          toast({
            title: "Lavoura inválida",
            description: "A lavoura selecionada não pertence à propriedade informada.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      if (editTarget) {
        const { error } = await supabase
          .from("despesas")
          .update({
            valor: Number(valorNumber.toFixed(2)),
            data_vencimento: dataVenc,
            tipo_servico: form.tipoServico.trim() ? form.tipoServico.trim() : null,
            plano_conta_id: planoContaId,
            pagamento_metodo: form.pagamentoMetodo,
            propriedade_id: propriedadeId,
            lavoura_id: lavouraId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editTarget.id)
          .eq("empresa_id", selectedCompany.id);

        if (error) throw error;
        toast({ title: "Despesa atualizada", description: "Alteração salva com sucesso." });
      } else {
        const { error } = await supabase.from("despesas").insert({
          empresa_id: selectedCompany.id,
          criado_por: user.id,
          valor: Number(valorNumber.toFixed(2)),
          data_vencimento: dataVenc,
          tipo_servico: form.tipoServico.trim() ? form.tipoServico.trim() : null,
          plano_conta_id: planoContaId,
          pagamento_metodo: form.pagamentoMetodo,
          propriedade_id: propriedadeId,
          lavoura_id: lavouraId,
        });

        if (error) throw error;
        toast({ title: "Despesa cadastrada", description: "Registro incluído." });
      }

      setEditOpen(false);
      setEditTarget(null);
      await loadAll();
    } catch (error) {
      console.error("Erro ao salvar despesa:", error);
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany || !deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from("despesas")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;
      toast({ title: "Despesa removida", description: "Registro excluído." });
      setDeleteTarget(null);
      await loadAll();
    } catch (error) {
      console.error("Erro ao deletar despesa:", error);
      toast({ title: "Erro ao excluir", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">Controle Financeiro</h1>
            <p className="text-sm text-muted-foreground">Despesas da empresa (inclui panha quitada) e resumo de gastos.</p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Incluir
          </Button>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Parâmetros de gastos</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedCompany ? (
              <p className="text-sm text-muted-foreground">Selecione uma empresa para visualizar.</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : planosComLancamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa lançada ainda.</p>
            ) : (
              <>
                <div className="mb-3 text-sm text-muted-foreground">
                  Total de despesas: <span className="font-semibold text-foreground">{currencyFormatter.format(totalDespesas)}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {planosComLancamentos.map((plano, index) => {
                    const resumo = gastosByPlano[plano.id] ?? { total: 0, count: 0 };
                    const variant = cardVariants[index % cardVariants.length];
                    return (
                      <div key={plano.id} className={`rounded-xl border p-3 ${variant}`}>
                        <div className="truncate text-xs font-semibold text-foreground">{plano.nome}</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{currencyFormatter.format(resumo.total)}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{resumo.count} lançamento(s)</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Despesas registradas</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  type="search"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filtrar por plano, serviço, vencimento..."
                  className="h-9 w-full sm:w-[280px]"
                />
                {filterText.trim() ? (
                  <Button type="button" variant="outline" className="h-9" onClick={() => setFilterText("")}
                  >
                    Limpar
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedCompany ? (
              <p className="text-sm text-muted-foreground">Selecione uma empresa para visualizar.</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : despesas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa registrada.</p>
            ) : despesasFiltradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum resultado para o filtro informado.</p>
            ) : (
              <>
                {filterText.trim() ? (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Mostrando {despesasFiltradas.length} de {despesas.length}
                  </p>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-[140px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {despesasFiltradas.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{d.data_vencimento}</TableCell>
                        <TableCell className="font-medium">{planosById.get(d.plano_conta_id)?.nome ?? "(plano)"}</TableCell>
                        <TableCell>{d.tipo_servico ?? "-"}</TableCell>
                        <TableCell>{formatMetodo(d.pagamento_metodo)}</TableCell>
                        <TableCell className="text-right">{currencyFormatter.format(d.valor ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => openEdit(d)} aria-label="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => setDeleteTarget(d)}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editTarget ? "Editar despesa" : "Nova despesa"}</DialogTitle>
              <DialogDescription>Informe os dados da despesa.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    type="date"
                    value={form.dataVencimento}
                    onChange={(e) => setForm((p) => ({ ...p, dataVencimento: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Plano de contas</Label>
                  <div className="flex items-center gap-2">
                    <Select value={form.planoContaId} onValueChange={(v) => setForm((p) => ({ ...p, planoContaId: v }))}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {planos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => (form.planoContaId ? openPlanoEdit() : openPlanoCreate())}
                      disabled={!selectedCompany || planoSaving}
                      aria-label={form.planoContaId ? "Editar plano de contas" : "Cadastrar plano de contas"}
                      title={form.planoContaId ? "Editar plano de contas" : "Cadastrar plano de contas"}
                    >
                      {form.planoContaId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Método de pagamento</Label>
                  <Select
                    value={form.pagamentoMetodo}
                    onValueChange={(v) => setForm((p) => ({ ...p, pagamentoMetodo: v as PagamentoMetodo }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo de serviço (opcional)</Label>
                <Input
                  value={form.tipoServico}
                  onChange={(e) => setForm((p) => ({ ...p, tipoServico: e.target.value }))}
                  placeholder="Ex: Manutenção, Transporte..."
                  maxLength={160}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Propriedade (opcional)</Label>
                  <Select
                    value={form.propriedadeId || undefined}
                    onValueChange={(v) => {
                      setForm((p) => {
                        const nextPropId = v === "__none__" ? "" : v;
                        const nextLavId = p.lavouraId && lavourasById.get(p.lavouraId)?.propriedade_id !== nextPropId ? "" : p.lavouraId;
                        return { ...p, propriedadeId: nextPropId, lavouraId: nextLavId };
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {propriedades.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome ?? "(sem nome)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Lavoura (opcional)</Label>
                  <Select
                    value={form.lavouraId || undefined}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setForm((p) => ({ ...p, lavouraId: "" }));
                        return;
                      }

                      const lav = lavourasById.get(v);
                      setForm((p) => ({
                        ...p,
                        lavouraId: v,
                        propriedadeId: lav?.propriedade_id ?? p.propriedadeId,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {lavourasFiltradas.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={planoModalOpen}
          onOpenChange={(open) => {
            setPlanoModalOpen(open);
            if (!open) resetPlanoForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{planoEditing ? "Editar plano de contas" : "Novo plano de contas"}</DialogTitle>
              <DialogDescription>Informe o nome do plano de contas.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePlano} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={planoNome}
                  onChange={(e) => setPlanoNome(e.target.value)}
                  placeholder="Ex: Combustível"
                  maxLength={80}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPlanoModalOpen(false)} disabled={planoSaving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={planoSaving}>
                  {planoSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja excluir esta despesa?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
