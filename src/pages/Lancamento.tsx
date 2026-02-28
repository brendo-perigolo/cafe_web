import { useState, useEffect } from "react";
import { Coffee, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

const colheitaSchema = z.object({
  peso_kg: z.number().positive("Peso deve ser maior que zero"),
  panhador_id: z.string().min(1, "Selecione um panhador"),
  preco_por_kg: z.number().positive("Preço deve ser maior que zero").optional(),
  numero_bag: z.string().trim().max(60, "Número da bag deve ter no máximo 60 caracteres").optional(),
});

interface Panhador {
  id: string;
  nome: string;
  apelido: string | null;
}

export default function Lancamento() {
  const [panhadores, setPanhadores] = useState<Panhador[]>([]);
  const [panhadorId, setPanhadorId] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [precoKg, setPrecoKg] = useState("");
  const [numeroBag, setNumeroBag] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, selectedCompany } = useAuth();
  const { isOnline, savePendingColheita } = useOfflineSync();

  useEffect(() => {
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      return;
    }

    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome, apelido")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true);

    if (error) {
      console.error("Erro ao carregar panhadores:", error);
      return;
    }

    setPanhadores(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de registrar a colheita",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    try {
      const precoValue = precoKg.trim() ? Number(precoKg) : undefined;
      const bagValue = numeroBag.trim() ? numeroBag.trim() : undefined;

      const validated = colheitaSchema.parse({
        peso_kg: Number(pesoKg),
        panhador_id: panhadorId,
        preco_por_kg: precoValue,
        numero_bag: bagValue,
      });

      const panhador = panhadores.find((p) => p.id === validated.panhador_id);
      if (!panhador) throw new Error("Panhador não encontrado");

      const valorTotal = validated.preco_por_kg
        ? validated.peso_kg * validated.preco_por_kg
        : null;
      const dataColheita = new Date().toISOString();

      if (isOnline) {
        const { data: inserted, error } = await supabase
          .from("colheitas")
          .insert({
          peso_kg: validated.peso_kg,
          preco_por_kg: validated.preco_por_kg ?? null,
          valor_total: valorTotal,
          panhador_id: validated.panhador_id,
          numero_bag: validated.numero_bag ?? null,
          user_id: user!.id,
          data_colheita: dataColheita,
            empresa_id: selectedCompany.id,
          sincronizado: true,
          })
          .select("codigo")
          .single();

        if (error) throw error;

        toast({
          title: "Colheita registrada",
          description: inserted?.codigo ? `Código: ${inserted.codigo}` : "Dados salvos com sucesso",
        });
      } else {
        savePendingColheita({
          peso_kg: validated.peso_kg,
          preco_por_kg: validated.preco_por_kg ?? null,
          valor_total: valorTotal,
          panhador_id: validated.panhador_id,
          data_colheita: dataColheita,
          numero_bag: validated.numero_bag ?? null,
          empresa_id: selectedCompany.id,
        });

        toast({
          title: "Salvo offline",
          description: "Será sincronizado quando houver conexão",
        });
      }

      setPesoKg("");
      setPrecoKg("");
      setNumeroBag("");
      setPanhadorId("");
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Dados inválidos",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao registrar",
          description: "Tente novamente",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl p-4 space-y-6">
        <h1 className="text-3xl font-bold">Lançamento de Colheita</h1>

        <Card className="shadow-coffee">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Nova Colheita
            </CardTitle>
            <CardDescription>
              {isOnline ? "Conectado - Dados salvos na nuvem" : "Offline - Salvando localmente"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="panhador">Panhador</Label>
                <Select value={panhadorId} onValueChange={setPanhadorId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o panhador" />
                  </SelectTrigger>
                  <SelectContent>
                    {panhadores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                        {p.apelido ? ` (${p.apelido})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="peso">Peso (kg)</Label>
                <Input
                  id="peso"
                  type="number"
                  step="0.01"
                  value={pesoKg}
                  onChange={(e) => setPesoKg(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bag">Número da bag (opcional)</Label>
                <Input
                  id="bag"
                  value={numeroBag}
                  onChange={(e) => setNumeroBag(e.target.value)}
                  placeholder="Ex: BAG-102"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preco">Preço por kg (R$)</Label>
                <Input
                  id="preco"
                  type="number"
                  step="0.01"
                  value={precoKg}
                  onChange={(e) => setPrecoKg(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {panhadorId && pesoKg && precoKg.trim() && (
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="text-2xl font-bold">
                        {(
                          Number(pesoKg) * Number(precoKg || 0)
                        ).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Preço/kg informado: {Number(precoKg || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Salvando..." : "Registrar Colheita"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled
                  title="Impressão via Bluetooth (em breve)"
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
