import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, Trash2, Coins, Undo2, Banknote, QrCode, CreditCard, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "@/hooks/use-toast";
import { safeRandomUUID } from "@/lib/device";
import { cacheKey, readJson, writeJson } from "@/lib/offline";
import { z } from "zod";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const panhadorSchema = z.object({
  nome: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  apelido: z.string().trim().max(120, "Apelido deve ter no máximo 120 caracteres").optional(),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos numéricos").optional(),
  bagNumero: z.string().trim().max(60, "Número da bag deve ter no máximo 60 caracteres").optional(),
  telefone: z.string().regex(/^\d{8,15}$/, "Telefone deve conter apenas números (8 a 15 dígitos)").optional(),
});

interface Panhador {
  id: string;
  nome: string;
  apelido: string | null;
  cpf: string | null;
  telefone: string | null;
  bag_numero: string | null;
  bag_semana?: string | null;
  bag_atualizado_em?: string | null;
  created_at: string;
  tem_pendencias?: boolean;
}

interface BagHistoricoRow {
  id: string;
  alterado_em: string;
  bag_anterior: string | null;
  bag_nova: string | null;
  panhador_id: string;
  panhadores?: { nome?: string } | null;
}

interface LancamentoPagamentoRow {
  id: string;
  codigo: string;
  data_colheita: string;
  peso_kg: number;
  quantidade_balaios: number | null;
  valor_total: number | null;
  pago_em: string | null;
  pagamento_lote: string | null;
  pagamento_metodo?: string | null;
  pagamento_cheque_numero?: string | null;
}

type PagamentoStatusFilter = "todas" | "pagas" | "pendentes";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const getIsoWeekKey = (isoDate: string) => {
  const d0 = new Date(isoDate);
  if (Number.isNaN(d0.getTime())) return null;
  // ISO week: Thursday decides the year
  const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default function Panhadores() {
  const [panhadores, setPanhadores] = useState<Panhador[]>([]);
  const [bagFieldsSupported, setBagFieldsSupported] = useState(true);
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bagNumero, setBagNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [panhadoresLoading, setPanhadoresLoading] = useState(false);
  const [panhadorFilter, setPanhadorFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bagDialogOpen, setBagDialogOpen] = useState(false);
  const [bagTarget, setBagTarget] = useState<Panhador | null>(null);
  const [bagTargetValue, setBagTargetValue] = useState("");
  const [bagSaving, setBagSaving] = useState(false);
  const [bagReportOpen, setBagReportOpen] = useState(false);
  const [bagHistorico, setBagHistorico] = useState<BagHistoricoRow[]>([]);
  const [bagHistoricoLoading, setBagHistoricoLoading] = useState(false);
  const [bagPanhadorReportOpen, setBagPanhadorReportOpen] = useState(false);
  const [bagPanhadorTarget, setBagPanhadorTarget] = useState<Panhador | null>(null);
  const [bagPanhadorHistorico, setBagPanhadorHistorico] = useState<BagHistoricoRow[]>([]);
  const [bagPanhadorHistoricoLoading, setBagPanhadorHistoricoLoading] = useState(false);
  const [bagConflictOpen, setBagConflictOpen] = useState(false);
  const [bagConflictMessage, setBagConflictMessage] = useState("");
  const [bagConflictConfirm, setBagConflictConfirm] = useState<null | (() => Promise<void>)>(null);

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [pagamentoTarget, setPagamentoTarget] = useState<Panhador | null>(null);
  const [pagamentoSemana, setPagamentoSemana] = useState<string>("");
  const [pagamentoStatusFilter, setPagamentoStatusFilter] = useState<PagamentoStatusFilter>("todas");
  const [pagamentoLoading, setPagamentoLoading] = useState(false);
  const [pagamentoLancamentos, setPagamentoLancamentos] = useState<LancamentoPagamentoRow[]>([]);
  const [pagamentoSelectedIds, setPagamentoSelectedIds] = useState<Record<string, boolean>>({});
  const [pagamentoConfirming, setPagamentoConfirming] = useState(false);
  const [pagamentoEstornando, setPagamentoEstornando] = useState(false);
  const [pagamentoMetodo, setPagamentoMetodo] = useState<"dinheiro" | "pix" | "cartao" | "cheque">("dinheiro");
  const [pagamentoChequeNumero, setPagamentoChequeNumero] = useState<string>("");
  const [pagamentoMetodoDialogOpen, setPagamentoMetodoDialogOpen] = useState(false);
  const buildAndPrintComprovanteMovimentacao = (item: LancamentoPagamentoRow) => {
    if (!selectedCompany || !user) return;
    if (!item.pago_em) {
      toast({ title: "Pendente", description: "Essa movimentação ainda está pendente de pagamento.", variant: "destructive" });
      return;
    }

    const pagoEmBr = new Date(item.pago_em).toLocaleString("pt-BR");
    const totalKg = (item.peso_kg ?? 0);
    const totalBalaios = (item.quantidade_balaios ?? 0);
    const totalValor = (item.valor_total ?? 0);
    const metodo = (item.pagamento_metodo ?? "").toString();
    const chequeNumero = (item.pagamento_cheque_numero ?? "").toString();

    const chequeInfo =
      metodo === "cheque" ? `<div><strong>Cheque:</strong> ${chequeNumero || "(não informado)"}</div>` : "";

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Comprovante de Pagamento</title>
          <style>
            body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #111827; }
            .wrap { max-width: 820px; margin: 0 auto; padding: 16px; }
            .top { display:flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
            h1 { margin: 0; font-size: 18px; }
            .meta { font-size: 12px; color: #374151; }
            .kpis { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
            .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
            .kpi .label { font-size: 11px; color: #6b7280; }
            .kpi .value { font-size: 14px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
            th { text-align: left; background: #f9fafb; }
            .footer { margin-top: 18px; font-size: 12px; color: #374151; }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="top">
              <div>
                <h1>Comprovante de Pagamento</h1>
                <div class="meta"><strong>Panhador:</strong> ${pagamentoTarget?.nome ?? ""}</div>
                <div class="meta"><strong>Data:</strong> ${pagoEmBr}</div>
                <div class="meta"><strong>Método:</strong> ${(metodo || "-").toUpperCase()}</div>
                ${chequeInfo}
                <div class="meta"><strong>Código:</strong> ${item.codigo}</div>
              </div>
              <div class="meta" style="text-align:right;">
                <div><strong>Empresa:</strong> ${selectedCompany.nome ?? ""}</div>
                <div><strong>Responsável:</strong> ${user.email ?? ""}</div>
              </div>
            </div>

            <div class="kpis">
              <div class="kpi"><div class="label">Kg</div><div class="value">${totalKg.toFixed(2)} kg</div></div>
              <div class="kpi"><div class="label">Balaios</div><div class="value">${totalBalaios.toFixed(2)}</div></div>
              <div class="kpi"><div class="label">Valor</div><div class="value">${currencyFormatter.format(totalValor)}</div></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 22%">Código</th>
                  <th style="width: 22%">Data</th>
                  <th style="text-align:right; width: 18%">Kg</th>
                  <th style="text-align:right; width: 18%">Balaios</th>
                  <th style="text-align:right; width: 20%">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${item.codigo}</td>
                  <td>${dateFormatter.format(new Date(item.data_colheita))}</td>
                  <td style="text-align:right;">${(item.peso_kg ?? 0).toFixed(2)}</td>
                  <td style="text-align:right;">${(item.quantidade_balaios ?? 0).toFixed(2)}</td>
                  <td style="text-align:right;">${currencyFormatter.format(item.valor_total ?? 0)}</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">Assinatura: ________________________________</div>
          </div>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 250);
    }
  };
  const { user, selectedCompany } = useAuth();
  const { savePendingPanhadorCreate, savePendingPanhadorDeactivate, savePendingPanhadorUpdate } = useOfflineSync();

  const getBalaios = (item: LancamentoPagamentoRow) => (item.quantidade_balaios ?? 0);

  const semanaOptions = useMemo(() => {
    const set = new Set<string>();
    (pagamentoLancamentos ?? []).forEach((it) => {
      const key = getIsoWeekKey(it.data_colheita);
      if (key) set.add(key);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [pagamentoLancamentos]);

  const pagamentoLancamentosFiltrados = useMemo(() => {
    let list = pagamentoLancamentos ?? [];
    if (pagamentoSemana.trim()) {
      const s = pagamentoSemana.trim();
      list = list.filter((it) => getIsoWeekKey(it.data_colheita) === s);
    }
    if (pagamentoStatusFilter === "pagas") return list.filter((it) => it.pago_em != null);
    if (pagamentoStatusFilter === "pendentes") return list.filter((it) => it.pago_em == null);
    return list;
  }, [pagamentoLancamentos, pagamentoSemana, pagamentoStatusFilter]);


  const pagamentoSelectedLancamentos = useMemo(
    () => pagamentoLancamentosFiltrados.filter((it) => pagamentoSelectedIds[it.id]),
    [pagamentoLancamentosFiltrados, pagamentoSelectedIds],
  );

  const pagamentoSelectionMode = useMemo(() => {
    const selected = pagamentoSelectedLancamentos;
    const hasPendentes = selected.some((it) => it.pago_em == null);
    const hasPagos = selected.some((it) => it.pago_em != null);
    return { hasPendentes, hasPagos, mixed: hasPendentes && hasPagos };
  }, [pagamentoSelectedLancamentos]);

  const pagamentoResumo = useMemo(() => {
    const list = pagamentoLancamentosFiltrados;
    const totalKg = list.reduce((sum, it) => sum + (it.peso_kg ?? 0), 0);
    const totalBalaios = list.reduce((sum, it) => sum + getBalaios(it), 0);
    const mediaPesoBalaio = totalBalaios > 0 ? totalKg / totalBalaios : 0;
    const valorPago = list.reduce((sum, it) => sum + (it.pago_em != null ? (it.valor_total ?? 0) : 0), 0);
    const valorPendente = list.reduce((sum, it) => sum + (it.pago_em == null ? (it.valor_total ?? 0) : 0), 0);
    const balaiosPagos = list.reduce((sum, it) => sum + (it.pago_em != null ? getBalaios(it) : 0), 0);
    const balaiosPendentes = list.reduce((sum, it) => sum + (it.pago_em == null ? getBalaios(it) : 0), 0);
    return { totalKg, totalBalaios, mediaPesoBalaio, valorPago, valorPendente, balaiosPagos, balaiosPendentes };
  }, [pagamentoLancamentosFiltrados]);

  const openPagamento = async (panhador: Panhador) => {
    if (!selectedCompany) return;
    setPagamentoTarget(panhador);
    setPagamentoOpen(true);
    setPagamentoLoading(true);
    setPagamentoSelectedIds({});
    setPagamentoMetodo("dinheiro");
    setPagamentoChequeNumero("");
    setPagamentoStatusFilter("todas");
    try {
      const { data, error } = await supabase
        .from("colheitas")
        .select(
          "id, codigo, data_colheita, peso_kg, quantidade_balaios, valor_total, pago_em, pagamento_lote, pagamento_metodo, pagamento_cheque_numero",
        )
        .eq("empresa_id", selectedCompany.id)
        .eq("panhador_id", panhador.id)
        .order("data_colheita", { ascending: false })
        .limit(300);
      if (error) throw error;
      setPagamentoLancamentos((data as unknown as LancamentoPagamentoRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar lançamentos para pagamento:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os lançamentos do panhador.", variant: "destructive" });
      setPagamentoLancamentos([]);
    } finally {
      setPagamentoLoading(false);
    }
  };

  const togglePagamentoSelectAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    if (value) {
      pagamentoLancamentosFiltrados.forEach((it) => {
        if (it.pago_em == null) next[it.id] = true;
      });
    }
    setPagamentoSelectedIds(next);
  };

  const togglePagamentoSelectAllPagos = (value: boolean) => {
    const next: Record<string, boolean> = {};
    if (value) {
      pagamentoLancamentosFiltrados.forEach((it) => {
        if (it.pago_em != null) next[it.id] = true;
      });
    }
    setPagamentoSelectedIds(next);
  };

  const confirmPagamentoSelected = async () => {
    if (!user || !selectedCompany || !pagamentoTarget) return;
    if (pagamentoSelectedLancamentos.length === 0) {
      toast({ title: "Selecione lançamentos", description: "Marque uma ou mais operações para pagar.", variant: "destructive" });
      return;
    }

    const pendentesSemValor = pagamentoSelectedLancamentos.filter((it) => it.valor_total == null).length;
    if (pendentesSemValor > 0) {
      toast({
        title: "Há pendentes sem valor",
        description: "Existem itens sem valor fechado. Defina o preço/valor antes de confirmar pagamento.",
        variant: "destructive",
      });
      return;
    }

    const chequeNumero = pagamentoChequeNumero.trim();
    if (pagamentoMetodo === "cheque" && chequeNumero && !/^\d+$/.test(chequeNumero)) {
      toast({ title: "Cheque inválido", description: "Número do cheque deve conter apenas números.", variant: "destructive" });
      return;
    }

    setPagamentoConfirming(true);
    const pagoEmIso = new Date().toISOString();
    const lote = `PG-${Date.now().toString(36).toUpperCase()}`;

    try {
      const ids = pagamentoSelectedLancamentos.map((it) => it.id);
      const { error } = await supabase
        .from("colheitas")
        .update({
          pago_em: pagoEmIso,
          pago_por: user.id,
          pagamento_lote: lote,
          pagamento_metodo: pagamentoMetodo,
          pagamento_cheque_numero: pagamentoMetodo === "cheque" && chequeNumero ? chequeNumero : null,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("empresa_id", selectedCompany.id);
      if (error) throw error;

      // Espelha no módulo financeiro (DRE): cria uma despesa por colheita quitada
      // usando o plano de contas "Pagamento de panha".
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
          const despesasPayload = pagamentoSelectedLancamentos.map((it) => ({
            empresa_id: selectedCompany.id,
            criado_por: user.id,
            valor: it.valor_total ?? 0,
            data_vencimento: dataVencimento,
            tipo_servico: null,
            plano_conta_id: plano.id,
            pagamento_metodo: pagamentoMetodo,
            colheita_id: it.id,
          }));

          const { error: despError } = await supabase
            .from("despesas")
            .upsert(despesasPayload, { onConflict: "colheita_id", ignoreDuplicates: true });

          if (despError) throw despError;
        } else {
          toast({
            title: "Despesa não lançada",
            description: "Plano de contas 'Pagamento de panha' não encontrado para esta empresa.",
            variant: "destructive",
          });
        }
      } catch (e) {
        console.error("Falha ao lançar despesa automaticamente:", e);
        toast({
          title: "Despesa não lançada",
          description: "Pagamento confirmado, mas não foi possível lançar a despesa automaticamente.",
          variant: "destructive",
        });
      }

      toast({ title: "Pagamento confirmado", description: `Lote ${lote} registrado para ${pagamentoTarget.nome}.` });

      // Comprovante em PDF (via print) automático ao pagar.
      try {
        // Comprovante individual por movimentação: abre para cada item pago selecionado.
        pagamentoSelectedLancamentos.forEach((it) => {
          const itemWithPayment: LancamentoPagamentoRow = {
            ...it,
            pago_em: pagoEmIso,
            pagamento_lote: lote,
            pagamento_metodo: pagamentoMetodo,
            pagamento_cheque_numero: pagamentoMetodo === "cheque" && chequeNumero ? chequeNumero : null,
          };
          buildAndPrintComprovanteMovimentacao(itemWithPayment);
        });
      } catch (e) {
        console.error("Falha ao gerar comprovante:", e);
      }

      await openPagamento(pagamentoTarget);
    } catch (err) {
      console.error("Erro ao confirmar pagamento no modal:", err);
      const message = typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message) : "Tente novamente";
      toast({ title: "Erro ao pagar", description: message, variant: "destructive" });
    } finally {
      setPagamentoConfirming(false);
    }
  };

  const estornarPagamentoSelected = async () => {
    if (!user || !selectedCompany || !pagamentoTarget) return;

    const toEstornar = pagamentoSelectedLancamentos.filter((it) => it.pago_em != null);
    if (toEstornar.length === 0) {
      toast({
        title: "Selecione itens pagos",
        description: "Marque uma ou mais movimentações já pagas para estornar.",
        variant: "destructive",
      });
      return;
    }

    setPagamentoEstornando(true);
    try {
      const ids = toEstornar.map((it) => it.id);
      const { error } = await supabase
        .from("colheitas")
        .update({
          pago_em: null,
          pago_por: null,
          pagamento_lote: null,
          pagamento_metodo: null,
          pagamento_cheque_numero: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("empresa_id", selectedCompany.id);
      if (error) throw error;

      // Remove espelho financeiro (se existir)
      try {
        const { error: despError } = await supabase
          .from("despesas")
          .delete()
          .eq("empresa_id", selectedCompany.id)
          .in("colheita_id", ids);
        if (despError) throw despError;
      } catch (e) {
        console.error("Falha ao remover despesas no estorno:", e);
      }

      toast({
        title: "Pagamento estornado",
        description: `${ids.length} movimentação(ões) voltaram para pendente.`,
      });

      await openPagamento(pagamentoTarget);
    } catch (err) {
      console.error("Erro ao estornar pagamento:", err);
      const message = typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message) : "Tente novamente";
      toast({ title: "Erro ao estornar", description: message, variant: "destructive" });
    } finally {
      setPagamentoEstornando(false);
    }
  };

  const handlePrimaryPagamentoAction = async () => {
    // Evita misturar pendentes e pagos na mesma ação
    if (pagamentoSelectionMode.mixed) {
      toast({
        title: "Seleção misturada",
        description: "Selecione apenas pendentes para pagar OU apenas pagos para estornar.",
        variant: "destructive",
      });
      return;
    }

    if (pagamentoSelectionMode.hasPagos) {
      await estornarPagamentoSelected();
      return;
    }

    // Fluxo em 2 etapas: ao clicar em Pagar, abre o segundo diálogo para escolher o método.
    setPagamentoMetodoDialogOpen(true);
  };

  useEffect(() => {
    loadPanhadores();
  }, [user, selectedCompany?.id]);

  const loadPanhadores = async () => {
    if (!user || !selectedCompany) {
      setPanhadores([]);
      setPanhadoresLoading(false);
      setBagFieldsSupported(true);
      return;
    }

    setPanhadoresLoading(true);

    const listCacheKey = cacheKey("panhadores_list", selectedCompany.id);

    const primary = await supabase
      .from("panhadores")
      .select("id, nome, apelido, cpf, telefone, bag_numero, bag_semana, bag_atualizado_em, created_at")
      .eq("empresa_id", selectedCompany.id)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (primary.error) {
      const message = (primary.error as { message?: string }).message?.toLowerCase() ?? "";
      const looksLikeMissingColumn =
        message.includes("column") || message.includes("bag_numero") || message.includes("bag_semana") || message.includes("bag_atualizado_em");

      if (looksLikeMissingColumn) {
        setBagFieldsSupported(false);
        const fallback = await supabase
          .from("panhadores")
          .select("id, nome, apelido, cpf, telefone, created_at")
          .eq("empresa_id", selectedCompany.id)
          .eq("ativo", true)
          .order("created_at", { ascending: false });

        if (fallback.error) {
          console.error("Erro ao carregar panhadores (fallback):", fallback.error);
          setPanhadoresLoading(false);
          return;
        }

        const fallbackList = (((fallback.data as unknown as Panhador[]) || []) as Panhador[]).map((p) => ({
          ...p,
          bag_numero: null,
          tem_pendencias: false,
        }));
        setPanhadores(fallbackList);
        writeJson(listCacheKey, {
          cachedAt: new Date().toISOString(),
          bagFieldsSupported: false,
          panhadores: fallbackList,
        });
        toast({
          title: "Banco sem suporte a bag",
          description: "Aplique a migration de bag (bag_numero/bag_semana) no Supabase para usar este recurso.",
          variant: "destructive",
        });
        setPanhadoresLoading(false);
        return;
      }

      console.error("Erro ao carregar panhadores:", primary.error);

      const cached = readJson<{ cachedAt?: string; bagFieldsSupported?: boolean; panhadores: Panhador[] } | null>(
        listCacheKey,
        null,
      );
      if (cached?.panhadores?.length) {
        setBagFieldsSupported(cached.bagFieldsSupported ?? true);
        setPanhadores(cached.panhadores);
        toast({ title: "Modo offline", description: "Mostrando panhadores salvos no dispositivo." });
      }
      setPanhadoresLoading(false);
      return;
    }

    setBagFieldsSupported(true);
    const basePanhadores = ((primary.data as unknown as Panhador[]) || []).map((p) => ({ ...p, tem_pendencias: false }));

    let finalPanhadores = basePanhadores;

    // Calcula indicador de pendências (se existe pelo menos 1 colheita pendente para o panhador)
    try {
      const { data: pendenciasData, error: pendenciasError } = await supabase
        .from("colheitas")
        .select("panhador_id")
        .eq("empresa_id", selectedCompany.id)
        .is("pago_em", null)
        .limit(5000);
      if (pendenciasError) throw pendenciasError;
      const pendingSet = new Set<string>((pendenciasData as unknown as Array<{ panhador_id: string | null }>).map((r) => r.panhador_id).filter(Boolean) as string[]);
      finalPanhadores = basePanhadores.map((p) => ({ ...p, tem_pendencias: pendingSet.has(p.id) }));
      setPanhadores(finalPanhadores);
    } catch (e) {
      console.error("Erro ao calcular pendências de pagamento:", e);
      finalPanhadores = basePanhadores;
      setPanhadores(basePanhadores);
    }

    writeJson(listCacheKey, {
      cachedAt: new Date().toISOString(),
      bagFieldsSupported: true,
      panhadores: finalPanhadores,
    });
    setPanhadoresLoading(false);
  };

  const loadBagHistorico = async () => {
    if (!user || !selectedCompany) {
      setBagHistorico([]);
      return;
    }

    setBagHistoricoLoading(true);
    try {
      const { data, error } = await supabase
        .from("panhadores_bag_historico")
        .select("id, alterado_em, bag_anterior, bag_nova, panhador_id, panhadores(nome)")
        .eq("empresa_id", selectedCompany.id)
        .order("alterado_em", { ascending: false })
        .limit(200);

      if (error) throw error;
      setBagHistorico((data as unknown as BagHistoricoRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar histórico de bags:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o relatório de bags.", variant: "destructive" });
    } finally {
      setBagHistoricoLoading(false);
    }
  };

  const loadBagHistoricoForPanhador = async (panhadorId: string) => {
    if (!user || !selectedCompany) {
      setBagPanhadorHistorico([]);
      return;
    }

    setBagPanhadorHistoricoLoading(true);
    try {
      const { data, error } = await supabase
        .from("panhadores_bag_historico")
        .select("id, alterado_em, bag_anterior, bag_nova, panhador_id")
        .eq("empresa_id", selectedCompany.id)
        .eq("panhador_id", panhadorId)
        .order("alterado_em", { ascending: false })
        .limit(200);

      if (error) throw error;
      setBagPanhadorHistorico((data as unknown as BagHistoricoRow[]) || []);
    } catch (error) {
      console.error("Erro ao carregar histórico de bags do panhador:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o histórico deste panhador.", variant: "destructive" });
      setBagPanhadorHistorico([]);
    } finally {
      setBagPanhadorHistoricoLoading(false);
    }
  };

  const insertBagHistorico = async (
    panhadorId: string,
    bagAnterior: string | null,
    bagNova: string | null,
    observacao?: string,
  ) => {
    if (!user || !selectedCompany) return;
    try {
      const { error } = await supabase.from("panhadores_bag_historico").insert({
        empresa_id: selectedCompany.id,
        panhador_id: panhadorId,
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
    if (!bagFieldsSupported) return null;
    let q = supabase
      .from("panhadores")
      .select("id, nome, bag_numero")
      .eq("empresa_id", selectedCompany.id)
      .eq("bag_numero", bag);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data as unknown as { id: string; nome: string; bag_numero: string | null } | null;
  };

  const findPanhadorByCpf = async (cpfDigits: string) => {
    if (!selectedCompany) return null;
    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome, apelido, cpf")
      .eq("empresa_id", selectedCompany.id)
      .eq("cpf", cpfDigits)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as { id: string; nome: string; apelido: string | null; cpf: string | null } | null;
  };

  const findPanhadorByTelefone = async (telefoneDigits: string) => {
    if (!selectedCompany) return null;
    const { data, error } = await supabase
      .from("panhadores")
      .select("id, nome, apelido, telefone")
      .eq("empresa_id", selectedCompany.id)
      .eq("telefone", telefoneDigits)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as { id: string; nome: string; apelido: string | null; telefone: string | null } | null;
  };

  const detachBagFromOther = async (otherId: string, otherBag: string | null, observacao?: string) => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) return;
    const now = new Date().toISOString();

    if (!navigator.onLine) {
      savePendingPanhadorUpdate(selectedCompany.id, {
        id: otherId,
        bag_numero: null,
        bag_semana: null,
        bag_atualizado_em: now,
        updated_at: now,
      });
      setPanhadores((prev) =>
        prev.map((p) => (p.id === otherId ? { ...p, bag_numero: null, bag_semana: null, bag_atualizado_em: now } : p)),
      );
      return;
    }

    const { error } = await supabase
      .from("panhadores")
      .update({ bag_numero: null, bag_semana: null, bag_atualizado_em: now, updated_at: now })
      .eq("id", otherId)
      .eq("empresa_id", selectedCompany.id);
    if (error) throw error;
    await insertBagHistorico(otherId, otherBag, null, observacao);
  };

  const setBagForPanhador = async (
    panhadorId: string,
    bagAnterior: string | null,
    bagNova: string | null,
    observacao?: string,
  ) => {
    if (!user || !selectedCompany) return;
    if (!bagFieldsSupported) return;
    const now = new Date().toISOString();

    if (!navigator.onLine) {
      savePendingPanhadorUpdate(selectedCompany.id, {
        id: panhadorId,
        bag_numero: bagNova,
        bag_atualizado_em: now,
        updated_at: now,
      });
      setPanhadores((prev) =>
        prev.map((p) => (p.id === panhadorId ? { ...p, bag_numero: bagNova, bag_atualizado_em: now } : p)),
      );
      return;
    }

    const { error } = await supabase
      .from("panhadores")
      .update({ bag_numero: bagNova, bag_atualizado_em: now, updated_at: now })
      .eq("id", panhadorId)
      .eq("empresa_id", selectedCompany.id);
    if (error) throw error;
    await insertBagHistorico(panhadorId, bagAnterior, bagNova, observacao);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedCompany) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha a empresa antes de cadastrar um panhador",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const normalizedCpf = cpf.replace(/\D/g, "");
      const normalizedTelefone = telefone.replace(/\D/g, "");
      const trimmedBag = bagNumero.trim();

      const validated = panhadorSchema.parse({
        nome,
        apelido: apelido.trim() || undefined,
        cpf: normalizedCpf ? normalizedCpf : undefined,
        bagNumero: bagFieldsSupported ? trimmedBag || undefined : undefined,
        telefone: normalizedTelefone ? normalizedTelefone : undefined,
      });

      if (!bagFieldsSupported && trimmedBag) {
        toast({
          title: "Bag indisponível",
          description: "Seu banco ainda não tem as colunas de bag. Aplique a migration no Supabase e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      if (!navigator.onLine) {
        const panhadorId = safeRandomUUID();
        const nowIso = new Date().toISOString();

        const payload: Record<string, unknown> = {
          id: panhadorId,
          nome: validated.nome,
          apelido: validated.apelido ?? null,
          cpf: validated.cpf ?? null,
          telefone: validated.telefone ?? null,
          user_id: user.id,
          empresa_id: selectedCompany.id,
          created_at: nowIso,
        };
        if (bagFieldsSupported) {
          payload.bag_numero = validated.bagNumero ?? null;
        }

        savePendingPanhadorCreate(selectedCompany.id, payload);

        setPanhadores((prev) => [
          {
            id: panhadorId,
            nome: validated.nome,
            apelido: (validated.apelido ?? null) as string | null,
            cpf: (validated.cpf ?? null) as string | null,
            telefone: (validated.telefone ?? null) as string | null,
            bag_numero: bagFieldsSupported ? ((validated.bagNumero ?? null) as string | null) : null,
            bag_semana: null,
            bag_atualizado_em: null,
            created_at: nowIso,
            tem_pendencias: false,
          },
          ...prev,
        ]);

        toast({ title: "Salvo offline", description: "Panhador será sincronizado quando a internet voltar." });

        setNome("");
        setApelido("");
        setCpf("");
        setTelefone("");
        setBagNumero("");
        setDialogOpen(false);
        return;
      }

      // Regras de unicidade por empresa:
      // - Pode ter nomes/apelidos repetidos
      // - NÃO pode repetir telefone/CPF/nº bag dentro da mesma empresa
      if (validated.cpf) {
        const existingCpf = await findPanhadorByCpf(validated.cpf);
        if (existingCpf) {
          toast({
            title: "CPF já cadastrado",
            description: `Já existe um panhador com este CPF nesta empresa (${existingCpf.nome}${existingCpf.apelido ? ` - ${existingCpf.apelido}` : ""}).`,
            variant: "destructive",
          });
          return;
        }
      }

      if (validated.telefone) {
        const existingTel = await findPanhadorByTelefone(validated.telefone);
        if (existingTel) {
          toast({
            title: "Telefone já cadastrado",
            description: `Já existe um panhador com este telefone nesta empresa (${existingTel.nome}${existingTel.apelido ? ` - ${existingTel.apelido}` : ""}).`,
            variant: "destructive",
          });
          return;
        }
      }

      const create = async () => {
        const panhadorId = safeRandomUUID();
        const payload = {
          id: panhadorId,
          nome: validated.nome,
          apelido: validated.apelido ?? null,
          cpf: validated.cpf ?? null,
          telefone: validated.telefone ?? null,
          bag_numero: validated.bagNumero ?? null,
          user_id: user.id,
          empresa_id: selectedCompany.id,
        };

        const { error } = await supabase.from("panhadores").insert(payload);
        if (error) throw error;

        if (validated.bagNumero) {
          await insertBagHistorico(panhadorId, null, validated.bagNumero, "Definição inicial");
        }
      };

      if (validated.bagNumero) {
        const owner = await findBagOwner(validated.bagNumero);
        if (owner) {
          setBagConflictMessage(
            `A bag ${validated.bagNumero} já está vinculada ao panhador ${owner.nome}. Deseja transferir esta bag para o novo panhador? Ao confirmar, a bag será removida do outro panhador.`,
          );
          setBagConflictConfirm(() => async () => {
            await detachBagFromOther(owner.id, owner.bag_numero, `Transferida para ${validated.nome}`);
            await create();
          });
          setBagConflictOpen(true);
          return;
        }
      }

      await create();

      toast({
        title: "Panhador cadastrado",
        description: "Cadastro realizado com sucesso",
      });

      setNome("");
      setApelido("");
      setCpf("");
      setTelefone("");
      setBagNumero("");
      setDialogOpen(false);
      loadPanhadores();
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
            : "";
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

        toast({
          title: "Erro ao cadastrar",
          description: "Tente novamente",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente desativar este panhador?")) return;

    if (!user || !selectedCompany) return;

    if (!navigator.onLine) {
      savePendingPanhadorDeactivate(selectedCompany.id, id);
      setPanhadores((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Salvo offline", description: "Desativação ficará pendente para sincronizar." });
      return;
    }

    const { error } = await supabase
      .from("panhadores")
      .update({ ativo: false })
      .eq("id", id);

    if (error) {
      toast({
        title: "Erro ao desativar",
        description: "Tente novamente",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Panhador desativado",
      description: "O panhador foi removido da lista",
    });

    loadPanhadores();
  };

  const formatCpf = (value: string | null) => {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 11) return value;
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const filteredPanhadores = useMemo(() => {
    const term = panhadorFilter.trim().toLowerCase();
    if (!term) return panhadores;

    const numericTerm = term.replace(/\D/g, "");

    return panhadores.filter((p) => {
      const nomeMatch = p.nome.toLowerCase().includes(term);
      const apelidoMatch = p.apelido?.toLowerCase().includes(term) ?? false;
      const bagMatch = p.bag_numero?.toLowerCase().includes(term) ?? false;
      const cpfMatch = numericTerm
        ? (p.cpf ?? "").includes(numericTerm)
        : p.cpf?.toLowerCase().includes(term) ?? false;
      return nomeMatch || apelidoMatch || cpfMatch || bagMatch;
    });
  }, [panhadores, panhadorFilter]);

  const openBagDialog = (panhador: Panhador) => {
    setBagTarget(panhador);
    setBagTargetValue(panhador.bag_numero ?? "");
    setBagDialogOpen(true);
  };

  const openPanhadorHistoricoDialog = async (panhador: Panhador) => {
    setBagPanhadorTarget(panhador);
    setBagPanhadorReportOpen(true);
    await loadBagHistoricoForPanhador(panhador.id);
  };

  const handleSaveBag = async () => {
    if (!user || !selectedCompany || !bagTarget) return;
    if (!bagFieldsSupported) {
      toast({
        title: "Bag indisponível",
        description: "Seu banco ainda não tem as colunas de bag. Aplique a migration no Supabase e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    const next = bagTargetValue.trim();
    const nextBag = next ? next : null;
    const prevBag = bagTarget.bag_numero ?? null;

    if ((prevBag ?? "") === (nextBag ?? "")) {
      setBagDialogOpen(false);
      setBagTarget(null);
      return;
    }

    if (nextBag && nextBag.length > 60) {
      toast({ title: "Bag inválida", description: "Número da bag deve ter no máximo 60 caracteres.", variant: "destructive" });
      return;
    }

    setBagSaving(true);
    try {
      if (!navigator.onLine) {
        await setBagForPanhador(bagTarget.id, prevBag, nextBag, "Troca de bag (offline)");
        toast({ title: "Salvo offline", description: "A bag ficará pendente para sincronizar." });
        setBagDialogOpen(false);
        setBagTarget(null);
        return;
      }

      const run = async () => {
        await setBagForPanhador(bagTarget.id, prevBag, nextBag, "Troca de bag");
        toast({ title: "Bag atualizada", description: "Vínculo de bag atualizado com sucesso." });
        setBagDialogOpen(false);
        setBagTarget(null);
        await loadPanhadores();
      };

      if (nextBag) {
        const owner = await findBagOwner(nextBag, bagTarget.id);
        if (owner) {
          setBagConflictMessage(
            `A bag ${nextBag} já está vinculada ao panhador ${owner.nome}. Deseja transferir esta bag? Ao confirmar, a bag será removida do outro panhador.`,
          );
          setBagConflictConfirm(() => async () => {
            await detachBagFromOther(owner.id, owner.bag_numero, `Transferida para ${bagTarget.nome}`);
            await run();
          });
          setBagConflictOpen(true);
          return;
        }
      }

      await run();
    } catch (error) {
      console.error("Erro ao atualizar bag:", error);
      toast({ title: "Erro", description: "Não foi possível atualizar a bag.", variant: "destructive" });
    } finally {
      setBagSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(210_45%_97%)]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Equipe</p>
            <h1 className="text-3xl font-bold text-[hsl(24_25%_18%)]">Gestão de panhadores</h1>
            <p className="text-sm text-muted-foreground">Cadastre e acompanhe toda a equipe de campo</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setBagReportOpen(true);
                loadBagHistorico();
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Relatório de bags
            </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                Novo panhador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar panhador</DialogTitle>
                <DialogDescription>Informe os dados pessoais do panhador</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apelido">Apelido (opcional)</Label>
                  <Input
                    id="apelido"
                    value={apelido}
                    onChange={(e) => setApelido(e.target.value)}
                    placeholder="Joãozinho"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF (opcional)</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone (opcional)</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(18) 99999-8888"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bag">Bag vinculada (opcional)</Label>
                  <Input
                    id="bag"
                    value={bagNumero}
                    onChange={(e) => setBagNumero(e.target.value)}
                    placeholder="Ex: 20"
                    maxLength={60}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card className="rounded-3xl border border-slate-100 bg-white shadow-coffee">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl">Lista de panhadores</CardTitle>
              <CardDescription>Visualize e filtre os registros cadastrados</CardDescription>
            </div>
            <Input
              placeholder="Filtrar por nome, apelido ou CPF"
              value={panhadorFilter}
              onChange={(e) => setPanhadorFilter(e.target.value)}
              className="w-full sm:w-72"
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Nome</TableHead>
                    <TableHead>Apelido</TableHead>
                    <TableHead>Bag</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panhadoresLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando panhadores...
                      </TableCell>
                    </TableRow>
                  ) : filteredPanhadores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        {panhadores.length === 0
                          ? "Nenhum panhador cadastrado ainda"
                          : "Nenhum resultado para o filtro aplicado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPanhadores.map((panhador) => (
                      <TableRow key={panhador.id}>
                        <TableCell className="font-medium text-[hsl(24_25%_20%)]">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                panhador.tem_pendencias
                                  ? "h-6 w-1.5 rounded-full bg-amber-500"
                                  : "h-6 w-1.5 rounded-full bg-emerald-500"
                              }
                              title={panhador.tem_pendencias ? "Possui pendências" : "Tudo pago"}
                            />
                            <span>{panhador.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell>{panhador.apelido ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{panhador.bag_numero ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCpf(panhador.cpf) ?? "Não informado"}
                        </TableCell>
                        <TableCell>{panhador.telefone ?? "Não informado"}</TableCell>
                        <TableCell>{dateFormatter.format(new Date(panhador.created_at))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPagamento(panhador)}
                              title="Pagamento"
                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                            >
                              <Coins className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPanhadorHistoricoDialog(panhador)}
                              title="Ver histórico"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openBagDialog(panhador)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(panhador.id)}>
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

        <Dialog
          open={pagamentoOpen}
          onOpenChange={(open) => {
            setPagamentoOpen(open);
            if (!open) {
              setPagamentoTarget(null);
              setPagamentoLancamentos([]);
              setPagamentoSelectedIds({});
              setPagamentoSemana("");
              setPagamentoStatusFilter("todas");
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>{pagamentoTarget ? `Pagamento - ${pagamentoTarget.nome}` : "Pagamento"}</DialogTitle>
              <DialogDescription>
                Selecione os lançamentos a serem pagos e confirme para registrar o pagamento.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="rounded-2xl border border-slate-100 bg-slate-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Total kg (panhador)</CardDescription>
                  <CardTitle className="text-xl text-[hsl(24_25%_18%)]">{pagamentoResumo.totalKg.toFixed(2)} kg</CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl border border-slate-100 bg-slate-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Total balaios (panhador)</CardDescription>
                  <CardTitle className="text-xl text-[hsl(24_25%_18%)]">{pagamentoResumo.totalBalaios.toFixed(2)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl border border-slate-100 bg-slate-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Média peso/balaio</CardDescription>
                  <CardTitle className="text-xl text-[hsl(24_25%_18%)]">{pagamentoResumo.mediaPesoBalaio.toFixed(2)} kg</CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl border border-emerald-100 bg-emerald-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Valor pago</CardDescription>
                  <CardTitle className="text-xl text-emerald-800">{currencyFormatter.format(pagamentoResumo.valorPago)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl border border-emerald-100 bg-emerald-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Balaios pagos</CardDescription>
                  <CardTitle className="text-xl text-emerald-800">{pagamentoResumo.balaiosPagos.toFixed(2)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl border border-amber-100 bg-amber-50/70">
                <CardHeader className="py-3">
                  <CardDescription>Pendente p/ pagamento</CardDescription>
                  <CardTitle className="text-xl text-amber-900">{pagamentoResumo.balaiosPendentes.toFixed(2)}</CardTitle>
                  <div className="text-xs text-amber-900/80">
                    {currencyFormatter.format(pagamentoResumo.valorPendente)}
                  </div>
                </CardHeader>
              </Card>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm">Semana</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={pagamentoSemana}
                  onChange={(e) => setPagamentoSemana(e.target.value)}
                >
                  <option value="">Todas</option>
                  {semanaOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <Label className="ml-2 text-sm">Status</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={pagamentoStatusFilter}
                  onChange={(e) => setPagamentoStatusFilter(e.target.value as PagamentoStatusFilter)}
                >
                  <option value="todas">Todas</option>
                  <option value="pagas">Pagas</option>
                  <option value="pendentes">Pendentes</option>
                </select>

              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => togglePagamentoSelectAll(false)}
                  disabled={pagamentoLoading}
                >
                  Limpar seleção
                </Button>
                <Button
                  type="button"
                  onClick={handlePrimaryPagamentoAction}
                  disabled={pagamentoLoading || pagamentoConfirming || pagamentoEstornando || pagamentoSelectedLancamentos.length === 0}
                  variant={pagamentoSelectionMode.hasPagos ? "destructive" : "secondary"}
                  className={pagamentoSelectionMode.mixed ? "pointer-events-none opacity-60" : ""}
                >
                  {pagamentoSelectionMode.mixed ? (
                    "Seleção inválida"
                  ) : pagamentoSelectionMode.hasPagos ? (
                    <>
                      <Undo2 className="mr-2 h-4 w-4" />
                      {pagamentoEstornando ? "Estornando..." : "Estornar"}
                    </>
                  ) : (
                    <>
                      <Coins className="mr-2 h-4 w-4" />
                      {pagamentoConfirming ? "Confirmando..." : "Pagar"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Dialog
              open={pagamentoMetodoDialogOpen}
              onOpenChange={(open) => {
                setPagamentoMetodoDialogOpen(open);
                if (!open) {
                  setPagamentoMetodo("dinheiro");
                  setPagamentoChequeNumero("");
                }
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Forma de pagamento</DialogTitle>
                  <DialogDescription>
                    Escolha como este pagamento será feito. Se for cheque, informe o número (opcional).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setPagamentoMetodo("dinheiro")}
                    className={
                      pagamentoMetodo === "dinheiro"
                        ? "flex items-center justify-between rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-left"
                        : "flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/60"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                        <Banknote className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold">Dinheiro</div>
                        <div className="text-xs text-muted-foreground">Pagamento em espécie</div>
                      </div>
                    </div>
                    {pagamentoMetodo === "dinheiro" ? (
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">Selecionado</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPagamentoMetodo("pix")}
                    className={
                      pagamentoMetodo === "pix"
                        ? "flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-left"
                        : "flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/60"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <QrCode className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold">Pix</div>
                        <div className="text-xs text-muted-foreground">Transferência instantânea</div>
                      </div>
                    </div>
                    {pagamentoMetodo === "pix" ? (
                      <span className="rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Selecionado</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPagamentoMetodo("cartao")}
                    className={
                      pagamentoMetodo === "cartao"
                        ? "flex items-center justify-between rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-left"
                        : "flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/60"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                        <CreditCard className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold">Cartão</div>
                        <div className="text-xs text-muted-foreground">Débito/crédito</div>
                      </div>
                    </div>
                    {pagamentoMetodo === "cartao" ? (
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">Selecionado</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPagamentoMetodo("cheque")}
                    className={
                      pagamentoMetodo === "cheque"
                        ? "flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-left"
                        : "flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/60"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <Landmark className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold">Cheque</div>
                        <div className="text-xs text-muted-foreground">Opcional: informar nº do cheque</div>
                      </div>
                    </div>
                    {pagamentoMetodo === "cheque" ? (
                      <span className="rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">Selecionado</span>
                    ) : null}
                  </button>

                  {pagamentoMetodo === "cheque" ? (
                    <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3">
                      <Label className="text-sm">Nº do cheque (opcional)</Label>
                      <Input
                        className="mt-2 h-9"
                        inputMode="numeric"
                        value={pagamentoChequeNumero}
                        onChange={(e) => setPagamentoChequeNumero(e.target.value.replace(/\D/g, ""))}
                        placeholder="Ex: 12345"
                        maxLength={30}
                      />
                      <div className="mt-1 text-xs text-muted-foreground">Apenas números.</div>
                    </div>
                  ) : null}
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPagamentoMetodoDialogOpen(false)}
                    disabled={pagamentoConfirming}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      setPagamentoMetodoDialogOpen(false);
                      await confirmPagamentoSelected();
                    }}
                    className=""
                    variant="secondary"
                    disabled={pagamentoConfirming}
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Confirmar pagamento
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <div className="max-h-[45vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 sticky top-0 z-10">
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Balaios</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagamentoLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Carregando lançamentos...
                      </TableCell>
                    </TableRow>
                  ) : pagamentoLancamentosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum lançamento encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagamentoLancamentosFiltrados.map((it) => {
                      const disabled = false;
                      return (
                        <TableRow key={it.id}>
                          <TableCell>
                            <Checkbox
                              checked={!!pagamentoSelectedIds[it.id]}
                              onCheckedChange={(v) => {
                                const next = { ...pagamentoSelectedIds };
                                next[it.id] = Boolean(v);
                                if (!next[it.id]) delete next[it.id];
                                setPagamentoSelectedIds(next);
                              }}
                              disabled={disabled}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{it.codigo}</TableCell>
                          <TableCell>{dateFormatter.format(new Date(it.data_colheita))}</TableCell>
                          <TableCell className="text-right">{(it.peso_kg ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{(it.quantidade_balaios ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{currencyFormatter.format(it.valor_total ?? 0)}</TableCell>
                          <TableCell>
                            {it.pago_em ? (
                              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                                <span className="h-3 w-1 rounded-full bg-emerald-500" />
                                Pago
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                                <span className="h-3 w-1 rounded-full bg-amber-500" />
                                Pendente
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => buildAndPrintComprovanteMovimentacao(it)}
                              disabled={!it.pago_em}
                              title={it.pago_em ? "Comprovante" : "Pendente"}
                              className={
                                it.pago_em
                                  ? "text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                  : "text-slate-300"
                              }
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bagDialogOpen}
          onOpenChange={(open) => {
            setBagDialogOpen(open);
            if (!open) {
              setBagTarget(null);
              setBagTargetValue("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar bag</DialogTitle>
              <DialogDescription>
                {bagTarget ? `Atualize a bag vinculada do panhador ${bagTarget.nome}.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Bag vinculada</Label>
              <Input
                value={bagTargetValue}
                onChange={(e) => setBagTargetValue(e.target.value)}
                placeholder="Ex: 20"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para remover a bag.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBagDialogOpen(false)} disabled={bagSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveBag} disabled={bagSaving}>
                {bagSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={bagReportOpen} onOpenChange={setBagReportOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Relatório de bags utilizadas</DialogTitle>
              <DialogDescription>Histórico de alterações de bag (últimos 200 registros)</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Data</TableHead>
                    <TableHead>Panhador</TableHead>
                    <TableHead>Bag anterior</TableHead>
                    <TableHead>Bag nova</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bagHistoricoLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando histórico...
                      </TableCell>
                    </TableRow>
                  ) : bagHistorico.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhuma troca de bag registrada ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bagHistorico.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{dateFormatter.format(new Date(row.alterado_em))}</TableCell>
                          <TableCell>{row.panhadores?.nome ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{row.bag_anterior ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{row.bag_nova ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bagPanhadorReportOpen}
          onOpenChange={(open) => {
            setBagPanhadorReportOpen(open);
            if (!open) {
              setBagPanhadorTarget(null);
              setBagPanhadorHistorico([]);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {bagPanhadorTarget ? `Histórico de bags - ${bagPanhadorTarget.nome}` : "Histórico de bags"}
              </DialogTitle>
              <DialogDescription>Alterações registradas para este panhador (últimos 200 registros)</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Data</TableHead>
                    <TableHead>Bag anterior</TableHead>
                    <TableHead>Bag nova</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bagPanhadorHistoricoLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Carregando histórico...
                      </TableCell>
                    </TableRow>
                  ) : bagPanhadorHistorico.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Nenhuma troca de bag registrada para este panhador.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bagPanhadorHistorico.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{dateFormatter.format(new Date(row.alterado_em))}</TableCell>
                        <TableCell className="font-mono text-sm">{row.bag_anterior ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{row.bag_nova ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={bagConflictOpen}
          onOpenChange={(open) => {
            setBagConflictOpen(open);
            if (!open) {
              setBagConflictMessage("");
              setBagConflictConfirm(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bag já vinculada</AlertDialogTitle>
              <AlertDialogDescription>{bagConflictMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const fn = bagConflictConfirm;
                    setBagConflictOpen(false);
                    setBagConflictConfirm(null);
                    if (fn) await fn();
                    await loadPanhadores();
                  } catch (error) {
                    console.error("Erro ao transferir bag:", error);
                    toast({
                      title: "Erro",
                      description: "Não foi possível transferir a bag. Tente novamente.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Sim, transferir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
