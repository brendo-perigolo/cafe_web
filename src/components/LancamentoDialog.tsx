import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog as InlineDialog, DialogContent as InlineDialogContent, DialogDescription as InlineDialogDescription, DialogHeader as InlineDialogHeader, DialogTitle as InlineDialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { getDeviceToken } from "@/lib/device";
import { getAparelhoAtivo } from "@/lib/aparelhos";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cacheKey, readJson, writeJson } from "@/lib/offline";
import { getDeviceLancamentoSettings } from "@/lib/deviceSettings";
import { isUuid, toUuidOrNull } from "@/lib/uuid";
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

interface PropriedadeOption {
  id: string;
  nome: string | null;
}

interface LavouraOption {
  id: string;
  nome: string;
  propriedade_id: string;
}

const PADRAO_OPTION = "__padrao__";

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
  const { savePendingColheita } = useOfflineSync();
  const [panhadores, setPanhadores] = useState<PanhadorOption[]>([]);
  const [propriedadesSupported, setPropriedadesSupported] = useState(true);
  const [propriedades, setPropriedades] = useState<PropriedadeOption[]>([]);
  const [lavouras, setLavouras] = useState<LavouraOption[]>([]);
  const [propriedadeId, setPropriedadeId] = useState(PADRAO_OPTION);
  const [lavouraId, setLavouraId] = useState(PADRAO_OPTION);
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
  const [kgPorBalaioManual, setKgPorBalaioManual] = useState("");
  const [mostrarPropriedadeLavoura, setMostrarPropriedadeLavoura] = useState(true);
  const [usarPropriedadeLavouraPadrao, setUsarPropriedadeLavouraPadrao] = useState(false);
  const [propriedadePadraoId, setPropriedadePadraoId] = useState<string | null>(null);
  const [lavouraPadraoId, setLavouraPadraoId] = useState<string | null>(null);
  const [panhadorOpen, setPanhadorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      loadPanhadores();
      loadPropriedades();
    }
  }, [open, user, selectedCompany?.id]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!open || !user || !selectedCompany) {
        setKgPorBalaioConfig(null);
        setKgPorBalaioManual("");
        setPrecoPorBalaio(false);
        setMostrarPropriedadeLavoura(true);
        setUsarPropriedadeLavouraPadrao(false);
        setPropriedadePadraoId(null);
        setLavouraPadraoId(null);
        return;
      }

      const settings = getDeviceLancamentoSettings(selectedCompany.id);
      const kgDefaultEnabled = settings.usar_kg_por_balaio_padrao ?? true;
      const kgDefault =
        settings.kg_por_balaio_padrao != null && Number.isFinite(Number(settings.kg_por_balaio_padrao))
          ? Number(settings.kg_por_balaio_padrao)
          : null;
      setKgPorBalaioConfig(kgDefault);
      setKgPorBalaioManual(kgDefaultEnabled && kgDefault != null && kgDefault > 0 ? String(kgDefault) : "");
      setPrecoPorBalaio(settings.preco_por_balaio_padrao ?? false);

      setMostrarPropriedadeLavoura(settings.mostrar_propriedade_lavoura ?? true);
      setUsarPropriedadeLavouraPadrao(settings.usar_propriedade_lavoura_padrao ?? false);
      setPropriedadePadraoId(settings.propriedade_padrao_id ?? null);
      setLavouraPadraoId(settings.lavoura_padrao_id ?? null);
    };

    loadConfig();
  }, [open, user, selectedCompany?.id]);

  useEffect(() => {
    if (!open) {
      setPanhadorId("");
      setPesoKg("");
      setPrecoKg("");
      setNumeroBag("");
      setPropriedadeId(PADRAO_OPTION);
      setLavouraId(PADRAO_OPTION);
      setUsarBalaioNoTicket(false);
      setPrecoPorBalaio(false);
      setKgPorBalaioManual("");
    }
  }, [open]);

  const loadPropriedades = async () => {
    if (!user || !selectedCompany) {
      setPropriedades([]);
      setLavouras([]);
      setPropriedadesSupported(true);
      setPropriedadeId(PADRAO_OPTION);
      setLavouraId(PADRAO_OPTION);
      return;
    }

    const deviceSettings = getDeviceLancamentoSettings(selectedCompany.id);
    const usePropDefault = deviceSettings.usar_propriedade_lavoura_padrao ?? false;
    const devicePropId = deviceSettings.propriedade_padrao_id ?? null;
    const deviceLavId = deviceSettings.lavoura_padrao_id ?? null;

    const propsCacheKey = cacheKey("propriedades_list", selectedCompany.id);
    const lavourasCacheKey = cacheKey("lavouras_list", selectedCompany.id);

    const tryLoadFromCache = () => {
      const cachedProps = readJson<{ supported?: boolean; propriedades: PropriedadeOption[] } | null>(propsCacheKey, null);
      const cachedLavouras = readJson<{ supported?: boolean; lavouras: LavouraOption[] } | null>(lavourasCacheKey, null);

      if (!cachedProps) return false;

      setPropriedadesSupported(cachedProps.supported !== false);
      const list = (cachedProps.propriedades ?? []) as PropriedadeOption[];
      setPropriedades(list);

      const padrao = list.find((p) => (p.nome ?? "").trim().toLowerCase() === "padrao")?.id;
      const fromDeviceDefault =
        usePropDefault && devicePropId && list.some((p) => p.id === devicePropId)
          ? devicePropId
          : null;
      const nextPropriedadeId = fromDeviceDefault ?? padrao ?? (list[0]?.id ?? PADRAO_OPTION);
      setPropriedadeId(nextPropriedadeId);

      const allLavouras = (cachedLavouras?.lavouras ?? []) as LavouraOption[];
      if (nextPropriedadeId !== PADRAO_OPTION) {
        const filtered = allLavouras.filter((l) => l.propriedade_id === nextPropriedadeId);
        setLavouras(filtered);
        const padraoLav = filtered.find((l) => l.nome.trim().toLowerCase() === "padrao")?.id;
        const fromDeviceLav =
          usePropDefault && deviceLavId && filtered.some((l) => l.id === deviceLavId)
            ? deviceLavId
            : null;
        setLavouraId(fromDeviceLav ?? padraoLav ?? (filtered[0]?.id ?? PADRAO_OPTION));
      } else {
        setLavouras([]);
        setLavouraId(PADRAO_OPTION);
      }

      return true;
    };

    if (!navigator.onLine) {
      const ok = tryLoadFromCache();
      if (!ok) {
        setPropriedades([]);
        setLavouras([]);
        setPropriedadeId(PADRAO_OPTION);
        setLavouraId(PADRAO_OPTION);
      }
      return;
    }

    const { data, error } = await supabase
      .from("propriedades")
      .select("id, nome")
      .eq("empresa_id", selectedCompany.id)
      .order("nome", { ascending: true, nullsFirst: true });

    if (error) {
      const message = (error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingTable =
        (error as { code?: string }).code === "42P01" || message.includes("relation") || message.includes("does not exist");

      if (looksLikeMissingTable) {
        setPropriedadesSupported(false);
        setPropriedades([]);
        setLavouras([]);
        setPropriedadeId(PADRAO_OPTION);
        setLavouraId(PADRAO_OPTION);

        writeJson(propsCacheKey, {
          cachedAt: new Date().toISOString(),
          supported: false,
          propriedades: [],
        });
        return;
      }

      console.error("Erro ao carregar propriedades:", error);
      toast({ title: "Erro", description: "Não foi possível carregar propriedades.", variant: "destructive" });

      // fallback cache
      tryLoadFromCache();
      return;
    }

    setPropriedadesSupported(true);
    const list = (data || []) as PropriedadeOption[];
    setPropriedades(list);

    writeJson(propsCacheKey, {
      cachedAt: new Date().toISOString(),
      supported: true,
      propriedades: list,
    });

    const padrao = list.find((p) => (p.nome ?? "").trim().toLowerCase() === "padrao")?.id;
    const nextPropriedadeId = padrao ?? (list[0]?.id ?? PADRAO_OPTION);
    setPropriedadeId(nextPropriedadeId);

    if (nextPropriedadeId !== PADRAO_OPTION) {
      await loadLavouras(nextPropriedadeId);
    } else {
      setLavouras([]);
      setLavouraId(PADRAO_OPTION);
    }
  };

  const loadLavouras = async (propId: string) => {
    if (!user || !selectedCompany) {
      setLavouras([]);
      setLavouraId(PADRAO_OPTION);
      return;
    }

    if (!isUuid(propId)) {
      setLavouras([]);
      setLavouraId(PADRAO_OPTION);
      return;
    }

    const lavourasCacheKey = cacheKey("lavouras_list", selectedCompany.id);
    const cachedLavouras = readJson<{ supported?: boolean; lavouras: LavouraOption[] } | null>(lavourasCacheKey, null);

    if (!navigator.onLine) {
      const all = (cachedLavouras?.lavouras ?? []) as LavouraOption[];
      const filtered = all.filter((l) => l.propriedade_id === propId);
      setLavouras(filtered);
      const padrao = filtered.find((l) => l.nome.trim().toLowerCase() === "padrao")?.id;
      setLavouraId(padrao ?? (filtered[0]?.id ?? PADRAO_OPTION));
      return;
    }

    const { data, error } = await supabase
      .from("lavouras")
      .select("id, nome, propriedade_id")
      .eq("empresa_id", selectedCompany.id)
      .eq("propriedade_id", propId)
      .order("nome", { ascending: true });

    if (error) {
      const message = (error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingTable =
        (error as { code?: string }).code === "42P01" || message.includes("relation") || message.includes("does not exist");
      if (looksLikeMissingTable) {
        setPropriedadesSupported(false);
        setLavouras([]);
        setLavouraId(PADRAO_OPTION);

        writeJson(lavourasCacheKey, {
          cachedAt: new Date().toISOString(),
          supported: false,
          lavouras: [],
        });
        return;
      }

      console.error("Erro ao carregar lavouras:", error);
      toast({ title: "Erro", description: "Não foi possível carregar lavouras.", variant: "destructive" });

      // fallback cache
      const all = (cachedLavouras?.lavouras ?? []) as LavouraOption[];
      const filtered = all.filter((l) => l.propriedade_id === propId);
      setLavouras(filtered);
      return;
    }

    const list = (data || []) as LavouraOption[];
    setLavouras(list);

    // cache all lavouras for the company (merge with existing)
    try {
      const existing = (cachedLavouras?.lavouras ?? []) as LavouraOption[];
      const merged = [...existing.filter((l) => l.propriedade_id !== propId), ...list];
      writeJson(lavourasCacheKey, {
        cachedAt: new Date().toISOString(),
        supported: true,
        lavouras: merged,
      });
    } catch {
      // ignore
    }
    const padrao = list.find((l) => l.nome.trim().toLowerCase() === "padrao")?.id;
    setLavouraId(padrao ?? (list[0]?.id ?? PADRAO_OPTION));
  };

  const effectiveKgPorBalaio = (() => {
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

  const balaiosPreview = useMemo(() => {
    const peso = Number(pesoKg);
    if (!Number.isFinite(peso) || peso <= 0) return null;
    if (effectiveKgPorBalaio == null || effectiveKgPorBalaio <= 0) return null;
    return peso / effectiveKgPorBalaio;
  }, [pesoKg, effectiveKgPorBalaio]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setBagFieldsSupported(true);
      return;
    }

    const panCacheKey = cacheKey("panhadores_list", selectedCompany.id);
    const loadFromCache = () => {
      const cached = readJson<{ bagFieldsSupported?: boolean; panhadores: PanhadorOption[] } | null>(panCacheKey, null);
      if (!cached?.panhadores) return false;
      setBagFieldsSupported(cached.bagFieldsSupported !== false);
      setPanhadores((cached.panhadores ?? []) as PanhadorOption[]);
      return true;
    };

    if (!navigator.onLine) {
      loadFromCache();
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

        writeJson(panCacheKey, {
          cachedAt: new Date().toISOString(),
          bagFieldsSupported: false,
          panhadores: (fallback.data as unknown as PanhadorOption[]) || [],
        });
        return;
      }

      console.error("Erro ao carregar panhadores:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os panhadores.", variant: "destructive" });

      loadFromCache();
      return;
    }

    setBagFieldsSupported(true);
    setPanhadores(data || []);

    writeJson(panCacheKey, {
      cachedAt: new Date().toISOString(),
      bagFieldsSupported: true,
      panhadores: data || [],
    });
  };

  const selectedPanhador = panhadores.find((p) => p.id === panhadorId) ?? null;

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

    const escapeHtml = (input: unknown) => {
      const str = String(input ?? "");
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return str.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
    };

    const formatCurrency = (value: number | null | undefined) => {
      if (value == null) return "-";
      try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
      } catch {
        return String(value);
      }
    };

    const openPrintTicket = async (data: {
      codigo?: string | null;
      empresa: string;
      panhador: string;
      dataColheita: string;
      pesoKg: number;
      numeroBag?: string | null;
      mostrarBalaioNoTicket?: boolean;
      kgPorBalaioUsado?: number | null;
      precoPorKg?: number | null;
      precoPorBalaio?: number | null;
      valorTotal?: number | null;
      offline?: boolean;
    }) => {
      const emittedAt = new Date().toLocaleString("pt-BR");
      const dataLabel = (() => {
        const d = new Date(data.dataColheita);
        return Number.isNaN(d.getTime()) ? data.dataColheita : d.toLocaleString("pt-BR");
      })();

      const padRight = (value: string, width: number) => {
        const s = value ?? "";
        if (s.length >= width) return s.slice(0, width);
        return s + " ".repeat(width - s.length);
      };

      const padLeft = (value: string, width: number) => {
        const s = value ?? "";
        if (s.length >= width) return s.slice(0, width);
        return " ".repeat(width - s.length) + s;
      };

      const line2 = (label: string, value: string, width = 32) => {
        const left = `${label}:`;
        const space = 1;
        const rightWidth = Math.max(0, width - left.length - space);
        return `${left} ${padLeft(value, rightWidth)}`.slice(0, width);
      };

      const buildPosText58 = () => {
        const width = 32;
        const sep = "-".repeat(width);
        const title = "COMPROVANTE COLHEITA";
        const centeredTitle = (() => {
          const t = title.slice(0, width);
          const leftPad = Math.max(0, Math.floor((width - t.length) / 2));
          return " ".repeat(leftPad) + t;
        })();

        const balaios =
          data.mostrarBalaioNoTicket && data.kgPorBalaioUsado && data.kgPorBalaioUsado > 0
            ? data.pesoKg / data.kgPorBalaioUsado
            : null;

        const lines: string[] = [];
        lines.push(padRight(String(data.empresa ?? "-").toUpperCase(), width));
        lines.push(centeredTitle);
        lines.push(sep);
        lines.push(line2("Data", dataLabel, width));
        lines.push(line2("Gerado", emittedAt, width));
        if (data.codigo) lines.push(line2("Codigo", data.codigo, width));
        lines.push(sep);
        lines.push(line2("Panhador", data.panhador || "-", width));
        if (data.numeroBag) lines.push(line2("Bag", data.numeroBag, width));
        lines.push(line2("Peso", `${data.pesoKg.toFixed(2)} kg`, width));
        if (balaios != null) lines.push(line2("Balaios", balaios.toFixed(2), width));
        if (data.precoPorKg != null) lines.push(line2("Preco/kg", formatCurrency(data.precoPorKg), width));
        if (data.precoPorBalaio != null) lines.push(line2("Preco/bal", formatCurrency(data.precoPorBalaio), width));
        if (data.valorTotal != null) lines.push(line2("Valor", formatCurrency(data.valorTotal), width));
        if (data.offline) lines.push(line2("Status", "OFFLINE", width));
        lines.push(sep);
        lines.push("Assinatura:");
        lines.push("______________________________");
        lines.push("\n");
        return lines.join("\n");
      };

      const posText = buildPosText58();

      // Android (RawBT): compartilhar texto costuma ser o caminho mais direto.
      // Se não houver suporte ao Share API, cai para impressão via navegador.
      try {
        if (typeof navigator !== "undefined" && "share" in navigator && typeof navigator.share === "function") {
          await navigator.share({ title: "Comprovante", text: posText });
          return;
        }
      } catch {
        // Usuário pode cancelar ou o app não aceitar; segue para fallback.
      }

      const balaios =
        data.mostrarBalaioNoTicket && data.kgPorBalaioUsado && data.kgPorBalaioUsado > 0
          ? data.pesoKg / data.kgPorBalaioUsado
          : null;

      const title = "Comprovante de Colheita";
      const html = `
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${escapeHtml(title)}</title>
            <style>
              @page { size: 58mm auto; margin: 0; }
              body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; width: 58mm; margin: 0; padding: 4mm; color: #111827; }
              h1 { margin: 0; font-size: 14px; }
              .top { border-bottom: 1px dashed #9ca3af; padding-bottom: 8px; margin-bottom: 8px; }
              .meta { font-size: 11px; color: #111827; display: grid; gap: 2px; margin-top: 6px; }
              .kpi { border-top: 1px dashed #9ca3af; padding-top: 8px; margin-top: 8px; font-size: 11px; }
              .kpi .row { display: flex; justify-content: space-between; gap: 8px; }
              .kpi .label { opacity: 0.9; }
              .kpi .value { font-weight: 700; white-space: nowrap; }
              .footer { margin-top: 12px; font-size: 11px; }
            </style>
          </head>
          <body>
            <div class="top">
              <h1>${escapeHtml(title)}</h1>
              <div class="meta">
                <div><strong>Empresa:</strong> ${escapeHtml(data.empresa)}</div>
                <div><strong>Panhador:</strong> ${escapeHtml(data.panhador)}</div>
                <div><strong>Data:</strong> ${escapeHtml(dataLabel)}</div>
                <div><strong>Gerado em:</strong> ${escapeHtml(emittedAt)}</div>
                ${data.codigo ? `<div><strong>Código:</strong> ${escapeHtml(data.codigo)}</div>` : ""}
                ${data.numeroBag ? `<div><strong>Bag:</strong> ${escapeHtml(data.numeroBag)}</div>` : ""}
                ${data.offline ? `<div><strong>Status:</strong> OFFLINE (pendente de sincronização)</div>` : ""}
              </div>
            </div>

            <div class="kpi">
              <div class="row"><div class="label">Peso</div><div class="value">${escapeHtml(data.pesoKg.toFixed(2))} kg</div></div>
              ${balaios != null ? `<div class="row"><div class="label">Balaios</div><div class="value">${escapeHtml(balaios.toFixed(2))}</div></div>` : ""}
              ${data.precoPorKg != null ? `<div class="row"><div class="label">Preço/kg</div><div class="value">${escapeHtml(formatCurrency(data.precoPorKg))}</div></div>` : ""}
              ${data.precoPorBalaio != null ? `<div class="row"><div class="label">Preço/balaio</div><div class="value">${escapeHtml(formatCurrency(data.precoPorBalaio))}</div></div>` : ""}
              ${data.valorTotal != null ? `<div class="row"><div class="label">Valor</div><div class="value">${escapeHtml(formatCurrency(data.valorTotal))}</div></div>` : ""}
            </div>

            <div class="footer">Assinatura: ________________________________</div>
          </body>
        </html>
      `;

      const w = window.open("", "_blank");
      if (!w) {
        toast({
          title: "Popup bloqueado",
          description: "Permita popups para imprimir o comprovante.",
          variant: "destructive",
        });
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 250);
    };

    const toastRegisteredWithPrint = (params: {
      title: string;
      description: string;
      ticket: Parameters<typeof openPrintTicket>[0];
    }) => {
      toast({
        title: params.title,
        description: params.description,
        action: (
          <ToastAction altText="Imprimir" onClick={() => void openPrintTicket(params.ticket)}>
            Imprimir
          </ToastAction>
        ),
      });
    };

    try {
      const precoInput = precoKg.trim() ? Number(precoKg) : undefined;

      if (effectiveKgPorBalaio == null || !Number.isFinite(effectiveKgPorBalaio) || effectiveKgPorBalaio <= 0) {
        toast({
          title: "Peso médio obrigatório",
          description: "Informe o kg médio do balaio no lançamento.",
          variant: "destructive",
        });
        return;
      }

      if (precoPorBalaio && precoInput != null) {
        // effectiveKgPorBalaio já validado acima
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

      const aparelhoToken = getDeviceToken();
      const basePayload = {
        panhador_id: parsed.panhadorId,
        peso_kg: parsed.pesoKg,
        preco_por_kg: parsed.precoKg ?? null,
        preco_por_balaio: precoPorBalaioFinal,
        valor_total: valorTotal,
        numero_bag: numeroBagParaColheita,
        data_colheita: new Date().toISOString(),
        empresa_id: selectedCompany.id,
        mostrar_balaio_no_ticket: usarBalaioNoTicket,
        kg_por_balaio_utilizado: kgPorBalaioUsado,
        aparelho_token: aparelhoToken,
        ...(propriedadesSupported
          ? {
              propriedade_id: propriedadeId === PADRAO_OPTION ? null : toUuidOrNull(propriedadeId),
              lavoura_id: lavouraId === PADRAO_OPTION ? null : toUuidOrNull(lavouraId),
            }
          : {}),
      };

      const enqueueOffline = () => {
        const pending = savePendingColheita({
          ...basePayload,
          panhador_nome: effectiveSelected?.nome,
        });

        toastRegisteredWithPrint({
          title: "Salvo offline",
          description: "A colheita foi salva no dispositivo e será sincronizada quando a internet voltar.",
          ticket: {
            codigo: `OFF-${pending.id.slice(0, 8)}`,
            empresa: selectedCompany.nome ?? "-",
            panhador: effectiveSelected?.nome ?? "-",
            dataColheita: basePayload.data_colheita,
            pesoKg: basePayload.peso_kg,
            numeroBag: basePayload.numero_bag,
            mostrarBalaioNoTicket: basePayload.mostrar_balaio_no_ticket,
            kgPorBalaioUsado: basePayload.kg_por_balaio_utilizado,
            precoPorKg: basePayload.preco_por_kg,
            precoPorBalaio: basePayload.preco_por_balaio,
            valorTotal: basePayload.valor_total,
            offline: true,
          },
        });
        onOpenChange(false);
      };

      if (!navigator.onLine) {
        enqueueOffline();
        return;
      }

      let pendenteAparelho = true;
      try {
        const ativo = await getAparelhoAtivo(selectedCompany.id, aparelhoToken);
        pendenteAparelho = ativo !== true;
      } catch {
        pendenteAparelho = true;
      }

      const { error } = await supabase.from("colheitas").insert({
        ...basePayload,
        user_id: user.id,
        sincronizado: true,
        pendente_aparelho: pendenteAparelho,
      });

      if (error) throw error;

      toastRegisteredWithPrint({
        title: "Movimentação registrada",
        description: "A colheita foi registrada com sucesso.",
        ticket: {
          codigo: null,
          empresa: selectedCompany.nome ?? "-",
          panhador: effectiveSelected?.nome ?? "-",
          dataColheita: basePayload.data_colheita,
          pesoKg: basePayload.peso_kg,
          numeroBag: basePayload.numero_bag,
          mostrarBalaioNoTicket: basePayload.mostrar_balaio_no_ticket,
          kgPorBalaioUsado: basePayload.kg_por_balaio_utilizado,
          precoPorKg: basePayload.preco_por_kg,
          precoPorBalaio: basePayload.preco_por_balaio,
          valorTotal: basePayload.valor_total,
          offline: false,
        },
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isNetworkError = !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(message);

      if (isNetworkError) {
        toast({
          title: "Sem conexão",
          description: "Salvando localmente para sincronizar depois...",
        });

        try {
          const precoInput = precoKg.trim() ? Number(precoKg) : undefined;
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
            panhadorId: panhadorId,
            pesoKg: pesoNumber,
            precoKg: precoPorKgFinal,
          });

          const effectiveSelected = panhadores.find((p) => p.id === parsed.panhadorId) ?? null;
          const numeroBagParaColheita = (effectiveSelected?.bag_numero ?? "").trim()
            ? (effectiveSelected?.bag_numero ?? "").trim()
            : null;

          const pending = savePendingColheita({
            panhador_id: parsed.panhadorId,
            panhador_nome: effectiveSelected?.nome,
            peso_kg: parsed.pesoKg,
            preco_por_kg: parsed.precoKg ?? null,
            preco_por_balaio: precoPorBalaioFinal,
            kg_por_balaio_utilizado: effectiveKgPorBalaio,
            valor_total: valorTotal,
            numero_bag: numeroBagParaColheita,
            data_colheita: new Date().toISOString(),
            empresa_id: selectedCompany.id,
            aparelho_token: getDeviceToken(),
            mostrar_balaio_no_ticket: usarBalaioNoTicket,
            ...(propriedadesSupported
              ? {
                  propriedade_id: propriedadeId === PADRAO_OPTION ? null : toUuidOrNull(propriedadeId),
                  lavoura_id: lavouraId === PADRAO_OPTION ? null : toUuidOrNull(lavouraId),
                }
              : {}),
          });

          toastRegisteredWithPrint({
            title: "Salvo offline",
            description: "A colheita ficou pendente para sincronizar.",
            ticket: {
              codigo: `OFF-${pending.id.slice(0, 8)}`,
              empresa: selectedCompany.nome ?? "-",
              panhador: effectiveSelected?.nome ?? "-",
              dataColheita: new Date().toISOString(),
              pesoKg: parsed.pesoKg,
              numeroBag: numeroBagParaColheita,
              mostrarBalaioNoTicket: usarBalaioNoTicket,
              kgPorBalaioUsado: effectiveKgPorBalaio,
              precoPorKg: parsed.precoKg ?? null,
              precoPorBalaio: precoPorBalaioFinal,
              valorTotal,
              offline: true,
            },
          });
          onOpenChange(false);
          return;
        } catch (fallbackError) {
          console.error("Falha ao salvar offline após erro de rede:", fallbackError);
        }

        return;
      }

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
      <DialogContent
        overlayClassName="bg-background sm:bg-black/80"
        className="inset-0 left-0 top-0 max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0 sm:left-[50%] sm:top-[50%] sm:max-h-[calc(100vh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
        hideClose
      >
        <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-h-none">
          {/* Mobile header */}
          <div className="flex items-center gap-2 border-b bg-card px-3 py-3 sm:hidden">
            <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">Nova Colheita</p>
            </div>
          </div>

          {/* Desktop header */}
          <DialogHeader className="hidden px-6 pt-6 sm:flex">
            <DialogTitle>Nova Colheita</DialogTitle>
            <DialogDescription>Preencha os dados do lançamento</DialogDescription>
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

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="rounded-3xl border bg-card p-4 sm:rounded-2xl">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>
                    Apanhador <span className="text-destructive">*</span>
                  </Label>
                  <Popover open={panhadorOpen} onOpenChange={setPanhadorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-start gap-2"
                      >
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className={cn("truncate", !panhadorId && "text-muted-foreground")}>
                          {selectedPanhador
                            ? `${selectedPanhador.nome}${selectedPanhador.apelido ? ` (${selectedPanhador.apelido})` : ""}`
                            : "Buscar apanhador pelo nome..."}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar apanhador..." />
                        <CommandList>
                          <CommandEmpty>Nenhum apanhador encontrado.</CommandEmpty>
                          <CommandGroup>
                            {panhadores.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.nome} ${p.apelido ?? ""}`}
                                onSelect={() => {
                                  setPanhadorId(p.id);
                                  setPanhadorOpen(false);
                                }}
                              >
                                {p.nome}
                                {p.apelido ? ` (${p.apelido})` : ""}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>
                      Bag <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={numeroBag}
                      onChange={(e) => handleNumeroBagChange(e.target.value)}
                      placeholder="Ex: 001"
                      maxLength={60}
                    />
                    <div className="hidden sm:block">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => {
                          setTrocarBagValue("");
                          setTrocarBagOpen(true);
                        }}
                        disabled={!panhadorId || !bagFieldsSupported}
                        title={!panhadorId ? "Selecione um apanhador" : undefined}
                      >
                        Trocar bag
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Peso (kg) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={pesoKg}
                      onChange={(e) => setPesoKg(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{precoPorBalaio ? "R$/Balaio" : "R$/Kg"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={precoKg}
                      onChange={(e) => setPrecoKg(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kg médio/balaio</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={kgPorBalaioManual}
                      onChange={(e) => setKgPorBalaioManual(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Padrão em Configurações: {kgPorBalaioConfig != null ? `${kgPorBalaioConfig} kg` : "não configurado"}
                    </p>
                  </div>
                </div>

                {propriedadesSupported && mostrarPropriedadeLavoura && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Propriedade</Label>
                      <Select
                        value={propriedadeId}
                        onValueChange={(value) => {
                          const next = value || PADRAO_OPTION;
                          setPropriedadeId(next);
                          if (next === PADRAO_OPTION) {
                            setLavouras([]);
                            setLavouraId(PADRAO_OPTION);
                            return;
                          }

                          void loadLavouras(next);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PADRAO_OPTION}>Padrão</SelectItem>
                          {propriedades.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {(p.nome ?? "").trim() ? (p.nome as string) : "(sem nome)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Lavoura</Label>
                      <Select value={lavouraId} onValueChange={setLavouraId} disabled={propriedadeId === PADRAO_OPTION}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a propriedade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PADRAO_OPTION}>Padrão</SelectItem>
                          {lavouras.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={precoPorBalaio ? "outline" : "secondary"}
                    className="w-full"
                    onClick={() => setPrecoPorBalaio(false)}
                  >
                    Por Kg
                  </Button>
                  <Button
                    type="button"
                    variant={precoPorBalaio ? "secondary" : "outline"}
                    className="w-full"
                    onClick={() => setPrecoPorBalaio(true)}
                  >
                    Por Balaio
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">Qtd. balaios</div>
                    <div className="font-semibold">
                      {balaiosPreview != null ? balaiosPreview.toFixed(2) : "—"}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">Valor a pagar</div>
                    <div className="font-semibold">
                      {valorTotalPreview != null
                        ? valorTotalPreview.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Advanced/desktop-only options */}
                <div className="hidden sm:block space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Mostrar balaio no ticket</p>
                      <p className="text-xs text-muted-foreground">
                        Média: peso ÷ peso do balaio ({effectiveKgPorBalaio != null ? `${effectiveKgPorBalaio} kg` : "não definido"})
                      </p>
                    </div>
                    <Switch checked={usarBalaioNoTicket} onCheckedChange={setUsarBalaioNoTicket} />
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
                </div>
              </div>
            </div>
          </div>

          {/* Mobile footer */}
          <div className="border-t bg-background px-4 py-3 sm:hidden">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <span className="truncate font-mono">
                  SF-{getDeviceToken().replace(/-/g, "").slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{new Date().toLocaleString("pt-BR")}</span>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Colheita"}
            </Button>
          </div>

          {/* Desktop footer */}
          <div className="hidden justify-end gap-2 border-t bg-background px-6 py-4 sm:flex">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
