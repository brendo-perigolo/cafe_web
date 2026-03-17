import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog as InlineDialog, DialogContent as InlineDialogContent, DialogDescription as InlineDialogDescription, DialogHeader as InlineDialogHeader, DialogTitle as InlineDialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
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

const lancamentoSchema = z.object({
  panhadorId: z.string().min(1, "Selecione um panhador"),
  pesoKg: z.number().positive("Peso deve ser maior que zero"),
  precoKg: z.number().positive("Preço deve ser maior que zero").optional(),
});

interface PanhadorOption {
  id: string;
  nome: string;
  apelido: string | null;
  bag_numero?: string | null;
  bag_semana?: string | null;
}

const formatLocalDateIso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getWeekMondayKey = (base: Date = new Date()) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDateIso(d);
};

interface LancamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function LancamentoDialog({ open, onOpenChange, onCreated }: LancamentoDialogProps) {
  const { user, selectedCompany } = useAuth();
  const [panhadores, setPanhadores] = useState<PanhadorOption[]>([]);
  const [bagFieldsSupported, setBagFieldsSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [panhadorId, setPanhadorId] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [precoKg, setPrecoKg] = useState("");
  const [numeroBag, setNumeroBag] = useState("");
  const [bagConflictOpen, setBagConflictOpen] = useState(false);
  const [bagConflictOwner, setBagConflictOwner] = useState<{ id: string; nome: string; bag_numero: string | null } | null>(
    null,
  );
  const [pendingTransfer, setPendingTransfer] = useState<{ bag: string; targetPanhadorId: string } | null>(null);
  const [trocarBagOpen, setTrocarBagOpen] = useState(false);
  const [trocarBagValue, setTrocarBagValue] = useState("");
  const [trocarBagSaving, setTrocarBagSaving] = useState(false);
  const [usarBalaioNoTicket, setUsarBalaioNoTicket] = useState(false);
  const [precoPorBalaio, setPrecoPorBalaio] = useState(false);
  const [kgPorBalaioConfig, setKgPorBalaioConfig] = useState<number | null>(null);
  const [usarKgPorBalaioPadrao, setUsarKgPorBalaioPadrao] = useState(true);
  const [kgPorBalaioManual, setKgPorBalaioManual] = useState("");

  useEffect(() => {
    if (open) {
      loadPanhadores();
    }
  }, [open, user, selectedCompany?.id]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!open || !user || !selectedCompany) {
        setKgPorBalaioConfig(null);
        setUsarKgPorBalaioPadrao(true);
        setKgPorBalaioManual("");
        return;
      }

      const { data, error } = await supabase
        .from("empresas_config")
        .select("kg_por_balaio, usar_kg_por_balaio_padrao")
        .eq("empresa_id", selectedCompany.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar configuração do balaio:", error);
        setKgPorBalaioConfig(null);
        setUsarKgPorBalaioPadrao(true);
        return;
      }

      const value = data?.kg_por_balaio != null ? Number(data.kg_por_balaio) : null;
      setKgPorBalaioConfig(value);
      setUsarKgPorBalaioPadrao(data?.usar_kg_por_balaio_padrao ?? true);
      setKgPorBalaioManual("");
    };

    loadConfig();
  }, [open, user, selectedCompany?.id]);

  useEffect(() => {
    if (!open) {
      setPanhadorId("");
      setPesoKg("");
      setPrecoKg("");
      setNumeroBag("");
      setUsarBalaioNoTicket(false);
      setPrecoPorBalaio(false);
      setKgPorBalaioManual("");
    }
  }, [open]);

  const effectiveKgPorBalaio = (() => {
    if (usarKgPorBalaioPadrao) return kgPorBalaioConfig;
    const parsed = Number(kgPorBalaioManual);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  })();

  const valorTotalPreview = useMemo(() => {
    if (!pesoKg || !precoKg) return null;
    const preco = Number(precoKg);
    const peso = Number(pesoKg);
    if (!Number.isFinite(preco) || !Number.isFinite(peso)) return null;

    if (precoPorBalaio) {
      if (effectiveKgPorBalaio == null || effectiveKgPorBalaio <= 0) return null;
      return (peso / effectiveKgPorBalaio) * preco;
    }

    return peso * preco;
  }, [pesoKg, precoKg, precoPorBalaio, effectiveKgPorBalaio]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setBagFieldsSupported(true);
      return;
    }

    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome, apelido, bag_numero, bag_semana")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error) {
      const message = (error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingColumn =
        message.includes("column") || message.includes("bag_numero") || message.includes("bag_semana");

      if (looksLikeMissingColumn) {
        const fallback = await supabase
          .from("panhadores")
          .select("id, nome, apelido")
          .eq("empresa_id", selectedCompany.id)
          .eq("ativo", true)
          .order("nome", { ascending: true });
        if (fallback.error) {
          console.error("Erro ao carregar panhadores (fallback):", fallback.error);
          toast({ title: "Erro", description: "Não foi possível carregar os panhadores.", variant: "destructive" });
          return;
        }

        setBagFieldsSupported(false);
        setPanhadores((fallback.data as unknown as PanhadorOption[]) || []);
        return;
      }

      console.error("Erro ao carregar panhadores:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os panhadores.", variant: "destructive" });
      return;
    }

    setBagFieldsSupported(true);
    setPanhadores(data || []);
  };

  const selectedPanhador = panhadores.find((p) => p.id === panhadorId) ?? null;
  const currentWeekKey = getWeekMondayKey();
  const bagObrigatoriaHoje =
    bagFieldsSupported &&
    new Date().getDay() === 1 &&
    selectedPanhador != null &&
    (selectedPanhador.bag_semana ?? null) !== currentWeekKey;

  useEffect(() => {
    if (!open) return;
    if (!selectedPanhador) return;
    const next = selectedPanhador.bag_numero ?? "";
    setNumeroBag(next);
  }, [panhadorId]);

  const handleNumeroBagChange = (value: string) => {
    setNumeroBag(value);
    const term = value.trim().toLowerCase();
    if (!term) return;
    const match = panhadores.find((p) => (p.bag_numero ?? "").trim().toLowerCase() === term);
    if (match && match.id !== panhadorId) setPanhadorId(match.id);
  };

  const insertBagHistorico = async (
    targetPanhadorId: string,
    bagAnterior: string | null,
    bagNova: string | null,
    observacao?: string,
  ) => {
    if (!user || !selectedCompany) return;
    try {
      const { error } = await supabase.from("panhadores_bag_historico").insert({
        empresa_id: selectedCompany.id,
        panhador_id: targetPanhadorId,
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
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("panhadores")
      .update({ bag_numero: null, bag_semana: null, bag_atualizado_em: now, updated_at: now })
      .eq("id", otherId)
      .eq("empresa_id", selectedCompany.id);
    if (error) throw error;
    await insertBagHistorico(otherId, otherBag, null, observacao);
    setPanhadores((prev) => prev.map((p) => (p.id === otherId ? { ...p, bag_numero: null, bag_semana: null } : p)));
  };

  const syncBagToPanhador = async (
    targetId: string,
    bagValue: string,
    bagAnterior?: string | null,
    observacaoHistorico?: string,
  ) => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) return;
    const trimmed = bagValue.trim();
    if (!trimmed) return;
    const weekKey = getWeekMondayKey();

    const { error } = await supabase
      .from("panhadores")
      .update({
        bag_numero: trimmed,
        bag_semana: weekKey,
        bag_atualizado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .eq("empresa_id", selectedCompany.id);

    if (error) {
      console.error("Erro ao atualizar bag do panhador:", error);
      return;
    }

    const prevNorm = (bagAnterior ?? "").trim();
    if (prevNorm !== trimmed) {
      await insertBagHistorico(targetId, bagAnterior ?? null, trimmed, observacaoHistorico ?? "Atualização no lançamento");
    }

    setPanhadores((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, bag_numero: trimmed, bag_semana: weekKey } : p)),
    );
  };

  const submitLancamentoCore = async () => {
    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de registrar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const effectivePanhadorId = panhadorId;

    try {
      const precoInput = precoKg.trim() ? Number(precoKg) : undefined;

      if (bagObrigatoriaHoje) {
        toast({
          title: "Bag obrigatória",
          description: "Hoje é segunda-feira: use o botão 'Trocar bag' para definir a bag desta semana.",
          variant: "destructive",
        });
        return;
      }

      if (!usarKgPorBalaioPadrao) {
        if (effectiveKgPorBalaio == null || !Number.isFinite(effectiveKgPorBalaio) || effectiveKgPorBalaio <= 0) {
          toast({
            title: "Peso médio obrigatório",
            description: "Informe o peso médio do balaio (kg) no lançamento.",
            variant: "destructive",
          });
          return;
        }
      }

      if (precoPorBalaio && precoInput != null) {
        if (effectiveKgPorBalaio == null || !Number.isFinite(effectiveKgPorBalaio) || effectiveKgPorBalaio <= 0) {
          toast({
            title: "Configuração do balaio",
            description: "Defina o peso do balaio em Configurações antes de usar preço por balaio.",
            variant: "destructive",
          });
          return;
        }
      }

      const pesoNumber = Number(pesoKg);
      const round2 = (value: number) => Number(value.toFixed(2));

      let precoPorKgFinal: number | undefined;
      let precoPorBalaioFinal: number | null = null;
      let valorTotal: number | null = null;

      if (precoInput != null) {
        if (precoPorBalaio) {
          const kgBalaio = effectiveKgPorBalaio as number;
          precoPorBalaioFinal = round2(precoInput);
          precoPorKgFinal = round2(precoInput / kgBalaio);
          valorTotal = round2((pesoNumber / kgBalaio) * precoPorBalaioFinal);
        } else {
          precoPorKgFinal = round2(precoInput);
          if (effectiveKgPorBalaio != null && Number.isFinite(effectiveKgPorBalaio) && effectiveKgPorBalaio > 0) {
            precoPorBalaioFinal = round2(precoInput * effectiveKgPorBalaio);
          }
          valorTotal = round2(pesoNumber * precoPorKgFinal);
        }
      }

      const parsed = lancamentoSchema.parse({
        panhadorId: effectivePanhadorId,
        pesoKg: pesoNumber,
        precoKg: precoPorKgFinal,
      });
      const kgPorBalaioUsado = effectiveKgPorBalaio;

      const effectiveSelected = panhadores.find((p) => p.id === parsed.panhadorId) ?? null;
      const numeroBagParaColheita = (effectiveSelected?.bag_numero ?? "").trim()
        ? (effectiveSelected?.bag_numero ?? "").trim()
        : null;

      const { error } = await supabase.from("colheitas").insert({
        panhador_id: parsed.panhadorId,
        peso_kg: parsed.pesoKg,
        preco_por_kg: parsed.precoKg ?? null,
        preco_por_balaio: precoPorBalaioFinal,
        valor_total: valorTotal,
        numero_bag: numeroBagParaColheita,
        data_colheita: new Date().toISOString(),
        empresa_id: selectedCompany.id,
        user_id: user.id,
        sincronizado: true,
        mostrar_balaio_no_ticket: usarBalaioNoTicket,
        kg_por_balaio_utilizado: kgPorBalaioUsado,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLancamentoCore();
  };

  const handleConfirmTransfer = async () => {
    if (!pendingTransfer) {
      setBagConflictOpen(false);
      return;
    }
    const target = panhadores.find((p) => p.id === pendingTransfer.targetPanhadorId) ?? null;
    const owner = bagConflictOwner;
    if (!user || !selectedCompany || !target || !owner) {
      setBagConflictOpen(false);
      setPendingTransfer(null);
      setBagConflictOwner(null);
      return;
    }

    setBagConflictOpen(false);
    setTrocarBagSaving(true);
    try {
      await detachBagFromOther(owner.id, owner.bag_numero, `Transferida para ${target.nome}`);
      await syncBagToPanhador(target.id, pendingTransfer.bag, target.bag_numero ?? null, "Troca de bag");
      setNumeroBag(pendingTransfer.bag);
      setTrocarBagOpen(false);
      toast({ title: "Bag atualizada", description: "Bag transferida com sucesso." });
    } catch (error) {
      console.error("Erro ao transferir bag:", error);
      toast({ title: "Erro", description: "Não foi possível transferir a bag.", variant: "destructive" });
    } finally {
      setTrocarBagSaving(false);
      setPendingTransfer(null);
      setBagConflictOwner(null);
    }
  };

  const handleCancelTransfer = () => {
    const current = panhadores.find((p) => p.id === panhadorId);
    setNumeroBag(current?.bag_numero ?? "");
    setPendingTransfer(null);
    setBagConflictOwner(null);
    setBagConflictOpen(false);
  };

  const handleTrocarBagConfirm = async () => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) {
      toast({
        title: "Bag indisponível",
        description: "Seu banco ainda não tem suporte a bag. Aplique a migration e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    if (!panhadorId) {
      toast({
        title: "Selecione um panhador",
        description: "Escolha o panhador antes de trocar a bag.",
        variant: "destructive",
      });
      return;
    }
    const bag = trocarBagValue.trim();
    if (!bag) {
      toast({ title: "Bag obrigatória", description: "Informe o número da bag para trocar.", variant: "destructive" });
      return;
    }
    if (bag.length > 60) {
      toast({ title: "Bag inválida", description: "Número da bag deve ter no máximo 60 caracteres.", variant: "destructive" });
      return;
    }

    const target = panhadores.find((p) => p.id === panhadorId) ?? null;
    if (!target) {
      toast({ title: "Erro", description: "Panhador não encontrado.", variant: "destructive" });
      return;
    }

    setTrocarBagSaving(true);
    try {
      const owner = await findBagOwner(bag, target.id);
      if (owner && owner.id !== target.id) {
        setBagConflictOwner(owner);
        setPendingTransfer({ bag, targetPanhadorId: target.id });
        setBagConflictOpen(true);
        return;
      }

      await syncBagToPanhador(target.id, bag, target.bag_numero ?? null, "Troca de bag");
      setNumeroBag(bag);
      setTrocarBagOpen(false);
      toast({ title: "Bag atualizada", description: "Bag trocada com sucesso." });
    } catch (error) {
      console.error("Erro ao trocar bag:", error);
      toast({ title: "Erro", description: "Não foi possível trocar a bag.", variant: "destructive" });
    } finally {
      setTrocarBagSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <DialogDescription>Preencha os dados da nova colheita</DialogDescription>
        </DialogHeader>

        <AlertDialog open={bagConflictOpen} onOpenChange={setBagConflictOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bag já vinculada</AlertDialogTitle>
              <AlertDialogDescription>
                {bagConflictOwner
                  ? `A bag ${bagConflictOwner.bag_numero ?? ""} está vinculada ao panhador ${bagConflictOwner.nome}. Deseja transferir para o panhador selecionado?`
                  : "Esta bag já está vinculada a outro panhador. Deseja transferir para o panhador selecionado?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelTransfer}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmTransfer}>Transferir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <InlineDialog
          open={trocarBagOpen}
          onOpenChange={(open) => {
            setTrocarBagOpen(open);
            if (!open) setTrocarBagValue("");
          }}
        >
          <InlineDialogContent>
            <InlineDialogHeader>
              <InlineDialogTitle>Trocar bag</InlineDialogTitle>
              <InlineDialogDescription>
                {selectedPanhador ? `Informe a bag que será vinculada ao panhador ${selectedPanhador.nome}.` : ""}
              </InlineDialogDescription>
            </InlineDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="trocarBagDialog">Número da bag</Label>
              <Input
                id="trocarBagDialog"
                value={trocarBagValue}
                onChange={(e) => setTrocarBagValue(e.target.value)}
                placeholder="Ex: 20"
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setTrocarBagOpen(false)} disabled={trocarBagSaving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleTrocarBagConfirm} disabled={trocarBagSaving}>
                {trocarBagSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </InlineDialogContent>
        </InlineDialog>

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
            <Label>Buscar bag (opcional)</Label>
            <div className="flex gap-2">
              <Input value={numeroBag} onChange={(e) => handleNumeroBagChange(e.target.value)} placeholder="Ex: 20" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setTrocarBagValue("");
                  setTrocarBagOpen(true);
                }}
                disabled={!panhadorId || !bagFieldsSupported}
                title={!panhadorId ? "Selecione um panhador" : undefined}
              >
                Trocar bag
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Este campo é apenas para busca/seleção.</p>
            {bagObrigatoriaHoje && (
              <p className="text-xs text-muted-foreground">Hoje é segunda-feira: use o botão "Trocar bag" para definir a bag desta semana.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{precoPorBalaio ? "Preço por balaio (opcional)" : "Preço por kg (opcional)"}</Label>
            <Input type="number" step="0.01" value={precoKg} onChange={(e) => setPrecoKg(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Mostrar balaio no ticket</p>
              <p className="text-xs text-muted-foreground">
                Média: peso ÷ peso do balaio ({effectiveKgPorBalaio != null ? `${effectiveKgPorBalaio} kg` : "não definido"})
              </p>
            </div>
            <Switch checked={usarBalaioNoTicket} onCheckedChange={setUsarBalaioNoTicket} />
          </div>
          {!usarKgPorBalaioPadrao && (
            <div className="space-y-2">
              <Label>Peso do balaio (kg) no lançamento</Label>
              <Input
                type="number"
                step="0.01"
                value={kgPorBalaioManual}
                onChange={(e) => setKgPorBalaioManual(e.target.value)}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Padrão em Configurações: {kgPorBalaioConfig != null ? `${kgPorBalaioConfig} kg` : "não configurado"}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Trocar preço para balaio</p>
              <p className="text-xs text-muted-foreground">Digitar o preço por balaio e converter automaticamente.</p>
            </div>
            <Switch checked={precoPorBalaio} onCheckedChange={setPrecoPorBalaio} />
          </div>
          {valorTotalPreview != null && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              Valor estimado: <strong>{valorTotalPreview.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
              {precoKg.trim() && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Preço/kg: {(
                    precoPorBalaio && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0
                      ? Number(precoKg || 0) / effectiveKgPorBalaio
                      : Number(precoKg || 0)
                  ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
              {usarBalaioNoTicket && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0 && precoKg.trim() && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Preço/balaio: {(
                    precoPorBalaio ? Number(precoKg || 0) : Number(precoKg || 0) * effectiveKgPorBalaio
                  ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
              {usarBalaioNoTicket && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0 && pesoKg.trim() && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Média de balaios: {(Number(pesoKg) / effectiveKgPorBalaio).toFixed(2)}
                </div>
              )}
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
