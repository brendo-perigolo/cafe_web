import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getAparelhoAtivo } from "@/lib/aparelhos";
import { getDeviceToken, safeRandomUUID } from "@/lib/device";
import { toUuidOrNull } from "@/lib/uuid";
import {
  getPendingColheitas,
  getPendingPanhadorOps,
  PendingColheitaLocal,
  PendingPanhadorOp,
  setPendingColheitas,
  setPendingPanhadorOps,
} from "@/lib/offline";

export type PendingColheita = PendingColheitaLocal;

export type PendingPanhadorAction = PendingPanhadorOp["action"];

export const getPendingCounts = () => {
  const colheitas = getPendingColheitas();
  const panhadores = getPendingPanhadorOps();
  return { colheitas: colheitas.length, panhadores: panhadores.length };
};

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Conexão restaurada",
        description: "Sincronizando dados...",
      });
      syncPendingData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Modo offline",
        description: "Dados serão salvos localmente",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const savePendingColheita = (colheita: Omit<PendingColheita, "id">) => {
    const pending = getPendingColheitas();
    const newColheita: PendingColheita = {
      id: safeRandomUUID(),
      ...colheita,
      sync_attempts: colheita.sync_attempts ?? 0,
      last_error: colheita.last_error ?? null,
      last_error_at: colheita.last_error_at ?? null,
    };
    pending.push(newColheita);
    setPendingColheitas(pending);
    return newColheita;
  };

  const savePendingPanhadorOp = (op: Omit<PendingPanhadorOp, "id" | "created_at">) => {
    const pending = getPendingPanhadorOps();
    const newOp: PendingPanhadorOp = {
      id: safeRandomUUID(),
      created_at: new Date().toISOString(),
      ...op,
    };
    pending.push(newOp);
    setPendingPanhadorOps(pending);
    return newOp;
  };

  const savePendingPanhadorCreate = (empresaId: string, payload: Record<string, unknown>) =>
    savePendingPanhadorOp({ action: "insert", empresa_id: empresaId, payload });

  const savePendingPanhadorUpdate = (empresaId: string, payload: Record<string, unknown>) =>
    savePendingPanhadorOp({ action: "update", empresa_id: empresaId, payload });

  const savePendingPanhadorDeactivate = (empresaId: string, panhadorId: string) =>
    savePendingPanhadorOp({ action: "deactivate", empresa_id: empresaId, payload: { id: panhadorId } });

  const syncPendingPanhadores = async () => {
    if (!user) return;
    const ops = getPendingPanhadorOps();
    if (ops.length === 0) return;

    const stripUnknownBagFields = (payload: Record<string, unknown>) => {
      const next = { ...payload };
      delete next.bag_numero;
      delete next.bag_semana;
      delete next.bag_atualizado_em;
      return next;
    };

    const getErrorCode = (err: unknown) => (err as { code?: string } | null)?.code;
    const getErrorMessage = (err: unknown) =>
      typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message) : "";

    const remaining: PendingPanhadorOp[] = [];

    for (const op of ops) {
      if (op.action === "insert") {
        try {
          let payload = op.payload;
          let { error } = await supabase.from("panhadores").insert(payload);

          if (error && getErrorCode(error) === "42703") {
            // Colunas bag_* podem não existir (migration ainda não aplicada).
            payload = stripUnknownBagFields(payload);
            ({ error } = await supabase.from("panhadores").insert(payload));
          }

          if (error) throw error;

          const bagNumero = typeof op.payload.bag_numero === "string" ? op.payload.bag_numero : null;
          const panhadorId = typeof op.payload.id === "string" ? op.payload.id : null;
          if (bagNumero && panhadorId) {
            // Best-effort: tabela pode não existir em bancos antigos.
            const hist = await supabase.from("panhadores_bag_historico").insert({
              empresa_id: op.empresa_id,
              panhador_id: panhadorId,
              bag_anterior: null,
              bag_nova: bagNumero,
              alterado_por: user.id,
              observacao: "Definição inicial (offline)",
            });
            if (hist.error && getErrorCode(hist.error) !== "42P01") {
              console.error("Erro ao registrar histórico de bag:", hist.error);
            }
          }

          continue;
        } catch (error) {
          console.error("Erro ao sincronizar panhador (insert):", error);
          remaining.push(op);
          continue;
        }
      }

      if (op.action === "update") {
        const id = typeof op.payload.id === "string" ? op.payload.id : null;
        if (!id) continue;
        try {
          let payload = op.payload;
          let { error } = await supabase.from("panhadores").update(payload).eq("id", id);

          if (error && getErrorCode(error) === "42703") {
            payload = stripUnknownBagFields(payload);
            ({ error } = await supabase.from("panhadores").update(payload).eq("id", id));
          }

          if (error) throw error;
          continue;
        } catch (error) {
          console.error("Erro ao sincronizar panhador (update):", error);
          remaining.push(op);
          continue;
        }
      }

      if (op.action === "deactivate") {
        const id = typeof op.payload.id === "string" ? op.payload.id : null;
        if (!id) continue;
        try {
          const { error } = await supabase.from("panhadores").update({ ativo: false }).eq("id", id);
          if (error) throw error;
        } catch (error) {
          console.error("Erro ao sincronizar panhador (deactivate):", error);
          remaining.push(op);
        }
      }
    }

    setPendingPanhadorOps(remaining);
  };

  const syncPendingData = async () => {
    if (!user || syncing) return;

    setSyncing(true);
    const pending = getPendingColheitas() as PendingColheita[];

    const pendingPanhadores = getPendingPanhadorOps();

    if (pending.length === 0 && pendingPanhadores.length === 0) {
      setSyncing(false);
      return;
    }

    const getErrorCode = (err: unknown) => (err as { code?: string } | null)?.code;
    const getErrorMessage = (err: unknown) =>
      typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message) : "";
    const getErrorDetails = (err: unknown) =>
      typeof err === "object" && err && "details" in err ? String((err as { details?: unknown }).details) : "";

    const formatSyncError = (err: unknown) => {
      const code = getErrorCode(err);
      const message = getErrorMessage(err);
      const details = getErrorDetails(err);
      const parts = [
        code ? `code=${code}` : "",
        message ? message.trim() : "",
        details ? details.trim() : "",
      ].filter(Boolean);
      return parts.join(" | ") || "Erro desconhecido";
    };

    try {
      // 1) Sincroniza panhadores primeiro (colheitas podem depender deles)
      await syncPendingPanhadores();

      const pendingPanhadoresAfter = getPendingPanhadorOps();
      const panhadoresRemaining = pendingPanhadoresAfter.length;
      const panhadoresProcessed = pendingPanhadores.length;

      // 2) Sincroniza colheitas
      let colheitasSent = 0;
      const remainingColheitas: PendingColheita[] = [];

      for (const colheita of pending) {
        const aparelhoToken = (colheita as unknown as { aparelho_token?: string }).aparelho_token || getDeviceToken();
        let pendenteAparelho = true;
        try {
          const ativo = await getAparelhoAtivo(colheita.empresa_id, aparelhoToken);
          pendenteAparelho = ativo !== true;
        } catch {
          pendenteAparelho = true;
        }

        const basePayload: Record<string, unknown> = {
          peso_kg: colheita.peso_kg,
          preco_por_kg: colheita.preco_por_kg,
          valor_total: colheita.valor_total,
          panhador_id: toUuidOrNull((colheita as unknown as { panhador_id?: unknown }).panhador_id),
          user_id: user.id,
          data_colheita: colheita.data_colheita,
          empresa_id: colheita.empresa_id,
          numero_bag: colheita.numero_bag,
          sincronizado: true,
        };

        const extendedPayload: Record<string, unknown> = {
          ...basePayload,
          preco_por_balaio: colheita.preco_por_balaio ?? null,
          kg_por_balaio_utilizado: colheita.kg_por_balaio_utilizado ?? null,
          mostrar_balaio_no_ticket: colheita.mostrar_balaio_no_ticket ?? false,
          aparelho_token: aparelhoToken,
          pendente_aparelho: pendenteAparelho,
          ...(Object.prototype.hasOwnProperty.call(colheita, "propriedade_id")
            ? { propriedade_id: toUuidOrNull((colheita as unknown as { propriedade_id?: unknown }).propriedade_id) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(colheita, "lavoura_id")
            ? { lavoura_id: toUuidOrNull((colheita as unknown as { lavoura_id?: unknown }).lavoura_id) }
            : {}),
        };

        try {
          let { error } = await supabase.from("colheitas").insert(extendedPayload);

          const code = error ? getErrorCode(error) : null;
          const message = error ? getErrorMessage(error).toLowerCase() : "";

          const looksLikeMissingColumn =
            code === "42703" || message.includes("column") || message.includes("does not exist") || message.includes("aparelho");

          if (error && looksLikeMissingColumn) {
            // Banco antigo sem colunas novas: tenta com payload mínimo.
            ({ error } = await supabase.from("colheitas").insert(basePayload));
          }

          if (error) throw error;
          colheitasSent += 1;
        } catch (error) {
          console.error("Erro ao sincronizar colheita:", error);
          const next: PendingColheita = {
            ...colheita,
            sync_attempts: (colheita.sync_attempts ?? 0) + 1,
            last_error: formatSyncError(error),
            last_error_at: new Date().toISOString(),
          };
          remainingColheitas.push(next);
          continue;
        }
      }

      setPendingColheitas(remainingColheitas);

      const totalBefore = pendingPanhadores.length + pending.length;
      const remainingAfter = panhadoresRemaining + remainingColheitas.length;
      const sentTotal = (panhadoresProcessed - panhadoresRemaining) + colheitasSent;

      if (sentTotal > 0 && remainingAfter === 0) {
        toast({
          title: "Sincronização completa",
          description: `${totalBefore} registro(s) sincronizado(s)`,
        });
        return;
      }

      if (sentTotal > 0 && remainingAfter > 0) {
        toast({
          title: "Sincronização parcial",
          description: `${sentTotal} enviado(s), ${remainingAfter} pendente(s)`,
        });
        return;
      }

      toast({
        title: "Sincronização pendente",
        description: `${remainingAfter} item(ns) ainda aguardando (veja o alerta para detalhes).`,
        variant: "destructive",
      });
    } catch (error) {
      console.error("Erro ao sincronizar:", error);

      const message =
        typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";

      toast({
        title: "Erro na sincronização",
        description: code || message ? `(${code || "erro"}) ${message || "Tentaremos novamente mais tarde"}` : "Tentaremos novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return {
    isOnline,
    syncing,
    savePendingColheita,
    savePendingPanhadorCreate,
    savePendingPanhadorUpdate,
    savePendingPanhadorDeactivate,
    syncPendingData,
  };
};
