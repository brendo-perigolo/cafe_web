import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getAparelhoAtivo } from "@/lib/aparelhos";
import { getDeviceToken, safeRandomUUID } from "@/lib/device";
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

    for (const op of ops) {
      if (op.action === "insert") {
        const { error } = await supabase.from("panhadores").insert(op.payload);
        if (error) throw error;

        const bagNumero = typeof op.payload.bag_numero === "string" ? op.payload.bag_numero : null;
        const panhadorId = typeof op.payload.id === "string" ? op.payload.id : null;
        if (bagNumero && panhadorId) {
          await supabase.from("panhadores_bag_historico").insert({
            empresa_id: op.empresa_id,
            panhador_id: panhadorId,
            bag_anterior: null,
            bag_nova: bagNumero,
            alterado_por: user.id,
            observacao: "Definição inicial (offline)",
          });
        }

        continue;
      }

      if (op.action === "update") {
        const id = typeof op.payload.id === "string" ? op.payload.id : null;
        if (!id) continue;
        const { error } = await supabase.from("panhadores").update(op.payload).eq("id", id);
        if (error) throw error;
        continue;
      }

      if (op.action === "deactivate") {
        const id = typeof op.payload.id === "string" ? op.payload.id : null;
        if (!id) continue;
        const { error } = await supabase.from("panhadores").update({ ativo: false }).eq("id", id);
        if (error) throw error;
      }
    }

    setPendingPanhadorOps([]);
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

    try {
      // 1) Sincroniza panhadores primeiro (colheitas podem depender deles)
      await syncPendingPanhadores();

      // 2) Sincroniza colheitas
      for (const colheita of pending) {
        const aparelhoToken = (colheita as unknown as { aparelho_token?: string }).aparelho_token || getDeviceToken();
        const ativo = await getAparelhoAtivo(colheita.empresa_id, aparelhoToken);
        const pendenteAparelho = ativo !== true;

        const { error } = await supabase.from("colheitas").insert({
          peso_kg: colheita.peso_kg,
          preco_por_kg: colheita.preco_por_kg,
          preco_por_balaio: colheita.preco_por_balaio ?? null,
          kg_por_balaio_utilizado: colheita.kg_por_balaio_utilizado ?? null,
          valor_total: colheita.valor_total,
          panhador_id: colheita.panhador_id,
          user_id: user.id,
          data_colheita: colheita.data_colheita,
          empresa_id: colheita.empresa_id,
          numero_bag: colheita.numero_bag,
          sincronizado: true,
          mostrar_balaio_no_ticket: colheita.mostrar_balaio_no_ticket ?? false,
          aparelho_token: aparelhoToken,
          pendente_aparelho: pendenteAparelho,
          ...(Object.prototype.hasOwnProperty.call(colheita, "propriedade_id")
            ? { propriedade_id: colheita.propriedade_id ?? null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(colheita, "lavoura_id") ? { lavoura_id: colheita.lavoura_id ?? null } : {}),
        });

        if (error) throw error;
      }

      setPendingColheitas([]);
      toast({
        title: "Sincronização completa",
        description: `${pendingPanhadores.length + pending.length} registro(s) enviado(s)`,
      });
    } catch (error) {
      console.error("Erro ao sincronizar:", error);
      toast({
        title: "Erro na sincronização",
        description: "Tentaremos novamente mais tarde",
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
