import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface PlanoContaRow {
  id: string;
  nome: string;
}

export default function PlanosContas() {
  const { user, selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [planos, setPlanos] = useState<PlanoContaRow[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlanoContaRow | null>(null);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PlanoContaRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canLoad = Boolean(user && selectedCompany);

  const sortedPlanos = useMemo(() => {
    const list = [...planos];
    list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return list;
  }, [planos]);

  const loadPlanos = async () => {
    if (!canLoad || !selectedCompany) {
      setPlanos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("planos_contas")
        .select("id, nome")
        .eq("empresa_id", selectedCompany.id)
        .order("nome", { ascending: true });

      if (error) throw error;
      setPlanos((data as unknown as PlanoContaRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar planos de contas:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os planos de contas.", variant: "destructive" });
      setPlanos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlanos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedCompany?.id]);

  const openCreate = () => {
    setEditTarget(null);
    setNome("");
    setEditOpen(true);
  };

  const openEdit = (row: PlanoContaRow) => {
    setEditTarget(row);
    setNome(row.nome);
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompany) return;

    const trimmed = nome.trim();
    if (!trimmed) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do plano de contas.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const { error } = await supabase
          .from("planos_contas")
          .update({ nome: trimmed, updated_at: new Date().toISOString() })
          .eq("id", editTarget.id)
          .eq("empresa_id", selectedCompany.id);
        if (error) throw error;

        toast({ title: "Plano atualizado", description: "Alteração salva com sucesso." });
      } else {
        const { error } = await supabase.from("planos_contas").insert({ empresa_id: selectedCompany.id, nome: trimmed });
        if (error) throw error;

        toast({ title: "Plano criado", description: "Plano de contas cadastrado." });
      }

      setEditOpen(false);
      setEditTarget(null);
      setNome("");
      await loadPlanos();
    } catch (error) {
      console.error("Erro ao salvar plano de contas:", error);
      const message =
        typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";
      const isDuplicate = message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate");
      toast({
        title: "Erro ao salvar",
        description: isDuplicate ? "Já existe um plano com este nome nesta empresa." : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany || !deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from("planos_contas")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("empresa_id", selectedCompany.id);
      if (error) throw error;

      toast({ title: "Plano removido", description: "Plano de contas excluído." });
      setDeleteTarget(null);
      await loadPlanos();
    } catch (error) {
      console.error("Erro ao deletar plano de contas:", error);
      toast({
        title: "Não foi possível excluir",
        description: "Verifique se este plano está sendo usado em alguma despesa.",
        variant: "destructive",
      });
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
            <h1 className="truncate text-xl font-semibold">Plano de contas</h1>
            <p className="text-sm text-muted-foreground">Cadastre e edite os planos para organizar a DRE.</p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Incluir
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Planos cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedCompany ? (
              <p className="text-sm text-muted-foreground">Selecione uma empresa para visualizar.</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : sortedPlanos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-[140px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPlanos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button variant="outline" size="icon" onClick={() => openEdit(p)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => setDeleteTarget(p)}
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
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editTarget ? "Editar plano" : "Novo plano"}</DialogTitle>
              <DialogDescription>Informe o nome do plano de contas.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Combustível" maxLength={120} />
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

        <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget ? `Tem certeza que deseja excluir "${deleteTarget.nome}"?` : "Tem certeza?"}
              </AlertDialogDescription>
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
