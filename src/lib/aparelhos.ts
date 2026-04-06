import { supabase } from "@/integrations/supabase/client";

const statusCache = new Map<string, boolean | null>();

export const getAparelhoAtivo = async (empresaId: string, token: string) => {
  const key = `${empresaId}:${token}`;
  if (statusCache.has(key)) return statusCache.get(key) ?? null;

  const primary = await supabase
    .from("aparelhos")
    .select("ativo")
    .eq("empresa_id", empresaId)
    .eq("token", token)
    .maybeSingle();

  const fallbackNeeded = primary.error && (primary.error as { code?: string }).code === "42703";
  const { data, error } = fallbackNeeded
    ? await supabase.from("aparelhos").select("ativo").eq("token", token).maybeSingle()
    : primary;

  if (error) {
    console.error("Erro ao consultar aparelho:", error);
    statusCache.set(key, null);
    return null;
  }

  const ativo = data?.ativo ?? null;
  statusCache.set(key, ativo);
  return ativo;
};
