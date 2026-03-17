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
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const colheitaSchema = z.object({
  peso_kg: z.number().positive("Peso deve ser maior que zero"),
  panhador_id: z.string().min(1, "Selecione um panhador"),
  preco_por_kg: z.number().positive("Preço deve ser maior que zero").optional(),
});

interface Panhador {
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

export default function Lancamento() {
  const [panhadores, setPanhadores] = useState<Panhador[]>([]);
  const [bagFieldsSupported, setBagFieldsSupported] = useState(true);
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
  const [loading, setLoading] = useState(false);
  const { user, selectedCompany } = useAuth();
  const { isOnline, savePendingColheita } = useOfflineSync();

  const generateCodigo = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  };

  useEffect(() => {
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!user || !selectedCompany) {
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
  }, [user, selectedCompany?.id]);

  const effectiveKgPorBalaio = (() => {
    if (usarKgPorBalaioPadrao) return kgPorBalaioConfig;
    const parsed = Number(kgPorBalaioManual);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  })();

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
      .eq("ativo", true);

    if (error) {
      const message = (error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingColumn =
        message.includes("column") || message.includes("bag_numero") || message.includes("bag_semana");

      if (looksLikeMissingColumn) {
        const fallback = await supabase
          .from("panhadores")
          .select("id, nome, apelido")
          .eq("empresa_id", selectedCompany.id)
          .eq("ativo", true);
        if (fallback.error) {
          console.error("Erro ao carregar panhadores (fallback):", fallback.error);
          return;
        }
        setBagFieldsSupported(false);
        setPanhadores((fallback.data as unknown as Panhador[]) || []);
        return;
      }

      console.error("Erro ao carregar panhadores:", error);
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
      // não bloquear lançamento por falta de tabela/política
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
    if (!isOnline) {
      toast({
        title: "Sem conexão",
        description: "A troca de bag precisa estar online.",
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
      toast({
        title: "Bag obrigatória",
        description: "Informe o número da bag para trocar.",
        variant: "destructive",
      });
      return;
    }
    if (bag.length > 60) {
      toast({
        title: "Bag inválida",
        description: "Número da bag deve ter no máximo 60 caracteres.",
        variant: "destructive",
      });
      return;
    }

    const target = panhadores.find((p) => p.id === panhadorId);
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

  const submitColheita = async () => {
    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de registrar a colheita",
        variant: "destructive",
      });
      return;
    }

    const effectivePanhadorId = panhadorId;

    setLoading(true);

    try {
      const precoInput = precoKg.trim() ? Number(precoKg) : undefined;

      if (bagObrigatoriaHoje) {
        throw new Error("Hoje é segunda-feira: clique em 'Trocar bag' para definir a bag desta semana.");
      }

      if (!usarKgPorBalaioPadrao) {
        if (effectiveKgPorBalaio == null || !Number.isFinite(effectiveKgPorBalaio) || effectiveKgPorBalaio <= 0) {
          throw new Error("Informe o peso médio do balaio (kg) no lançamento");
        }
      }

      if (precoPorBalaio && precoInput != null) {
        if (effectiveKgPorBalaio == null || !Number.isFinite(effectiveKgPorBalaio) || effectiveKgPorBalaio <= 0) {
          throw new Error("Configuração de peso do balaio inválida");
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

      const validated = colheitaSchema.parse({
        peso_kg: pesoNumber,
        panhador_id: effectivePanhadorId,
        preco_por_kg: precoPorKgFinal,
      });

      const panhador = panhadores.find((p) => p.id === validated.panhador_id);
      if (!panhador) throw new Error("Panhador não encontrado");

      const numeroBagParaColheita = (panhador.bag_numero ?? "").trim() ? (panhador.bag_numero ?? "").trim() : null;

      const dataColheita = new Date().toISOString();
      const kgPorBalaioUsado = effectiveKgPorBalaio;

      if (isOnline) {
        let codigo = generateCodigo();

        for (let attempt = 0; attempt < 3; attempt++) {
          const { error } = await supabase.from("colheitas").insert({
            codigo,
            peso_kg: validated.peso_kg,
            preco_por_kg: validated.preco_por_kg ?? null,
            preco_por_balaio: precoPorBalaioFinal,
            valor_total: valorTotal,
            panhador_id: validated.panhador_id,
            numero_bag: numeroBagParaColheita,
            user_id: user!.id,
            data_colheita: dataColheita,
            empresa_id: selectedCompany.id,
            sincronizado: true,
            mostrar_balaio_no_ticket: usarBalaioNoTicket,
            kg_por_balaio_utilizado: kgPorBalaioUsado,
          });

          if (!error) {
            toast({
              title: "Colheita registrada",
              description: `Código: ${codigo}`,
            });
            break;
          }

          const isCodigoConflict =
            (error as { code?: string; message?: string }).code === "23505" ||
            (error as { message?: string }).message?.toLowerCase().includes("colheitas_codigo_key") ||
            (error as { message?: string }).message?.toLowerCase().includes("duplicate key") ||
            (error as { message?: string }).message?.toLowerCase().includes("unique") ||
            false;

          if (isCodigoConflict && attempt < 2) {
            codigo = generateCodigo();
            continue;
          }

          throw error;
        }
      } else {
        savePendingColheita({
          peso_kg: validated.peso_kg,
          preco_por_kg: validated.preco_por_kg ?? null,
          preco_por_balaio: precoPorBalaioFinal,
          valor_total: valorTotal,
          panhador_id: validated.panhador_id,
          data_colheita: dataColheita,
          numero_bag: numeroBagParaColheita,
          empresa_id: selectedCompany.id,
          mostrar_balaio_no_ticket: usarBalaioNoTicket,
          kg_por_balaio_utilizado: kgPorBalaioUsado,
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
      setUsarBalaioNoTicket(false);
      setPrecoPorBalaio(false);
      setKgPorBalaioManual("");
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Dados inválidos",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        const message =
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message)
            : "Tente novamente";
        toast({
          title: "Erro ao registrar",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitColheita();
  };

  const handleConfirmTransfer = async () => {
    if (!pendingTransfer) {
      setBagConflictOpen(false);
      return;
    }
    const target = panhadores.find((p) => p.id === pendingTransfer.targetPanhadorId) ?? null;
    const owner = bagConflictOwner;
    if (!target || !owner) {
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl p-4 space-y-6">
        <h1 className="text-3xl font-bold">Lançamento de Colheita</h1>

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

        <Dialog
          open={trocarBagOpen}
          onOpenChange={(open) => {
            setTrocarBagOpen(open);
            if (!open) setTrocarBagValue("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar bag</DialogTitle>
              <DialogDescription>
                {selectedPanhador ? `Informe a bag que será vinculada ao panhador ${selectedPanhador.nome}.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="trocarBag">Número da bag</Label>
              <Input
                id="trocarBag"
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
          </DialogContent>
        </Dialog>

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
                <Label htmlFor="bag">Buscar bag (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="bag"
                    value={numeroBag}
                    onChange={(e) => handleNumeroBagChange(e.target.value)}
                    placeholder="Ex: 20"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setTrocarBagValue("");
                      setTrocarBagOpen(true);
                    }}
                    disabled={!panhadorId || !isOnline || !bagFieldsSupported}
                    title={!isOnline ? "Disponível apenas online" : !panhadorId ? "Selecione um panhador" : undefined}
                  >
                    Trocar bag
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Este campo é apenas para busca/seleção.</p>
                {bagObrigatoriaHoje && (
                  <p className="text-xs text-muted-foreground">
                    Hoje é segunda-feira: use o botão "Trocar bag" para definir a bag desta semana.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="preco">{precoPorBalaio ? "Preço por balaio (R$)" : "Preço por kg (R$)"}</Label>
                <Input
                  id="preco"
                  type="number"
                  step="0.01"
                  value={precoKg}
                  onChange={(e) => setPrecoKg(e.target.value)}
                  placeholder="0.00"
                />
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
                  <Label htmlFor="kgPorBalaioManual">Peso do balaio (kg) no lançamento</Label>
                  <Input
                    id="kgPorBalaioManual"
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

              {panhadorId && pesoKg && precoKg.trim() && (
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="text-2xl font-bold">
                        {(
                          Number(pesoKg) *
                          (precoPorBalaio && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0
                            ? Number(precoKg || 0) / effectiveKgPorBalaio
                            : Number(precoKg || 0))
                        ).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Preço/kg: {(
                          precoPorBalaio && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0
                            ? Number(precoKg || 0) / effectiveKgPorBalaio
                            : Number(precoKg || 0)
                        ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                      {usarBalaioNoTicket && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Preço/balaio: {(
                            precoPorBalaio
                              ? Number(precoKg || 0)
                              : Number(precoKg || 0) * effectiveKgPorBalaio
                          ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      )}

                      {usarBalaioNoTicket && effectiveKgPorBalaio != null && effectiveKgPorBalaio > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Média de balaios: {(Number(pesoKg) / effectiveKgPorBalaio).toFixed(2)}
                        </p>
                      )}
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
