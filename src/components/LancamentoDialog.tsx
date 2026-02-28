import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

const lancamentoSchema = z.object({
  panhadorId: z.string().min(1, "Selecione um panhador"),
  pesoKg: z.number().positive("Peso deve ser maior que zero"),
  precoKg: z.number().positive("Preço deve ser maior que zero").optional(),
  numeroBag: z.string().max(60, "Número da bag deve ter no máximo 60 caracteres").optional(),
});

interface PanhadorOption {
  id: string;
  nome: string;
  apelido: string | null;
}

interface LancamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function LancamentoDialog({ open, onOpenChange, onCreated }: LancamentoDialogProps) {
  const { user, selectedCompany } = useAuth();
  const [panhadores, setPanhadores] = useState<PanhadorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [panhadorId, setPanhadorId] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [precoKg, setPrecoKg] = useState("");
  const [numeroBag, setNumeroBag] = useState("");

  useEffect(() => {
    if (open) {
      loadPanhadores();
    }
  }, [open, user, selectedCompany?.id]);

  useEffect(() => {
    if (!open) {
      setPanhadorId("");
      setPesoKg("");
      setPrecoKg("");
      setNumeroBag("");
    }
  }, [open]);

  const valorTotalPreview = useMemo(() => {
    if (!pesoKg || !precoKg) return null;
    return Number(pesoKg) * Number(precoKg);
  }, [pesoKg, precoKg]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      return;
    }

    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome, apelido")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar panhadores:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os panhadores.", variant: "destructive" });
      return;
    }

    setPanhadores(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de registrar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const parsed = lancamentoSchema.parse({
        panhadorId,
        pesoKg: Number(pesoKg),
        precoKg: precoKg.trim() ? Number(precoKg) : undefined,
        numeroBag: numeroBag.trim() ? numeroBag.trim() : undefined,
      });

      const valorTotal = parsed.precoKg ? Number((parsed.precoKg * parsed.pesoKg).toFixed(2)) : null;

      const { error } = await supabase.from("colheitas").insert({
        panhador_id: parsed.panhadorId,
        peso_kg: parsed.pesoKg,
        preco_por_kg: parsed.precoKg ?? null,
        valor_total: valorTotal,
        numero_bag: parsed.numeroBag ?? null,
        data_colheita: new Date().toISOString(),
        empresa_id: selectedCompany.id,
        user_id: user.id,
        sincronizado: true,
      });

      if (error) throw error;

      toast({ title: "Movimentação registrada", description: "A colheita foi registrada com sucesso." });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ title: "Dados inválidos", description: err.errors[0].message, variant: "destructive" });
      } else {
        console.error("Erro ao registrar movimentação:", err);
        toast({ title: "Erro ao registrar", description: "Tente novamente", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <DialogDescription>Preencha os dados da nova colheita</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Panhador</Label>
            <Select value={panhadorId} onValueChange={setPanhadorId}>
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
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.01" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Número da bag (opcional)</Label>
            <Input value={numeroBag} onChange={(e) => setNumeroBag(e.target.value)} placeholder="BAG-102" />
          </div>
          <div className="space-y-2">
            <Label>Preço por kg (opcional)</Label>
            <Input type="number" step="0.01" value={precoKg} onChange={(e) => setPrecoKg(e.target.value)} />
          </div>
          {valorTotalPreview != null && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              Valor estimado: <strong>{valorTotalPreview.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
