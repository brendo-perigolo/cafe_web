import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { TablesInsert } from "@/integrations/supabase/types";

export default function Configuracoes() {
  const { user, selectedCompany } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [kgPorBalaio, setKgPorBalaio] = useState<string>("");
  const [usarKgPorBalaioPadrao, setUsarKgPorBalaioPadrao] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user || !selectedCompany) {
        setKgPorBalaio("");
        setInitialLoading(false);
        return;
      }

      setInitialLoading(true);
      const { data, error } = await supabase
        .from("empresas_config")
        .select("kg_por_balaio, usar_kg_por_balaio_padrao")
        .eq("empresa_id", selectedCompany.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar configurações:", error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar as configurações.",
          variant: "destructive",
        });
        setInitialLoading(false);
        return;
      }

      const value = data?.kg_por_balaio != null ? Number(data.kg_por_balaio) : null;
      setKgPorBalaio(value != null ? String(value) : "");
      setUsarKgPorBalaioPadrao(data?.usar_kg_por_balaio_padrao ?? true);
      setInitialLoading(false);
    };

    load();
  }, [user, selectedCompany?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de salvar configurações.",
        variant: "destructive",
      });
      return;
    }

    const hasKgValue = Boolean(kgPorBalaio.trim());
    const parsed = hasKgValue ? Number(kgPorBalaio) : null;
    if (usarKgPorBalaioPadrao) {
      if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) {
        toast({
          title: "Valor inválido",
          description: "Informe um peso do balaio maior que zero.",
          variant: "destructive",
        });
        return;
      }
    } else if (parsed != null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast({
        title: "Valor inválido",
        description: "Se informar o peso do balaio, ele deve ser maior que zero.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const payload: TablesInsert<"empresas_config"> = {
        empresa_id: selectedCompany.id,
        usar_kg_por_balaio_padrao: usarKgPorBalaioPadrao,
      };

      if (usarKgPorBalaioPadrao) {
        payload.kg_por_balaio = parsed;
      } else if (parsed != null) {
        // Opcional: permite deixar um valor salvo para quando o usuário voltar ao modo padrão.
        payload.kg_por_balaio = parsed;
      }

      const { error } = await supabase
        .from("empresas_config")
        .upsert(payload, { onConflict: "empresa_id" });

      if (error) throw error;

      toast({
        title: "Configurações salvas",
        description: "Configurações do balaio atualizadas.",
      });
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl p-4 space-y-6">
        <h1 className="text-3xl font-bold">Configurações</h1>

        <Card className="shadow-coffee">
          <CardHeader>
            <CardTitle>Padrões do Balaio</CardTitle>
            <CardDescription>
              Usado para calcular a média de balaios no lançamento de colheita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Usar kg/balaio padrão</p>
                  <p className="text-xs text-muted-foreground">
                      Desative para exigir o peso médio do balaio em cada lançamento.
                  </p>
                </div>
                <Switch
                  checked={usarKgPorBalaioPadrao}
                  onCheckedChange={setUsarKgPorBalaioPadrao}
                  disabled={initialLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kgPorBalaio">Peso do balaio (kg)</Label>
                <Input
                  id="kgPorBalaio"
                  type="number"
                  step="0.01"
                  value={kgPorBalaio}
                  onChange={(e) => setKgPorBalaio(e.target.value)}
                  placeholder={initialLoading ? "Carregando..." : "0.00"}
                  disabled={initialLoading}
                />
                {!usarKgPorBalaioPadrao && (
                  <p className="text-xs text-muted-foreground">
                    No modo manual, este valor não é usado automaticamente (você deve informar no lançamento).
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={loading || initialLoading}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
