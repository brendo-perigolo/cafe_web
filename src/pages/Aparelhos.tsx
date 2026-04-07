import { useEffect, useMemo, useState } from "react";
import { Smartphone } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getDeviceToken } from "@/lib/device";

type Aparelho = {
  id: string;
  nome: string;
  token: string;
  ativo: boolean;
  updated_at: string;
};

export default function Aparelhos() {
  const { user, selectedCompany } = useAuth();
  const deviceToken = useMemo(() => getDeviceToken(), []);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [cadastrarOpen, setCadastrarOpen] = useState(false);

  const loadAparelhos = async () => {
    if (!user || !selectedCompany) {
      setAparelhos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let data: any[] | null = null;
    let error: any = null;

    // Fallback: se a coluna empresa_id ainda não existe (migration não aplicada), busca sem filtro.
    const primary = await supabase
      .from("aparelhos")
      .select("id, nome, token, ativo, updated_at")
      .eq("empresa_id", selectedCompany.id)
      .order("nome", { ascending: true });

    if (primary.error && (primary.error as { code?: string; message?: string }).code === "42703") {
      const fallback = await supabase
        .from("aparelhos")
        .select("id, nome, token, ativo, updated_at")
        .order("nome", { ascending: true });
      data = fallback.data as any[] | null;
      error = fallback.error;
    } else {
      data = primary.data as any[] | null;
      error = primary.error;
    }

    if (error) {
      console.error("Erro ao carregar aparelhos:", error);
      toast({ title: "Erro", description: "Não foi possível carregar aparelhos.", variant: "destructive" });
      setLoading(false);
      return;
    }

    setAparelhos(
      (data ?? []).map((item) => ({
        id: item.id,
        nome: item.nome,
        token: item.token,
        ativo: item.ativo,
        updated_at: item.updated_at,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAparelhos();
  }, [user, selectedCompany?.id]);

  const handleCreate = async () => {
    if (!user || !selectedCompany) return;

    const trimmed = nome.trim();
    if (trimmed.length < 3) {
      toast({ title: "Nome inválido", description: "Informe um nome com pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const primary = await supabase.from("aparelhos").insert({
        empresa_id: selectedCompany.id,
        nome: trimmed,
        token: deviceToken,
        ativo: true,
      });

      if (primary.error && (primary.error as { code?: string }).code === "42703") {
        const fallback = await (supabase as any).from("aparelhos").insert({
          nome: trimmed,
          token: deviceToken,
          ativo: true,
        });
        if (fallback.error) throw fallback.error;
      } else if (primary.error) {
        throw primary.error;
      }

      toast({ title: "Aparelho cadastrado", description: "Token registrado com sucesso." });
      setNome("");
      setCadastrarOpen(false);
      await loadAparelhos();
    } catch (error) {
      console.error("Erro ao cadastrar aparelho:", error);
      toast({
        title: "Erro ao cadastrar",
        description: "Verifique se o token já foi usado nesta empresa.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (id: string, next: boolean) => {
    if (!user || !selectedCompany) return;

    setAparelhos((prev) => prev.map((a) => (a.id === id ? { ...a, ativo: next } : a)));

    const primary = await supabase
      .from("aparelhos")
      .update({ ativo: next })
      .eq("id", id)
      .eq("empresa_id", selectedCompany.id);

    const error =
      primary.error && (primary.error as { code?: string }).code === "42703"
        ? (await supabase.from("aparelhos").update({ ativo: next }).eq("id", id)).error
        : primary.error;

    if (error) {
      console.error("Erro ao atualizar aparelho:", error);
      toast({ title: "Erro", description: "Não foi possível atualizar o aparelho.", variant: "destructive" });
      await loadAparelhos();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Aparelhos</h1>
              <p className="text-sm text-muted-foreground">Cadastre e ative/desative equipamentos</p>
            </div>
          </div>

          <Dialog
            open={cadastrarOpen}
            onOpenChange={(open) => {
              setCadastrarOpen(open);
              if (open) setNome("");
            }}
          >
            <Button onClick={() => setCadastrarOpen(true)} disabled={!selectedCompany}>
              Cadastrar
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar aparelho</DialogTitle>
                <DialogDescription>Use o token deste dispositivo</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Token</Label>
                  <Input value={deviceToken} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Nome do equipamento</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Coletor 01" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCadastrarOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={saving || !selectedCompany}>
                  {saving ? "Salvando..." : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Lista de aparelhos</CardTitle>
              <CardDescription>Mostrando todos os aparelhos desta empresa</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead>Nome</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : aparelhos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum aparelho cadastrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      aparelhos.map((aparelho) => {
                        const isThisDevice = aparelho.token === deviceToken;
                        return (
                          <TableRow key={aparelho.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {aparelho.nome}
                                {isThisDevice && <Badge className="bg-slate-100 text-slate-700">Este</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{aparelho.token}</TableCell>
                            <TableCell className="text-center">
                              {aparelho.ativo ? (
                                <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700">Inativo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center">
                                <Switch checked={aparelho.ativo} onCheckedChange={(v) => handleToggleAtivo(aparelho.id, v)} />
                              </div>
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
        </div>
      </main>
    </div>
  );
}
