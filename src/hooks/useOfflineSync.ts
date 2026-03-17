import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface PendingColheita {
  id: string;
  peso_kg: number;
  preco_por_kg: number | null;
  preco_por_balaio?: number | null;
  kg_por_balaio_utilizado?: number | null;
  valor_total: number | null;
  panhador_id: string;
  data_colheita: string;
  numero_bag: string | null;
  empresa_id: string;
  mostrar_balaio_no_ticket?: boolean;
}

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
    const pending = JSON.parse(localStorage.getItem("pendingColheitas") || "[]");
    const newColheita = {
      id: crypto.randomUUID(),
      ...colheita,
    };
    pending.push(newColheita);
    localStorage.setItem("pendingColheitas", JSON.stringify(pending));
    return newColheita;
  };

  const syncPendingData = async () => {
    if (!user || syncing) return;

    setSyncing(true);
    const pending = JSON.parse(localStorage.getItem("pendingColheitas") || "[]") as PendingColheita[];

    if (pending.length === 0) {
      setSyncing(false);
      return;
    }

    try {
      for (const colheita of pending) {
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
        });

        if (error) throw error;
      }

      localStorage.removeItem("pendingColheitas");
      toast({
        title: "Sincronização completa",
        description: `${pending.length} registro(s) enviado(s)`,
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
    syncPendingData,
  };
};
