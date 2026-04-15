import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Clock3,
  Coins,
  Coffee,
  LogOut,
  MapPinned,
  NotebookPen,
  Package,
  RefreshCw,
  Smartphone,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { LancamentoDialog } from "@/components/LancamentoDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getPendingCounts, useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "@/hooks/use-toast";
import { cacheKey, readJson, writeJson } from "@/lib/offline";
import { checkPwaCacheHealth } from "@/lib/pwaCache";
import { cn } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, Cell } from "recharts";

type ColheitaRecord = {
  id: string;
  codigo: string;
  peso_kg: number;
  quantidade_balaios: number | null;
  valor_total: number | null;
  data_colheita: string;
  numero_bag: string | null;
  panhador: {
    id: string;
    nome: string;
  };
};

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  route?: string;
  action?: () => void;
};

type QuickLink = {
  label: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
  accent: string;
};

const navigationItems: NavigationItem[] = [
  { label: "Panhadores", icon: Users, route: "/panhadores" },
  { label: "Encarregados", icon: UserCog, route: "/encarregados" },
  { label: "Aparelhos", icon: Smartphone, route: "/aparelhos" },
  { label: "Movimentações", icon: Clock3, route: "/movimentacoes" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const donutColors = ["#1d3557", "#2d6a4f", "#c97c5d"];

export default function Dashboard() {
  const [colheitas, setColheitas] = useState<ColheitaRecord[]>([]);
  const [panhadoresAtivos, setPanhadoresAtivos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheReady, setCacheReady] = useState<boolean | null>(null);
  const { user, selectedCompany, signOut } = useAuth();
  const { isOnline, syncing, syncPendingData } = useOfflineSync();
  const [pendingCounts, setPendingCounts] = useState(() => getPendingCounts());
  const navigate = useNavigate();
  const location = useLocation();
  const [lancamentoDialogOpen, setLancamentoDialogOpen] = useState(false);

  const totalPendentes = pendingCounts.colheitas + pendingCounts.panhadores;

  const loadStats = async () => {
    if (!user || !selectedCompany) {
      setColheitas([]);
      setPanhadoresAtivos(0);
      setLoading(false);
      return;
    }

    const statsCacheKey = cacheKey("dashboard_stats", selectedCompany.id);

    const cached = readJson<{ cachedAt?: string; colheitas: ColheitaRecord[]; panhadoresAtivos: number } | null>(
      statsCacheKey,
      null,
    );

    const hasCached = Boolean(cached?.colheitas?.length || cached?.panhadoresAtivos != null);

    // Always hydrate from cache first for fast navigation (especially offline).
    if (cached?.colheitas) {
      setColheitas(cached.colheitas);
      setPanhadoresAtivos(cached.panhadoresAtivos ?? 0);
      setLoading(false);
    }

    // Offline: don't even try Supabase (it can hang/time out and makes the app feel slow).
    if (!navigator.onLine) {
      setLoading(!hasCached);
      return;
    }

    // Online: refresh in background with a short timeout.
    setRefreshing(true);

    try {
      const [{ data: colheitasData, error: colheitasError }, { data: panhadoresData, error: panhadoresError }] =
        await Promise.race([
          Promise.all([
            supabase
              .from("colheitas")
              .select("id, codigo, peso_kg, quantidade_balaios, valor_total, data_colheita, numero_bag, panhadores!inner(id, nome)")
              .eq("empresa_id", selectedCompany.id)
              .order("data_colheita", { ascending: false }),
            supabase
              .from("panhadores")
              .select("id")
              .eq("empresa_id", selectedCompany.id)
              .eq("ativo", true),
          ]),
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error("Timeout ao carregar dashboard")), 6000),
          ),
        ]);

      if (colheitasError) throw colheitasError;
      if (panhadoresError) throw panhadoresError;

      const normalizedColheitas: ColheitaRecord[] = (colheitasData ?? []).map((colheita) => ({
        id: colheita.id,
        codigo: colheita.codigo,
        peso_kg: Number(colheita.peso_kg) || 0,
        quantidade_balaios: colheita.quantidade_balaios != null ? Number(colheita.quantidade_balaios) : null,
        valor_total: colheita.valor_total != null ? Number(colheita.valor_total) : null,
        data_colheita: colheita.data_colheita,
        numero_bag: colheita.numero_bag,
        panhador: {
          id: (colheita.panhadores as { id: string }).id,
          nome: (colheita.panhadores as { nome: string }).nome || "Desconhecido",
        },
      }));

      setColheitas(normalizedColheitas);
      setPanhadoresAtivos(panhadoresData?.length ?? 0);

      writeJson(statsCacheKey, {
        cachedAt: new Date().toISOString(),
        colheitas: normalizedColheitas,
        panhadoresAtivos: panhadoresData?.length ?? 0,
      });
    } catch (error) {
      console.error("Erro ao carregar estatísticas:", error);

      // Keep cached data if we have it; avoid spamming toasts on every Dashboard visit.
      if (!hasCached) {
        toast({
          title: "Erro ao carregar dados",
          description: "Tente novamente mais tarde",
          variant: "destructive",
        });
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const health = await checkPwaCacheHealth();
        if (cancelled) return;
        setCacheReady(health.ready);
      } catch {
        if (cancelled) return;
        setCacheReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  useEffect(() => {
    setPendingCounts(getPendingCounts());
  }, [isOnline, syncing, lancamentoDialogOpen, selectedCompany?.id]);

  const handleSync = async () => {
    try {
      await syncPendingData();
      setPendingCounts(getPendingCounts());
    } catch (error) {
      console.error("Erro na sincronização:", error);
      toast({
        title: "Não foi possível sincronizar",
        description: "Verifique a conexão e tente novamente",
        variant: "destructive",
      });
    } finally {
      await loadStats();
      setPendingCounts(getPendingCounts());
    }
  };

  const totalColheita = useMemo(() => colheitas.reduce((sum, item) => sum + item.peso_kg, 0), [colheitas]);
  const totalValor = useMemo(
    () => colheitas.reduce((sum, item) => sum + (item.valor_total ?? 0), 0),
    [colheitas],
  );
  const colheitasCount = colheitas.length;
  const mediaPorLancamento = useMemo(() => {
    if (!colheitasCount) return 0;
    return totalColheita / colheitasCount;
  }, [colheitasCount, totalColheita]);
  const colheitasComValor = useMemo(() => colheitas.filter((item) => item.valor_total != null).length, [colheitas]);
  const colheitasPendentes = colheitasCount - colheitasComValor;

  const ultimasColheitas = useMemo(
    () => [...colheitas].sort((a, b) => new Date(b.data_colheita).getTime() - new Date(a.data_colheita).getTime()).slice(0, 5),
    [colheitas],
  );

  const colheitasSeries = useMemo(() => {
    const grouped = new Map<string, number>();

    colheitas.forEach((colheita) => {
      const dayKey = new Date(colheita.data_colheita).toISOString().split("T")[0];
      grouped.set(dayKey, (grouped.get(dayKey) || 0) + colheita.peso_kg);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([day, total]) => ({
        day,
        label: new Date(day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        kg: Number(total.toFixed(2)),
      }));
  }, [colheitas]);

  const bagsDistribuicao = useMemo(() => {
    const grouped = new Map<string, number>();

    colheitas.forEach((colheita) => {
      const bag = colheita.numero_bag?.trim() || "Sem bag";
      grouped.set(bag, (grouped.get(bag) || 0) + colheita.peso_kg);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([bag, peso]) => ({
        bag,
        peso: Number(peso.toFixed(2)),
      }));
  }, [colheitas]);

  const rankingPanhadores = useMemo(() => {
    const grouped = new Map<string, { nome: string; total: number }>();

    colheitas.forEach((colheita) => {
      const current = grouped.get(colheita.panhador.id) || {
        nome: colheita.panhador.nome,
        total: 0,
      };
      current.total += colheita.peso_kg;
      grouped.set(colheita.panhador.id, current);
    });

    const ordered = Array.from(grouped.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const leader = ordered[0]?.total || 1;

    return ordered.map((item, index) => ({
      ...item,
      position: index + 1,
      percent: Math.round((item.total / leader) * 100),
    }));
  }, [colheitas]);

  const uniqueBagsCount = useMemo(() => {
    const bags = new Set(colheitas.map((colheita) => colheita.numero_bag?.trim() || "Sem bag"));
    return bags.size || 0;
  }, [colheitas]);

  const mediaPorBag = useMemo(() => {
    if (!uniqueBagsCount) return 0;
    return totalColheita / uniqueBagsCount;
  }, [uniqueBagsCount, totalColheita]);

  const donutData = useMemo(
    () => [
      { name: "Com valor", value: colheitasComValor },
      { name: "Pendentes", value: Math.max(colheitasPendentes, 0) },
      { name: "Bags únicos", value: uniqueBagsCount },
    ],
    [colheitasComValor, colheitasPendentes, uniqueBagsCount],
  );

  const quickLinks: QuickLink[] = [
    {
      label: "Panhadores",
      description: "Panhadores e equipes",
      icon: Users,
      action: () => navigate("/panhadores"),
      accent: "from-sky-50 to-white border-sky-100 text-sky-700",
    },
    {
      label: "Aparelhos",
      description: "Gestão de aparelhos",
      icon: Smartphone,
      action: () => navigate("/aparelhos"),
      accent: "from-violet-50 to-white border-violet-100 text-violet-700",
    },
    {
      label: "Movimentações",
      description: "Controle de entradas",
      icon: Clock3,
      action: () => navigate("/movimentacoes"),
      accent: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
    },
    {
      label: "Controle Financeiro",
      description: "Despesas e gastos",
      icon: Coins,
      action: () => navigate("/despesas"),
      accent: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
    },
    {
      label: "Propriedades",
      description: "Propriedades e lavouras",
      icon: MapPinned,
      action: () => navigate("/propriedades"),
      accent: "from-amber-50 to-white border-amber-100 text-amber-700",
    },
  ];

  const statsCards = [
    {
      label: "Volume",
      value: `${totalColheita.toFixed(2)} kg`,
      helper: "Atualizado automaticamente",
      icon: Coffee,
    },
    {
      label: "Receita",
      value: currencyFormatter.format(totalValor),
      helper: "Baseada em valores fechados",
      icon: TrendingUp,
    },
    {
      label: "Lançamentos",
      value: colheitasCount,
      helper: "No período mostrado",
      icon: NotebookPen,
    },
    {
      label: "Equipe",
      value: panhadoresAtivos,
      helper: "Panhadores ativos",
      icon: Users,
    },
    {
      label: "Bags únicos",
      value: uniqueBagsCount,
      helper: "No período mostrado",
      icon: Package,
    },
    {
      label: "Média / bag",
      value: `${mediaPorBag.toFixed(1)} kg`,
      helper: "Baseada em bags únicos",
      icon: Coffee,
    },
    {
      label: "Média / lançamento",
      value: `${mediaPorLancamento.toFixed(1)} kg`,
      helper: "Peso médio por registro",
      icon: Coffee,
    },
    {
      label: "Com valor",
      value: colheitasComValor,
      helper: "Registros fechados",
      icon: Coins,
    },
    {
      label: "Pendentes",
      value: Math.max(colheitasPendentes, 0),
      helper: "Aguardando valor",
      icon: Clock3,
    },
  ];

  const sidebarItems = useMemo<NavigationItem[]>(
    () => [
      ...navigationItems,
      ...(isOnline
        ? ([
            {
              label: "Sair do sistema",
              icon: LogOut,
              action: signOut,
            },
          ] as NavigationItem[])
        : []),
    ],
    [isOnline, signOut],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(210_45%_96%)]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(210_45%_97%)] text-foreground">
      <div className="flex w-full">
        <aside className="sticky top-0 hidden min-h-screen w-64 flex-col bg-[hsl(26_25%_15%)] px-6 py-10 text-[hsl(38_45%_95%)] lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-[hsl(196_65%_45%)]/90 p-3">
                <Coffee className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-wide">Safra Café</p>
                <p className="text-xs uppercase tracking-[0.3em] text-[hsl(154_45%_65%)]">painel</p>
              </div>
            </div>
            <div className="mt-8 rounded-2xl bg-white/10 p-4 text-sm shadow-coffee/20">
              <p className="text-xs uppercase tracking-[0.4em] text-white/70">empresa</p>
              <p className="mt-1 text-lg font-semibold">
                {selectedCompany ? selectedCompany.nome : "Selecione uma empresa"}
              </p>
              <p className="text-sm text-white/70 break-words">
                {user?.email ?? "Usuário sem e-mail"}
              </p>
            </div>
          </div>
          <nav className="mt-10 flex-1 space-y-2">
            {sidebarItems.map((item) => {
              const isActive = item.route && location.pathname === item.route;
              return (
                <button
                  key={item.label}
                  onClick={() => (item.action ? item.action() : item.route && navigate(item.route))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-smooth",
                    isActive ? "bg-white/15 text-white shadow-coffee" : "text-white/70 hover:bg-white/10",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <Navbar />
          <main className="px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
          <section className="grid gap-4 sm:gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader className="flex flex-col gap-4 pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:items-center sm:gap-2">
                      <span className="hidden w-fit items-center justify-center rounded-full bg-[hsl(204_70%_94%)] px-4 py-1 text-xs font-semibold text-[hsl(204_65%_32%)] sm:inline-flex">
                        Painel rápido
                      </span>

                      <div className="flex items-center justify-center gap-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 sm:px-3 sm:py-1 sm:text-xs">
                        <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                        {isOnline ? "Online" : "Offline"}
                      </div>

                      <div className="flex items-center justify-center gap-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 sm:px-3 sm:py-1 sm:text-xs">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            cacheReady === null ? "bg-slate-400" : cacheReady ? "bg-emerald-500" : "bg-amber-500",
                          )}
                        />
                        {cacheReady === null ? "Checando cache" : cacheReady ? "Cache OK" : "Cache pendente"}
                      </div>

                      <span className="col-span-2 mt-0.5 flex items-center justify-end font-mono text-[9px] text-muted-foreground sm:col-span-1 sm:mt-0 sm:justify-center sm:text-xs">
                        v{__APP_VERSION__}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={handleSync}
                    disabled={!isOnline || syncing}
                    size="icon"
                    className="hidden h-9 w-9 rounded-full bg-[hsl(196_65%_45%)] text-white hover:bg-[hsl(196_65%_40%)] sm:inline-flex"
                    aria-label={totalPendentes > 0 ? `Sincronizar (${totalPendentes} pendentes)` : "Sincronizar"}
                    title={totalPendentes > 0 ? `Sincronizar (${totalPendentes} pendentes)` : "Sincronizar"}
                  >
                    <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {quickLinks.map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className={cn(
                        "flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border bg-gradient-to-br px-3 py-3 text-center text-sm transition hover:-translate-y-0.5 sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:px-4 sm:text-left",
                        item.accent,
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="leading-tight">
                        <p className="font-semibold text-[hsl(24_25%_20%)]">{item.label}</p>
                        <p className="hidden text-xs text-muted-foreground sm:block">{item.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-base sm:text-lg">Últimas colheitas</CardTitle>
                <CardDescription className="text-xs">Atualizado em tempo real</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-2 sm:max-h-[360px]">
                  {ultimasColheitas.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground">Nenhuma colheita registrada ainda.</p>
                  )}
                  {ultimasColheitas.map((colheita) => (
                    <div key={colheita.id} className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        <span className="font-mono">#{colheita.codigo}</span>
                        <span className="font-mono tabular-nums text-foreground">
                          {timeFormatter.format(new Date(colheita.data_colheita))}
                        </span>
                      </div>

                      <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[hsl(24_25%_25%)]">{colheita.panhador.nome}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-[hsl(24_35%_30%)]">{colheita.peso_kg.toFixed(2)} kg</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {colheita.quantidade_balaios != null ? `${colheita.quantidade_balaios.toFixed(2)} balaios` : "- balaios"}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {colheita.quantidade_balaios && colheita.quantidade_balaios > 0
                              ? `Média ${(colheita.peso_kg / colheita.quantidade_balaios).toFixed(2)} kg/balaio`
                              : "Média -"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                            {colheita.valor_total != null ? currencyFormatter.format(colheita.valor_total) : "Valor pendente"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 text-[hsl(24_35%_30%)]">
                          <Calendar className="h-3 w-3" />
                          <span className="tabular-nums">
                            {new Date(colheita.data_colheita).toLocaleDateString("pt-BR")}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
            {statsCards.map((stat) => (
              <Card key={stat.label} className="rounded-2xl border border-slate-100 bg-white/90 shadow-coffee">
                <CardContent className="flex flex-col gap-1.5 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                    <span className="truncate">{stat.label}</span>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <p
                    className="truncate font-display text-base leading-tight text-[hsl(24_30%_25%)] sm:text-xl"
                    title={String(stat.value)}
                  >
                    {stat.value}
                  </p>
                  <p className="hidden text-[11px] text-muted-foreground sm:block">{stat.helper}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          {!isOnline && (
            <Card className="mt-6 border border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-2 py-4 text-amber-700">
                <span className="text-lg">📡</span>
                <p className="text-sm">Modo offline: os dados serão sincronizados assim que a conexão voltar.</p>
              </CardContent>
            </Card>
          )}

          <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-3">
            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader>
                <CardTitle className="font-display text-lg sm:text-xl">Volume diário</CardTitle>
                <CardDescription>Kg registrados por dia</CardDescription>
              </CardHeader>
              <CardContent>
                {colheitasSeries.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Cadastre colheitas para visualizar este gráfico.</p>
                ) : (
                  <ChartContainer
                    config={{ kg: { label: "Total colhido", color: "hsl(196,65%,40%)" } }}
                    className="!aspect-auto h-[200px] w-full overflow-visible sm:h-[260px]"
                  >
                    <AreaChart data={colheitasSeries} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colheitaFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor="hsl(196,65%,40%)" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="hsl(196,65%,40%)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <Area type="monotone" dataKey="kg" stroke="hsl(196,65%,40%)" strokeWidth={3} fill="url(#colheitaFill)" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-lg sm:text-xl">Total por bag</CardTitle>
                    <CardDescription>Distribuição das pesagens</CardDescription>
                  </div>
                  <Package className="h-5 w-5 text-[hsl(152_45%_40%)]" />
                </div>
              </CardHeader>
              <CardContent>
                {bagsDistribuicao.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nenhum bag registrado ainda.</p>
                ) : (
                  <ChartContainer
                    config={{ peso: { label: "Peso", color: "hsl(152,45%,40%)" } }}
                    className="!aspect-auto h-[200px] w-full overflow-visible sm:h-[260px]"
                  >
                    <BarChart data={bagsDistribuicao}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="bag" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                      <Bar dataKey="peso" radius={[12, 12, 0, 0]} fill="hsl(152,45%,40%)" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee overflow-hidden">
              <CardHeader>
                <CardTitle className="font-display text-lg sm:text-xl">Resumo geral</CardTitle>
                <CardDescription>Proporção de registros</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-5">
                {donutData.every((item) => item.value === 0) ? (
                  <p className="text-sm text-muted-foreground">Ainda não há dados suficientes.</p>
                ) : (
                  <ChartContainer
                    config={{ value: { label: "Registros", color: "hsl(24,45%,45%)" } }}
                    className="!aspect-auto h-44 w-full max-w-[240px] overflow-visible sm:h-48 sm:max-w-[260px]"
                  >
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                        {donutData.map((entry, index) => (
                          <Cell key={entry.name} fill={donutColors[index % donutColors.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                )}
                <div className="grid w-full gap-2 text-xs sm:text-sm">
                  {donutData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 sm:py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: donutColors[index % donutColors.length] }}></span>
                        {item.name}
                      </div>
                      <span className="font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader>
                <CardTitle className="font-display text-lg sm:text-xl">Ranking de panhadores</CardTitle>
                <CardDescription>Top 5 por volume colhido</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {rankingPanhadores.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">Registre colheitas para ver o ranking.</p>
                )}
                {rankingPanhadores.map((item) => (
                  <div key={item.nome} className="rounded-2xl border border-slate-100 p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(196_65%_45%)]/10 text-sm font-semibold text-[hsl(196_65%_35%)] sm:h-10 sm:w-10">
                        {item.position}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[hsl(24_25%_25%)]">{item.nome}</p>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[hsl(196_65%_45%)]" style={{ width: `${item.percent}%` }}></div>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-[hsl(24_35%_30%)]">{item.total.toFixed(2)} kg</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
              <CardHeader>
                <CardTitle className="font-display text-lg sm:text-xl">Resumo de bags</CardTitle>
                <CardDescription>Média e principais bolsas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Média por bag</p>
                  <p className="font-display text-2xl text-[hsl(24_35%_25%)] sm:text-3xl">{mediaPorBag.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">{uniqueBagsCount} bags registrados</p>
                </div>
                <div className="space-y-3">
                  {bagsDistribuicao.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ainda não há bags suficientes para listar.</p>
                  )}
                  {bagsDistribuicao.map((bag) => (
                    <div key={bag.bag} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-1.5 text-xs sm:py-2 sm:text-sm">
                      <div>
                        <p className="font-semibold text-[hsl(24_35%_25%)]">Bag {bag.bag}</p>
                        <p className="text-xs text-muted-foreground">Volume acumulado</p>
                      </div>
                      <span className="font-mono text-[hsl(152_45%_35%)]">{bag.peso.toFixed(2)} kg</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
          </main>
        </div>
      </div>
      <LancamentoDialog
        open={lancamentoDialogOpen}
        onOpenChange={setLancamentoDialogOpen}
        onCreated={loadStats}
      />
    </div>
  );
}
