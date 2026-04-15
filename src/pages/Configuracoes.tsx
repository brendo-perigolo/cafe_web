import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cacheKey, readJson, writeJson } from "@/lib/offline";
import { getDeviceLancamentoSettings, setDeviceLancamentoSettings } from "@/lib/deviceSettings";

interface PropriedadeOption {
  id: string;
  nome: string | null;
}

interface LavouraOption {
  id: string;
  nome: string;
  propriedade_id: string;
}

export default function Configuracoes() {
  const { user, selectedCompany } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [kgPorBalaio, setKgPorBalaio] = useState<string>("");
  const [usarKgPorBalaioPadrao, setUsarKgPorBalaioPadrao] = useState(true);
  const [kgPorLitro, setKgPorLitro] = useState<string>("1");
  const [precoPorBalaioPadrao, setPrecoPorBalaioPadrao] = useState(false);
  const [lancamentoModo, setLancamentoModo] = useState<"padrao" | "somente_balaio" | "peso_medio_balaio">("padrao");

  const [mostrarPropriedadeLavoura, setMostrarPropriedadeLavoura] = useState(true);
  const [usarPropriedadeLavouraPadrao, setUsarPropriedadeLavouraPadrao] = useState(false);
  const [propriedadePadraoId, setPropriedadePadraoId] = useState<string>("");
  const [lavouraPadraoId, setLavouraPadraoId] = useState<string>("");
  const [propriedades, setPropriedades] = useState<PropriedadeOption[]>([]);
  const [lavouras, setLavouras] = useState<LavouraOption[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user || !selectedCompany) {
        setKgPorBalaio("");
        setKgPorLitro("1");
        setUsarKgPorBalaioPadrao(true);
        setPrecoPorBalaioPadrao(false);
        setMostrarPropriedadeLavoura(true);
        setUsarPropriedadeLavouraPadrao(false);
        setPropriedadePadraoId("");
        setLavouraPadraoId("");
        setPropriedades([]);
        setLavouras([]);
        setInitialLoading(false);
        return;
      }

      setInitialLoading(true);

      const settings = getDeviceLancamentoSettings(selectedCompany.id);
      setLancamentoModo(settings.lancamento_modo ?? "padrao");
      setUsarKgPorBalaioPadrao(settings.usar_kg_por_balaio_padrao ?? true);
      setKgPorBalaio(
        settings.kg_por_balaio_padrao != null && Number.isFinite(Number(settings.kg_por_balaio_padrao))
          ? String(Number(settings.kg_por_balaio_padrao))
          : "",
      );
      setKgPorLitro(
        settings.kg_por_litro != null && Number.isFinite(Number(settings.kg_por_litro)) && Number(settings.kg_por_litro) > 0
          ? String(Number(settings.kg_por_litro))
          : "1",
      );
      setPrecoPorBalaioPadrao(settings.preco_por_balaio_padrao ?? false);
      setMostrarPropriedadeLavoura(settings.mostrar_propriedade_lavoura ?? true);
      setUsarPropriedadeLavouraPadrao(settings.usar_propriedade_lavoura_padrao ?? false);
      setPropriedadePadraoId(settings.propriedade_padrao_id ?? "");
      setLavouraPadraoId(settings.lavoura_padrao_id ?? "");

      const propsCache = cacheKey("propriedades_list", selectedCompany.id);
      const lavCache = cacheKey("lavouras_list", selectedCompany.id);
      const cachedProps = readJson<{ supported?: boolean; propriedades: PropriedadeOption[] } | null>(propsCache, null);
      const cachedLavs = readJson<{ supported?: boolean; lavouras: LavouraOption[] } | null>(lavCache, null);
      setPropriedades((cachedProps?.propriedades ?? []) as PropriedadeOption[]);
      setLavouras((cachedLavs?.lavouras ?? []) as LavouraOption[]);

      if (navigator.onLine) {
        const { data: propsData } = await supabase
          .from("propriedades")
          .select("id, nome")
          .eq("empresa_id", selectedCompany.id)
          .order("nome", { ascending: true, nullsFirst: true });
        const propsList = ((propsData as PropriedadeOption[] | null) ?? []).slice();
        setPropriedades(propsList);
        writeJson(propsCache, { cachedAt: new Date().toISOString(), supported: true, propriedades: propsList });

        const { data: lavData } = await supabase
          .from("lavouras")
          .select("id, nome, propriedade_id")
          .eq("empresa_id", selectedCompany.id)
          .order("nome", { ascending: true });
        const lavList = ((lavData as LavouraOption[] | null) ?? []).slice();
        setLavouras(lavList);
        writeJson(lavCache, { cachedAt: new Date().toISOString(), supported: true, lavouras: lavList });
      }

      setInitialLoading(false);
    };

    load();
  }, [user, selectedCompany?.id]);

  useEffect(() => {
    const onSave = () => {
      formRef.current?.requestSubmit();
    };

    window.addEventListener("safra:config_save", onSave);
    return () => {
      window.removeEventListener("safra:config_save", onSave);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de salvar configurações.",
        variant: "destructive",
      });
      return;
    }

    const hasKgValue = Boolean(kgPorBalaio.trim());
    const parsed = hasKgValue ? Number(kgPorBalaio) : null;

    const hasKgPorLitro = Boolean(kgPorLitro.trim());
    const parsedKgPorLitro = hasKgPorLitro ? Number(kgPorLitro) : null;
    if (parsedKgPorLitro == null || !Number.isFinite(parsedKgPorLitro) || parsedKgPorLitro <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um kg por litro maior que zero (ex: 1).",
        variant: "destructive",
      });
      return;
    }
    if (parsed != null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast({
        title: "Valor inválido",
        description: "Se informar o kg médio do balaio, ele deve ser maior que zero.",
        variant: "destructive",
      });
      return;
    }

    if (lancamentoModo !== "padrao") {
      if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) {
        toast({
          title: "Kg médio do balaio obrigatório",
          description: "Para usar lançamento por balaio/peso médio, configure o kg médio do balaio (padrão).",
          variant: "destructive",
        });
        return;
      }
    }

    if (usarPropriedadeLavouraPadrao) {
      if (!propriedadePadraoId) {
        toast({
          title: "Propriedade padrão",
          description: "Selecione uma propriedade padrão.",
          variant: "destructive",
        });
        return;
      }

      const lavsForProp = lavouras.filter((l) => l.propriedade_id === propriedadePadraoId);
      if (lavsForProp.length > 0 && !lavouraPadraoId) {
        toast({
          title: "Lavoura padrão",
          description: "Selecione uma lavoura padrão.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      setDeviceLancamentoSettings(selectedCompany.id, {
        lancamento_modo: lancamentoModo,
        usar_kg_por_balaio_padrao: usarKgPorBalaioPadrao,
        kg_por_balaio_padrao: parsed,
        kg_por_litro: parsedKgPorLitro,
        preco_por_balaio_padrao: precoPorBalaioPadrao,
        mostrar_propriedade_lavoura: mostrarPropriedadeLavoura,
        usar_propriedade_lavoura_padrao: usarPropriedadeLavouraPadrao,
        propriedade_padrao_id: usarPropriedadeLavouraPadrao ? propriedadePadraoId : null,
        lavoura_padrao_id: usarPropriedadeLavouraPadrao ? lavouraPadraoId : null,
      });

      toast({
        title: "Configurações salvas",
        description: "Configurações do aparelho atualizadas.",
      });
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const lavourasDaPropriedade = propriedadePadraoId
    ? lavouras.filter((l) => l.propriedade_id === propriedadePadraoId)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl p-4 space-y-6">
        <h1 className="text-3xl font-bold">Configuração</h1>

        <Card className="shadow-coffee">
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSave} className="space-y-4">
              <Accordion type="multiple" defaultValue={["lancamento"]} className="w-full">
                <AccordionItem value="lancamento">
                  <AccordionTrigger>Lançamento</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="kgPorBalaio">Kg médio do balaio (padrão)</Label>
                        <Input
                          id="kgPorBalaio"
                          type="number"
                          step="0.01"
                          value={kgPorBalaio}
                          onChange={(e) => setKgPorBalaio(e.target.value)}
                          placeholder={initialLoading ? "Carregando..." : "0.00"}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Usar kg/balaio padrão</p>
                          <p className="text-xs text-muted-foreground">
                            Quando ativo, o lançamento começa com esse valor (você pode editar).
                          </p>
                        </div>
                        <Switch
                          checked={usarKgPorBalaioPadrao}
                          onCheckedChange={setUsarKgPorBalaioPadrao}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="kgPorLitro">Kg por litro (kg/L)</Label>
                        <Input
                          id="kgPorLitro"
                          type="number"
                          step="0.0001"
                          min={0}
                          value={kgPorLitro}
                          onChange={(e) => setKgPorLitro(e.target.value)}
                          placeholder={initialLoading ? "Carregando..." : "1"}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Preço por balaio (padrão)</p>
                          <p className="text-xs text-muted-foreground">Define o modo inicial do preço no lançamento.</p>
                        </div>
                        <Switch
                          checked={precoPorBalaioPadrao}
                          onCheckedChange={setPrecoPorBalaioPadrao}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Lançamento somente por balaio</p>
                          <p className="text-xs text-muted-foreground">
                            Informa qtd. balaios e preço/balaio (peso é calculado pelo kg/balaio padrão).
                          </p>
                        </div>
                        <Switch
                          checked={lancamentoModo === "somente_balaio"}
                          onCheckedChange={(checked) => {
                            setLancamentoModo(checked ? "somente_balaio" : "padrao");
                          }}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Lançamento por peso médio do balaio</p>
                          <p className="text-xs text-muted-foreground">
                            Informa peso (kg), peso médio/balaio (kg) e preço/balaio (qtd. balaios é calculada).
                          </p>
                        </div>
                        <Switch
                          checked={lancamentoModo === "peso_medio_balaio"}
                          onCheckedChange={(checked) => {
                            setLancamentoModo(checked ? "peso_medio_balaio" : "padrao");
                          }}
                          disabled={initialLoading || lancamentoModo === "somente_balaio"}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="propriedades">
                  <AccordionTrigger>Propriedade e lavoura</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Mostrar propriedade e lavoura</p>
                          <p className="text-xs text-muted-foreground">Exibe os campos no lançamento.</p>
                        </div>
                        <Switch
                          checked={mostrarPropriedadeLavoura}
                          onCheckedChange={setMostrarPropriedadeLavoura}
                          disabled={initialLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Usar propriedade/lavoura padrão</p>
                          <p className="text-xs text-muted-foreground">Define o padrão para os próximos lançamentos.</p>
                        </div>
                        <Switch
                          checked={usarPropriedadeLavouraPadrao}
                          onCheckedChange={(next) => {
                            setUsarPropriedadeLavouraPadrao(next);
                            if (!next) {
                              setPropriedadePadraoId("");
                              setLavouraPadraoId("");
                            }
                          }}
                          disabled={initialLoading}
                        />
                      </div>

                      {usarPropriedadeLavouraPadrao ? (
                        <>
                          <div className="space-y-2">
                            <Label>Propriedade padrão</Label>
                            <Select
                              value={propriedadePadraoId}
                              onValueChange={(v) => {
                                setPropriedadePadraoId(v);
                                setLavouraPadraoId("");
                              }}
                              disabled={initialLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={initialLoading ? "Carregando..." : "Selecione"} />
                              </SelectTrigger>
                              <SelectContent>
                                {propriedades.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {(p.nome ?? "Sem nome").trim() || "Sem nome"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Lavoura padrão</Label>
                            <Select
                              value={lavouraPadraoId}
                              onValueChange={setLavouraPadraoId}
                              disabled={initialLoading || !propriedadePadraoId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={!propriedadePadraoId ? "Selecione a propriedade" : "Selecione"} />
                              </SelectTrigger>
                              <SelectContent>
                                {lavourasDaPropriedade.map((l) => (
                                  <SelectItem key={l.id} value={l.id}>
                                    {l.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex justify-end">
                <Button type="submit" disabled={loading || initialLoading} variant="secondary">
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
