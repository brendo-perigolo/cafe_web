import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Package, Coins, AlertCircle, Pencil, Trash2, Plus } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { LancamentoDialog } from "@/components/LancamentoDialog";

interface Lancamento {
  id: string;
  codigo: string;
  peso_kg: number;
  valor_total: number | null;
  data_colheita: string;
  numero_bag: string | null;
  panhador: string;
  panhador_id: string;
  preco_por_kg: number | null;
}

interface PanhadorOption {
  id: string;
  nome: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default function Movimentacoes() {
  const { user, selectedCompany } = useAuth();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "com-valor" | "pendentes">("todos");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [panhadores, setPanhadores] = useState<PanhadorOption[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({
    panhadorId: "",
    pesoKg: "",
    numeroBag: "",
    precoKg: "",
    valorTotal: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lancamento | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);

  useEffect(() => {
    loadLancamentos();
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    if (editTarget) {
      setEditForm({
        panhadorId: editTarget.panhador_id,
        pesoKg: editTarget.peso_kg.toString(),
        numeroBag: editTarget.numero_bag ?? "",
        precoKg: editTarget.preco_por_kg != null ? editTarget.preco_por_kg.toString() : "",
        valorTotal: editTarget.valor_total != null ? editTarget.valor_total.toString() : "",
      });
    }
  }, [editTarget]);

  const loadLancamentos = async () => {
    if (!user || !selectedCompany) {
      setLancamentos([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("colheitas")
      .select("id, codigo, peso_kg, preco_por_kg, valor_total, data_colheita, numero_bag, panhador_id, panhadores(nome)")
      .eq("empresa_id", selectedCompany.id)
      .order("data_colheita", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Erro ao carregar movimentações:", error);
      toast({
        title: "Erro ao carregar movimentações",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const normalized: Lancamento[] = (data || []).map((item) => ({
      id: item.id,
      codigo: item.codigo ?? "-",
      peso_kg: Number(item.peso_kg) || 0,
      preco_por_kg: item.preco_por_kg != null ? Number(item.preco_por_kg) : null,
      valor_total: item.valor_total != null ? Number(item.valor_total) : null,
      data_colheita: item.data_colheita,
      numero_bag: item.numero_bag,
      panhador: (item.panhadores as { nome?: string } | null)?.nome ?? "-",
      panhador_id: item.panhador_id,
    }));

    setLancamentos(normalized);
    setLoading(false);
  };

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      return;
    }

    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar panhadores:", error);
      toast({ title: "Erro", description: "Não foi possível carregar panhadores.", variant: "destructive" });
      return;
    }

    setPanhadores(data || []);
  };

  const filteredLancamentos = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    return lancamentos.filter((item) => {
      const itemDate = new Date(item.data_colheita);
      if (start && itemDate < start) return false;
      if (end && itemDate > end) return false;

      const matchesStatus =
        statusFilter === "todos"
          ? true
          : statusFilter === "com-valor"
            ? item.valor_total != null
            : item.valor_total == null;

      if (!matchesStatus) return false;

      if (!term) return true;

      const codigoMatch = item.codigo.toLowerCase().includes(term);
      const panhadorMatch = item.panhador.toLowerCase().includes(term);
      const bagMatch = item.numero_bag?.toLowerCase().includes(term) ?? false;
      const dataMatch = dateFormatter.format(new Date(item.data_colheita)).includes(term);
      return codigoMatch || panhadorMatch || bagMatch || dataMatch;
    });
  }, [lancamentos, filter, statusFilter, startDate, endDate]);

  const totalPeso = useMemo(() => filteredLancamentos.reduce((sum, item) => sum + item.peso_kg, 0), [filteredLancamentos]);
  const totalValorFechado = useMemo(
    () => filteredLancamentos.reduce((sum, item) => sum + (item.valor_total ?? 0), 0),
    [filteredLancamentos],
  );
  const pendentes = useMemo(() => filteredLancamentos.filter((item) => item.valor_total == null).length, [filteredLancamentos]);
  const editValorPreview = useMemo(() => {
    const peso = Number(editForm.pesoKg);
    const preco = editForm.precoKg.trim() ? Number(editForm.precoKg) : null;
    if (!peso || !preco) return null;
    return Number((peso * preco).toFixed(2));
  }, [editForm.pesoKg, editForm.precoKg]);

  const handleOpenEdit = (item: Lancamento) => {
    setEditTarget(item);
    setEditDialogOpen(true);
  };

  const handleUpdateLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !user || !editTarget) return;

    const pesoNumber = Number(editForm.pesoKg);
    if (!pesoNumber || pesoNumber <= 0) {
      toast({ title: "Peso inválido", description: "Informe um peso maior que zero.", variant: "destructive" });
      return;
    }
    if (!editForm.panhadorId) {
      toast({ title: "Selecione o panhador", variant: "destructive" });
      return;
    }

    const precoNumber = editForm.precoKg.trim() ? Number(editForm.precoKg) : null;
    const valorNumber = editForm.valorTotal.trim()
      ? Number(editForm.valorTotal)
      : precoNumber != null
        ? Number((precoNumber * pesoNumber).toFixed(2))
        : null;

    setEditSaving(true);

    try {
      const { error: historyError } = await supabase.from("colheitas_historico").insert({
        colheita_id: editTarget.id,
        empresa_id: selectedCompany.id,
        user_id: user.id ?? null,
        dados: {
          peso_kg: editTarget.peso_kg,
          preco_por_kg: editTarget.preco_por_kg,
          valor_total: editTarget.valor_total,
          numero_bag: editTarget.numero_bag,
          panhador_id: editTarget.panhador_id,
          panhador_nome: editTarget.panhador,
          data_colheita: editTarget.data_colheita,
          responsavel_email: user.email,
        },
      });

      if (historyError) throw historyError;

      const { error } = await supabase
        .from("colheitas")
        .update({
          panhador_id: editForm.panhadorId,
          peso_kg: pesoNumber,
          preco_por_kg: precoNumber,
          valor_total: valorNumber,
          numero_bag: editForm.numeroBag.trim() ? editForm.numeroBag.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editTarget.id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      toast({ title: "Movimentação atualizada" });
      setEditDialogOpen(false);
      setEditTarget(null);
      await loadLancamentos();
    } catch (err) {
      console.error("Erro ao atualizar movimentação:", err);
      toast({ title: "Erro ao atualizar", description: "Tente novamente", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteLancamento = async () => {
    if (!deleteTarget || !selectedCompany) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from("colheitas")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      toast({ title: "Movimentação removida" });
      setDeleteTarget(null);
      await loadLancamentos();
    } catch (err) {
      console.error("Erro ao remover movimentação:", err);
      toast({ title: "Erro ao remover", description: "Tente novamente", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(210_45%_97%)]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Movimentações</p>
            <h1 className="text-3xl font-bold text-[hsl(24_25%_18%)]">Entradas e saídas de colheita</h1>
            <p className="text-sm text-muted-foreground">Acompanhe rapidamente tudo que foi lançado na safra</p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={loadLancamentos} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-1 py-5">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Volume total</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-3xl text-[hsl(24_25%_20%)]">{totalPeso.toFixed(2)} kg</p>
                <Package className="h-5 w-5 text-[hsl(196_65%_40%)]" />
              </div>
              <p className="text-xs text-muted-foreground">Somatório dos registros carregados</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-1 py-5">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Valor fechado</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-3xl text-[hsl(152_45%_32%)]">{currencyFormatter.format(totalValorFechado)}</p>
                <Coins className="h-5 w-5 text-[hsl(152_45%_40%)]" />
              </div>
              <p className="text-xs text-muted-foreground">Considera lançamentos com valor informado</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-1 py-5">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pendentes</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-3xl text-[hsl(14_70%_45%)]">{pendentes}</p>
                <AlertCircle className="h-5 w-5 text-[hsl(14_70%_45%)]" />
              </div>
              <p className="text-xs text-muted-foreground">Lançamentos aguardando valor final</p>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="font-display text-xl">Histórico de movimentações</CardTitle>
                <CardDescription>Últimos lançamentos registrados para a empresa atual</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-full" onClick={() => setRegisterDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova movimentação
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Buscar por código, panhador ou bag"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="com-valor">Com valor</SelectItem>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Código</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Panhador</TableHead>
                    <TableHead>Bag</TableHead>
                    <TableHead className="text-right">Peso (kg)</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando movimentações...
                      </TableCell>
                    </TableRow>
                  ) : filteredLancamentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        {lancamentos.length === 0
                          ? "Nenhum lançamento encontrado para esta empresa"
                          : "Nenhum resultado para o filtro aplicado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLancamentos.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">#{item.codigo}</TableCell>
                        <TableCell>{dateFormatter.format(new Date(item.data_colheita))}</TableCell>
                        <TableCell>{item.panhador}</TableCell>
                        <TableCell>{item.numero_bag ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{item.peso_kg.toFixed(2)} kg</TableCell>
                        <TableCell className="text-right">
                          {item.valor_total != null ? currencyFormatter.format(item.valor_total) : "Pendente"}
                        </TableCell>
                        <TableCell>
                          {item.valor_total != null ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Valor fechado</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)}>
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
      </main>
      <LancamentoDialog
        open={registerDialogOpen}
        onOpenChange={setRegisterDialogOpen}
        onCreated={loadLancamentos}
      />
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar movimentação</DialogTitle>
            <DialogDescription>Atualize os dados e salve para manter o histórico</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={handleUpdateLancamento} className="space-y-4">
              <div className="space-y-2">
                <Label>Panhador</Label>
                <Select
                  value={editForm.panhadorId}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, panhadorId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o panhador" />
                  </SelectTrigger>
                  <SelectContent>
                    {!panhadores.some((p) => p.id === editForm.panhadorId) && editForm.panhadorId && (
                      <SelectItem value={editForm.panhadorId}>
                        {editTarget.panhador} (inativo)
                      </SelectItem>
                    )}
                    {panhadores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.pesoKg}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, pesoKg: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Número da bag</Label>
                <Input
                  value={editForm.numeroBag}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, numeroBag: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>Preço por kg</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.precoKg}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, precoKg: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor total</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.valorTotal}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, valorTotal: e.target.value }))}
                  placeholder={editValorPreview != null ? `Sugestão: ${currencyFormatter.format(editValorPreview)}` : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Se deixar em branco, usamos o preço por kg para recalcular automaticamente.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditTarget(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover movimentação</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A movimentação será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLancamento} disabled={deleteLoading}>
              {deleteLoading ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
