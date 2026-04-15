import { cacheKey, readJson, writeJson } from "@/lib/offline";

export type DeviceLancamentoSettings = {
  // Modo de lançamento
  // - padrao: usuário informa peso (kg) e preço por kg ou por balaio
  // - somente_balaio: usuário informa qtd. balaios e preço por balaio; peso é calculado pelo kg/balaio padrão
  // - peso_medio_balaio: usuário informa peso (kg), kg médio/balaio e preço por balaio; qtd. balaios é calculada
  lancamento_modo?: "padrao" | "somente_balaio" | "peso_medio_balaio";

  // Balaio
  usar_kg_por_balaio_padrao?: boolean; // se true, pré-preenche o campo no lançamento
  kg_por_balaio_padrao?: number | null; // valor padrão salvo no aparelho
  kg_por_litro?: number | null; // conversão local (kg/L)

  // Propriedade/Lavoura
  mostrar_propriedade_lavoura?: boolean; // se false, não mostra no lançamento e usa padrão
  usar_propriedade_lavoura_padrao?: boolean;
  propriedade_padrao_id?: string | null;
  lavoura_padrao_id?: string | null;

  // Preço
  preco_por_balaio_padrao?: boolean; // define modo inicial no lançamento
};

export const getDeviceLancamentoSettingsKey = (empresaId: string) => cacheKey("device_lancamento_settings", empresaId);

export const getDeviceLancamentoSettings = (empresaId: string): DeviceLancamentoSettings => {
  return readJson<DeviceLancamentoSettings>(getDeviceLancamentoSettingsKey(empresaId), {}) ?? {};
};

export const setDeviceLancamentoSettings = (empresaId: string, next: DeviceLancamentoSettings) => {
  const prev = getDeviceLancamentoSettings(empresaId);
  const merged: DeviceLancamentoSettings = { ...prev, ...next };
  writeJson(getDeviceLancamentoSettingsKey(empresaId), merged);
  return merged;
};
