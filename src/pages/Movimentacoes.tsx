import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Package,
  Coins,
  AlertCircle,
  Pencil,
  Trash2,
  Check,
  ChevronsUpDown,
  SlidersHorizontal,
  FileText,
  CreditCard,
  Plus,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";
import { cacheKey, getPendingColheitas, readJson, writeJson } from "@/lib/offline";
import { getDeviceToken, safeRandomUUID } from "@/lib/device";
import { isUuid, toUuidOrNull } from "@/lib/uuid";

interface Lancamento {
  id: string;
  codigo: string;
  peso_kg: number;
  quantidade_balaios: number | null;
  valor_total: number | null;
  data_colheita: string;
  numero_bag: string | null;
  panhador: string;
  panhador_id: string;
  propriedade_id: string | null;
  lavoura_id: string | null;
  propriedade: string;
  lavoura: string;
  preco_por_kg: number | null;
  pago_em: string | null;
  encarregado: string;
  aparelho: string;
  aparelho_token: string | null;
  pendente_aparelho: boolean;
  // Metadados do item offline (quando ainda não sincronizou)
  offline_sync_attempts?: number;
  offline_last_error?: string | null;
  offline_last_error_at?: string | null;
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
  const { user, selectedCompany, isAdmin } = useAuth();
  const { syncPendingData, syncing, savePendingColheitaUpdate } = useOfflineSync();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "com-valor" | "pendentes">("todos");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [panhadores, setPanhadores] = useState<PanhadorOption[]>([]);
  const [panhadorFilterId, setPanhadorFilterId] = useState<string>("todos");
  const [panhadorFilterOpen, setPanhadorFilterOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lancamento | null>(null);
  const [propriedadesSupported, setPropriedadesSupported] = useState(true);
  const [propriedades, setPropriedades] = useState<PropriedadeOption[]>([]);
  const [lavouras, setLavouras] = useState<LavouraOption[]>([]);
  const [editForm, setEditForm] = useState({
    panhadorId: "",
    propriedadeId: PADRAO_OPTION,
    lavouraId: PADRAO_OPTION,
    pesoKg: "",
    numeroBag: "",
    precoKg: "",
    valorTotal: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lancamento | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [kgPorBalaio, setKgPorBalaio] = useState<number | null>(null);
  const [confirmPagamentoOpen, setConfirmPagamentoOpen] = useState(false);

  const [syncLogOpen, setSyncLogOpen] = useState(false);
  const [syncLogTarget, setSyncLogTarget] = useState<Lancamento | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<Lancamento | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [createPanhadorOpen, setCreatePanhadorOpen] = useState(false);
  const [createPanhadorNome, setCreatePanhadorNome] = useState("");
  const [createPanhadorApelido, setCreatePanhadorApelido] = useState("");
  const [createPanhadorSaving, setCreatePanhadorSaving] = useState(false);
  const [createPanhadorContext, setCreatePanhadorContext] = useState<"filter" | "edit">("filter");

  const openCreatePanhador = (context: "filter" | "edit") => {
    setCreatePanhadorContext(context);
    setCreatePanhadorOpen(true);
  };

  const isOffline = !navigator.onLine;

  const handleCreatePanhador = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedCompany) {
      toast({ title: "Selecione uma empresa", variant: "destructive" });
      return;
    }

    const nome = createPanhadorNome.trim();
    const apelido = createPanhadorApelido.trim();

    if (nome.length < 3) {
      toast({ title: "Nome inválido", description: "Informe pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }

    if (!navigator.onLine) {
      toast({ title: "Sem internet", description: "Conecte-se para cadastrar um novo panhador.", variant: "destructive" });
      return;
    }

    setCreatePanhadorSaving(true);
    try {
      const id = safeRandomUUID();
      const payload = {
        id,
        nome,
        apelido: apelido ? apelido : null,
        user_id: user.id,
        empresa_id: selectedCompany.id,
      };

      const { error } = await supabase.from("panhadores").insert(payload);
      if (error) throw error;

      const next = [{ id, nome }, ...panhadores.filter((p) => p.id !== id)];
      setPanhadores(next);
      writeJson(cacheKey("panhadores_list", selectedCompany.id), { panhadores: next });

      if (createPanhadorContext === "filter") {
        setPanhadorFilterId(id);
      } else {
        setEditForm((prev) => ({ ...prev, panhadorId: id }));
      }

      toast({ title: "Panhador cadastrado" });
      setCreatePanhadorNome("");
      setCreatePanhadorApelido("");
      setCreatePanhadorOpen(false);
    } catch (err) {
      console.error("Erro ao cadastrar panhador:", err);
      toast({ title: "Erro", description: "Não foi possível cadastrar o panhador.", variant: "destructive" });
    } finally {
      setCreatePanhadorSaving(false);
    }
  };

  const mergePendingLocal = (items: Lancamento[]) => {
    if (!selectedCompany?.id) return items;
    const pending = getPendingColheitas().filter((p) => p.empresa_id === selectedCompany.id);
    if (pending.length === 0) return items;

    const existingIds = new Set(items.map((it) => it.id));

    const locals: Lancamento[] = pending
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({
        id: p.id,
        codigo: `OFF-${p.id.slice(0, 4).toUpperCase()}`,
        offline_sync_attempts: p.sync_attempts ?? 0,
        offline_last_error: p.last_error ?? null,
        offline_last_error_at: p.last_error_at ?? null,
        peso_kg: Number(p.peso_kg) || 0,
        quantidade_balaios: p.kg_por_balaio_utilizado
          ? Number((Number(p.peso_kg) / Number(p.kg_por_balaio_utilizado)).toFixed(4))
          : null,
        valor_total: p.valor_total != null ? Number(p.valor_total) : null,
        data_colheita: p.data_colheita,
        numero_bag: p.numero_bag ?? null,
        panhador: p.panhador_nome ?? "(offline)",
        panhador_id: p.panhador_id,
        propriedade_id: (Object.prototype.hasOwnProperty.call(p, "propriedade_id") ? (p.propriedade_id ?? null) : null) as
          | string
          | null,
        lavoura_id: (Object.prototype.hasOwnProperty.call(p, "lavoura_id") ? (p.lavoura_id ?? null) : null) as string | null,
        propriedade: "padrao",
        lavoura: "padrao",
        preco_por_kg: p.preco_por_kg != null ? Number(p.preco_por_kg) : null,
        pago_em: null,
        encarregado: "offline",
        aparelho: "Offline",
        aparelho_token: (p as unknown as { aparelho_token?: string | null }).aparelho_token ?? null,
        pendente_aparelho: true,
      }));

    // Mostra pendências locais no topo.
    return [...locals, ...items];
  };

  useEffect(() => {
    loadLancamentos();
    loadPanhadores();
    loadPropriedades();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    setPanhadorFilterId("todos");
  }, [selectedCompany?.id]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!user || !selectedCompany) {
        setKgPorBalaio(null);
        return;
      }

      const { data, error } = await supabase
        .from("empresas_config")
        .select("kg_por_balaio")
        .eq("empresa_id", selectedCompany.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar configuração do balaio:", error);
        setKgPorBalaio(null);
        return;
      }

      setKgPorBalaio(data?.kg_por_balaio != null ? Number(data.kg_por_balaio) : null);
    };

    loadConfig();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    if (editTarget) {
      setEditForm({
        panhadorId: editTarget.panhador_id,
        propriedadeId: editTarget.propriedade_id ?? PADRAO_OPTION,
        lavouraId: editTarget.lavoura_id ?? PADRAO_OPTION,
        pesoKg: editTarget.peso_kg.toString(),
        numeroBag: editTarget.numero_bag ?? "",
        precoKg: editTarget.preco_por_kg != null ? editTarget.preco_por_kg.toString() : "",
        valorTotal: editTarget.valor_total != null ? editTarget.valor_total.toString() : "",
      });

      if ((editTarget.propriedade_id ?? null) != null) {
        void loadLavouras(editTarget.propriedade_id as string);
      } else {
        setLavouras([]);
      }
    }
  }, [editTarget]);

  const loadPropriedades = async () => {
    if (!user || !selectedCompany) {
      setPropriedadesSupported(true);
      setPropriedades([]);
      setLavouras([]);
      return;
    }

    if (!navigator.onLine) {
      const cached = readJson<{ supported?: boolean; propriedades?: PropriedadeOption[] } | null>(
        cacheKey("propriedades_list", selectedCompany.id),
        null,
      );
      if (cached) {
        setPropriedadesSupported(cached.supported !== false);
        setPropriedades(cached.propriedades ?? []);
        return;
      }
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
        return;
      }

      console.error("Erro ao carregar propriedades:", error);

      const cached = readJson<{ supported?: boolean; propriedades?: PropriedadeOption[] } | null>(
        cacheKey("propriedades_list", selectedCompany.id),
        null,
      );

      if (cached) {
        setPropriedadesSupported(cached.supported !== false);
        setPropriedades(cached.propriedades ?? []);
        toast({ title: "Modo offline", description: "Carregando propriedades do cache." });
        return;
      }

      toast({ title: "Erro", description: "Não foi possível carregar propriedades.", variant: "destructive" });
      return;
    }

    setPropriedadesSupported(true);
    setPropriedades((data || []) as PropriedadeOption[]);
  };

  const loadLavouras = async (propId: string) => {
    if (!user || !selectedCompany) {
      setLavouras([]);
      return;
    }

    if (!isUuid(propId)) {
      setLavouras([]);
      return;
    }

    if (!navigator.onLine) {
      const cached = readJson<{ supported?: boolean; lavouras?: LavouraOption[] } | null>(
        cacheKey("lavouras_list", selectedCompany.id),
        null,
      );
      if (cached?.lavouras) {
        setLavouras((cached.lavouras ?? []).filter((l) => l.propriedade_id === propId));
        return;
      }
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
        return;
      }

      console.error("Erro ao carregar lavouras:", error);

      const cached = readJson<{ supported?: boolean; lavouras?: LavouraOption[] } | null>(
        cacheKey("lavouras_list", selectedCompany.id),
        null,
      );
      if (cached?.lavouras) {
        setLavouras((cached.lavouras ?? []).filter((l) => l.propriedade_id === propId));
        toast({ title: "Modo offline", description: "Carregando lavouras do cache." });
        return;
      }

      toast({ title: "Erro", description: "Não foi possível carregar lavouras.", variant: "destructive" });
      return;
    }

    setLavouras((data || []) as LavouraOption[]);
  };

  const loadLancamentos = async () => {
    if (!user || !selectedCompany) {
      setLancamentos([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const movCacheKey = cacheKey("movimentacoes_list", selectedCompany.id);
    const deviceToken = getDeviceToken();
    const deviceMovCacheKey = cacheKey(`movimentacoes_device_${deviceToken}`, selectedCompany.id);

    if (!navigator.onLine) {
      const cached = readJson<{ cachedAt?: string; lancamentos: Lancamento[] } | null>(movCacheKey, null);
      const cachedDevice = readJson<{ cachedAt?: string; lancamentos: Lancamento[] } | null>(deviceMovCacheKey, null);

      const combined = (() => {
        const base = cached?.lancamentos ?? [];
        const extra = cachedDevice?.lancamentos ?? [];
        if (base.length === 0 && extra.length === 0) return [];

        const byId = new Map<string, Lancamento>();
        [...base, ...extra].forEach((it) => {
          if (!byId.has(it.id)) byId.set(it.id, it);
        });

        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.data_colheita).getTime() - new Date(a.data_colheita).getTime(),
        );
      })();

      if (combined.length) {
        setLancamentos(mergePendingLocal(combined));
        setLoading(false);
        return;
      }

      toast({
        title: "Falha de conexão",
        description: "Sem internet e sem cache disponível.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const baseSelect =
      "id, codigo, peso_kg, preco_por_kg, valor_total, data_colheita, numero_bag, panhador_id, quantidade_balaios, pago_em, aparelho_token, pendente_aparelho, profiles!colheitas_user_id_fkey(full_name), panhadores(nome)";
    const extendedSelect = `${baseSelect}, propriedade_id, lavoura_id, propriedades(nome), lavouras(nome)`;

    const colheitasQuery = supabase
      .from("colheitas")
      .select(extendedSelect)
      .eq("empresa_id", selectedCompany.id)
      .order("data_colheita", { ascending: false })
      .limit(200);

    const colheitasDeviceQuery = supabase
      .from("colheitas")
      .select(extendedSelect)
      .eq("empresa_id", selectedCompany.id)
      .eq("aparelho_token", deviceToken)
      .order("data_colheita", { ascending: false })
      .limit(500);

    const [{ data, error }, deviceResult, aparelhosResult] = await Promise.all([
      colheitasQuery,
      colheitasDeviceQuery,
      supabase.from("aparelhos").select("token, nome").eq("empresa_id", selectedCompany.id),
    ]);

    const colheitasMissingColumns =
      !!error &&
      (((error as { code?: string }).code === "42703" || (error as { code?: string }).code === "42P01") ||
        ((error as { message?: string }).message?.toLowerCase().includes("propriedade_id") ?? false) ||
        ((error as { message?: string }).message?.toLowerCase().includes("lavoura_id") ?? false) ||
        ((error as { message?: string }).message?.toLowerCase().includes("propriedades") ?? false) ||
        ((error as { message?: string }).message?.toLowerCase().includes("lavouras") ?? false));

    if (colheitasMissingColumns) {
      setPropriedadesSupported(false);
    }

    const fallbackColheitas = colheitasMissingColumns
      ? await supabase
          .from("colheitas")
          .select(baseSelect)
          .eq("empresa_id", selectedCompany.id)
          .order("data_colheita", { ascending: false })
          .limit(200)
      : null;

    const effectiveData = (colheitasMissingColumns ? fallbackColheitas?.data : data) ?? [];
    const effectiveError = colheitasMissingColumns ? fallbackColheitas?.error : error;

    const deviceMissingColumns =
      !!deviceResult.error &&
      (((deviceResult.error as { code?: string }).code === "42703" || (deviceResult.error as { code?: string }).code === "42P01") ||
        ((deviceResult.error as { message?: string }).message?.toLowerCase().includes("propriedade_id") ?? false) ||
        ((deviceResult.error as { message?: string }).message?.toLowerCase().includes("lavoura_id") ?? false) ||
        ((deviceResult.error as { message?: string }).message?.toLowerCase().includes("propriedades") ?? false) ||
        ((deviceResult.error as { message?: string }).message?.toLowerCase().includes("lavouras") ?? false));

    const deviceFallback = deviceMissingColumns
      ? await supabase
          .from("colheitas")
          .select(baseSelect)
          .eq("empresa_id", selectedCompany.id)
          .eq("aparelho_token", deviceToken)
          .order("data_colheita", { ascending: false })
          .limit(500)
      : null;

    const deviceData = (deviceMissingColumns ? deviceFallback?.data : deviceResult.data) ?? [];
    const deviceError = deviceMissingColumns ? deviceFallback?.error : deviceResult.error;

    const aparelhosFallbackNeeded = aparelhosResult.error && (aparelhosResult.error as { code?: string }).code === "42703";
    const aparelhosFallback = aparelhosFallbackNeeded ? await supabase.from("aparelhos").select("token, nome") : null;
    const aparelhosData = (aparelhosFallbackNeeded ? aparelhosFallback?.data : aparelhosResult.data) ?? [];
    const aparelhosError = aparelhosFallbackNeeded ? aparelhosFallback?.error : aparelhosResult.error;

    if (aparelhosError) console.error("Erro ao carregar aparelhos:", aparelhosError);

    const aparelhoByToken = new Map<string, { nome: string }>();
    (aparelhosData ?? []).forEach((a) => aparelhoByToken.set(a.token, { nome: a.nome }));

    if (effectiveError) {
      console.error("Erro ao carregar movimentações:", effectiveError);

      const cached = readJson<{ cachedAt?: string; lancamentos: Lancamento[] } | null>(movCacheKey, null);
      const cachedDevice = readJson<{ cachedAt?: string; lancamentos: Lancamento[] } | null>(deviceMovCacheKey, null);
      if (cached?.lancamentos?.length) {
        setLancamentos(mergePendingLocal(cached.lancamentos));
        toast({ title: "Modo offline", description: "Mostrando movimentações salvas no dispositivo." });
        setLoading(false);
        return;
      }

      if (cachedDevice?.lancamentos?.length) {
        setLancamentos(mergePendingLocal(cachedDevice.lancamentos));
        toast({ title: "Modo offline", description: "Mostrando movimentações deste aparelho (cache)." });
        setLoading(false);
        return;
      }

      toast({
        title: "Falha de conexão",
        description: isOffline ? "Sem internet e sem cache disponível." : "Tente novamente em instantes.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const normalized: Lancamento[] = (effectiveData || []).map((item) => ({
      id: item.id,
      codigo: item.codigo ?? "-",
      peso_kg: Number(item.peso_kg) || 0,
      quantidade_balaios: (item as { quantidade_balaios?: number | null }).quantidade_balaios != null ? Number((item as { quantidade_balaios?: number | null }).quantidade_balaios) : null,
      preco_por_kg: item.preco_por_kg != null ? Number(item.preco_por_kg) : null,
      valor_total: item.valor_total != null ? Number(item.valor_total) : null,
      data_colheita: item.data_colheita,
      numero_bag: item.numero_bag,
      panhador: (item.panhadores as { nome?: string } | null)?.nome ?? "-",
      panhador_id: item.panhador_id,
      propriedade_id: (item as { propriedade_id?: string | null }).propriedade_id ?? null,
      lavoura_id: (item as { lavoura_id?: string | null }).lavoura_id ?? null,
      propriedade: ((item as { propriedades?: { nome?: string | null } | null }).propriedades as { nome?: string | null } | null)?.nome ?? "padrao",
      lavoura: ((item as { lavouras?: { nome?: string | null } | null }).lavouras as { nome?: string | null } | null)?.nome ?? "padrao",
      pago_em: (item as { pago_em?: string | null }).pago_em ?? null,
      encarregado: (item.profiles as { full_name?: string } | null)?.full_name ?? "-",
      aparelho_token: (item as { aparelho_token?: string | null }).aparelho_token ?? null,
      aparelho:
        ((item as { aparelho_token?: string | null }).aparelho_token ?? null)
          ? aparelhoByToken.get(((item as { aparelho_token?: string | null }).aparelho_token ?? "").trim())?.nome ??
            (((item as { aparelho_token?: string | null }).aparelho_token ?? "").trim().slice(0, 8) || "-")
          : "-",
      pendente_aparelho: (item as { pendente_aparelho?: boolean }).pendente_aparelho ?? false,
    }));

    const merged = mergePendingLocal(normalized);
    setLancamentos(merged);

    writeJson(movCacheKey, {
      cachedAt: new Date().toISOString(),
      lancamentos: normalized,
    });

    if (!deviceError) {
      const normalizedDevice: Lancamento[] = (deviceData || []).map((item) => ({
        id: item.id,
        codigo: item.codigo ?? "-",
        peso_kg: Number(item.peso_kg) || 0,
        quantidade_balaios:
          (item as { quantidade_balaios?: number | null }).quantidade_balaios != null
            ? Number((item as { quantidade_balaios?: number | null }).quantidade_balaios)
            : null,
        preco_por_kg: item.preco_por_kg != null ? Number(item.preco_por_kg) : null,
        valor_total: item.valor_total != null ? Number(item.valor_total) : null,
        data_colheita: item.data_colheita,
        numero_bag: item.numero_bag,
        panhador: (item.panhadores as { nome?: string } | null)?.nome ?? "-",
        panhador_id: item.panhador_id,
        propriedade_id: (item as { propriedade_id?: string | null }).propriedade_id ?? null,
        lavoura_id: (item as { lavoura_id?: string | null }).lavoura_id ?? null,
        propriedade:
          ((item as { propriedades?: { nome?: string | null } | null }).propriedades as { nome?: string | null } | null)?.nome ??
          "padrao",
        lavoura:
          ((item as { lavouras?: { nome?: string | null } | null }).lavouras as { nome?: string | null } | null)?.nome ?? "padrao",
        pago_em: (item as { pago_em?: string | null }).pago_em ?? null,
        encarregado: (item.profiles as { full_name?: string } | null)?.full_name ?? "-",
        aparelho_token: (item as { aparelho_token?: string | null }).aparelho_token ?? null,
        aparelho:
          ((item as { aparelho_token?: string | null }).aparelho_token ?? null)
            ? aparelhoByToken.get(((item as { aparelho_token?: string | null }).aparelho_token ?? "").trim())?.nome ??
              (((item as { aparelho_token?: string | null }).aparelho_token ?? "").trim().slice(0, 8) || "-")
            : "-",
        pendente_aparelho: (item as { pendente_aparelho?: boolean }).pendente_aparelho ?? false,
      }));

      writeJson(deviceMovCacheKey, {
        cachedAt: new Date().toISOString(),
        lancamentos: normalizedDevice,
      });
    }
    setLoading(false);
  };

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      return;
    }

    if (!navigator.onLine) {
      const cached = readJson<{ panhadores?: PanhadorOption[] } | null>(cacheKey("panhadores_list", selectedCompany.id), null);
      if (cached?.panhadores) {
        setPanhadores((cached.panhadores ?? []).map((p) => ({ id: p.id, nome: p.nome })));
        return;
      }
    }

    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar panhadores:", error);

      const cached = readJson<{ panhadores?: PanhadorOption[] } | null>(cacheKey("panhadores_list", selectedCompany.id), null);
      if (cached?.panhadores) {
        setPanhadores((cached.panhadores ?? []).map((p) => ({ id: p.id, nome: p.nome })));
        toast({ title: "Modo offline", description: "Carregando panhadores do cache." });
        return;
      }

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

      if (panhadorFilterId !== "todos" && item.panhador_id !== panhadorFilterId) return false;

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
  }, [lancamentos, filter, statusFilter, panhadorFilterId, startDate, endDate]);

  const getBalaiosForLancamento = (item: Lancamento) => {
    if (item.quantidade_balaios != null) return item.quantidade_balaios;
    if (kgPorBalaio == null || kgPorBalaio <= 0) return null;
    return Number((item.peso_kg / kgPorBalaio).toFixed(4));
  };

  const selectedLancamentos = useMemo(
    () => filteredLancamentos.filter((item) => Boolean(selectedIds[item.id])),
    [filteredLancamentos, selectedIds],
  );

  const selectedTotals = useMemo(() => {
    const totalKg = selectedLancamentos.reduce((sum, item) => sum + item.peso_kg, 0);
    const totalBalaios = selectedLancamentos.reduce((sum, item) => sum + (getBalaiosForLancamento(item) ?? 0), 0);
    const totalValor = selectedLancamentos.reduce((sum, item) => sum + (item.valor_total ?? 0), 0);
    const pendentesSelected = selectedLancamentos.filter((item) => item.valor_total == null).length;
    const jaPagos = selectedLancamentos.filter((item) => item.pago_em != null).length;
    return { totalKg, totalBalaios, totalValor, pendentesSelected, jaPagos };
  }, [selectedLancamentos, kgPorBalaio]);

  const filteredTotals = useMemo(() => {
    const totalKg = filteredLancamentos.reduce((sum, item) => sum + item.peso_kg, 0);
    const totalBalaios = filteredLancamentos.reduce((sum, item) => sum + (getBalaiosForLancamento(item) ?? 0), 0);
    const pagosCount = filteredLancamentos.filter((item) => item.pago_em != null).length;
    const valorPago = filteredLancamentos.reduce(
      (sum, item) => sum + (item.pago_em != null ? (item.valor_total ?? 0) : 0),
      0,
    );
    return { totalKg, totalBalaios, pagosCount, valorPago };
  }, [filteredLancamentos, kgPorBalaio]);

  const allVisibleSelected =
    filteredLancamentos.length > 0 && filteredLancamentos.every((item) => Boolean(selectedIds[item.id]));
  const someVisibleSelected = filteredLancamentos.some((item) => Boolean(selectedIds[item.id]));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const item of filteredLancamentos) {
        next[item.id] = checked;
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");

  const openPrintTicket = (item: Lancamento) => {
    const title = "Comprovante de Colheita";
    const companyName = selectedCompany?.nome ?? "-";
    const emittedAt = new Date().toLocaleString("pt-BR");
    const dataLabel = dateFormatter.format(new Date(item.data_colheita));

    const balaios = getBalaiosForLancamento(item);
    const offline = item.codigo.startsWith("OFF-") || !navigator.onLine;

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
              <div><strong>Empresa:</strong> ${escapeHtml(companyName)}</div>
              <div><strong>Panhador:</strong> ${escapeHtml(item.panhador)}</div>
              <div><strong>Data:</strong> ${escapeHtml(dataLabel)}</div>
              <div><strong>Gerado em:</strong> ${escapeHtml(emittedAt)}</div>
              <div><strong>Código:</strong> ${escapeHtml(item.codigo)}</div>
              ${item.numero_bag ? `<div><strong>Bag:</strong> ${escapeHtml(item.numero_bag)}</div>` : ""}
              ${offline ? `<div><strong>Status:</strong> OFFLINE (pendente de sincronização)</div>` : ""}
            </div>
          </div>

          <div class="kpi">
            <div class="row"><div class="label">Peso</div><div class="value">${escapeHtml(item.peso_kg.toFixed(2))} kg</div></div>
            ${balaios != null ? `<div class="row"><div class="label">Balaios</div><div class="value">${escapeHtml(balaios.toFixed(2))}</div></div>` : ""}
            ${item.preco_por_kg != null ? `<div class="row"><div class="label">Preço/kg</div><div class="value">${escapeHtml(currencyFormatter.format(item.preco_por_kg))}</div></div>` : ""}
            ${item.valor_total != null ? `<div class="row"><div class="label">Valor</div><div class="value">${escapeHtml(currencyFormatter.format(item.valor_total))}</div></div>` : ""}
          </div>

          <div class="footer">Assinatura: ________________________________</div>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) {
      toast({ title: "Popup bloqueado", description: "Permita popups para imprimir.", variant: "destructive" });
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const buildPrintableHtmlForItems = (
    mode: "relatorio" | "comprovante",
    lote: string | undefined,
    pagoEm: string | undefined,
    items: Lancamento[],
  ) => {
    const title = mode === "relatorio" ? "Relatório de Colheitas" : "Comprovante de Pagamento";
    const companyName = selectedCompany?.nome ?? "-";
    const emittedAt = new Date().toLocaleString("pt-BR");

    const formatDateFromInput = (value: string) => {
      if (!value) return "";
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : dateFormatter.format(d);
    };

    const periodoLabel = startDate && endDate
      ? `${formatDateFromInput(startDate)} até ${formatDateFromInput(endDate)}`
      : startDate
        ? `A partir de ${formatDateFromInput(startDate)}`
        : endDate
          ? `Até ${formatDateFromInput(endDate)}`
          : "Todos";

    const panhadorLabel =
      panhadorFilterId === "todos"
        ? "Todos"
        : panhadores.find((p) => p.id === panhadorFilterId)?.nome ?? "-";

    const resumo = (() => {
      const totalKg = items.reduce((sum, it) => sum + it.peso_kg, 0);
      const totalBalaios = items.reduce((sum, it) => sum + (getBalaiosForLancamento(it) ?? 0), 0);
      const totalValor = items.reduce((sum, it) => sum + (it.valor_total ?? 0), 0);
      const pendentes = items.filter((it) => it.valor_total == null).length;
      const pagos = items.filter((it) => it.pago_em != null).length;
      const valorPago = items.reduce((sum, it) => sum + (it.pago_em != null ? (it.valor_total ?? 0) : 0), 0);
      return { totalKg, totalBalaios, totalValor, pendentes, pagos, valorPago };
    })();

    const groups = new Map<string, { panhador: string; items: Lancamento[] }>();
    for (const item of items) {
      const key = item.panhador_id;
      const existing = groups.get(key);
      if (existing) existing.items.push(item);
      else groups.set(key, { panhador: item.panhador, items: [item] });
    }

    const tableRows = Array.from(groups.values())
      .sort((a, b) => a.panhador.localeCompare(b.panhador))
      .map((group) => {
        const itemsSorted = group.items
          .slice()
          .sort((a, b) => new Date(a.data_colheita).getTime() - new Date(b.data_colheita).getTime());

        const totalKg = itemsSorted.reduce((sum, it) => sum + it.peso_kg, 0);
        const totalBalaios = itemsSorted.reduce((sum, it) => sum + (getBalaiosForLancamento(it) ?? 0), 0);
        const totalValor = itemsSorted.reduce((sum, it) => sum + (it.valor_total ?? 0), 0);

        const rows = itemsSorted
          .map((it) => {
            const balaios = getBalaiosForLancamento(it);
            const valorCell =
              it.valor_total != null
                ? escapeHtml(currencyFormatter.format(it.valor_total))
                : '<span class="pending">Pendente</span>';
            return `
              <tr>
                <td>#${escapeHtml(it.codigo)}</td>
                <td>${escapeHtml(dateFormatter.format(new Date(it.data_colheita)))}</td>
                <td>${escapeHtml(it.numero_bag ?? "-")}</td>
                <td class="num">${it.peso_kg.toFixed(2)}</td>
                <td class="num">${balaios != null ? balaios.toFixed(2) : "-"}</td>
                <td class="num">${valorCell}</td>
              </tr>
            `;
          })
          .join("");

        return `
          <tr class="group-row">
            <td colspan="6">
              <div class="group-title">${escapeHtml(group.panhador)}</div>
              <div class="group-sub">${escapeHtml(`${totalKg.toFixed(2)} kg · ${totalBalaios.toFixed(2)} balaios · ${currencyFormatter.format(totalValor)}`)}</div>
            </td>
          </tr>
          ${rows}
        `;
      })
      .join("");

    const metaRows = [
      `<div><strong>Empresa:</strong> ${escapeHtml(companyName)}</div>`,
      `<div><strong>Período:</strong> ${escapeHtml(periodoLabel)}</div>`,
      `<div><strong>Panhador:</strong> ${escapeHtml(panhadorLabel)}</div>`,
      `<div><strong>Gerado em:</strong> ${escapeHtml(emittedAt)}</div>`,
      lote ? `<div><strong>Lote:</strong> ${escapeHtml(lote)}</div>` : "",
      pagoEm ? `<div><strong>Pagamento em:</strong> ${escapeHtml(pagoEm)}</div>` : "",
    ]
      .filter(Boolean)
      .join("");

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0; font-size: 20px; }
            .top { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 14px; background: #f8fafc; }
            .meta { font-size: 12px; color: #334155; display: grid; gap: 4px; margin-top: 8px; }
            .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
            .kpi { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; }
            .kpi .label { font-size: 11px; color: #64748b; }
            .kpi .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            thead th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 12px; color: #334155; border-bottom: 1px solid #e2e8f0; }
            tbody td { padding: 8px; border-bottom: 1px solid #eef2f7; font-size: 12px; }
            .num { text-align: right; white-space: nowrap; }
            .group-row td { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 8px; }
            .group-title { font-size: 13px; font-weight: 700; }
            .group-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
            .pending { color: #b45309; font-weight: 700; }
            .footer { margin-top: 16px; font-size: 11px; color: #64748b; }
            @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <div class="top">
            <h1>${escapeHtml(title)}</h1>
            <div class="meta">${metaRows}</div>
            <div class="kpis">
              <div class="kpi"><div class="label">Itens</div><div class="value">${items.length}</div></div>
              <div class="kpi"><div class="label">Total kg</div><div class="value">${resumo.totalKg.toFixed(2)} kg</div></div>
              <div class="kpi"><div class="label">Total balaios</div><div class="value">${resumo.totalBalaios.toFixed(2)}</div></div>
              <div class="kpi"><div class="label">${mode === "comprovante" ? "Valor pago" : "Valor"}</div><div class="value">${escapeHtml(currencyFormatter.format(mode === "comprovante" ? resumo.valorPago : resumo.totalValor))}</div></div>
            </div>
            ${resumo.pendentes > 0 ? `<div style="margin-top:8px; font-size:12px; color:#b45309;"><strong>Atenção:</strong> ${resumo.pendentes} pendente(s) sem valor.</div>` : ""}
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 14%">Código</th>
                <th style="width: 16%">Data</th>
                <th>Bag</th>
                <th class="num" style="width: 14%">Kg</th>
                <th class="num" style="width: 14%">Balaios</th>
                <th class="num" style="width: 18%">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div class="footer">Assinatura: ________________________________</div>
        </body>
      </html>
    `;
  };

  const buildPrintableHtml = (mode: "relatorio" | "comprovante", lote?: string, pagoEm?: string) =>
    buildPrintableHtmlForItems(mode, lote, pagoEm, selectedLancamentos);

  const openPrint = (mode: "relatorio" | "comprovante", lote?: string, pagoEm?: string, itemsOverride?: Lancamento[]) => {
    const items = itemsOverride ?? selectedLancamentos;
    if (items.length === 0) {
      toast({
        title: "Selecione movimentações",
        description: "Marque uma ou mais linhas para gerar o documento.",
        variant: "destructive",
      });
      return;
    }

    const html = itemsOverride ? buildPrintableHtmlForItems(mode, lote, pagoEm, itemsOverride) : buildPrintableHtml(mode, lote, pagoEm);
    const w = window.open("", "_blank");
    if (!w) {
      toast({ title: "Popup bloqueado", description: "Permita popups para gerar o PDF (imprimir).", variant: "destructive" });
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const handleConfirmPagamento = async () => {
    if (!user || !selectedCompany) return;
    if (selectedLancamentos.length === 0) {
      toast({ title: "Selecione movimentações", description: "Marque uma ou mais linhas para pagar.", variant: "destructive" });
      return;
    }

    const invalidIds = selectedLancamentos.filter((it) => !isUuid(it.id));
    if (invalidIds.length > 0) {
      toast({
        title: "Item inválido",
        description: "Existem movimentações com ID inválido (offline/pendente). Sincronize antes de pagar.",
        variant: "destructive",
      });
      return;
    }

    if (selectedTotals.pendentesSelected > 0) {
      toast({
        title: "Há pendentes",
        description: "Existem itens sem valor fechado. Defina o preço/valor antes de confirmar pagamento.",
        variant: "destructive",
      });
      return;
    }

    const pagoEmIso = new Date().toISOString();
    const lote = `PG-${Date.now().toString(36).toUpperCase()}`;

    try {
      const historyPayload = selectedLancamentos.map((it) => ({
        colheita_id: it.id,
        empresa_id: selectedCompany.id,
        user_id: user.id ?? null,
        dados: {
          acao: "pagamento_confirmado",
          pagamento_lote: lote,
          pago_em: pagoEmIso,
          panhador_id: it.panhador_id,
          panhador_nome: it.panhador,
          peso_kg: it.peso_kg,
          quantidade_balaios: getBalaiosForLancamento(it),
          preco_por_kg: it.preco_por_kg,
          valor_total: it.valor_total,
          numero_bag: it.numero_bag,
          data_colheita: it.data_colheita,
          responsavel_email: user.email,
        },
      }));

      const { error: historyError } = await supabase.from("colheitas_historico").insert(historyPayload);
      if (historyError) throw historyError;

      const ids = selectedLancamentos.map((it) => it.id);
      const { error } = await supabase
        .from("colheitas")
        .update({
          pago_em: pagoEmIso,
          pago_por: user.id,
          pagamento_lote: lote,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      // Espelha no controle financeiro: cria uma despesa por colheita quitada.
      try {
        const { data: plano, error: planoError } = await supabase
          .from("planos_contas")
          .select("id")
          .eq("empresa_id", selectedCompany.id)
          .eq("nome_lower", "pagamento de panha")
          .maybeSingle();

        if (planoError) throw planoError;

        if (plano?.id) {
          const dataVencimento = pagoEmIso.slice(0, 10); // YYYY-MM-DD
          const despesasPayload = selectedLancamentos.map((it) => ({
            empresa_id: selectedCompany.id,
            criado_por: user.id,
            valor: it.valor_total ?? 0,
            data_vencimento: dataVencimento,
            tipo_servico: null,
            plano_conta_id: plano.id,
            pagamento_metodo: null,
            colheita_id: it.id,
          }));

          const { error: despError } = await supabase
            .from("despesas")
            .upsert(despesasPayload, { onConflict: "colheita_id", ignoreDuplicates: true });

          if (despError) throw despError;
        }
      } catch (e) {
        console.error("Falha ao lançar despesas automaticamente (movimentações):", e);
      }

      toast({ title: "Pagamento confirmado", description: `Lote ${lote} registrado.` });
      setConfirmPagamentoOpen(false);
      openPrint("comprovante", lote, new Date(pagoEmIso).toLocaleString("pt-BR"));
      setSelectedIds({});
      await loadLancamentos();
    } catch (err) {
      console.error("Erro ao confirmar pagamento:", err);
      const message =
        typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message) : "Tente novamente";
      toast({ title: "Erro ao pagar", description: message, variant: "destructive" });
    }
  };

  const totalPeso = useMemo(() => filteredLancamentos.reduce((sum, item) => sum + item.peso_kg, 0), [filteredLancamentos]);
  const totalBalaios = useMemo(
    () => filteredLancamentos.reduce((sum, item) => sum + (getBalaiosForLancamento(item) ?? 0), 0),
    [filteredLancamentos, kgPorBalaio],
  );
  const totalValorFechado = useMemo(
    () => filteredLancamentos.reduce((sum, item) => sum + (item.valor_total ?? 0), 0),
    [filteredLancamentos],
  );
  const totalPago = useMemo(
    () => filteredLancamentos.reduce((sum, item) => sum + (item.pago_em != null ? (item.valor_total ?? 0) : 0), 0),
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

    if (!isUuid(editTarget.id)) {
      toast({
        title: "Movimentação offline",
        description: "Sincronize a movimentação antes de editar.",
        variant: "destructive",
      });
      return;
    }

    const pesoNumber = Number(editForm.pesoKg);
    if (!pesoNumber || pesoNumber <= 0) {
      toast({ title: "Peso inválido", description: "Informe um peso maior que zero.", variant: "destructive" });
      return;
    }
    if (!editForm.panhadorId || !isUuid(editForm.panhadorId)) {
      toast({ title: "Selecione o panhador", variant: "destructive" });
      return;
    }

    const precoNumber = editForm.precoKg.trim() ? Number(editForm.precoKg) : null;
    const valorNumber = editForm.valorTotal.trim()
      ? Number(editForm.valorTotal)
      : precoNumber != null
        ? Number((precoNumber * pesoNumber).toFixed(2))
        : null;

    const propriedadePayload = propriedadesSupported
      ? {
          propriedade_id: editForm.propriedadeId === PADRAO_OPTION ? null : toUuidOrNull(editForm.propriedadeId),
          lavoura_id: editForm.lavouraId === PADRAO_OPTION ? null : toUuidOrNull(editForm.lavouraId),
        }
      : {};

    setEditSaving(true);

    try {
      if (!navigator.onLine) {
        const updatePayload: Record<string, unknown> = {
          panhador_id: editForm.panhadorId,
          peso_kg: pesoNumber,
          preco_por_kg: precoNumber,
          valor_total: valorNumber,
          numero_bag: editForm.numeroBag.trim() ? editForm.numeroBag.trim() : null,
          ...(propriedadePayload as Record<string, unknown>),
        };

        savePendingColheitaUpdate({
          id: editTarget.id,
          empresa_id: selectedCompany.id,
          payload: updatePayload,
        });

        const panhadorNome = panhadores.find((p) => p.id === editForm.panhadorId)?.nome ?? editTarget.panhador;
        const propNome =
          !propriedadesSupported
            ? editTarget.propriedade
            : editForm.propriedadeId === PADRAO_OPTION
              ? "padrao"
              : propriedades.find((p) => p.id === editForm.propriedadeId)?.nome ?? editTarget.propriedade;
        const lavNome =
          !propriedadesSupported
            ? editTarget.lavoura
            : editForm.lavouraId === PADRAO_OPTION
              ? "padrao"
              : lavouras.find((l) => l.id === editForm.lavouraId)?.nome ?? editTarget.lavoura;

        const applyLocalUpdate = (list: Lancamento[]) =>
          list.map((it) =>
            it.id === editTarget.id
              ? {
                  ...it,
                  panhador_id: editForm.panhadorId,
                  panhador: panhadorNome,
                  propriedade_id:
                    propriedadesSupported && editForm.propriedadeId !== PADRAO_OPTION ? toUuidOrNull(editForm.propriedadeId) : null,
                  lavoura_id:
                    propriedadesSupported && editForm.lavouraId !== PADRAO_OPTION ? toUuidOrNull(editForm.lavouraId) : null,
                  propriedade: propNome,
                  lavoura: lavNome,
                  peso_kg: pesoNumber,
                  preco_por_kg: precoNumber,
                  valor_total: valorNumber,
                  numero_bag: editForm.numeroBag.trim() ? editForm.numeroBag.trim() : null,
                }
              : it,
          );

        setLancamentos((prev) => applyLocalUpdate(prev));

        const movCacheKey = cacheKey("movimentacoes_list", selectedCompany.id);
        const token = getDeviceToken();
        const deviceMovCacheKey = cacheKey(`movimentacoes_device_${token}`, selectedCompany.id);

        const patchCache = (key: string) => {
          const cached = readJson<{ cachedAt?: string; lancamentos: Lancamento[] } | null>(key, null);
          if (!cached?.lancamentos?.length) return;
          writeJson(key, {
            ...cached,
            cachedAt: new Date().toISOString(),
            lancamentos: applyLocalUpdate(cached.lancamentos),
          });
        };

        patchCache(movCacheKey);
        patchCache(deviceMovCacheKey);

        toast({ title: "Salvo offline", description: "A edição será sincronizada quando a internet voltar." });
        setEditDialogOpen(false);
        setEditTarget(null);
        return;
      }

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
          propriedade_id: editTarget.propriedade_id,
          lavoura_id: editTarget.lavoura_id,
          propriedade_nome: editTarget.propriedade,
          lavoura_nome: editTarget.lavoura,
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
          ...(propriedadePayload as Record<string, unknown>),
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

    if (!isUuid(deleteTarget.id)) {
      toast({
        title: "Movimentação offline",
        description: "Sincronize a movimentação antes de excluir.",
        variant: "destructive",
      });
      return;
    }

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
      <main className="w-full px-2 sm:px-4 lg:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold text-[hsl(24_25%_18%)] sm:text-2xl">Movimentações colheitas</h1>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={loadLancamentos}
            disabled={loading}
            aria-label="Atualizar"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <section className="grid grid-cols-2 gap-2">
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-2.5 overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Volume total</p>
              <div className="flex items-end justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-display text-base leading-none text-[hsl(24_25%_20%)] sm:text-2xl">
                  {totalPeso.toFixed(2)} kg
                </p>
                <Package className="h-4 w-4 shrink-0 text-[hsl(196_65%_40%)]" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Somatório dos registros carregados</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-2.5 overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Total balaios</p>
              <div className="flex items-end justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-display text-base leading-none text-[hsl(196_65%_35%)] sm:text-2xl">
                  {totalBalaios.toFixed(2)}
                </p>
                <Package className="h-4 w-4 shrink-0 text-[hsl(196_65%_40%)]" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Estimado com kg por balaio configurado</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-2.5 overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Valor fechado</p>
              <div className="flex items-end justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-display text-base leading-none text-[hsl(152_45%_32%)] sm:text-2xl">
                  {currencyFormatter.format(totalValorFechado)}
                </p>
                <Coins className="h-4 w-4 shrink-0 text-[hsl(152_45%_40%)]" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Considera lançamentos com valor informado</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-2.5 overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Total pago</p>
              <div className="flex items-end justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-display text-base leading-none text-[hsl(152_45%_32%)] sm:text-2xl">
                  {currencyFormatter.format(totalPago)}
                </p>
                <Coins className="h-4 w-4 shrink-0 text-[hsl(152_45%_40%)]" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Soma apenas itens marcados como pagos</p>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
          <CardHeader className="gap-3 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2 lg:ml-auto">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setFiltersOpen(true)}
                  aria-label="Filtros"
                  title="Filtros"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>

                {isAdmin ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                      onClick={() => openPrint("relatorio")}
                      disabled={selectedLancamentos.length === 0}
                      aria-label="Relatório"
                      title="Relatório"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      className="rounded-full"
                      onClick={() => setConfirmPagamentoOpen(true)}
                      disabled={selectedLancamentos.length === 0}
                      aria-label="Pagamento"
                      title="Pagamento"
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isAdmin && selectedLancamentos.length > 0 && (
              <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <strong>{selectedLancamentos.length}</strong> selecionado(s) · {selectedTotals.totalKg.toFixed(2)} kg · {selectedTotals.totalBalaios.toFixed(2)} balaios · {currencyFormatter.format(selectedTotals.totalValor)}
                  {(selectedTotals.pendentesSelected > 0 || selectedTotals.jaPagos > 0) && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {selectedTotals.pendentesSelected > 0 ? `${selectedTotals.pendentesSelected} pendente(s)` : ""}
                      {selectedTotals.pendentesSelected > 0 && selectedTotals.jaPagos > 0 ? " · " : ""}
                      {selectedTotals.jaPagos > 0 ? `${selectedTotals.jaPagos} já pago(s)` : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => openPrint("relatorio")}
                    aria-label="Relatório"
                    title="Relatório"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="rounded-full"
                    onClick={() => setConfirmPagamentoOpen(true)}
                    aria-label="Confirmar pagamento"
                    title="Confirmar pagamento"
                  >
                    <CreditCard className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="sm:hidden space-y-2">
              {loading ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center text-sm text-muted-foreground">
                  Carregando movimentações...
                </div>
              ) : filteredLancamentos.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center text-sm text-muted-foreground">
                  {lancamentos.length === 0
                    ? "Nenhum lançamento encontrado para esta empresa"
                    : "Nenhum resultado para o filtro aplicado"}
                </div>
              ) : (
                filteredLancamentos.map((item) => {
                  const balaios = getBalaiosForLancamento(item);
                  const statusDot = item.pago_em != null ? "bg-emerald-500" : item.valor_total != null ? "bg-sky-500" : "bg-amber-500";
                  return (
                    <Card key={item.id} className="overflow-hidden border border-slate-100 bg-white">
                      <button
                        type="button"
                        className="w-full p-3 text-left"
                        onClick={() => {
                          setDetailsTarget(item);
                          setDetailsOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 overflow-hidden">
                            <div className="truncate text-sm font-semibold text-[hsl(24_25%_18%)]">
                              Ticket {item.codigo}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{item.panhador}</div>
                          </div>
                          <div className="shrink-0 text-[10px] text-muted-foreground">
                            {dateFormatter.format(new Date(item.data_colheita))}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                            Bag #{item.numero_bag ?? "-"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                            {item.peso_kg.toFixed(2)} kg
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                            Bal: {balaios != null ? balaios.toFixed(2) : "-"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                            {item.valor_total != null ? currencyFormatter.format(item.valor_total) : "Pendente"}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full", statusDot)} />
                            {item.codigo.startsWith("OFF-") ? (
                              <span className="text-[10px] font-medium text-amber-700">Pendente sync</span>
                            ) : item.pendente_aparelho ? (
                              <span className="text-[10px] font-medium text-amber-700">Aparelho inativo</span>
                            ) : null}
                          </div>
                          {item.codigo.startsWith("OFF-") && item.offline_last_error ? (
                            <span className="text-[10px] font-medium text-destructive">Erro</span>
                          ) : null}
                        </div>
                      </button>
                    </Card>
                  );
                })
              )}
            </div>

            <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 text-xs sm:block sm:text-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          onCheckedChange={(value) => toggleSelectAllVisible(Boolean(value))}
                          aria-label="Selecionar todos"
                        />
                      </div>
                    </TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="hidden md:table-cell">Encarregado</TableHead>
                    <TableHead className="hidden md:table-cell">Aparelho</TableHead>
                    <TableHead>Panhador</TableHead>
                    <TableHead className="hidden sm:table-cell">Bag</TableHead>
                    <TableHead className="text-right">Peso (kg)</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Balaios</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                        {isAdmin ? <TableHead className="text-right">Ações</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                        <TableCell colSpan={isAdmin ? 12 : 11} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando movimentações...
                      </TableCell>
                    </TableRow>
                  ) : filteredLancamentos.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={isAdmin ? 12 : 11} className="py-6 text-center text-sm text-muted-foreground">
                        {lancamentos.length === 0
                          ? "Nenhum lançamento encontrado para esta empresa"
                          : "Nenhum resultado para o filtro aplicado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLancamentos.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setDetailsTarget(item);
                          setDetailsOpen(true);
                        }}
                        title="Abrir opções"
                      >
                        <TableCell>
                          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={Boolean(selectedIds[item.id])}
                              onCheckedChange={(value) => toggleSelectOne(item.id, Boolean(value))}
                              aria-label="Selecionar"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-sm">#{item.codigo}</div>
                            {item.codigo.startsWith("OFF-") && (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-amber-100 text-amber-700">Pendente sync</Badge>
                                {item.offline_last_error ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSyncLogTarget(item);
                                      setSyncLogOpen(true);
                                    }}
                                    aria-label="Ver log de sincronização"
                                    title="Ver log de sincronização"
                                  >
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                  </Button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{dateFormatter.format(new Date(item.data_colheita))}</TableCell>
                        <TableCell className="hidden md:table-cell">{item.encarregado}</TableCell>
                        <TableCell className="hidden md:table-cell">{item.aparelho}</TableCell>
                        <TableCell>{item.panhador}</TableCell>
                        <TableCell className="hidden sm:table-cell">{item.numero_bag ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{item.peso_kg.toFixed(2)} kg</TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          {(() => {
                            const balaios = getBalaiosForLancamento(item);
                            return balaios != null ? `${balaios.toFixed(2)}` : "-";
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.valor_total != null ? currencyFormatter.format(item.valor_total) : "Pendente"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {item.pago_em != null ? (
                              <Badge className="bg-slate-100 text-slate-700">Pago</Badge>
                            ) : item.valor_total != null ? (
                                <Badge className="bg-emerald-100 text-emerald-700">Valor fechado</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
                              )}
                            {item.pendente_aparelho && (
                              <Badge className="bg-amber-100 text-amber-700">Aparelho inativo</Badge>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(item)}
                                disabled={item.codigo.startsWith("OFF-")}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget(item)}
                                disabled={item.codigo.startsWith("OFF-")}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsTarget(null);
        }}
      >
        <DialogContent className="top-[6%] w-[95vw] max-w-lg max-h-[90vh] translate-y-0 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da movimentação</DialogTitle>
            <DialogDescription>Informações completas do registro</DialogDescription>
          </DialogHeader>

          {detailsTarget ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Ticket</Label>
                  <div className="text-sm font-mono">{detailsTarget.codigo}</div>
                </div>
                <div className="space-y-1">
                  <Label>Data</Label>
                  <div className="text-sm">{dateFormatter.format(new Date(detailsTarget.data_colheita))}</div>
                </div>
                <div className="space-y-1">
                  <Label>Panhador</Label>
                  <div className="text-sm">{detailsTarget.panhador}</div>
                </div>
                <div className="space-y-1">
                  <Label>Bag</Label>
                  <div className="text-sm font-mono">{detailsTarget.numero_bag ?? "-"}</div>
                </div>
                <div className="space-y-1">
                  <Label>Peso</Label>
                  <div className="text-sm">{detailsTarget.peso_kg.toFixed(2)} kg</div>
                </div>
                <div className="space-y-1">
                  <Label>Balaios</Label>
                  <div className="text-sm">
                    {(() => {
                      const balaios = getBalaiosForLancamento(detailsTarget);
                      return balaios != null ? balaios.toFixed(2) : "-";
                    })()}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Valor</Label>
                  <div className="text-sm">
                    {detailsTarget.valor_total != null ? currencyFormatter.format(detailsTarget.valor_total) : "Pendente"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <div className="text-sm">
                    {detailsTarget.pago_em != null ? "Pago" : detailsTarget.valor_total != null ? "Valor fechado" : "Pendente"}
                  </div>
                </div>
              </div>

              {propriedadesSupported ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Propriedade</Label>
                    <div className="text-sm">{detailsTarget.propriedade || "padrao"}</div>
                  </div>
                  <div className="space-y-1">
                    <Label>Lavoura</Label>
                    <div className="text-sm">{detailsTarget.lavoura || "padrao"}</div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Encarregado</Label>
                  <div className="text-sm">{detailsTarget.encarregado}</div>
                </div>
                <div className="space-y-1">
                  <Label>Aparelho</Label>
                  <div className="text-sm">{detailsTarget.aparelho}</div>
                </div>
              </div>

              {detailsTarget.codigo.startsWith("OFF-") && detailsTarget.offline_last_error ? (
                <div className="space-y-2">
                  <Label>Erro de sincronização</Label>
                  <div className="max-h-48 overflow-auto rounded-md border bg-slate-50 p-3">
                    {(() => {
                      const raw = detailsTarget.offline_last_error ?? "";
                      const parts = raw
                        .split("|")
                        .map((p) => p.trim())
                        .filter(Boolean);
                      const codePart = parts.find((p) => p.toLowerCase().startsWith("code=")) ?? "";
                      const code = codePart ? codePart.slice(5) : "";
                      const message = parts.find((p) => !p.toLowerCase().startsWith("code=")) ?? raw;
                      const details = parts
                        .filter((p) => p !== codePart && p !== message)
                        .join(" | ");

                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground">Código do erro</div>
                              <div className="font-mono text-xs">{code || "-"}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground">Movimentação</div>
                              <div className="font-mono text-xs">{detailsTarget.codigo}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-muted-foreground">Mensagem</div>
                            <pre className="whitespace-pre-wrap text-xs leading-relaxed">{message || "-"}</pre>
                          </div>
                          {details ? (
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground">Detalhes</div>
                              <pre className="whitespace-pre-wrap text-xs leading-relaxed">{details}</pre>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => openPrintTicket(detailsTarget)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Reimprimir
                </Button>
                {isAdmin ? (
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setDetailsOpen(false);
                      handleOpenEdit(detailsTarget);
                    }}
                    disabled={detailsTarget.codigo.startsWith("OFF-")}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                ) : null}
                {detailsTarget.codigo.startsWith("OFF-") ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (!navigator.onLine) {
                        toast({
                          title: "Sem internet",
                          description: "Conecte-se para tentar sincronizar.",
                          variant: "destructive",
                        });
                        return;
                      }

                      try {
                        await syncPendingData();
                      } finally {
                        const pendingNow = getPendingColheitas();
                        const still = pendingNow.find((p) => p.id === detailsTarget.id) ?? null;

                        if (!still) {
                          toast({ title: "Sincronizado", description: "Item enviado com sucesso." });
                          setDetailsOpen(false);
                          setDetailsTarget(null);
                          void loadLancamentos();
                          return;
                        }

                        setDetailsTarget((prev) =>
                          prev
                            ? {
                                ...prev,
                                offline_sync_attempts: still.sync_attempts ?? 0,
                                offline_last_error: still.last_error ?? null,
                                offline_last_error_at: still.last_error_at ?? null,
                              }
                            : prev,
                        );

                        if (still.last_error) {
                          toast({
                            title: "Falha ao sincronizar",
                            description: "Veja o motivo no log dentro do modal.",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                    disabled={syncing}
                  >
                    {syncing ? "Sincronizando..." : "Sincronizar"}
                  </Button>
                ) : null}
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetailsOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={filtersOpen}
        onOpenChange={(open) => {
          setFiltersOpen(open);
          if (!open) setPanhadorFilterOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
            <DialogDescription>Filtre as movimentações por status, panhador e período</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Busca</Label>
              <Input
                placeholder="Código, panhador ou bag"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as "todos" | "com-valor" | "pendentes")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="com-valor">Com valor</SelectItem>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Panhador</Label>
              <div className="flex gap-2">
                <Popover open={panhadorFilterOpen} onOpenChange={setPanhadorFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={panhadorFilterOpen}
                      className="flex-1 justify-between bg-white hover:bg-white"
                    >
                      {panhadorFilterId === "todos"
                        ? "Todos"
                        : panhadores.find((p) => p.id === panhadorFilterId)?.nome ?? "Filtrar por panhador"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] bg-white p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Digite o nome..." />
                      <CommandList>
                        <CommandEmpty>Nenhum panhador encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="Todos"
                            onSelect={() => {
                              setPanhadorFilterId("todos");
                              setPanhadorFilterOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                panhadorFilterId === "todos" ? "opacity-100" : "opacity-0",
                              )}
                            />
                            Todos
                          </CommandItem>
                          {panhadores.map((panhador) => (
                            <CommandItem
                              key={panhador.id}
                              value={panhador.nome}
                              onSelect={() => {
                                setPanhadorFilterId(panhador.id);
                                setPanhadorFilterOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  panhadorFilterId === panhador.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {panhador.nome}
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
                  className="shrink-0 bg-white hover:bg-white"
                  onClick={() => openCreatePanhador("filter")}
                  aria-label="Adicionar panhador"
                  title="Adicionar panhador"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label>Data final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setFiltersOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                <div className="flex gap-2">
                  <Select
                    value={editForm.panhadorId}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, panhadorId: value }))}
                  >
                    <SelectTrigger className="flex-1 bg-white">
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

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 bg-white hover:bg-white"
                    onClick={() => openCreatePanhador("edit")}
                    aria-label="Adicionar panhador"
                    title="Adicionar panhador"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {propriedadesSupported && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Propriedade</Label>
                    <Select
                      value={editForm.propriedadeId}
                      onValueChange={(value) => {
                        setEditForm((prev) => ({ ...prev, propriedadeId: value, lavouraId: PADRAO_OPTION }));
                        if (value === PADRAO_OPTION) {
                          setLavouras([]);
                          return;
                        }
                        void loadLavouras(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Padrão" />
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
                    <Select
                      value={editForm.lavouraId}
                      onValueChange={(value) => setEditForm((prev) => ({ ...prev, lavouraId: value }))}
                      disabled={editForm.propriedadeId === PADRAO_OPTION}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Padrão" />
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

      <Dialog
        open={createPanhadorOpen}
        onOpenChange={(open) => {
          setCreatePanhadorOpen(open);
          if (!open) {
            setCreatePanhadorNome("");
            setCreatePanhadorApelido("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo panhador</DialogTitle>
            <DialogDescription>Cadastre rápido para já selecionar no lançamento.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePanhador} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={createPanhadorNome}
                onChange={(e) => setCreatePanhadorNome(e.target.value)}
                placeholder="Nome do panhador"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Apelido (opcional)</Label>
              <Input
                value={createPanhadorApelido}
                onChange={(e) => setCreatePanhadorApelido(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreatePanhadorOpen(false)}
                disabled={createPanhadorSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createPanhadorSaving}>
                {createPanhadorSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={syncLogOpen}
        onOpenChange={(open) => {
          setSyncLogOpen(open);
          if (!open) setSyncLogTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log de sincronização</DialogTitle>
            <DialogDescription>Motivo do erro ao tentar enviar ao Supabase</DialogDescription>
          </DialogHeader>

          {syncLogTarget ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Código</Label>
                  <div className="text-sm font-mono">#{syncLogTarget.codigo}</div>
                </div>
                <div className="space-y-1">
                  <Label>Tentativas</Label>
                  <div className="text-sm">{syncLogTarget.offline_sync_attempts ?? 0}</div>
                </div>
                <div className="space-y-1">
                  <Label>Último erro</Label>
                  <div className="text-sm">
                    {syncLogTarget.offline_last_error_at
                      ? dateFormatter.format(new Date(syncLogTarget.offline_last_error_at))
                      : "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Panhador</Label>
                  <div className="text-sm">{syncLogTarget.panhador}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Detalhes</Label>
                <div className="max-h-56 overflow-auto rounded-md border bg-slate-50 p-3">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed">
                    {syncLogTarget.offline_last_error || "Sem detalhes de erro salvos."}
                  </pre>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSyncLogOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
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

      <AlertDialog open={confirmPagamentoOpen} onOpenChange={setConfirmPagamentoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a confirmar o pagamento de {selectedLancamentos.length} movimentação(ões).
              {selectedTotals.pendentesSelected > 0
                ? " Existem itens pendentes (sem valor) e eles não podem ser pagos."
                : " Será gerado um comprovante (você poderá salvar como PDF)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPagamento} disabled={selectedTotals.pendentesSelected > 0}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
