import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getDeviceLancamentoSettings } from "@/lib/deviceSettings";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type ColheitaResumo = {
  peso_kg: number;
  quantidade_balaios: number | null;
  data_colheita: string;
  propriedade_id: string;
  lavoura_id: string;
};

export default function PropriedadesLavouras() {
  const { user, selectedCompany } = useAuth();

  const [loadingPropriedades, setLoadingPropriedades] = useState(false);
  const [loadingLavouras, setLoadingLavouras] = useState(false);

  const [propriedades, setPropriedades] = useState<Tables<"propriedades">[]>([]);
  const [lavouras, setLavouras] = useState<Tables<"lavouras">[]>([]);

  const [showInativos, setShowInativos] = useState(false);

  const [availableSafras, setAvailableSafras] = useState<number[]>([]);
  const [selectedSafra, setSelectedSafra] = useState<number>(() => new Date().getFullYear());
  const [loadingProducao, setLoadingProducao] = useState(false);
  const [colheitasSafra, setColheitasSafra] = useState<ColheitaResumo[]>([]);
  const [kgPorBalaioConfig, setKgPorBalaioConfig] = useState<number>(15);
  const [kgPorLitroConfig, setKgPorLitroConfig] = useState<number>(1);

  const [propriedadeModalOpen, setPropriedadeModalOpen] = useState(false);
  const [propriedadeEditing, setPropriedadeEditing] = useState<Tables<"propriedades"> | null>(null);
  const [propNome, setPropNome] = useState<string>("");
  const [propEndereco, setPropEndereco] = useState<string>("");
  const [propSaving, setPropSaving] = useState(false);

  const [lavouraModalOpen, setLavouraModalOpen] = useState(false);
  const [lavouraEditing, setLavouraEditing] = useState<Tables<"lavouras"> | null>(null);
  const [lavouraTargetPropriedade, setLavouraTargetPropriedade] = useState<Tables<"propriedades"> | null>(null);
  const [lavNome, setLavNome] = useState<string>("");
  const [lavQuantidade, setLavQuantidade] = useState<string>("");
  const [lavSaving, setLavSaving] = useState(false);

  const lavourasPorPropriedade = useMemo(() => {
    const map = new Map<string, Tables<"lavouras">[]>();
    (lavouras ?? []).forEach((lavoura) => {
      const key = lavoura.propriedade_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lavoura);
    });
    return map;
  }, [lavouras]);

  const resetPropriedadeForm = () => {
    setPropriedadeEditing(null);
    setPropNome("");
    setPropEndereco("");
  };

  const resetLavouraForm = () => {
    setLavouraEditing(null);
    setLavouraTargetPropriedade(null);
    setLavNome("");
    setLavQuantidade("");
  };

  const looksLikeMissingSchema = (error: unknown) => {
    const message = (error as { message?: string }).message?.toLowerCase() ?? "";
    const code = (error as { code?: string }).code;
    return code === "42P01" || message.includes("relation") || message.includes("does not exist") || message.includes("not found");
  };

  const getSafraFromDate = (value: string | null | undefined) => {
    if (!value) return null;
    const match = /^\d{4}/.exec(value);
    if (!match) return null;
    const year = Number(match[0]);
    return Number.isFinite(year) ? year : null;
  };

  const loadSafras = async () => {
    if (!user || !selectedCompany) {
      setAvailableSafras([]);
      setSelectedSafra(new Date().getFullYear());
      return;
    }

    try {
      const { data, error } = await supabase
        .from("colheitas")
        .select("data_colheita")
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      const years = new Set<number>();
      (data ?? []).forEach((row: { data_colheita?: string | null }) => {
        const year = getSafraFromDate(row.data_colheita ?? null);
        if (year) years.add(year);
      });

      const list = Array.from(years.values()).sort((a, b) => b - a);
      setAvailableSafras(list);

      const currentYear = new Date().getFullYear();
      if (list.includes(selectedSafra)) return;
      if (list.includes(currentYear)) {
        setSelectedSafra(currentYear);
      } else if (list.length) {
        setSelectedSafra(list[0]);
      } else {
        setSelectedSafra(currentYear);
      }
    } catch (error) {
      console.error("Erro ao carregar safras:", error);
      setAvailableSafras([]);
    }
  };

  const loadConversoes = async () => {
    if (!user || !selectedCompany) return;
    try {
      const device = getDeviceLancamentoSettings(selectedCompany.id);
      const deviceKgBalaio =
        device.kg_por_balaio_padrao != null && Number.isFinite(Number(device.kg_por_balaio_padrao))
          ? Number(device.kg_por_balaio_padrao)
          : null;
      const deviceKgLitro =
        device.kg_por_litro != null && Number.isFinite(Number(device.kg_por_litro)) && Number(device.kg_por_litro) > 0
          ? Number(device.kg_por_litro)
          : null;

      if (deviceKgBalaio != null && deviceKgBalaio > 0) {
        setKgPorBalaioConfig(deviceKgBalaio);
        setKgPorLitroConfig(deviceKgLitro ?? 1);
        return;
      }

      const { data, error } = await supabase
        .from("empresas_config")
        .select("kg_por_balaio, kg_por_litro")
        .eq("empresa_id", selectedCompany.id)
        .maybeSingle();

      if (error) throw error;

      const kgBalaio = data?.kg_por_balaio != null ? Number(data.kg_por_balaio) : 15;
      const kgLitro = (data as { kg_por_litro?: number | null } | null)?.kg_por_litro;

      setKgPorBalaioConfig(Number.isFinite(kgBalaio) && kgBalaio > 0 ? kgBalaio : 15);
      setKgPorLitroConfig(kgLitro != null && Number.isFinite(Number(kgLitro)) && Number(kgLitro) > 0 ? Number(kgLitro) : 1);
    } catch (err) {
      console.error("Erro ao carregar conversões:", err);
      setKgPorBalaioConfig(15);
      setKgPorLitroConfig(1);
    }
  };

  const loadColheitasSafra = async (safra: number) => {
    if (!user || !selectedCompany) {
      setColheitasSafra([]);
      setLoadingProducao(false);
      return;
    }

    const start = `${safra}-01-01`;
    const end = `${safra}-12-31`;

    setLoadingProducao(true);
    try {
      const { data, error } = await supabase
        .from("colheitas")
        .select("peso_kg, quantidade_balaios, data_colheita, propriedade_id, lavoura_id")
        .eq("empresa_id", selectedCompany.id)
        .gte("data_colheita", start)
        .lte("data_colheita", end);

      if (error) throw error;

      const normalized: ColheitaResumo[] = (
        (data ?? []) as Array<{
          peso_kg: number;
          quantidade_balaios: number | null;
          data_colheita: string;
          propriedade_id: string;
          lavoura_id: string;
        }>
      ).map((row) => ({
        peso_kg: Number(row.peso_kg) || 0,
        quantidade_balaios: row.quantidade_balaios != null ? Number(row.quantidade_balaios) : null,
        data_colheita: String(row.data_colheita),
        propriedade_id: String(row.propriedade_id),
        lavoura_id: String(row.lavoura_id),
      }));

      setColheitasSafra(normalized);
    } catch (error) {
      console.error("Erro ao carregar colheitas da safra:", error);
      toast({ title: "Erro", description: "Não foi possível carregar produção da safra.", variant: "destructive" });
      setColheitasSafra([]);
    } finally {
      setLoadingProducao(false);
    }
  };

  const loadPropriedades = async () => {
    if (!user || !selectedCompany) {
      setPropriedades([]);
      setLoadingPropriedades(false);
      return;
    }

    setLoadingPropriedades(true);
    try {
      const { data, error } = await supabase
        .from("propriedades")
        .select("id, empresa_id, nome, endereco, ativo, created_at, updated_at")
        .eq("empresa_id", selectedCompany.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (looksLikeMissingSchema(error)) {
          toast({
            title: "Banco sem suporte a propriedades/lavouras",
            description: "Aplique a migration de propriedades/lavouras no Supabase.",
            variant: "destructive",
          });
          setPropriedades([]);
          return;
        }
        throw error;
      }

      const list = (data ?? []) as Tables<"propriedades">[];
      setPropriedades(list);
    } catch (error) {
      console.error("Erro ao carregar propriedades:", error);
      toast({ title: "Erro", description: "Não foi possível carregar propriedades.", variant: "destructive" });
      setPropriedades([]);
    } finally {
      setLoadingPropriedades(false);
    }
  };

  const loadLavouras = async () => {
    if (!user || !selectedCompany) {
      setLavouras([]);
      setLoadingLavouras(false);
      return;
    }

    setLoadingLavouras(true);
    try {
      const { data, error } = await supabase
        .from("lavouras")
        .select("id, empresa_id, propriedade_id, nome, quantidade_pe_de_cafe, ativo, created_at, updated_at")
        .eq("empresa_id", selectedCompany.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (looksLikeMissingSchema(error)) {
          setLavouras([]);
          return;
        }
        throw error;
      }

      setLavouras((data ?? []) as Tables<"lavouras">[]);
    } catch (error) {
      console.error("Erro ao carregar lavouras:", error);
      toast({ title: "Erro", description: "Não foi possível carregar lavouras.", variant: "destructive" });
      setLavouras([]);
    } finally {
      setLoadingLavouras(false);
    }
  };

  useEffect(() => {
    loadPropriedades();
    loadLavouras();
    loadSafras();
    loadConversoes();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    if (!user || !selectedCompany) return;
    loadColheitasSafra(selectedSafra);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedCompany?.id, selectedSafra]);

  const openCreatePropriedade = () => {
    resetPropriedadeForm();
    setPropriedadeModalOpen(true);
  };

  const openEditPropriedade = (item: Tables<"propriedades">) => {
    setPropriedadeEditing(item);
    setPropNome(item.nome ?? "");
    setPropEndereco(item.endereco ?? "");
    setPropriedadeModalOpen(true);
  };

  const savePropriedade = async () => {
    if (!user || !selectedCompany) {
      toast({ title: "Selecione uma empresa", description: "Escolha a empresa antes de cadastrar/editar.", variant: "destructive" });
      return;
    }

    setPropSaving(true);
    try {
      const nome = propNome.trim();
      const endereco = propEndereco.trim();

      if (!propriedadeEditing) {
        const payload: TablesInsert<"propriedades"> = {
          empresa_id: selectedCompany.id,
          nome: nome ? nome : null,
          endereco: endereco ? endereco : null,
          ativo: true,
        };

        const { data, error } = await supabase
          .from("propriedades")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;

        toast({ title: "Propriedade cadastrada", description: "Registro criado com sucesso." });
        resetPropriedadeForm();
        setPropriedadeModalOpen(false);
        await loadPropriedades();
      } else {
        const payload: TablesUpdate<"propriedades"> = {
          nome: nome ? nome : null,
          endereco: endereco ? endereco : null,
        };

        const { error } = await supabase
          .from("propriedades")
          .update(payload)
          .eq("id", propriedadeEditing.id)
          .eq("empresa_id", selectedCompany.id);

        if (error) throw error;

        toast({ title: "Propriedade atualizada", description: "Alterações salvas." });
        resetPropriedadeForm();
        setPropriedadeModalOpen(false);
        await loadPropriedades();
      }
    } catch (error) {
      console.error("Erro ao salvar propriedade:", error);
      toast({ title: "Erro", description: "Não foi possível salvar a propriedade.", variant: "destructive" });
    } finally {
      setPropSaving(false);
    }
  };

  const openCreateLavoura = (propriedade: Tables<"propriedades">) => {
    resetLavouraForm();
    setLavouraTargetPropriedade(propriedade);
    setLavQuantidade("0");
    setLavouraModalOpen(true);
  };

  const openEditLavoura = (propriedade: Tables<"propriedades">, item: Tables<"lavouras">) => {
    setLavouraTargetPropriedade(propriedade);
    setLavouraEditing(item);
    setLavNome(item.nome ?? "");
    const qtd = item.quantidade_pe_de_cafe != null ? String(item.quantidade_pe_de_cafe) : "0";
    setLavQuantidade(qtd);
    setLavouraModalOpen(true);
  };

  const saveLavoura = async () => {
    if (!user || !selectedCompany) {
      toast({ title: "Selecione uma empresa", description: "Escolha a empresa antes de cadastrar/editar.", variant: "destructive" });
      return;
    }

    if (!lavouraTargetPropriedade) {
      toast({ title: "Selecione uma propriedade", description: "Escolha a propriedade para cadastrar lavouras.", variant: "destructive" });
      return;
    }

    const nome = lavNome.trim();
    if (nome.length < 2) {
      toast({ title: "Nome inválido", description: "Informe um nome de lavoura (mínimo 2 caracteres).", variant: "destructive" });
      return;
    }

    const parsedQuantidade = lavQuantidade.trim() ? Number(lavQuantidade) : 0;
    if (!Number.isFinite(parsedQuantidade) || parsedQuantidade < 0 || !Number.isInteger(parsedQuantidade)) {
      toast({ title: "Quantidade inválida", description: "Quantidade de pés deve ser um inteiro maior ou igual a zero.", variant: "destructive" });
      return;
    }

    setLavSaving(true);
    try {
      if (!lavouraEditing) {
        const payload: TablesInsert<"lavouras"> = {
          empresa_id: selectedCompany.id,
          propriedade_id: lavouraTargetPropriedade.id,
          nome,
          quantidade_pe_de_cafe: parsedQuantidade,
          ativo: true,
        };

        const { error } = await supabase.from("lavouras").insert(payload);
        if (error) throw error;

        toast({ title: "Lavoura cadastrada", description: "Registro criado com sucesso." });
        resetLavouraForm();
        setLavouraModalOpen(false);
        await loadLavouras();
      } else {
        const payload: TablesUpdate<"lavouras"> = {
          nome,
          quantidade_pe_de_cafe: parsedQuantidade,
        };

        const { error } = await supabase
          .from("lavouras")
          .update(payload)
          .eq("id", lavouraEditing.id)
          .eq("empresa_id", selectedCompany.id);

        if (error) throw error;

        toast({ title: "Lavoura atualizada", description: "Alterações salvas." });
        resetLavouraForm();
        setLavouraModalOpen(false);
        await loadLavouras();
      }
    } catch (error) {
      console.error("Erro ao salvar lavoura:", error);
      toast({ title: "Erro", description: "Não foi possível salvar a lavoura.", variant: "destructive" });
    } finally {
      setLavSaving(false);
    }
  };

  const togglePropriedadeAtivo = async (item: Tables<"propriedades">) => {
    if (!selectedCompany) return;
    const currentAtivo = (item as unknown as { ativo?: boolean }).ativo !== false;
    const nextAtivo = !currentAtivo;

    try {
      const { error } = await supabase
        .from("propriedades")
        .update({ ativo: nextAtivo } satisfies TablesUpdate<"propriedades">)
        .eq("id", item.id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      toast({
        title: nextAtivo ? "Propriedade ativada" : "Propriedade inativada",
        description: "Status atualizado.",
      });
      await loadPropriedades();
      await loadLavouras();
    } catch (error) {
      console.error("Erro ao alterar status da propriedade:", error);
      toast({ title: "Erro", description: "Não foi possível alterar o status da propriedade.", variant: "destructive" });
    }
  };

  const toggleLavouraAtivo = async (item: Tables<"lavouras">) => {
    if (!selectedCompany) return;
    const currentAtivo = (item as unknown as { ativo?: boolean }).ativo !== false;
    const nextAtivo = !currentAtivo;

    try {
      const { error } = await supabase
        .from("lavouras")
        .update({ ativo: nextAtivo } satisfies TablesUpdate<"lavouras">)
        .eq("id", item.id)
        .eq("empresa_id", selectedCompany.id);

      if (error) throw error;

      toast({
        title: nextAtivo ? "Lavoura ativada" : "Lavoura inativada",
        description: "Status atualizado.",
      });
      await loadLavouras();
    } catch (error) {
      console.error("Erro ao alterar status da lavoura:", error);
      toast({ title: "Erro", description: "Não foi possível alterar o status da lavoura.", variant: "destructive" });
    }
  };

  const propriedadesFiltradas = useMemo(() => {
    const list = propriedades ?? [];
    if (showInativos) return list;
    return list.filter((p) => (p as unknown as { ativo?: boolean }).ativo !== false);
  }, [propriedades, showInativos]);

  const lavourasFiltradas = useMemo(() => {
    const list = lavouras ?? [];
    if (showInativos) return list;
    return list.filter((l) => (l as unknown as { ativo?: boolean }).ativo !== false);
  }, [lavouras, showInativos]);

  const lavourasPorPropriedadeFiltradas = useMemo(() => {
    const map = new Map<string, Tables<"lavouras">[]>();
    (lavourasFiltradas ?? []).forEach((lavoura) => {
      const key = lavoura.propriedade_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lavoura);
    });
    return map;
  }, [lavourasFiltradas]);

  const producaoPorLavoura = useMemo(() => {
    const map = new Map<string, number>();
    (colheitasSafra ?? []).forEach((c) => {
      map.set(c.lavoura_id, (map.get(c.lavoura_id) ?? 0) + (Number(c.peso_kg) || 0));
    });
    return map;
  }, [colheitasSafra]);

  const balaiosPorLavoura = useMemo(() => {
    const map = new Map<string, number>();
    (colheitasSafra ?? []).forEach((c) => {
      const fromField = c.quantidade_balaios;
      const fallback = kgPorBalaioConfig ? (Number(c.peso_kg) || 0) / kgPorBalaioConfig : 0;
      const balaios = fromField != null ? Number(fromField) || 0 : fallback;
      map.set(c.lavoura_id, (map.get(c.lavoura_id) ?? 0) + balaios);
    });
    return map;
  }, [colheitasSafra, kgPorBalaioConfig]);

  const producaoPorPropriedade = useMemo(() => {
    const map = new Map<string, number>();
    (colheitasSafra ?? []).forEach((c) => {
      map.set(c.propriedade_id, (map.get(c.propriedade_id) ?? 0) + (Number(c.peso_kg) || 0));
    });
    return map;
  }, [colheitasSafra]);

  const balaiosPorPropriedade = useMemo(() => {
    const map = new Map<string, number>();
    (colheitasSafra ?? []).forEach((c) => {
      const fromField = c.quantidade_balaios;
      const fallback = kgPorBalaioConfig ? (Number(c.peso_kg) || 0) / kgPorBalaioConfig : 0;
      const balaios = fromField != null ? Number(fromField) || 0 : fallback;
      map.set(c.propriedade_id, (map.get(c.propriedade_id) ?? 0) + balaios);
    });
    return map;
  }, [colheitasSafra, kgPorBalaioConfig]);

  const pesPorPropriedade = useMemo(() => {
    const map = new Map<string, number>();
    lavourasFiltradas.forEach((l) => {
      map.set(l.propriedade_id, (map.get(l.propriedade_id) ?? 0) + (Number(l.quantidade_pe_de_cafe) || 0));
    });
    return map;
  }, [lavourasFiltradas]);

  const formatKg = (value: number) => {
    const v = Number.isFinite(value) ? value : 0;
    return `${v.toFixed(2)} kg`;
  };

  const formatKgPorPe = (kg: number, pes: number) => {
    if (!pes) return "—";
    const v = kg / pes;
    return `${v.toFixed(4)} kg/pé`;
  };

  const formatBalaios = (balaios: number) => {
    const v = Number.isFinite(balaios) ? balaios : 0;
    return v.toFixed(2);
  };

  const formatBalaiosPorPe = (balaios: number, pes: number) => {
    if (!pes) return "—";
    const v = (Number.isFinite(balaios) ? balaios : 0) / pes;
    return `${v.toFixed(4)} balaios/pé`;
  };

  const formatLitros = (kg: number) => {
    if (!kgPorLitroConfig) return "—";
    const v = kg / kgPorLitroConfig;
    return v.toFixed(2);
  };

  const formatLitrosPorPe = (kg: number, pes: number) => {
    if (!pes || !kgPorLitroConfig) return "—";
    const v = (kg / kgPorLitroConfig) / pes;
    return `${v.toFixed(4)} L/pé`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-4 space-y-4 sm:py-6 sm:space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Propriedades e Lavouras</h1>
            <p className="text-sm text-muted-foreground">
              Visualize as propriedades e as lavouras vinculadas. Cadastre/edite usando os botões.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Safra</span>
              <Select value={String(selectedSafra)} onValueChange={(v) => setSelectedSafra(Number(v))}>
                <SelectTrigger className="w-[120px] sm:w-[140px]">
                  <SelectValue placeholder="Safra" />
                </SelectTrigger>
                <SelectContent>
                  {(availableSafras.length ? availableSafras : [new Date().getFullYear()]).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              variant={showInativos ? "default" : "outline"}
              onClick={() => setShowInativos((v) => !v)}
            >
              {showInativos ? "Mostrando inativos" : "Ocultar inativos"}
            </Button>
            <Button type="button" size="sm" onClick={openCreatePropriedade} disabled={!selectedCompany}>
              Cadastrar propriedade
            </Button>
          </div>
        </div>

        {loadingPropriedades ? (
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">Carregando...</div>
        ) : propriedadesFiltradas.length === 0 ? (
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">Nenhuma propriedade cadastrada</div>
        ) : (
          <Card className="shadow-coffee">
            <CardHeader className="space-y-2">
              <CardTitle>Produção por safra</CardTitle>
              <CardDescription>
                {loadingProducao ? "Carregando produção..." : `Médias calculadas pela soma de lançamentos da safra ${selectedSafra}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:hidden">
                {propriedadesFiltradas.map((propriedade) => {
                  const propAtivo = (propriedade as unknown as { ativo?: boolean }).ativo !== false;
                  const sub = lavourasPorPropriedadeFiltradas.get(propriedade.id) ?? [];

                  const totalKgProp = producaoPorPropriedade.get(propriedade.id) ?? 0;
                  const totalBalaiosProp = balaiosPorPropriedade.get(propriedade.id) ?? 0;
                  const pesProp = pesPorPropriedade.get(propriedade.id) ?? 0;

                  return (
                    <div key={propriedade.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="min-w-0 truncate text-sm font-semibold">
                            {propriedade.nome ?? "(sem nome)"} {!propAtivo ? "(inativo)" : ""}
                          </p>
                          <p className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground">{propriedade.endereco ?? "—"}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-muted-foreground">Pés</p>
                          <p className="font-medium leading-none">{pesProp}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-muted-foreground">Produção</p>
                          <p className="font-medium leading-none truncate">{formatKg(totalKgProp)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-muted-foreground">kg/pé</p>
                          <p className="font-medium leading-none truncate">{formatKgPorPe(totalKgProp, pesProp)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-muted-foreground">Balaios</p>
                          <p className="font-medium leading-none truncate">{formatBalaios(totalBalaiosProp)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEditPropriedade(propriedade)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant={propAtivo ? "outline" : "default"}
                          size="sm"
                          onClick={() => togglePropriedadeAtivo(propriedade)}
                        >
                          {propAtivo ? "Inativar" : "Ativar"}
                        </Button>
                        <Button type="button" size="sm" onClick={() => openCreateLavoura(propriedade)}>
                          Cadastrar lavoura
                        </Button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Lavouras</p>
                        {loadingLavouras ? (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center text-xs text-muted-foreground">
                            Carregando lavouras...
                          </div>
                        ) : sub.length === 0 ? (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center text-xs text-muted-foreground">
                            Nenhuma lavoura cadastrada
                          </div>
                        ) : (
                          sub.map((lavoura) => {
                            const lavAtivo = (lavoura as unknown as { ativo?: boolean }).ativo !== false;
                            const totalKgLav = producaoPorLavoura.get(lavoura.id) ?? 0;
                            const totalBalaiosLav = balaiosPorLavoura.get(lavoura.id) ?? 0;
                            const pesLav = Number(lavoura.quantidade_pe_de_cafe) || 0;

                            return (
                              <div key={lavoura.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="min-w-0 truncate text-sm font-medium">
                                      {lavoura.nome} {!lavAtivo ? "(inativo)" : ""}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {pesLav} pés • {formatKg(totalKgLav)} • {formatBalaios(totalBalaiosLav)} balaios
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => openEditLavoura(propriedade, lavoura)}>
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={lavAtivo ? "outline" : "default"}
                                      size="sm"
                                      onClick={() => toggleLavouraAtivo(lavoura)}
                                    >
                                      {lavAtivo ? "Inativar" : "Ativar"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead>Propriedade / Lavoura</TableHead>
                      <TableHead>Qtd. pés</TableHead>
                      <TableHead>Produção (kg)</TableHead>
                      <TableHead>kg/pé</TableHead>
                      <TableHead>Balaios</TableHead>
                      <TableHead>balaios/pé</TableHead>
                      <TableHead>Litros</TableHead>
                      <TableHead>L/pé</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propriedadesFiltradas.map((propriedade) => {
                      const propAtivo = (propriedade as unknown as { ativo?: boolean }).ativo !== false;
                      const sub = lavourasPorPropriedadeFiltradas.get(propriedade.id) ?? [];

                      const totalKgProp = producaoPorPropriedade.get(propriedade.id) ?? 0;
                      const totalBalaiosProp = balaiosPorPropriedade.get(propriedade.id) ?? 0;
                      const pesProp = pesPorPropriedade.get(propriedade.id) ?? 0;

                      return (
                        <>
                          <TableRow key={propriedade.id} className="bg-muted/40">
                            <TableCell className="font-semibold">
                              <div className="flex flex-col">
                                <span>
                                  {propriedade.nome ?? "(sem nome)"} {!propAtivo ? "(inativo)" : ""}
                                </span>
                                <span className="text-xs text-muted-foreground">{propriedade.endereco ?? "—"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">{pesProp}</TableCell>
                            <TableCell className="font-semibold">{formatKg(totalKgProp)}</TableCell>
                            <TableCell className="font-semibold">{formatKgPorPe(totalKgProp, pesProp)}</TableCell>
                            <TableCell className="font-semibold">{formatBalaios(totalBalaiosProp)}</TableCell>
                            <TableCell className="font-semibold">{formatBalaiosPorPe(totalBalaiosProp, pesProp)}</TableCell>
                            <TableCell className="font-semibold">{formatLitros(totalKgProp)}</TableCell>
                            <TableCell className="font-semibold">{formatLitrosPorPe(totalKgProp, pesProp)}</TableCell>
                            <TableCell className="text-right">
                              <Button type="button" variant="ghost" size="sm" onClick={() => openEditPropriedade(propriedade)}>
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant={propAtivo ? "outline" : "default"}
                                size="sm"
                                className="ml-2"
                                onClick={() => togglePropriedadeAtivo(propriedade)}
                              >
                                {propAtivo ? "Inativar" : "Ativar"}
                              </Button>
                              <Button type="button" size="sm" className="ml-2" onClick={() => openCreateLavoura(propriedade)}>
                                Cadastrar lavoura
                              </Button>
                            </TableCell>
                          </TableRow>

                          {loadingLavouras ? (
                            <TableRow key={`${propriedade.id}-loading`}
                            >
                              <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                                Carregando lavouras...
                              </TableCell>
                            </TableRow>
                          ) : sub.length === 0 ? (
                            <TableRow key={`${propriedade.id}-empty`}>
                              <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                                Nenhuma lavoura cadastrada
                              </TableCell>
                            </TableRow>
                          ) : (
                            sub.map((lavoura) => {
                              const lavAtivo = (lavoura as unknown as { ativo?: boolean }).ativo !== false;
                              const totalKgLav = producaoPorLavoura.get(lavoura.id) ?? 0;
                              const totalBalaiosLav = balaiosPorLavoura.get(lavoura.id) ?? 0;
                              const pesLav = Number(lavoura.quantidade_pe_de_cafe) || 0;

                              return (
                                <TableRow key={lavoura.id}>
                                  <TableCell className="pl-8">
                                    <span className="font-medium">{lavoura.nome}</span> {!lavAtivo ? "(inativo)" : ""}
                                  </TableCell>
                                  <TableCell>{pesLav}</TableCell>
                                  <TableCell>{formatKg(totalKgLav)}</TableCell>
                                  <TableCell>{formatKgPorPe(totalKgLav, pesLav)}</TableCell>
                                  <TableCell>{formatBalaios(totalBalaiosLav)}</TableCell>
                                  <TableCell>{formatBalaiosPorPe(totalBalaiosLav, pesLav)}</TableCell>
                                  <TableCell>{formatLitros(totalKgLav)}</TableCell>
                                  <TableCell>{formatLitrosPorPe(totalKgLav, pesLav)}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditLavoura(propriedade, lavoura)}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={lavAtivo ? "outline" : "default"}
                                      size="sm"
                                      className="ml-2"
                                      onClick={() => toggleLavouraAtivo(lavoura)}
                                    >
                                      {lavAtivo ? "Inativar" : "Ativar"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog
          open={propriedadeModalOpen}
          onOpenChange={(open) => {
            setPropriedadeModalOpen(open);
            if (!open) resetPropriedadeForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{propriedadeEditing ? "Editar propriedade" : "Cadastrar propriedade"}</DialogTitle>
              <DialogDescription>Nome e endereço são opcionais.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome (opcional)</Label>
                <Input value={propNome} onChange={(e) => setPropNome(e.target.value)} placeholder="Ex: Fazenda Santa Luzia" />
              </div>
              <div className="space-y-2">
                <Label>Endereço (opcional)</Label>
                <Input value={propEndereco} onChange={(e) => setPropEndereco(e.target.value)} placeholder="Ex: Estrada X, km 10" />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPropriedadeModalOpen(false);
                    resetPropriedadeForm();
                  }}
                  disabled={propSaving}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={savePropriedade} disabled={propSaving || !selectedCompany}>
                  {propSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={lavouraModalOpen}
          onOpenChange={(open) => {
            setLavouraModalOpen(open);
            if (!open) resetLavouraForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lavouraEditing ? "Editar lavoura" : "Cadastrar lavoura"}</DialogTitle>
              <DialogDescription>
                {lavouraTargetPropriedade
                  ? `Vinculada à propriedade: ${lavouraTargetPropriedade.nome ?? "(sem nome)"}`
                  : "Selecione uma propriedade"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={lavNome} onChange={(e) => setLavNome(e.target.value)} placeholder="Ex: Talhão 1" />
              </div>
              <div className="space-y-2">
                <Label>Quantidade de pés de café</Label>
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={lavQuantidade}
                  onChange={(e) => setLavQuantidade(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setLavouraModalOpen(false);
                    resetLavouraForm();
                  }}
                  disabled={lavSaving}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={saveLavoura} disabled={lavSaving || !selectedCompany}>
                  {lavSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
