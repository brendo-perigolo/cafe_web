# Esquema Supabase

Documento de referência para integrar o aplicativo Android diretamente ao Supabase. Todos os endpoints REST seguem o padrão `https://<project-ref>.supabase.co/rest/v1/<tabela>` com autenticação via Bearer token do usuário logado.

## Visão Geral

| Tabela             | Função principal                                     |
|--------------------|-------------------------------------------------------|
| `profiles`         | Perfil básico sincronizado com `auth.users`.          |
| `empresas`         | Empresas/contas que isolam dados por organização.     |
| `empresas_usuarios`| Liga usuários às empresas e controla status.          |
| `panhadores`       | Cadastro de panhadores vinculado a uma empresa.       |
| `colheitas`        | Lançamentos de colheita vinculados a empresa/panhador.|

## Tabelas

### profiles

| Coluna      | Tipo        | Obrigatório | Default           | Notas                                 |
|-------------|-------------|-------------|-------------------|---------------------------------------|
| `id`        | `uuid`      | Sim         | —                 | FK para `auth.users.id`.              |
| `username`  | `text`      | Sim         | —                 | Único.                                |
| `full_name` | `text`      | Sim         | —                 | Nome completo.                        |
| `email`     | `text`      | Sim         | —                 | Sincronizado via trigger.             |
| `created_at`| `timestamptz`| Sim        | `now()`           |                                       |
| `updated_at`| `timestamptz`| Sim        | `now()`           | Atualizado por trigger `update_*`.    |

RLS: usuário só pode ler/alterar o próprio `id` (exceto master via política extra).

### empresas

| Coluna       | Tipo         | Obrigatório | Default | Notas                                  |
|--------------|--------------|-------------|---------|----------------------------------------|
| `id`         | `uuid`       | Sim         | `gen_random_uuid()` | Identificador da empresa.  |
| `nome`       | `text`       | Sim         | —       |                                         |
| `ativa`      | `boolean`    | Não         | `true`  |                                         |
| `plano`      | `text`       | Não         | `'free'`| Plano atual.                           |
| `metadata`   | `jsonb`      | Não         | `'{}'`  | Campos extras.                         |
| `responsavel`, `telefone`, `email`, `cnpj` | opcionais.
| `created_at`, `updated_at` | `timestamptz` | Sim | `now()` |

### empresas_usuarios

| Coluna      | Tipo    | Obrigatório | Default | Notas                                |
|-------------|---------|-------------|---------|--------------------------------------|
| `id`        | `uuid`  | Não         | `gen_random_uuid()` | PK.                         |
| `empresa_id`| `uuid`  | Sim         | —       | FK → `empresas.id`.                   |
| `user_id`   | `uuid`  | Sim         | —       | FK → `profiles.id`.                   |
| `cargo`     | `text`  | Não         | —       | Papel/opcional.                       |
| `ativo`     | `boolean` | Não       | `true`  | Se o vínculo está ativo.             |
| `created_at`| `timestamptz` | Sim   | `now()` |                                       |

RLS limita visualização/inserção ao próprio usuário e permite que o master veja tudo.

### panhadores

| Coluna      | Tipo        | Obrigatório | Default | Notas                                               |
|-------------|-------------|-------------|---------|-----------------------------------------------------|
| `id`        | `uuid`      | Não         | `gen_random_uuid()` | PK.                                    |
| `nome`      | `text`      | Sim         | —       | Campo obrigatório.                                 |
| `apelido`   | `text`      | Não         | —       |                                                     |
| `cpf`       | `text`      | Não         | —       | Livre (sem máscara) e opcional.                    |
| `telefone`  | `text`      | Não         | —       |                                                     |
| `empresa_id`| `uuid`      | Sim         | —       | FK → `empresas.id`.                                |
| `user_id`   | `uuid`      | Sim         | —       | Usuário que cadastrou (FK → `profiles.id`).        |
| `ativo`     | `boolean`   | Não         | `true`  | Soft delete.                                       |
| `created_at`,`updated_at`| `timestamptz`| Sim     | `now()` | Atualizado via trigger.                 |

RLS: apenas membros ativos da empresa (ou master) podem ver/manipular os registros.

### colheitas

| Coluna        | Tipo          | Obrigatório | Default                                          | Notas                                                       |
|---------------|---------------|-------------|--------------------------------------------------|-------------------------------------------------------------|
| `id`          | `uuid`        | Não         | `gen_random_uuid()`                              | PK.                                                         |
| `codigo`      | `text`        | Não (auto)  | `upper(substr(encode(gen_random_bytes(8),'hex'),1,10))` | Código único exibido no app.                    |
| `empresa_id`  | `uuid`        | Sim         | —                                                | FK → `empresas.id`.                                         |
| `user_id`     | `uuid`        | Sim         | —                                                | Usuário que registrou (FK → `profiles.id`).                 |
| `panhador_id` | `uuid`        | Sim         | —                                                | FK → `panhadores.id`.                                       |
| `peso_kg`     | `numeric(10,2)` | Sim       | —                                                | Quantidade colhida.                                         |
| `preco_por_kg`| `numeric(10,2)` | Não       | `null`                                           | Informado por lançamento (pode ser omitido).                |
| `valor_total` | `numeric(10,2)` | Não       | `null`                                           | Calculado no app quando `preco_por_kg` é enviado.          |
| `numero_bag`  | `text`        | Não        | `null`                                           | Código da bag, opcional.                                    |
| `data_colheita`| `timestamptz`| Sim         | `now()`                                          | Data da coleta.                                             |
| `sincronizado`| `boolean`     | Não        | `false`                                          | Usado pelo app offline.                                     |
| `created_at`, `updated_at` | `timestamptz` | Sim | `now()` | Mantidos por triggers.                          |

RLS: somente membros ativos da empresa (e o usuário autenticado) podem inserir/alterar/deletar. O e-mail master também possui acesso completo.

## Fluxo para o App Android

1. **Autenticação:** obtenha um JWT via Auth (e-mail/senha) e use-o no header `Authorization: Bearer <token>`.
2. **Selecionar empresa:** após o login, busque `/rest/v1/empresas_usuarios?select=empresa_id,empresas(*)&user_id=eq.<uid>&ativo=is.true`. Salve o `empresa_id` ativo.
3. **Listar panhadores da empresa:**
   ```http
   GET /rest/v1/panhadores?empresa_id=eq.<empresa_id>&ativo=is.true
   ```
4. **Criar lançamento de colheita:**
   ```http
   POST /rest/v1/colheitas
   Content-Type: application/json
   Prefer: return=representation
   {
     "empresa_id": "<empresa_id>",
     "user_id": "<uid>",
     "panhador_id": "<panhador_id>",
     "peso_kg": 120.5,
     "preco_por_kg": 45.90,
     "valor_total": 5533.95,
     "numero_bag": "BAG-102",
     "data_colheita": "2026-02-24T12:30:00Z",
     "sincronizado": true
   }
   ```
   A resposta incluirá o campo `codigo`. Se estiver offline, armazene localmente e envie depois.
5. **Leitura dos totais:** filtre sempre por `empresa_id` para garantir isolamento, ex.:
   ```http
   GET /rest/v1/colheitas?empresa_id=eq.<empresa_id>&select=peso_kg,valor_total
   ```

## Observações

- Todos os campos `uuid` devem ser enviados como strings válidas (geradas pelo app ou pelo Supabase quando omitidas).
- Em requisições REST, adicione `Prefer: return=representation` para receber o registro completo (incluindo `codigo`).
- Caso utilize a biblioteca oficial do Supabase em Kotlin, o mesmo esquema se aplica ao chamar `supabase.from("colheitas").insert(...)`.
- Mantenha as migrações sincronizadas (`supabase db push`) para garantir que o schema do app Android e do painel web permaneçam alinhados.
