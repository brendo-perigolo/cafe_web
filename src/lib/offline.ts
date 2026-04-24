import { idbGet, idbSet } from "@/lib/offlineDb";

export const PENDING_COLHEITAS_KEY = "safra:pending_colheitas";
export const LEGACY_PENDING_COLHEITAS_KEY = "pendingColheitas";

export const PENDING_COLHEITAS_UPDATES_KEY = "safra:pending_colheitas_updates";

export const PENDING_PANHADORES_OPS_KEY = "safra:pending_panhadores_ops";

export const OFFLINE_QUEUE_EVENT = "safra:offline-queue-updated";

function notifyOfflineQueueUpdated() {
  try {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  } catch {
    // ignore
  }
}

const CACHE_PREFIX = "safra:cache:";

export type JsonValue = unknown;

export const cacheKey = (name: string, empresaId: string) => `${CACHE_PREFIX}${name}:${empresaId}`;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: JsonValue) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export interface PendingColheitaLocal {
  id: string;
  // Código gerado no cliente para deduplicar reenvios (ex.: queda de rede após o insert).
  // Opcional para manter compatibilidade com itens antigos já salvos no localStorage.
  codigo?: string;
  // Metadados de sincronização (opcionais para compatibilidade com itens antigos)
  sync_attempts?: number;
  last_error?: string | null;
  last_error_at?: string | null;
  peso_kg: number;
  preco_por_kg: number | null;
  preco_por_balaio?: number | null;
  kg_por_balaio_utilizado?: number | null;
  valor_total: number | null;
  panhador_id: string;
  panhador_nome?: string;
  data_colheita: string;
  numero_bag: string | null;
  empresa_id: string;
  propriedade_id?: string | null;
  lavoura_id?: string | null;
  aparelho_token: string;
  mostrar_balaio_no_ticket?: boolean;
}

export interface PendingColheitaUpdateLocal {
  id: string;
  empresa_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  sync_attempts?: number;
  last_error?: string | null;
  last_error_at?: string | null;
}

export type PendingPanhadorAction = "insert" | "update" | "deactivate";

export interface PendingPanhadorOp {
  id: string;
  action: PendingPanhadorAction;
  empresa_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

let memPendingColheitas: PendingColheitaLocal[] | null = null;
let memPendingColheitasUpdates: PendingColheitaUpdateLocal[] | null = null;
let memPendingPanhadorOps: PendingPanhadorOp[] | null = null;

function ensureMemoryInit() {
  if (memPendingColheitas == null) {
    const current = readJson<PendingColheitaLocal[]>(PENDING_COLHEITAS_KEY, []);
    memPendingColheitas = current.length ? current : readJson<PendingColheitaLocal[]>(LEGACY_PENDING_COLHEITAS_KEY, []);
  }
  if (memPendingColheitasUpdates == null) {
    memPendingColheitasUpdates = readJson<PendingColheitaUpdateLocal[]>(PENDING_COLHEITAS_UPDATES_KEY, []);
  }
  if (memPendingPanhadorOps == null) {
    memPendingPanhadorOps = readJson<PendingPanhadorOp[]>(PENDING_PANHADORES_OPS_KEY, []);
  }
}

function mergeById<T extends { id: string }>(base: T[], extra: T[]) {
  const map = new Map<string, T>();
  base.forEach((it) => map.set(it.id, it));
  extra.forEach((it) => {
    if (!map.has(it.id)) map.set(it.id, it);
  });
  return Array.from(map.values());
}

function trySetLocalStorage(key: string, raw: string) {
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

function tryRemoveLocalStorage(key: string) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

async function hydratePendingQueuesFromIdb() {
  // Se o navegador apagou localStorage mas manteve IndexedDB, recupera as pendências.
  try {
    ensureMemoryInit();

    const [rawColheitas, rawUpdates, rawOps] = await Promise.all([
      idbGet(PENDING_COLHEITAS_KEY),
      idbGet(PENDING_COLHEITAS_UPDATES_KEY),
      idbGet(PENDING_PANHADORES_OPS_KEY),
    ]);

    const idbColheitas = rawColheitas ? (JSON.parse(rawColheitas) as PendingColheitaLocal[]) : [];
    const idbUpdates = rawUpdates ? (JSON.parse(rawUpdates) as PendingColheitaUpdateLocal[]) : [];
    const idbOps = rawOps ? (JSON.parse(rawOps) as PendingPanhadorOp[]) : [];

    const nextColheitas = mergeById(memPendingColheitas ?? [], Array.isArray(idbColheitas) ? idbColheitas : []);
    const nextUpdates = mergeById(memPendingColheitasUpdates ?? [], Array.isArray(idbUpdates) ? idbUpdates : []);
    const nextOps = mergeById(memPendingPanhadorOps ?? [], Array.isArray(idbOps) ? idbOps : []);

    const changed =
      nextColheitas.length !== (memPendingColheitas ?? []).length ||
      nextUpdates.length !== (memPendingColheitasUpdates ?? []).length ||
      nextOps.length !== (memPendingPanhadorOps ?? []).length;

    if (!changed) return;

    memPendingColheitas = nextColheitas;
    memPendingColheitasUpdates = nextUpdates;
    memPendingPanhadorOps = nextOps;

    // Best-effort espelha em localStorage para manter compatibilidade e leitura rápida.
    writeJson(PENDING_COLHEITAS_KEY, nextColheitas);
    removeKey(LEGACY_PENDING_COLHEITAS_KEY);
    writeJson(PENDING_COLHEITAS_UPDATES_KEY, nextUpdates);
    writeJson(PENDING_PANHADORES_OPS_KEY, nextOps);

    notifyOfflineQueueUpdated();
  } catch {
    // ignore
  }
}

// Fire-and-forget (não bloqueia render); mantém pendências mesmo se localStorage for limpo.
void hydratePendingQueuesFromIdb();

export function getPendingColheitas(): PendingColheitaLocal[] {
  ensureMemoryInit();
  return memPendingColheitas ?? [];
}

export async function setPendingColheitas(next: PendingColheitaLocal[]) {
  ensureMemoryInit();
  memPendingColheitas = next;
  const raw = JSON.stringify(next);
  const localOk = trySetLocalStorage(PENDING_COLHEITAS_KEY, raw);
  // cleanup legacy if present
  tryRemoveLocalStorage(LEGACY_PENDING_COLHEITAS_KEY);
  notifyOfflineQueueUpdated();

  try {
    await idbSet(PENDING_COLHEITAS_KEY, raw);
    return;
  } catch {
    if (!localOk) {
      throw new Error("Falha ao salvar dados offline no dispositivo");
    }
  }
}

export function getPendingColheitasUpdates(): PendingColheitaUpdateLocal[] {
  ensureMemoryInit();
  return memPendingColheitasUpdates ?? [];
}

export async function setPendingColheitasUpdates(next: PendingColheitaUpdateLocal[]) {
  ensureMemoryInit();
  memPendingColheitasUpdates = next;
  const raw = JSON.stringify(next);
  const localOk = trySetLocalStorage(PENDING_COLHEITAS_UPDATES_KEY, raw);
  notifyOfflineQueueUpdated();

  try {
    await idbSet(PENDING_COLHEITAS_UPDATES_KEY, raw);
    return;
  } catch {
    if (!localOk) {
      throw new Error("Falha ao salvar alterações offline no dispositivo");
    }
  }
}

export function getPendingPanhadorOps(): PendingPanhadorOp[] {
  ensureMemoryInit();
  return memPendingPanhadorOps ?? [];
}

export async function setPendingPanhadorOps(next: PendingPanhadorOp[]) {
  ensureMemoryInit();
  memPendingPanhadorOps = next;
  const raw = JSON.stringify(next);
  const localOk = trySetLocalStorage(PENDING_PANHADORES_OPS_KEY, raw);
  notifyOfflineQueueUpdated();

  try {
    await idbSet(PENDING_PANHADORES_OPS_KEY, raw);
    return;
  } catch {
    if (!localOk) {
      throw new Error("Falha ao salvar fila offline no dispositivo");
    }
  }
}
