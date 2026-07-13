# BouCheck

Plataforma de pesquisas e diagnósticos de maturidade em cloud.

## Estrutura do Projeto

```
boucheck/
├── backend/    # AdonisJS 6 (Node.js 22, TypeScript) — API, Lucid ORM, migrations, seeders
├── frontend/   # Next.js 15 (App Router, TypeScript) — interface web
├── infra/      # AWS CDK (TypeScript) — infraestrutura como código (VPC, RDS, S3, SQS)
```

## Pré-requisitos

- Node.js 22 (LTS)
- PostgreSQL 16
- AWS CLI v2 configurado com credenciais válidas
- AWS CDK CLI (`npm install -g aws-cdk`)

## Setup

Instale as dependências de cada projeto:

```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../infra && npm ci
```

## Variáveis de Ambiente

O backend lê credenciais de banco via variáveis de ambiente. Em produção, esses valores são resolvidos a partir do AWS Secrets Manager — nunca commit de segredos no repositório.

| Variável        | Descrição                              | Exemplo (dev)       |
|-----------------|----------------------------------------|---------------------|
| `DB_HOST`       | Hostname do PostgreSQL                 | `127.0.0.1`         |
| `DB_PORT`       | Porta do PostgreSQL                    | `5432`              |
| `DB_USER`       | Usuário do banco                       | `postgres`          |
| `DB_PASSWORD`   | Senha do banco                         | *(vazio em dev)*    |
| `DB_DATABASE`   | Nome do banco de dados                 | `boucheck`          |
| `NODE_ENV`      | Ambiente de execução                   | `development`       |
| `PORT`          | Porta da API                           | `3333`              |
| `HOST`          | Host de bind da API                    | `0.0.0.0`          |
| `APP_KEY`       | Chave de criptografia do AdonisJS      | *(gerar via cli)*   |

Copie `backend/.env.example` para `backend/.env` e preencha os valores locais.

## Deploy (CDK)

Os stacks CDK devem ser implantados na seguinte ordem, respeitando as dependências entre eles:

```
1. NetworkStack   — VPC, subnets, security groups
2. DatabaseStack  — RDS PostgreSQL 16, Secrets Manager (depende do NetworkStack)
3. StorageStack   — S3 buckets, SQS queues (depende do NetworkStack)
```

Para fazer deploy:

```bash
cd infra
npx cdk deploy BoucheckNetworkStack
npx cdk deploy BoucheckDatabaseStack
npx cdk deploy BoucheckStorageStack
```

Ou deploy de todos (o CDK resolve a ordem automaticamente):

```bash
cd infra
npx cdk deploy --all
```

## Migrations

As migrations rodam contra o endpoint do RDS (ou banco local) usando as variáveis de ambiente de conexão.

### Executar migrations

```bash
cd backend
node ace migration:run
```

### Rollback

```bash
cd backend
node ace migration:rollback          # reverte o último batch
node ace migration:rollback --batch=0  # reverte todas
```

### Em produção

Configure as variáveis `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE` apontando para o endpoint RDS (valores do Secrets Manager) e execute `node ace migration:run`.

## Seeds (dados de desenvolvimento)

Para popular o banco com o survey de demonstração e dados de referência:

```bash
cd backend
node ace db:seed
```

Os seeds são idempotentes — executar múltiplas vezes produz o mesmo resultado.

## Convenção de Nomes e Ordenação de Migrations

As migrations Lucid utilizam nomes de arquivo com **prefixo de timestamp** para garantir ordem determinística de execução:

```
{timestamp}_create_{table_name}_table.ts
```

Exemplos:

```
1704067200000_create_categories_table.ts
1704067200001_create_admin_users_table.ts
1704067200002_create_surveys_table.ts
...
```

**Regras:**

1. O prefixo numérico (timestamp Unix em milissegundos) garante que a ordenação lexicográfica dos arquivos corresponde à ordem de execução.
2. As migrations são criadas em **ordem de dependência referencial** — toda tabela referenciada por uma foreign key é criada antes da tabela que a referencia.
3. Cada migration possui um método `down()` que reverte as alterações do `up()` (geralmente `DROP TABLE`), permitindo rollback completo.
4. Para criar uma nova migration: `cd backend && node ace make:migration <nome>`

## Desenvolvimento

### Backend (AdonisJS)

```bash
cd backend
node ace serve --watch
```

A API estará disponível em `http://localhost:3333`.

### Frontend (Next.js)

```bash
cd frontend
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

### Verificação de qualidade

Cada projeto expõe comandos de verificação:

```bash
# Em qualquer projeto (backend/, frontend/, infra/)
npm run typecheck      # tsc --noEmit (strict mode)
npm run lint           # ESLint
npm run format:check   # Prettier
```
