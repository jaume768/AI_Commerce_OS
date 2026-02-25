# AI Commerce OS — Runbook (Fase 4)

## Prerequisites

- Docker & Docker Compose v2+
- Node.js 20+ & pnpm 9+
- (Optional) Python 3.12+ for local agent-service dev

## Quick Start

```bash
# 1. Clone & enter repo
cd aicommerceos

# 2. Copy env
cp .env.example .env

# 3. Start everything
make dev
# or: docker compose up --build -d

# 4. Wait for all services to be healthy (~30s)
make ps

# 5. Seed demo data
make seed

# 6. Run smoke tests
make smoke
```

## Service URLs

| Service         | URL                      | Notes                  |
|-----------------|--------------------------|------------------------|
| Dashboard       | http://localhost:3000     | Next.js + NextAuth     |
| API Node        | http://localhost:4000     | Fastify REST API       |
| Agent Service   | http://localhost:8000     | FastAPI (Python)       |
| MinIO Console   | http://localhost:9001     | S3-compatible storage  |
| PostgreSQL      | localhost:5432            | DB: aicommerce         |
| Redis           | localhost:6379            |                        |
| pgAdmin         | http://localhost:5050     | `make tools` to start  |
| Grafana         | http://localhost:3001     | `make observability`   |
| Prometheus      | http://localhost:9090     | `make observability`   |

## Default Credentials

| Service   | Email/User           | Password    |
|-----------|----------------------|-------------|
| Dashboard | admin@example.com    | password123 |
| Dashboard | viewer@example.com   | password123 |
| MinIO     | minioadmin           | minioadmin  |
| pgAdmin   | admin@aicommerce.local | admin     |
| Grafana   | admin                | admin       |

## Auth Flow

```bash
# Login → get JWT token + store_id
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'

# Use token + store_id in subsequent requests
curl http://localhost:4000/tasks?page=1&limit=10 \
  -H "Authorization: Bearer <token>" \
  -H "x-store-id: <store_id>"
```

## Task Flow (End-to-End)

1. **Dashboard/API** creates a task → `POST /tasks`
2. **API** persists to DB (status: `queued`) + enqueues to BullMQ
3. **Worker** picks up the job from Redis
4. **Worker** executes handler (e.g., `dummy` → simulates work)
5. **Worker** uploads artifact to S3 (MinIO)
6. **Worker** creates asset record + audit log in DB
7. **Worker** updates task status to `completed`

```bash
# Create a task
curl -X POST http://localhost:4000/tasks \
  -H "Authorization: Bearer <token>" \
  -H "x-store-id: <store_id>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test dummy","task_type":"dummy","priority":1}'

# Check task status (after ~2s)
curl http://localhost:4000/tasks/<task_id> \
  -H "Authorization: Bearer <token>" \
  -H "x-store-id: <store_id>"
```

## Approvals Flow

```bash
# Create approval
curl -X POST http://localhost:4000/approvals \
  -H "Authorization: Bearer <token>" \
  -H "x-store-id: <store_id>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Review campaign copy","diff_payload":{"before":"old","after":"new"}}'

# Approve it
curl -X PATCH http://localhost:4000/approvals/<id> \
  -H "Authorization: Bearer <token>" \
  -H "x-store-id: <store_id>" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","reason":"Looks good"}'
```

## Makefile Commands

```
make help          # Show all commands
make dev           # Build + start all services
make up            # Start (no rebuild)
make down          # Stop
make logs          # Tail all logs
make logs-api      # Tail API logs
make logs-worker   # Tail worker logs
make migrate       # Run DB migrations
make seed          # Seed demo data
make smoke         # Run smoke tests
make clean         # Remove containers + volumes
make observability # Start with OTEL + Prometheus + Grafana
make tools         # Start pgAdmin
make shell-api     # Shell into API container
make shell-db      # psql into Postgres
```

## Architecture

```
apps/
  dashboard-next/      → Next.js 14 (App Router) + NextAuth + Tailwind
services/
  api-node/            → Fastify 4 (JWT auth, RBAC, BullMQ producer)
  workers/             → BullMQ consumer (task handlers, S3 upload)
  agent-service/       → FastAPI (Python, placeholder for Fase 6 agents)
packages/
  shared/              → Types, enums, zod validation, pino logger, config
  connectors/          → S3 client, Shopify/Meta/TikTok/LLM stubs
infra/
  docker/              → Dockerfiles, OTEL/Prometheus configs
  migrations/          → SQL migrations + runner
  scripts/             → Seed, smoke tests
```

## Multi-Tenant Model

- Every request requires `x-store-id` header
- The `extractTenant` plugin verifies user has a `membership` to the store
- All DB queries are scoped by `store_id`
- Optional RLS support via `ENABLE_RLS=true`

## RBAC

| Role   | Tasks | Approvals | View |
|--------|-------|-----------|------|
| admin  | CRUD  | CRUD      | All  |
| viewer | Read  | Read      | All  |

## Troubleshooting

**Services won't start?**
```bash
docker compose logs postgres redis minio
make clean && make dev
```

**Migrations failed?**
```bash
docker compose logs migrate
docker compose exec postgres psql -U postgres -d aicommerce -c "SELECT * FROM _migrations"
```

**Worker not processing?**
```bash
make logs-worker
docker compose exec redis redis-cli KEYS "bull:tasks:*"
```

**MinIO bucket missing?**
```bash
docker compose logs minio-init
docker compose run --rm minio-init
```

## Feature Flags

| Flag          | Default | Description                        |
|---------------|---------|------------------------------------|
| `DRY_RUN`     | `true`  | Skip real external API calls       |
| `ENABLE_RLS`  | `false` | Enable Postgres Row-Level Security |
| `OTEL_ENABLED`| `false` | Enable OpenTelemetry tracing       |

## Next Steps (Fase 5+)

- Shopify OAuth + webhooks integration
- Real Meta/TikTok ad connectors
- LLM-based campaign generation
- Advanced agent orchestration
- Production deployment (Kubernetes/Fly.io)
