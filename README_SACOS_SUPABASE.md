# Sincronização Supabase — Sacos (balaio) + Kg

Este documento descreve as mudanças no banco (Supabase/Postgres) para que o app envie movimentações em **kg** e o Supabase calcule automaticamente:

- `quantidade_sacos` ($kg / kg_por_saco$)
- `preco_por_kg`
- `preco_por_saco`
- `valor_total` (quando não for enviado)

## 1) Mudanças no banco

### Nova tabela: `empresas_config`
Armazena a configuração por empresa.

Campos:
- `empresa_id` (PK, FK → `empresas.id`)
- `kg_por_saco` (`numeric(10,2)`, default `60`) — média/padrão de kg por saco
- `preco_padrao_por_saco` (`numeric(10,2)`, default `50`) — preço padrão por saco (em R$)

RLS: membros ativos da empresa (tabela `empresas_usuarios`) podem **ler/inserir/atualizar**. Delete fica restrito ao e-mail master.

### Alterações em `colheitas`
Novos campos:
- `quantidade_sacos` (`numeric(12,4)`) — calculado
- `preco_por_saco` (`numeric(10,2)`) — calculado quando ausente

### Cálculo automático (trigger)
Foi criado um trigger `BEFORE INSERT OR UPDATE` em `colheitas`:

1) Calcula `quantidade_sacos = peso_kg / kg_por_saco`
2) Normaliza preços:
   - Se não vier `preco_por_kg` nem `preco_por_saco`: usa `preco_padrao_por_saco` e calcula `preco_por_kg`
   - Se vier só `preco_por_kg`: calcula `preco_por_saco`
   - Se vier só `preco_por_saco`: calcula `preco_por_kg`
3) Se `valor_total` vier `null`, calcula `valor_total = peso_kg * preco_por_kg`

## 2) Como configurar o “kg por saco” e o preço padrão

### Ler configuração
```http
GET /rest/v1/empresas_config?select=*&empresa_id=eq.<empresa_id>
Authorization: Bearer <token>
```

### Atualizar configuração
```http
PATCH /rest/v1/empresas_config?empresa_id=eq.<empresa_id>
Authorization: Bearer <token>
Content-Type: application/json
Prefer: return=representation

{
  "kg_por_saco": 60,
  "preco_padrao_por_saco": 50
}
```

## 3) Como enviar movimentações (colheitas)

### Payload mínimo (recomendado)
Envie **apenas o peso em kg** (e os campos obrigatórios). O Supabase preenche os campos calculados.

```http
POST /rest/v1/colheitas
Authorization: Bearer <token>
Content-Type: application/json
Prefer: return=representation

{
  "empresa_id": "<empresa_id>",
  "user_id": "<uid>",
  "panhador_id": "<panhador_id>",
  "peso_kg": 120.5,
  "numero_bag": "BAG-102",
  "data_colheita": "2026-03-09T12:30:00Z",
  "sincronizado": true
}
```

Resposta (exemplo) incluirá também:
- `quantidade_sacos`
- `preco_por_kg`
- `preco_por_saco`
- `valor_total`

### Enviando preço por kg (opcional)
Se o app já tiver o preço por kg, envie `preco_por_kg`. O Supabase calculará `preco_por_saco`.

```json
{
  "empresa_id": "<empresa_id>",
  "user_id": "<uid>",
  "panhador_id": "<panhador_id>",
  "peso_kg": 120.5,
  "preco_por_kg": 3.25
}
```

### Enviando preço por saco (opcional)
Se o app preferir trabalhar por saco, envie `preco_por_saco`. O Supabase calculará `preco_por_kg`.

```json
{
  "empresa_id": "<empresa_id>",
  "user_id": "<uid>",
  "panhador_id": "<panhador_id>",
  "peso_kg": 120.5,
  "preco_por_saco": 50
}
```

## 4) Observações importantes

- Arredondamentos:
  - `quantidade_sacos`: 4 casas decimais
  - `preco_por_kg` e `preco_por_saco`: 2 casas decimais
  - `valor_total`: 2 casas decimais
- Se você enviar `valor_total`, o trigger não sobrescreve (ele só calcula quando vier `null`).
- Para aplicar as mudanças localmente/CI: `supabase db push`.
