import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Pencil, Plus, Search } from "lucide-react";
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
import { getDeviceToken, safeRandomUUID } from "@/lib/device";
import { getAparelhoAtivo } from "@/lib/aparelhos";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cacheKey, getPendingPanhadorOps, readJson, writeJson } from "@/lib/offline";
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

const panhadorCadastroSchema = z.object({
  nome: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  apelido: z.string().trim().max(120, "Apelido deve ter no máximo 120 caracteres").optional(),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos numéricos").optional(),
  telefone: z.string().regex(/^\d{8,15}$/, "Telefone deve conter apenas números (8 a 15 dígitos)").optional(),
  bagNumero: z.string().trim().max(60, "Número da bag deve ter no máximo 60 caracteres").optional(),
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

type LancamentoModo = "padrao" | "somente_balaio" | "peso_medio_balaio";

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
  const { isOnline, savePendingColheita, savePendingPanhadorCreate, savePendingPanhadorUpdate } = useOfflineSync();
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
  const [qtdBalaios, setQtdBalaios] = useState("");
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
  const [lancamentoModo, setLancamentoModo] = useState<LancamentoModo>("padrao");
  const [mostrarPropriedadeLavoura, setMostrarPropriedadeLavoura] = useState(true);
  const [usarPropriedadeLavouraPadrao, setUsarPropriedadeLavouraPadrao] = useState(false);
  const [propriedadePadraoId, setPropriedadePadraoId] = useState<string | null>(null);
  const [lavouraPadraoId, setLavouraPadraoId] = useState<string | null>(null);
  const [panhadorOpen, setPanhadorOpen] = useState(false);

  const [panhadorEditorOpen, setPanhadorEditorOpen] = useState(false);
  const [panhadorEditorMode, setPanhadorEditorMode] = useState<"create" | "edit">("create");
  const [panhadorEditorNome, setPanhadorEditorNome] = useState("");
  const [panhadorEditorApelido, setPanhadorEditorApelido] = useState("");
  const [panhadorEditorCpf, setPanhadorEditorCpf] = useState("");
  const [panhadorEditorTelefone, setPanhadorEditorTelefone] = useState("");
  const [panhadorEditorBagNumero, setPanhadorEditorBagNumero] = useState("");
  const [panhadorEditorSaving, setPanhadorEditorSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadPanhadores();
      loadPropriedades();
    }
  }, [open, user, selectedCompany?.id, isOnline]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!open || !user || !selectedCompany) {
        setKgPorBalaioConfig(null);
        setKgPorBalaioManual("");
        setPrecoPorBalaio(false);
        setLancamentoModo("padrao");
        setMostrarPropriedadeLavoura(true);
        setUsarPropriedadeLavouraPadrao(false);
        setPropriedadePadraoId(null);
        setLavouraPadraoId(null);
        return;
      }

      const settings = getDeviceLancamentoSettings(selectedCompany.id);
      const modo: LancamentoModo = (settings.lancamento_modo ?? "padrao") as LancamentoModo;
      setLancamentoModo(modo);
      const kgDefaultEnabled = settings.usar_kg_por_balaio_padrao ?? true;
      const kgDefault =
        settings.kg_por_balaio_padrao != null && Number.isFinite(Number(settings.kg_por_balaio_padrao))
          ? Number(settings.kg_por_balaio_padrao)
          : null;
      setKgPorBalaioConfig(kgDefault);
      setKgPorBalaioManual(kgDefaultEnabled && kgDefault != null && kgDefault > 0 ? String(kgDefault) : "");
      setPrecoPorBalaio(modo === "padrao" ? (settings.preco_por_balaio_padrao ?? false) : true);

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
      setQtdBalaios("");
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

  const precoPorBalaioEfetivo = lancamentoModo === "padrao" ? precoPorBalaio : true;

  const effectiveKgPorBalaio = useMemo(() => {
    if (lancamentoModo === "somente_balaio") {
      const fromConfig = kgPorBalaioConfig;
      return fromConfig != null && Number.isFinite(fromConfig) && fromConfig > 0 ? fromConfig : null;
    }

    const parsed = Number(kgPorBalaioManual);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, [lancamentoModo, kgPorBalaioConfig, kgPorBalaioManual]);

  const effectivePesoKgNumber = useMemo(() => {
    if (lancamentoModo === "somente_balaio") {
      const balaios = Number(qtdBalaios);
      if (!Number.isFinite(balaios) || balaios <= 0) return null;
      if (effectiveKgPorBalaio == null || effectiveKgPorBalaio <= 0) return null;
      return balaios * effectiveKgPorBalaio;
    }

    const peso = Number(pesoKg);
    if (!Number.isFinite(peso) || peso <= 0) return null;
    return peso;
  }, [lancamentoModo, qtdBalaios, pesoKg, effectiveKgPorBalaio]);

  const balaiosPreview = useMemo(() => {
    if (lancamentoModo === "somente_balaio") {
      const balaios = Number(qtdBalaios);
      if (!Number.isFinite(balaios) || balaios <= 0) return null;
      return balaios;
    }

    const peso = Number(pesoKg);
    if (!Number.isFinite(peso) || peso <= 0) return null;
    if (effectiveKgPorBalaio == null || effectiveKgPorBalaio <= 0) return null;
    return peso / effectiveKgPorBalaio;
  }, [lancamentoModo, qtdBalaios, pesoKg, effectiveKgPorBalaio]);

  const valorTotalPreview = useMemo(() => {
    if (!precoKg) return null;
    const preco = Number(precoKg);
    const peso = effectivePesoKgNumber;
    if (!Number.isFinite(preco) || peso == null || !Number.isFinite(peso)) return null;

    if (precoPorBalaioEfetivo) {
      if (effectiveKgPorBalaio == null || effectiveKgPorBalaio <= 0) return null;
      const balaios = balaiosPreview;
      if (balaios == null) return null;
      return balaios * preco;
    }

    return peso * preco;
  }, [precoKg, effectivePesoKgNumber, precoPorBalaioEfetivo, effectiveKgPorBalaio, balaiosPreview]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setBagFieldsSupported(true);
      return;
    }

    const panCacheKey = cacheKey("panhadores_list", selectedCompany.id);

    const applyPendingOps = (base: PanhadorOption[]) => {
      const ops = getPendingPanhadorOps().filter((op) => op.empresa_id === selectedCompany.id);
      if (ops.length === 0) return base;

      const map = new Map<string, PanhadorOption>();
      for (const p of base) map.set(p.id, p);

      const has = (obj: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

      for (const op of ops) {
        const payload = op.payload as Record<string, unknown>;

        if (op.action === "insert") {
          const id = typeof payload.id === "string" ? payload.id : null;
          const nome = typeof payload.nome === "string" ? payload.nome : null;
          if (!id || !nome) continue;

          const apelido =
            payload.apelido == null ? null : typeof payload.apelido === "string" ? payload.apelido : null;
          const bag_numero = typeof payload.bag_numero === "string" ? payload.bag_numero : null;
          const bag_semana = typeof payload.bag_semana === "string" ? payload.bag_semana : null;
          map.set(id, { id, nome, apelido, bag_numero, bag_semana });
          continue;
        }

        const id = typeof payload.id === "string" ? payload.id : null;
        if (!id) continue;

        if (op.action === "deactivate") {
          map.delete(id);
          continue;
        }

        if (op.action === "update") {
          const prev = map.get(id);
          if (!prev) continue;

          const nextNome = typeof payload.nome === "string" ? payload.nome : prev.nome;

          let nextApelido = prev.apelido ?? null;
          if (has(payload, "apelido")) {
            nextApelido =
              payload.apelido == null ? null : typeof payload.apelido === "string" ? payload.apelido : null;
          }

          let nextBag = prev.bag_numero ?? null;
          if (has(payload, "bag_numero")) {
            nextBag =
              payload.bag_numero == null ? null : typeof payload.bag_numero === "string" ? payload.bag_numero : null;
          }

          let nextSemana = prev.bag_semana ?? null;
          if (has(payload, "bag_semana")) {
            nextSemana =
              payload.bag_semana == null ? null : typeof payload.bag_semana === "string" ? payload.bag_semana : null;
          }

          map.set(id, { ...prev, nome: nextNome, apelido: nextApelido, bag_numero: nextBag, bag_semana: nextSemana });
        }
      }

      return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    };

    const loadFromCache = () => {
      const cached = readJson<{ bagFieldsSupported?: boolean; panhadores: PanhadorOption[] } | null>(panCacheKey, null);
      if (!cached?.panhadores) return false;
      setBagFieldsSupported(cached.bagFieldsSupported !== false);
      setPanhadores((cached.panhadores ?? []) as PanhadorOption[]);
      return true;
    };

    // Sempre tenta cache primeiro (rápido e mantém operações offline visíveis).
    loadFromCache();

    if (!navigator.onLine) return;

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

        const base = ((fallback.data as unknown as PanhadorOption[]) || []) as PanhadorOption[];
        const final = applyPendingOps(base);

        setBagFieldsSupported(false);
        setPanhadores(final);

        writeJson(panCacheKey, {
          cachedAt: new Date().toISOString(),
          bagFieldsSupported: false,
          panhadores: final,
        });
        return;
      }

      console.error("Erro ao carregar panhadores:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os panhadores.", variant: "destructive" });
      return;
    }

    const base = (data || []) as PanhadorOption[];
    const final = applyPendingOps(base);

    setBagFieldsSupported(true);
    setPanhadores(final);

    writeJson(panCacheKey, {
      cachedAt: new Date().toISOString(),
      bagFieldsSupported: true,
      panhadores: final,
    });
  };

  const selectedPanhador = panhadores.find((p) => p.id === panhadorId) ?? null;

  const openPanhadorEditor = () => {
    if (!user || !selectedCompany) {
      toast({ title: "Selecione uma empresa", variant: "destructive" });
      return;
    }

    const current = panhadores.find((p) => p.id === panhadorId) ?? null;

    if (panhadorId && current) {
      setPanhadorEditorMode("edit");
      setPanhadorEditorNome(current.nome ?? "");
      setPanhadorEditorApelido(current.apelido ?? "");
      setPanhadorEditorCpf("");
      setPanhadorEditorTelefone("");
      setPanhadorEditorBagNumero((current.bag_numero ?? "").trim());
    } else {
      setPanhadorEditorMode("create");
      setPanhadorEditorNome("");
      setPanhadorEditorApelido("");
      setPanhadorEditorCpf("");
      setPanhadorEditorTelefone("");
      setPanhadorEditorBagNumero("");
    }

    setPanhadorEditorOpen(true);
  };

  const savePanhadorFromEditor = async () => {
    if (!user || !selectedCompany) {
      toast({ title: "Selecione uma empresa", variant: "destructive" });
      return;
    }

    const nome = panhadorEditorNome.trim();
    const apelido = panhadorEditorApelido.trim();
    const normalizedCpf = panhadorEditorCpf.replace(/\D/g, "");
    const normalizedTelefone = panhadorEditorTelefone.replace(/\D/g, "");
    const trimmedBag = panhadorEditorBagNumero.trim();

    try {
      const validated = panhadorCadastroSchema.parse({
        nome,
        apelido: apelido || undefined,
        cpf: normalizedCpf ? normalizedCpf : undefined,
        telefone: normalizedTelefone ? normalizedTelefone : undefined,
        bagNumero: bagFieldsSupported ? (trimmedBag || undefined) : undefined,
      });

      if (!bagFieldsSupported && trimmedBag) {
        toast({
          title: "Bag indisponível",
          description: "Seu banco ainda não tem as colunas de bag. Aplique a migration no Supabase e tente novamente.",
          variant: "destructive",
        });
        return;
      }

    setPanhadorEditorSaving(true);
    try {
      const panCacheKey = cacheKey("panhadores_list", selectedCompany.id);
      const normalizeOption = (p: PanhadorOption): PanhadorOption => ({
        id: p.id,
        nome: p.nome,
        apelido: p.apelido ?? null,
        bag_numero: p.bag_numero ?? null,
        bag_semana: p.bag_semana ?? null,
      });

      if (panhadorEditorMode === "create") {
        const id = safeRandomUUID();
        const payload = {
          id,
          nome: validated.nome,
          apelido: validated.apelido ?? null,
          cpf: validated.cpf ?? null,
          telefone: validated.telefone ?? null,
          user_id: user.id,
          empresa_id: selectedCompany.id,
          ativo: true,
          ...(bagFieldsSupported ? { bag_numero: validated.bagNumero ?? null } : {}),
        };

        if (navigator.onLine) {
          const { error } = await supabase.from("panhadores").insert(payload);
          if (error) throw error;
        } else {
          savePendingPanhadorCreate(selectedCompany.id, payload);
        }

        const created: PanhadorOption = {
          id,
          nome: validated.nome,
          apelido: validated.apelido ?? null,
          bag_numero: bagFieldsSupported ? (validated.bagNumero ?? null) : null,
          bag_semana: null,
        };
        const next = [normalizeOption(created), ...panhadores.filter((p) => p.id !== id).map(normalizeOption)].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR"),
        );

        setPanhadores(next);
        writeJson(panCacheKey, {
          cachedAt: new Date().toISOString(),
          bagFieldsSupported,
          panhadores: next,
        });

        setPanhadorId(id);
        setPanhadorEditorOpen(false);
        toast({
          title: navigator.onLine ? "Panhador cadastrado" : "Panhador salvo offline",
          description: navigator.onLine ? undefined : "Será sincronizado quando a internet voltar.",
        });
        return;
      }

      // edit
      if (!panhadorId) {
        toast({ title: "Selecione um panhador", variant: "destructive" });
        return;
      }

      const payload = {
        id: panhadorId,
        nome: validated.nome,
        apelido: validated.apelido ?? null,
        ...(validated.cpf ? { cpf: validated.cpf } : {}),
        ...(validated.telefone ? { telefone: validated.telefone } : {}),
      };

      if (navigator.onLine) {
        const { error } = await supabase
          .from("panhadores")
          .update(payload)
          .eq("id", panhadorId)
          .eq("empresa_id", selectedCompany.id);
        if (error) throw error;
      } else {
        savePendingPanhadorUpdate(selectedCompany.id, payload);
      }

      const next = panhadores
        .map((p) =>
          p.id === panhadorId
            ? normalizeOption({ ...p, nome: validated.nome, apelido: validated.apelido ?? null })
            : normalizeOption(p),
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      setPanhadores(next);
      writeJson(panCacheKey, {
        cachedAt: new Date().toISOString(),
        bagFieldsSupported,
        panhadores: next,
      });

      setPanhadorEditorOpen(false);
      toast({
        title: navigator.onLine ? "Panhador atualizado" : "Alteração salva offline",
        description: navigator.onLine ? undefined : "Será sincronizada quando a internet voltar.",
      });
    } catch (error) {
      console.error("Erro ao salvar panhador:", error);
      if (error instanceof z.ZodError) {
        toast({ title: "Dados inválidos", description: error.errors[0].message, variant: "destructive" });
      } else {
        const message =
          typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";

        if (code === "23505" || message.toLowerCase().includes("duplicate")) {
          const msg = message.toLowerCase();
          if (msg.includes("idx_panhadores_empresa_cpf_unique")) {
            toast({ title: "CPF já cadastrado", description: "Este CPF já existe nesta empresa.", variant: "destructive" });
            return;
          }
          if (msg.includes("idx_panhadores_empresa_telefone_unique")) {
            toast({ title: "Telefone já cadastrado", description: "Este telefone já existe nesta empresa.", variant: "destructive" });
            return;
          }
          if (msg.includes("idx_panhadores_empresa_bag_unique")) {
            toast({ title: "Bag já vinculada", description: "Este número de bag já está vinculado a outro panhador nesta empresa.", variant: "destructive" });
            return;
          }
        }

        toast({ title: "Erro", description: "Não foi possível salvar o panhador.", variant: "destructive" });
      }
    } finally {
      setPanhadorEditorSaving(false);
    }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({ title: "Dados inválidos", description: error.errors[0].message, variant: "destructive" });
        return;
      }
      toast({ title: "Erro", description: "Não foi possível validar os dados.", variant: "destructive" });
      return;
    }
  };

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

      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);

      const printNow = () => {
        try {
          w.print();
        } catch {
          // ignore
        }
      };

      // iOS Safari costuma exigir que o print() rode no mesmo gesto do usuário.
      if (isIOS) {
        printNow();
      } else {
        setTimeout(printNow, 250);
      }
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

      const pesoNumber = effectivePesoKgNumber;
      if (pesoNumber == null || !Number.isFinite(pesoNumber) || pesoNumber <= 0) {
        toast({
          title: "Peso obrigatório",
          description:
            lancamentoModo === "somente_balaio"
              ? "Informe a quantidade de balaios."
              : "Informe o peso (kg) maior que zero.",
          variant: "destructive",
        });
        return;
      }

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

      const round2 = (value: number) => Number(value.toFixed(2));

      let precoPorKgFinal: number | undefined;
      let precoPorBalaioFinal: number | null = null;
      let valorTotal: number | null = null;

      if (precoInput != null) {
        if (precoPorBalaioEfetivo) {
          const kgBalaio = effectiveKgPorBalaio as number;
          precoPorBalaioFinal = round2(precoInput);
          precoPorKgFinal = round2(precoInput / kgBalaio);
          const balaios = balaiosPreview;
          valorTotal = balaios != null ? round2(balaios * precoPorBalaioFinal) : round2((pesoNumber / kgBalaio) * precoPorBalaioFinal);
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

      const hasPendingPanhadorInsert = getPendingPanhadorOps().some((op) => {
        if (op.empresa_id !== selectedCompany.id) return false;
        if (op.action !== "insert") return false;
        const payload = op.payload as Record<string, unknown>;
        return typeof payload.id === "string" && payload.id === parsed.panhadorId;
      });

      if (hasPendingPanhadorInsert) {
        toast({
          title: "Panhador pendente",
          description: "Este panhador foi cadastrado offline e ainda não sincronizou. Salvando a colheita offline para sincronizar depois.",
        });
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
          const pesoNumber = effectivePesoKgNumber;
          if (pesoNumber == null || !Number.isFinite(pesoNumber) || pesoNumber <= 0) {
            throw new Error("Peso inválido");
          }
          const round2 = (value: number) => Number(value.toFixed(2));

          let precoPorKgFinal: number | undefined;
          let precoPorBalaioFinal: number | null = null;
          let valorTotal: number | null = null;

          if (precoInput != null) {
            if (precoPorBalaioEfetivo) {
              const kgBalaio = effectiveKgPorBalaio as number;
              precoPorBalaioFinal = round2(precoInput);
              precoPorKgFinal = round2(precoInput / kgBalaio);
              const balaios = balaiosPreview;
              valorTotal = balaios != null ? round2(balaios * precoPorBalaioFinal) : round2((pesoNumber / kgBalaio) * precoPorBalaioFinal);
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

        <InlineDialog
          open={panhadorEditorOpen}
          onOpenChange={(open) => {
            setPanhadorEditorOpen(open);
            if (!open) {
              setPanhadorEditorNome("");
              setPanhadorEditorApelido("");
              setPanhadorEditorCpf("");
              setPanhadorEditorTelefone("");
              setPanhadorEditorBagNumero("");
              setPanhadorEditorMode("create");
            }
          }}
        >
          <InlineDialogContent>
            <InlineDialogHeader>
              <InlineDialogTitle>{panhadorEditorMode === "edit" ? "Editar panhador" : "Cadastrar panhador"}</InlineDialogTitle>
              <InlineDialogDescription>
                {panhadorEditorMode === "edit"
                  ? "Atualize os dados e salve para usar no lançamento."
                  : "Preencha os dados e salve para incluir na lista."}
              </InlineDialogDescription>
            </InlineDialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="panhadorEditorNome">Nome</Label>
                <Input
                  id="panhadorEditorNome"
                  value={panhadorEditorNome}
                  onChange={(e) => setPanhadorEditorNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void savePanhadorFromEditor();
                    }
                  }}
                  placeholder="Nome completo"
                  maxLength={120}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="panhadorEditorApelido">Apelido (opcional)</Label>
                <Input
                  id="panhadorEditorApelido"
                  value={panhadorEditorApelido}
                  onChange={(e) => setPanhadorEditorApelido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void savePanhadorFromEditor();
                    }
                  }}
                  placeholder="Ex: Joãozinho"
                  maxLength={80}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="panhadorEditorCpf">CPF (opcional)</Label>
                  <Input
                    id="panhadorEditorCpf"
                    value={panhadorEditorCpf}
                    onChange={(e) => setPanhadorEditorCpf(e.target.value)}
                    placeholder="Somente números"
                    inputMode="numeric"
                    maxLength={20}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="panhadorEditorTelefone">Telefone (opcional)</Label>
                  <Input
                    id="panhadorEditorTelefone"
                    value={panhadorEditorTelefone}
                    onChange={(e) => setPanhadorEditorTelefone(e.target.value)}
                    placeholder="Somente números"
                    inputMode="numeric"
                    maxLength={20}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="panhadorEditorBag">Bag (opcional)</Label>
                <Input
                  id="panhadorEditorBag"
                  value={panhadorEditorBagNumero}
                  onChange={(e) => setPanhadorEditorBagNumero(e.target.value)}
                  placeholder={bagFieldsSupported ? "Ex: 20" : "Indisponível"}
                  maxLength={60}
                  disabled={!bagFieldsSupported || panhadorEditorMode === "edit"}
                />
                {!bagFieldsSupported ? (
                  <p className="text-xs text-muted-foreground">
                    Bag indisponível: aplique a migration no Supabase para habilitar.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setPanhadorEditorOpen(false)}
                disabled={panhadorEditorSaving}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={() => void savePanhadorFromEditor()} disabled={panhadorEditorSaving}>
                {panhadorEditorSaving ? "Salvando..." : "Salvar"}
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
                  <div className="flex items-center gap-2">
                    <Popover open={panhadorOpen} onOpenChange={setPanhadorOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="flex-1 justify-start bg-white hover:bg-white"
                        >
                          <span className={cn("truncate", !panhadorId && "text-muted-foreground")}>
                            {selectedPanhador
                              ? `${selectedPanhador.nome}${selectedPanhador.apelido ? ` (${selectedPanhador.apelido})` : ""}${(selectedPanhador.bag_numero ?? "").trim() ? ` - Bag ${(selectedPanhador.bag_numero ?? "").trim()}` : ""}`
                              : "Selecione um apanhador..."}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar por nome, apelido ou bag..." />
                          <CommandList>
                            <CommandEmpty>Nenhum apanhador encontrado.</CommandEmpty>
                            <CommandGroup>
                              {panhadores.map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={`${p.nome} ${p.apelido ?? ""} ${p.bag_numero ?? ""}`}
                                  className="data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground"
                                  onSelect={() => {
                                    setPanhadorId(p.id);
                                    setPanhadorOpen(false);
                                  }}
                                >
                                  {p.nome}
                                  {p.apelido ? ` (${p.apelido})` : ""}
                                  {(p.bag_numero ?? "").trim() ? ` - Bag ${(p.bag_numero ?? "").trim()}` : ""}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={openPanhadorEditor}
                      aria-label={panhadorId ? "Editar panhador" : "Cadastrar panhador"}
                      title={panhadorId ? "Editar panhador" : "Cadastrar panhador"}
                    >
                      {panhadorId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>
                      Bag
                      {lancamentoModo === "somente_balaio" ? (
                        <span className="ml-2 text-xs text-muted-foreground">(opcional)</span>
                      ) : (
                        <span className="text-destructive">*</span>
                      )}
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
                    {lancamentoModo === "somente_balaio" ? (
                      <>
                        <Label>
                          Qtd. balaios <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={qtdBalaios}
                          onChange={(e) => setQtdBalaios(e.target.value)}
                          placeholder="0,00"
                          required
                        />
                      </>
                    ) : (
                      <>
                        <Label>
                          {lancamentoModo === "peso_medio_balaio" ? "Qtd. peso (kg)" : "Peso (kg)"}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={pesoKg}
                          onChange={(e) => setPesoKg(e.target.value)}
                          placeholder="0,00"
                          required
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{precoPorBalaioEfetivo ? "R$/Balaio" : "R$/Kg"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={precoKg}
                      onChange={(e) => setPrecoKg(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    {lancamentoModo === "somente_balaio" ? (
                      <>
                        <Label>Kg/balaio (padrão)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={kgPorBalaioConfig != null ? String(kgPorBalaioConfig) : ""}
                          placeholder={kgPorBalaioConfig == null ? "Não configurado" : "0,00"}
                          disabled
                        />
                      </>
                    ) : (
                      <>
                        <Label>{lancamentoModo === "peso_medio_balaio" ? "Peso médio balaio (kg)" : "Kg médio/balaio"}</Label>
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
                      </>
                    )}
                  </div>
                </div>

                {lancamentoModo === "peso_medio_balaio" ? (
                  <div className="space-y-2">
                    <Label>Qtd. balaios (calculado)</Label>
                    <Input value={balaiosPreview != null ? balaiosPreview.toFixed(2) : ""} placeholder="—" disabled />
                  </div>
                ) : null}

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

                {lancamentoModo === "padrao" ? (
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
                ) : null}

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
