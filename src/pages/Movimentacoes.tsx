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
import { cn } from "@/lib/utils";
import { cacheKey, getPendingColheitas, readJson, writeJson } from "@/lib/offline";

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
  const { user, selectedCompany } = useAuth();
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

  const [filtersOpen, setFiltersOpen] = useState(false);

  const isOffline = !navigator.onLine;

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

    const baseSelect =
      "id, codigo, peso_kg, preco_por_kg, valor_total, data_colheita, numero_bag, panhador_id, quantidade_balaios, pago_em, aparelho_token, pendente_aparelho, profiles!colheitas_user_id_fkey(full_name), panhadores(nome)";
    const extendedSelect = `${baseSelect}, propriedade_id, lavoura_id, propriedades(nome), lavouras(nome)`;

    const colheitasQuery = supabase
      .from("colheitas")
      .select(extendedSelect)
      .eq("empresa_id", selectedCompany.id)
      .order("data_colheita", { ascending: false })
      .limit(200);

    const [{ data, error }, aparelhosResult] = await Promise.all([
      colheitasQuery,
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
      if (cached?.lancamentos?.length) {
        setLancamentos(mergePendingLocal(cached.lancamentos));
        toast({ title: "Modo offline", description: "Mostrando movimentações salvas no dispositivo." });
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

  const buildPrintableHtml = (mode: "relatorio" | "comprovante", lote?: string, pagoEm?: string) => {
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
      const totalKg = selectedLancamentos.reduce((sum, it) => sum + it.peso_kg, 0);
      const totalBalaios = selectedLancamentos.reduce((sum, it) => sum + (getBalaiosForLancamento(it) ?? 0), 0);
      const totalValor = selectedLancamentos.reduce((sum, it) => sum + (it.valor_total ?? 0), 0);
      const pendentes = selectedLancamentos.filter((it) => it.valor_total == null).length;
      const pagos = selectedLancamentos.filter((it) => it.pago_em != null).length;
      const valorPago = selectedLancamentos.reduce((sum, it) => sum + (it.pago_em != null ? (it.valor_total ?? 0) : 0), 0);
      return { totalKg, totalBalaios, totalValor, pendentes, pagos, valorPago };
    })();

    const groups = new Map<string, { panhador: string; items: Lancamento[] }>();
    for (const item of selectedLancamentos) {
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
                ? currencyFormatter.format(it.valor_total)
                : '<span class="pending">Pendente</span>';
            return `
              <tr>
                <td>#${it.codigo}</td>
                <td>${dateFormatter.format(new Date(it.data_colheita))}</td>
                <td>${it.numero_bag ?? "-"}</td>
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
              <div class="group-title">${group.panhador}</div>
              <div class="group-sub">${totalKg.toFixed(2)} kg · ${totalBalaios.toFixed(2)} balaios · ${currencyFormatter.format(totalValor)}</div>
            </td>
          </tr>
          ${rows}
        `;
      })
      .join("");

    const metaRows = [
      `<div><strong>Empresa:</strong> ${companyName}</div>`,
      `<div><strong>Período:</strong> ${periodoLabel}</div>`,
      `<div><strong>Panhador:</strong> ${panhadorLabel}</div>`,
      `<div><strong>Gerado em:</strong> ${emittedAt}</div>`,
      lote ? `<div><strong>Lote:</strong> ${lote}</div>` : "",
      pagoEm ? `<div><strong>Pagamento em:</strong> ${pagoEm}</div>` : "",
    ]
      .filter(Boolean)
      .join("");

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
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
            <h1>${title}</h1>
            <div class="meta">${metaRows}</div>
            <div class="kpis">
              <div class="kpi"><div class="label">Itens</div><div class="value">${selectedLancamentos.length}</div></div>
              <div class="kpi"><div class="label">Total kg</div><div class="value">${resumo.totalKg.toFixed(2)} kg</div></div>
              <div class="kpi"><div class="label">Total balaios</div><div class="value">${resumo.totalBalaios.toFixed(2)}</div></div>
              <div class="kpi"><div class="label">${mode === "comprovante" ? "Valor pago" : "Valor"}</div><div class="value">${currencyFormatter.format(mode === "comprovante" ? resumo.valorPago : resumo.totalValor)}</div></div>
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

  const openPrint = (mode: "relatorio" | "comprovante", lote?: string, pagoEm?: string) => {
    if (selectedLancamentos.length === 0) {
      toast({
        title: "Selecione movimentações",
        description: "Marque uma ou mais linhas para gerar o documento.",
        variant: "destructive",
      });
      return;
    }

    const html = buildPrintableHtml(mode, lote, pagoEm);
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

    const pesoNumber = Number(editForm.pesoKg);
    if (!pesoNumber || pesoNumber <= 0) {
      toast({ title: "Peso inválido", description: "Informe um peso maior que zero.", variant: "destructive" });
      return;
    }
    if (!editForm.panhadorId) {
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
          propriedade_id: editForm.propriedadeId === PADRAO_OPTION ? null : editForm.propriedadeId,
          lavoura_id: editForm.lavouraId === PADRAO_OPTION ? null : editForm.lavouraId,
        }
      : {};

    setEditSaving(true);

    try {
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
      <main className="w-full px-2 sm:px-4 lg:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[hsl(24_25%_18%)] sm:text-3xl">Movimentações colheitas</h1>
          </div>
          <Button variant="outline" className="rounded-full" onClick={loadLancamentos} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <section className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-3 sm:space-y-1 sm:py-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Volume total</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-lg text-[hsl(24_25%_20%)] sm:text-3xl">{totalPeso.toFixed(2)} kg</p>
                <Package className="h-4 w-4 text-[hsl(196_65%_40%)] sm:h-5 sm:w-5" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Somatório dos registros carregados</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-3 sm:space-y-1 sm:py-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Total balaios</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-lg text-[hsl(196_65%_35%)] sm:text-3xl">{totalBalaios.toFixed(2)}</p>
                <Package className="h-4 w-4 text-[hsl(196_65%_40%)] sm:h-5 sm:w-5" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Estimado com kg por balaio configurado</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-3 sm:space-y-1 sm:py-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Valor fechado</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-lg text-[hsl(152_45%_32%)] sm:text-3xl">{currencyFormatter.format(totalValorFechado)}</p>
                <Coins className="h-4 w-4 text-[hsl(152_45%_40%)] sm:h-5 sm:w-5" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Considera lançamentos com valor informado</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-3 sm:space-y-1 sm:py-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Total pago</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-lg text-[hsl(152_45%_32%)] sm:text-3xl">{currencyFormatter.format(totalPago)}</p>
                <Coins className="h-4 w-4 text-[hsl(152_45%_40%)] sm:h-5 sm:w-5" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Soma apenas itens marcados como pagos</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 bg-white">
            <CardContent className="space-y-0.5 py-3 sm:space-y-1 sm:py-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">Pendentes</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-lg text-[hsl(14_70%_45%)] sm:text-3xl">{pendentes}</p>
                <AlertCircle className="h-4 w-4 text-[hsl(14_70%_45%)] sm:h-5 sm:w-5" />
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Lançamentos aguardando valor final</p>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
          <CardHeader className="gap-4">
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedLancamentos.length > 0 && (
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
            <div className="overflow-x-auto rounded-2xl border border-slate-100 text-xs sm:text-sm">
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
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                        <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando movimentações...
                      </TableCell>
                    </TableRow>
                  ) : filteredLancamentos.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                        {lancamentos.length === 0
                          ? "Nenhum lançamento encontrado para esta empresa"
                          : "Nenhum resultado para o filtro aplicado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLancamentos.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center justify-center">
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
                                    onClick={() => {
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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
              <Popover open={panhadorFilterOpen} onOpenChange={setPanhadorFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={panhadorFilterOpen}
                    className="w-full justify-between"
                  >
                    {panhadorFilterId === "todos"
                      ? "Todos"
                      : panhadores.find((p) => p.id === panhadorFilterId)?.nome ?? "Filtrar por panhador"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                <Select
                  value={editForm.panhadorId}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, panhadorId: value }))}
                >
                  <SelectTrigger>
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
