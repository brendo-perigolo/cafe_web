BEGIN;

-- Garante que exista o plano padrão para espelhar pagamentos antigos.
INSERT INTO public.planos_contas (empresa_id, nome)
SELECT e.id, 'Pagamento de panha'
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.planos_contas pc
  WHERE pc.empresa_id = e.id
    AND pc.nome_lower IN ('pagamento de panha', 'pagamento de colheitas')
)
ON CONFLICT ON CONSTRAINT planos_contas_empresa_nome_unique DO NOTHING;

-- Backfill: para cada colheita já paga, cria uma despesa espelhada (uma por colheita).
INSERT INTO public.despesas (
  empresa_id,
  criado_por,
  valor,
  data_vencimento,
  tipo_servico,
  plano_conta_id,
  pagamento_metodo,
  colheita_id
)
SELECT
  c.empresa_id,
  COALESCE(c.pago_por, c.user_id) AS criado_por,
  (c.valor_total)::numeric(12,2) AS valor,
  (c.pago_em)::date AS data_vencimento,
  NULL::text AS tipo_servico,
  pc.id AS plano_conta_id,
  c.pagamento_metodo,
  c.id AS colheita_id
FROM public.colheitas c
JOIN LATERAL (
  SELECT pc2.id
  FROM public.planos_contas pc2
  WHERE pc2.empresa_id = c.empresa_id
    AND pc2.nome_lower IN ('pagamento de panha', 'pagamento de colheitas')
  ORDER BY CASE WHEN pc2.nome_lower = 'pagamento de panha' THEN 0 ELSE 1 END
  LIMIT 1
) pc ON TRUE
WHERE c.pago_em IS NOT NULL
  AND c.valor_total IS NOT NULL
  AND c.valor_total > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.despesas d
    WHERE d.colheita_id = c.id
  );

COMMIT;
