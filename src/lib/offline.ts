export const PENDING_COLHEITAS_KEY = "safra:pending_colheitas";
export const LEGACY_PENDING_COLHEITAS_KEY = "pendingColheitas";

export const PENDING_COLHEITAS_UPDATES_KEY = "safra:pending_colheitas_updates";

export const PENDING_PANHADORES_OPS_KEY = "safra:pending_panhadores_ops";

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

export function getPendingColheitas(): PendingColheitaLocal[] {
  const current = readJson<PendingColheitaLocal[]>(PENDING_COLHEITAS_KEY, []);
  if (current.length) return current;
  // backward compatibility
  return readJson<PendingColheitaLocal[]>(LEGACY_PENDING_COLHEITAS_KEY, []);
}

export function setPendingColheitas(next: PendingColheitaLocal[]) {
  writeJson(PENDING_COLHEITAS_KEY, next);
  // cleanup legacy if present
  removeKey(LEGACY_PENDING_COLHEITAS_KEY);
}

export function getPendingColheitasUpdates(): PendingColheitaUpdateLocal[] {
  return readJson<PendingColheitaUpdateLocal[]>(PENDING_COLHEITAS_UPDATES_KEY, []);
}

export function setPendingColheitasUpdates(next: PendingColheitaUpdateLocal[]) {
  writeJson(PENDING_COLHEITAS_UPDATES_KEY, next);
}

export function getPendingPanhadorOps(): PendingPanhadorOp[] {
  return readJson<PendingPanhadorOp[]>(PENDING_PANHADORES_OPS_KEY, []);
}

export function setPendingPanhadorOps(next: PendingPanhadorOp[]) {
  writeJson(PENDING_PANHADORES_OPS_KEY, next);
}
