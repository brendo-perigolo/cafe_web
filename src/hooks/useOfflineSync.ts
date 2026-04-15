import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getAparelhoAtivo } from "@/lib/aparelhos";
import { getDeviceToken, safeRandomUUID } from "@/lib/device";
import { toUuidOrNull } from "@/lib/uuid";
import {
  getPendingColheitas,
  getPendingColheitasUpdates,
  getPendingPanhadorOps,
  PendingColheitaLocal,
  PendingColheitaUpdateLocal,
  PendingPanhadorOp,
  setPendingColheitas,
  setPendingColheitasUpdates,
  setPendingPanhadorOps,
} from "@/lib/offline";

export type PendingColheita = PendingColheitaLocal;

export type PendingPanhadorAction = PendingPanhadorOp["action"];

export const getPendingCounts = () => {
  const colheitas = getPendingColheitas();
  const colheitasUpdates = getPendingColheitasUpdates();
  const panhadores = getPendingPanhadorOps();
  return { colheitas: colheitas.length + colheitasUpdates.length, panhadores: panhadores.length };
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

  const savePendingColheitaUpdate = (update: Omit<PendingColheitaUpdateLocal, "created_at" | "sync_attempts" | "last_error" | "last_error_at">) => {
    const pending = getPendingColheitasUpdates();
    const newUpdate: PendingColheitaUpdateLocal = {
      ...update,
      created_at: new Date().toISOString(),
      sync_attempts: 0,
      last_error: null,
      last_error_at: null,
    };

    // Replace any previous pending update for same colheita id (keep newest intent).
    const next = pending.filter((it) => it.id !== update.id);
    next.push(newUpdate);
    setPendingColheitasUpdates(next);
    return newUpdate;
  };

  const syncPendingPanhadores = async (): Promise<Record<string, string>> => {
    if (!user) return;
    const ops = getPendingPanhadorOps();
    if (ops.length === 0) return {};

    const idRemap: Record<string, string> = {};

    const normalize = (value: unknown) =>
      String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    const getPayloadString = (payload: Record<string, unknown>, key: string) => {
      const value = payload[key];
      return typeof value === "string" ? value : null;
    };

    const buildMergeUpdate = (payload: Record<string, unknown>, existing: Record<string, unknown>) => {
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (key === "id" || key === "created_at" || key === "updated_at") continue;
        if (value == null) continue;
        if (typeof value === "string" && !value.trim()) continue;

        const existingValue = existing[key];
        if (existingValue == null || (typeof existingValue === "string" && !existingValue.trim())) {
          next[key] = value;
        }
      }
      // mantém o registro ativo se estamos mesclando dados
      if (existing.ativo === false) next.ativo = true;
      return next;
    };

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

    // Passo 1: tenta mesclar inserts com registros já existentes (evita duplicidade)
    for (const op of ops) {
      if (op.action !== "insert") continue;

      const payload = op.payload;
      const offlineId = getPayloadString(payload, "id");
      const nome = normalize(getPayloadString(payload, "nome"));
      const apelidoRaw = getPayloadString(payload, "apelido");
      const apelido = apelidoRaw == null ? "" : normalize(apelidoRaw);
      const bagRaw = getPayloadString(payload, "bag_numero");
      const bag = bagRaw == null ? "" : normalize(bagRaw);

      if (!offlineId || !nome) continue;

      try {
        let q = supabase
          .from("panhadores")
          .select("id, nome, apelido, bag_numero, cpf, telefone, ativo")
          .eq("empresa_id", op.empresa_id)
          .limit(25);

        // Se tiver bag, usa como filtro principal (mais específico)
        if (bag) q = q.eq("bag_numero", bagRaw as string);
        // Nome ajuda a reduzir candidatos sem precisar baixar tudo
        q = q.ilike("nome", (getPayloadString(payload, "nome") ?? "") as string);

        const { data, error } = await q;
        if (error) throw error;
        const candidates = (data ?? []) as Array<Record<string, unknown>>;

        const match = candidates.find((row) => {
          const rowNome = normalize(row.nome);
          const rowApelido = row.apelido == null ? "" : normalize(row.apelido);
          const rowBag = row.bag_numero == null ? "" : normalize(row.bag_numero);
          return rowNome === nome && rowApelido === apelido && rowBag === bag;
        });

        if (!match || typeof match.id !== "string") continue;

        // Mescla dados no registro existente (sem sobrescrever campos já preenchidos)
        let updatePayload = buildMergeUpdate(payload, match);
        if (Object.keys(updatePayload).length === 0) {
          idRemap[offlineId] = match.id;
          continue;
        }

        let { error: updateError } = await supabase.from("panhadores").update(updatePayload).eq("id", match.id);
        if (updateError && getErrorCode(updateError) === "42703") {
          updatePayload = stripUnknownBagFields(updatePayload);
          ({ error: updateError } = await supabase.from("panhadores").update(updatePayload).eq("id", match.id));
        }
        if (updateError) throw updateError;

        idRemap[offlineId] = match.id;
      } catch (error) {
        console.error("Erro ao tentar mesclar panhador (dedupe):", error);
      }
    }

    // Passo 2: processa fila normalmente (aplicando remap quando existir)
    for (const op of ops) {
      if (op.action === "insert") {
        const offlineId = getPayloadString(op.payload, "id");
        if (offlineId && idRemap[offlineId]) {
          // Já mesclado com registro existente
          continue;
        }
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
        const idRaw = typeof op.payload.id === "string" ? op.payload.id : null;
        const id = idRaw && idRemap[idRaw] ? idRemap[idRaw] : idRaw;
        if (!id) continue;
        try {
          let payload = { ...op.payload, id };
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
        const idRaw = typeof op.payload.id === "string" ? op.payload.id : null;
        const id = idRaw && idRemap[idRaw] ? idRemap[idRaw] : idRaw;
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

    return idRemap;
  };

  const syncPendingData = async () => {
    if (!user || syncing) return;

    setSyncing(true);
    const pending = getPendingColheitas() as PendingColheita[];

    const pendingUpdates = getPendingColheitasUpdates();

    const pendingPanhadores = getPendingPanhadorOps();

    if (pending.length === 0 && pendingPanhadores.length === 0 && pendingUpdates.length === 0) {
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
      const panhadorRemap = await syncPendingPanhadores();

      // Se houve mesclagem, remapeia panhador_id em colheitas pendentes antes de enviar
      if (Object.keys(panhadorRemap).length > 0) {
        const pendingBefore = getPendingColheitas() as PendingColheita[];
        const remapped = pendingBefore.map((c) => {
          const current = (c as unknown as { panhador_id?: unknown }).panhador_id;
          const key = typeof current === "string" ? current : "";
          const nextId = key && panhadorRemap[key] ? panhadorRemap[key] : current;
          return nextId === current ? c : ({ ...c, panhador_id: nextId } as PendingColheita);
        });
        setPendingColheitas(remapped);
      }

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

      // 3) Sincroniza edições offline (updates)
      let colheitasUpdatesSent = 0;
      const remainingUpdates: PendingColheitaUpdateLocal[] = [];

      for (const upd of pendingUpdates) {
        try {
          const raw = upd.payload ?? {};

          const baseUpdate: Record<string, unknown> = {
            ...(Object.prototype.hasOwnProperty.call(raw, "panhador_id") ? { panhador_id: toUuidOrNull(raw.panhador_id) } : {}),
            ...(Object.prototype.hasOwnProperty.call(raw, "peso_kg") ? { peso_kg: raw.peso_kg } : {}),
            ...(Object.prototype.hasOwnProperty.call(raw, "preco_por_kg") ? { preco_por_kg: raw.preco_por_kg } : {}),
            ...(Object.prototype.hasOwnProperty.call(raw, "valor_total") ? { valor_total: raw.valor_total } : {}),
            ...(Object.prototype.hasOwnProperty.call(raw, "numero_bag") ? { numero_bag: raw.numero_bag } : {}),
            updated_at: new Date().toISOString(),
          };

          const extendedUpdate: Record<string, unknown> = {
            ...baseUpdate,
            ...(Object.prototype.hasOwnProperty.call(raw, "propriedade_id") ? { propriedade_id: toUuidOrNull(raw.propriedade_id) } : {}),
            ...(Object.prototype.hasOwnProperty.call(raw, "lavoura_id") ? { lavoura_id: toUuidOrNull(raw.lavoura_id) } : {}),
          };

          let { error } = await supabase
            .from("colheitas")
            .update(extendedUpdate)
            .eq("id", upd.id)
            .eq("empresa_id", upd.empresa_id);

          const code = error ? getErrorCode(error) : null;
          const message = error ? getErrorMessage(error).toLowerCase() : "";

          const looksLikeMissingColumn =
            code === "42703" || message.includes("column") || message.includes("does not exist") || message.includes("propriedade") || message.includes("lavoura");

          if (error && looksLikeMissingColumn) {
            ({ error } = await supabase
              .from("colheitas")
              .update(baseUpdate)
              .eq("id", upd.id)
              .eq("empresa_id", upd.empresa_id));
          }

          if (error) throw error;
          colheitasUpdatesSent += 1;
        } catch (error) {
          console.error("Erro ao sincronizar edição offline:", error);
          const next: PendingColheitaUpdateLocal = {
            ...upd,
            sync_attempts: (upd.sync_attempts ?? 0) + 1,
            last_error: formatSyncError(error),
            last_error_at: new Date().toISOString(),
          };
          remainingUpdates.push(next);
          continue;
        }
      }

      setPendingColheitasUpdates(remainingUpdates);

      const totalBefore = pendingPanhadores.length + pending.length + pendingUpdates.length;
      const remainingAfter = panhadoresRemaining + remainingColheitas.length + remainingUpdates.length;
      const sentTotal = (panhadoresProcessed - panhadoresRemaining) + colheitasSent + colheitasUpdatesSent;

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
    savePendingColheitaUpdate,
    savePendingPanhadorCreate,
    savePendingPanhadorUpdate,
    savePendingPanhadorDeactivate,
    syncPendingData,
  };
};
