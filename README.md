# AI Commerce OS

**Plataforma de comercio inteligente que conecta tu tienda Shopify con agentes de IA para automatizar operaciones, marketing y soporte.**

AI Commerce OS es un sistema modular que integra Shopify con agentes autónomos capaces de gestionar pedidos, optimizar campañas publicitarias, generar creatividades y reportar métricas — todo con supervisión humana a través de un dashboard centralizado.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Guía paso a paso](#guía-paso-a-paso)
  - [Paso 1: Crear tu tienda Shopify](#paso-1-crear-tu-tienda-shopify)
  - [Paso 2: Crear la app en Shopify Dev Dashboard](#paso-2-crear-la-app-en-shopify-dev-dashboard)
  - [Paso 3: Clonar e instalar el proyecto](#paso-3-clonar-e-instalar-el-proyecto)
  - [Paso 4: Configurar variables de entorno](#paso-4-configurar-variables-de-entorno)
  - [Paso 5: Levantar los servicios](#paso-5-levantar-los-servicios)
  - [Paso 6: Crear datos iniciales (seed)](#paso-6-crear-datos-iniciales-seed)
  - [Paso 7: Acceder al dashboard](#paso-7-acceder-al-dashboard)
  - [Paso 8: Configurar webhooks (opcional en desarrollo)](#paso-8-configurar-webhooks-opcional-en-desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Servicios y puertos](#servicios-y-puertos)
- [Credenciales por defecto](#credenciales-por-defecto)
- [API Reference](#api-reference)
- [Comandos Make](#comandos-make)
- [Multi-tenancy y RBAC](#multi-tenancy-y-rbac)
- [Seguridad](#seguridad)
- [Shopify Integration](#shopify-integration)
- [Webhooks](#webhooks)
- [Tracking — Fase 3](#tracking--fase-3)
- [Agentes IA — Fase 6](#agentes-ia--fase-6)
  - [Arquitectura del Agent Service](#arquitectura-del-agent-service)
  - [Agentes disponibles](#agentes-disponibles)
  - [System Prompts](#system-prompts)
  - [Nota del operador](#nota-del-operador)
  - [Configuración de LLM](#configuración-de-llm)
  - [Scheduling automático](#scheduling-automático)
- [Observabilidad](#observabilidad)
- [Feature Flags](#feature-flags)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                    SHOPIFY STORE                         │
│           (Productos, pedidos, clientes)                 │
└──────────────┬────────────────────┬──────────────────────┘
               │ REST/GraphQL API   │ Webhooks
               ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                     api-node (Fastify)                   │
│  Auth (JWT) │ RBAC │ Brute-force protection              │
│  Shopify routes │ Webhook receiver (HMAC) │ Tracking     │
│  Tasks │ Approvals │ Assets │ Agent proxy                │
└──────┬──────────┬──────────────┬─────────┬───────────────┘
       │          │              │         │ Internal auth
       ▼          ▼              ▼         ▼
┌──────────┐ ┌────────┐ ┌────────────┐ ┌──────────────────────────────┐
│PostgreSQL│ │ Redis  │ │MinIO (S3)  │ │  agent-service (FastAPI)     │
│ (datos)  │ │(colas) │ │(assets)    │ │  OpsAgent │ SupportAgent     │
└──────────┘ └───┬────┘ └────────────┘ │  ReportingAgent │ Scheduler  │
                 │                     │  LLM (Claude/OpenAI/Mock)    │
                 ▼                     │  Tools │ Runner │ Kill switch │
        ┌────────────────┐             └──────────────────────────────┘
        │ Worker (BullMQ)│
        │ (tareas async) │                 ┌──────────────────────┐
        └────────────────┘                 │  LLM Provider        │
                                           │  (Anthropic/OpenAI)  │
┌──────────────────────────────────────────┴──────────────────────┘
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              dashboard-next (Next.js 14)                    │ │
│  │  Login │ Overview │ Tasks │ Approvals │ Shopify pages       │ │
│  │  Products │ Orders │ Customers │ Webhooks │ Tracking        │ │
│  │  Agents (run + note + toggle + history) │ Run detail        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Meta CAPI  │  TikTok Events API               │ │
│  │  (Server-side tracking con SHA-256 PII hashing)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Requisitos previos

| Herramienta       | Versión mínima | Notas                           |
|-------------------|----------------|---------------------------------|
| **Docker**        | 20+            | Con Docker Compose v2           |
| **Node.js**       | 20+            | Para desarrollo local           |
| **pnpm**          | 9+             | Gestor de paquetes del monorepo |
| **Python**        | 3.12+          | Solo para agent-service local   |
| **Cuenta Shopify**| —              | Plan Basic o superior           |

---

## Guía paso a paso

### Paso 1: Crear tu tienda Shopify

1. Ve a [shopify.com](https://www.shopify.com/) y crea una cuenta
2. Crea una tienda con el plan **Basic** (o usa el plan de prueba gratuito)
3. Configura lo básico:
   - **Moneda**: La de tu mercado (ej: EUR para Europa)
   - **Impuestos**: Configura según tu país
   - **Zonas de envío**: Añade las zonas donde venderás
4. **Añade productos**: Al menos unos cuantos para poder probar la integración
5. Anota tu **dominio de Shopify**: tiene la forma `tu-tienda.myshopify.com`

> **Ejemplo**: Si tu tienda se llama "Astrawisp", tu dominio será algo como `tb0weq-yv.myshopify.com`

### Paso 2: Crear la app en Shopify Dev Dashboard

La app es lo que permite a AI Commerce OS comunicarse con tu tienda de forma segura.

#### 2.1 Acceder al Dev Dashboard

1. Ve a [partners.shopify.com](https://partners.shopify.com/) y crea una cuenta de Partner (gratuita)
2. Ve a **Apps** → **Create app** → **Create app manually**
3. Ponle un nombre (ej: "AI Commerce OS")

#### 2.2 Configurar scopes (permisos)

En la sección **Configuration** → **Access scopes**, añade:

```
read_analytics,read_customers,read_inventory,read_marketing_events,read_orders,read_products,write_products
```

| Scope                    | Para qué se usa                                   |
|--------------------------|---------------------------------------------------|
| `read_products`          | Leer productos, variantes, colecciones            |
| `write_products`         | Actualizar título, tags, SEO, metafields          |
| `read_orders`            | Leer pedidos, line items, estados                 |
| `read_customers`         | Leer datos de clientes                            |
| `read_inventory`         | Leer stock de variantes                           |
| `read_analytics`         | Métricas y reporting                              |
| `read_marketing_events`  | Leer campañas de marketing                        |

#### 2.3 Obtener credenciales

En la sección **Overview** de tu app, encontrarás:

- **Client ID** → Lo necesitarás como `SHOPIFY_CLIENT_ID`
- **Client Secret** → Lo necesitarás como `SHOPIFY_CLIENT_SECRET`

> Estas credenciales se usan para el flujo OAuth `client_credentials`, que obtiene y renueva tokens automáticamente. No necesitas generar tokens manualmente.

#### 2.4 Instalar la app en tu tienda

1. En el Dev Dashboard, ve a **Test your app** (o **Install app**)
2. Selecciona tu tienda de desarrollo
3. Acepta los permisos
4. La app queda instalada — ahora AI Commerce OS puede acceder a los datos de tu tienda

### Paso 3: Clonar e instalar el proyecto

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/aicommerceos.git
cd aicommerceos

# Instalar dependencias
pnpm install
```

### Paso 4: Configurar variables de entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env
```

Edita el archivo `.env` y rellena **al menos** estas variables:

```env
# === Shopify (OBLIGATORIO) ===
SHOPIFY_SHOP_DOMAIN=tu-tienda.myshopify.com    # Tu dominio de Shopify (paso 1)
SHOPIFY_CLIENT_ID=tu_client_id                  # Client ID del Dev Dashboard (paso 2.3)
SHOPIFY_CLIENT_SECRET=tu_client_secret          # Client Secret del Dev Dashboard (paso 2.3)
SHOPIFY_API_VERSION=2024-10                     # Versión de la API de Shopify

# === Seguridad (CAMBIAR en producción) ===
JWT_SECRET=cambia-esto-por-un-string-largo-y-aleatorio-de-32-chars
NEXTAUTH_SECRET=cambia-esto-por-otro-string-largo-y-aleatorio
```

Las demás variables (PostgreSQL, Redis, MinIO) tienen valores por defecto que funcionan para desarrollo local. No necesitas cambiarlas salvo que tengas conflictos de puertos.

<details>
<summary><strong>Variables completas (referencia)</strong></summary>

| Variable | Default | Descripción |
|----------|---------|-------------|
| **Infraestructura** | | |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/aicommerce` | Conexión PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Conexión Redis |
| `S3_ENDPOINT` | `http://localhost:9000` | Endpoint MinIO/S3 |
| `S3_ACCESS_KEY` | `minioadmin` | Access key MinIO |
| `S3_SECRET_KEY` | `minioadmin` | Secret key MinIO |
| `S3_BUCKET` | `ai-commerce-os` | Nombre del bucket S3 |
| `CORS_ORIGIN` | `http://localhost:3000` | Origen CORS permitido |
| `OTEL_ENABLED` | `false` | Habilitar OpenTelemetry |
| **Seguridad** | | |
| `JWT_SECRET` | — | Secreto JWT (**obligatorio**, mín 32 chars) |
| `JWT_EXPIRES_IN` | `24h` | Duración de tokens JWT |
| `NEXTAUTH_SECRET` | — | Secreto NextAuth (**obligatorio**, mín 32 chars) |
| `NEXTAUTH_URL` | `http://localhost:3000` | URL del dashboard |
| `INTERNAL_AUTH_TOKEN` | — | Token compartido api-node ↔ agent-service |
| **Shopify** | | |
| `SHOPIFY_SHOP_DOMAIN` | — | **Tu dominio myshopify.com** |
| `SHOPIFY_CLIENT_ID` | — | **Client ID de tu app** |
| `SHOPIFY_CLIENT_SECRET` | — | **Client Secret de tu app** |
| `SHOPIFY_API_VERSION` | `2024-10` | Versión API Shopify |
| **Tracking** | | |
| `TRACKING_ENABLED` | `false` | Habilitar envío de eventos server-side |
| `STORE_URL` | — | URL pública de la tienda |
| `META_PIXEL_ID` | — | Pixel ID de Meta |
| `META_ACCESS_TOKEN` | — | System User Token de Meta |
| `META_TEST_EVENT_CODE` | — | Código de test events (solo dev) |
| `TIKTOK_PIXEL_ID` | — | Pixel ID de TikTok |
| `TIKTOK_ACCESS_TOKEN` | — | Access token de TikTok |
| **Agentes IA** | | |
| `LLM_PROVIDER` | `mock` | Proveedor LLM: `anthropic`, `openai`, `mock` |
| `ANTHROPIC_API_KEY` | — | API key de Anthropic |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Modelo Claude |
| `OPENAI_API_KEY` | — | API key de OpenAI |
| `OPENAI_MODEL` | `gpt-4o` | Modelo OpenAI |
| `DRY_RUN` | `true` | Modo seguro (agentes no ejecutan acciones) |
| `SCHEDULER_ENABLED` | `false` | Habilitar scheduling automático |
| `AGENT_SERVICE_URL` | `http://agent-service:8000` | URL interna del agent-service |
| **Email (SupportAgent)** | | |
| `IMAP_HOST` | — | Servidor IMAP |
| `IMAP_PORT` | `993` | Puerto IMAP |
| `IMAP_USER` | — | Email de soporte |
| `IMAP_PASSWORD` | — | Contraseña IMAP |
| `SMTP_HOST` | — | Servidor SMTP |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `SMTP_USER` | — | Email para enviar |
| `SMTP_PASSWORD` | — | Contraseña SMTP |

</details>

### Paso 5: Levantar los servicios

```bash
# Construir y arrancar todo (Postgres, Redis, MinIO, API, Worker, Dashboard)
make dev

# Espera ~30-60 segundos a que todo arranque
# Verifica que todo está "healthy":
make ps
```

Deberías ver algo así:

```
NAME                    STATUS
postgres                healthy
redis                   healthy
minio                   healthy
api-node                healthy
worker                  running
agent-service           running
dashboard-next          running
```

> **Si tienes conflictos de puerto**: PostgreSQL usa el puerto host `5433` (no 5432) y Redis usa `6380` (no 6379) para no chocar con instalaciones locales.

### Paso 6: Crear datos iniciales (seed)

```bash
make seed-docker
```

Esto crea:
- **2 usuarios de prueba**: `admin@example.com` y `viewer@example.com` (contraseña: `password123`)
- **1 tienda demo**: con su slug y configuración
- **Membresías**: admin tiene rol `admin`, viewer tiene rol `viewer`

### Paso 7: Acceder al dashboard

1. Abre **http://localhost:3000** en tu navegador
2. Inicia sesión con:
   - Email: `admin@example.com`
   - Password: `password123`
3. Verás el dashboard con las siguientes secciones:
   - **Overview** — Resumen general
   - **Tasks** — Gestión de tareas del sistema
   - **Approvals** — Sistema de aprobaciones
   - **Shopify > Store Overview** — Información de tu tienda real de Shopify
   - **Shopify > Products** — Lista de tus productos con imágenes y precios
   - **Shopify > Orders** — Historial de pedidos
   - **Shopify > Customers** — Lista de clientes
   - **Shopify > Webhooks** — Gestión de webhooks (registro, eventos recibidos)
   - **Tracking > Meta & TikTok** — Estado de tracking, test de conexión, eventos enviados
   - **Agents** — Cards de agentes con toggle, run con nota, historial de ejecuciones

> Si la integración Shopify muestra error, verifica que las credenciales en `.env` son correctas y que la app está instalada en tu tienda.

### Paso 8: Configurar webhooks (opcional en desarrollo)

Los webhooks permiten que Shopify notifique a tu sistema en tiempo real cuando algo ocurre (nuevo pedido, producto actualizado, etc.).

#### ¿Por qué necesito un túnel?

Los webhooks requieren una URL pública, pero en desarrollo tu servidor está en `localhost`. Un túnel crea un puente:

```
Shopify (internet) → https://abc123.ngrok.io → túnel → localhost:4000
```

#### Opción A: ngrok

```bash
# Instalar ngrok: https://ngrok.com/download
ngrok http 4000

# Te dará una URL como: https://a1b2c3d4.ngrok-free.app
```

#### Opción B: cloudflared (gratis, sin registro)

```bash
# Instalar: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:4000

# Te dará una URL como: https://random-words.trycloudflare.com
```

#### Registrar los webhooks

**Desde el dashboard:**

1. Ve a **Shopify > Webhooks**
2. Pega la URL de tu túnel (ej: `https://a1b2c3d4.ngrok-free.app`)
3. Haz clic en **"Register All"**
4. Se registrarán 12 topics automáticamente

**O desde la API:**

```bash
# Login primero
LOGIN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
STORE_ID=$(echo $LOGIN | python3 -c "import sys,json;print(json.load(sys.stdin)['memberships'][0]['store_id'])")

# Registrar todos los webhooks
curl -X POST http://localhost:4000/shopify/webhooks/register-all \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-store-id: $STORE_ID" \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://tu-tunel.ngrok-free.app"}'
```

**Desde el TOML de Shopify (alternativa sin túnel):**

En tu `shopify.app.toml`, puedes declarar los webhooks para que Shopify los registre automáticamente al hacer deploy:

```toml
[webhooks]
api_version = "2024-10"

[[webhooks.subscriptions]]
topics = ["orders/create", "orders/paid", "orders/updated", "orders/cancelled"]
uri = "/webhooks/shopify"

[[webhooks.subscriptions]]
topics = ["products/create", "products/update", "products/delete"]
uri = "/webhooks/shopify"

[[webhooks.subscriptions]]
topics = ["customers/create", "customers/update"]
compliance_topics = ["customers/redact", "customers/data_request", "shop/redact"]
uri = "/webhooks/shopify"
```

> **Nota**: En producción con un dominio real (ej: `api.tu-dominio.com`) no necesitarás túnel.

---

## Estructura del proyecto

```
aicommerceos/
├── apps/
│   └── dashboard-next/              # Dashboard (Next.js 14 + App Router + Tailwind)
│       └── src/
│           ├── app/dashboard/
│           │   ├── page.tsx              # Overview
│           │   ├── tasks/page.tsx        # Gestión de tareas
│           │   ├── approvals/page.tsx    # Aprobaciones
│           │   ├── shopify/
│           │   │   ├── page.tsx          # Store Overview
│           │   │   ├── products/page.tsx # Productos Shopify
│           │   │   ├── orders/page.tsx   # Pedidos
│           │   │   ├── customers/page.tsx# Clientes
│           │   │   └── webhooks/page.tsx # Gestión de webhooks
│           │   ├── tracking/page.tsx     # Meta & TikTok tracking status
│           │   └── agents/
│           │       ├── page.tsx          # Agentes: cards, toggle, run con nota
│           │       └── runs/
│           │           ├── page.tsx      # Historial de ejecuciones (filtrable)
│           │           └── [id]/page.tsx # Detalle de run: acciones, artifacts, audit
│           ├── components/
│           │   ├── Sidebar.tsx           # Navegación lateral
│           │   └── DiffViewer.tsx        # Visor de diffs before/after
│           └── lib/auth.ts              # NextAuth config (CredentialsProvider)
├── services/
│   ├── api-node/                    # API REST (Fastify 4)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── auth.ts               # Login + brute-force protection, /me
│   │       │   ├── health.ts             # /health, /ready (logs silenciados)
│   │       │   ├── tasks.ts              # CRUD tareas + cola BullMQ
│   │       │   ├── approvals.ts          # CRUD aprobaciones + state machine
│   │       │   ├── assets.ts             # Upload/download S3
│   │       │   ├── shopify.ts            # Shopify data + webhook mgmt + GraphQL
│   │       │   ├── shopify-webhooks.ts   # Receptor webhooks (HMAC, PII masking)
│   │       │   ├── tracking.ts           # Meta CAPI + TikTok Events API
│   │       │   └── agents.ts             # Proxy a agent-service (auth interna)
│   │       ├── plugins/
│   │       │   ├── auth.ts               # JWT auth decorator
│   │       │   └── tenant.ts             # Multi-tenant + store verification
│   │       ├── middleware/
│   │       │   └── rbac.ts               # Control de acceso por rol
│   │       ├── tracking.ts               # Servicio de tracking (orchestrator)
│   │       └── db.ts                     # Pool PostgreSQL + helpers
│   ├── workers/                     # Worker async (BullMQ consumer)
│   └── agent-service/               # Agentes IA (Python 3.12 / FastAPI)
│       └── app/
│           ├── main.py                   # FastAPI app + endpoints + auth middleware
│           ├── config.py                 # Settings (Pydantic): LLM, S3, IMAP, umbrales
│           ├── db.py                     # asyncpg pool + helpers
│           ├── models/
│           │   ├── agent.py              # AgentContext, AgentResult, ActionItem, TokenUsage
│           │   └── schemas.py            # Request/Response Pydantic schemas
│           ├── agents/
│           │   ├── base.py               # BaseAgent (abstract)
│           │   ├── registry.py           # AGENT_REGISTRY → {name: class}
│           │   ├── ops.py                # OpsAgent: pedidos en riesgo
│           │   ├── support.py            # SupportAgent: emails IMAP + respuestas
│           │   └── reporting.py          # ReportingAgent: informe diario KPIs
│           ├── llm/
│           │   ├── provider.py           # LLMProvider (abstract)
│           │   ├── anthropic_provider.py # Claude API (tool_use)
│           │   ├── openai_provider.py    # OpenAI API (function_calling)
│           │   ├── mock_provider.py      # Mock para dev/test
│           │   └── factory.py            # create_llm_provider()
│           ├── tools/
│           │   ├── shopify.py            # HTTP → api-node para datos Shopify
│           │   ├── database.py           # Queries directas: métricas, auditoría
│           │   ├── email_tools.py        # IMAP fetch, SMTP reply, clasificación
│           │   └── notifications.py      # Alertas dashboard (stubs)
│           ├── services/
│           │   ├── runner.py             # AgentRunner: tool-loop, audit, kill switch
│           │   └── storage.py            # Upload S3 (boto3)
│           └── scheduler/
│               └── jobs.py               # APScheduler: reporting diario, email check
├── packages/
│   ├── shared/                      # Tipos, config Zod, logger, helpers
│   │   └── src/
│   │       ├── config.ts                 # Env schemas (auth, S3, tracking, rate limit)
│   │       ├── validation/index.ts       # Password strength, login/register schemas
│   │       └── helpers/naming.ts         # UTM builder, naming conventions
│   └── connectors/                  # Conectores a servicios externos
│       └── src/
│           ├── shopify/index.ts          # REST + GraphQL + OAuth auto-token
│           ├── meta/index.ts             # Meta CAPI real (SHA-256 PII hashing)
│           ├── tiktok/index.ts           # TikTok Events API real
│           ├── llm/index.ts              # Anthropic + OpenAI + Mock providers
│           └── storage/                  # Cliente S3
├── infra/
│   ├── docker/                      # Dockerfiles + configs OTEL/Prometheus
│   ├── migrations/
│   │   ├── 001_initial.sql              # Stores, users, memberships, tasks, approvals
│   │   ├── 002_webhook_events.sql       # Webhook events table
│   │   ├── 003_tracking_events.sql      # Tracking events table
│   │   └── 004_agent_runs.sql           # agent_runs, agent_config, email_inbox
│   └── scripts/
│       ├── seed.js                      # Datos iniciales (usuarios, tienda)
│       └── smoke-test.sh                # Tests de humo
├── docker-compose.yml               # Orquestación de todos los servicios
├── docker-compose.prod.yml          # Override producción (sin volúmenes, NODE_ENV=prod)
├── Makefile                         # Comandos útiles
├── pnpm-workspace.yaml              # Configuración monorepo
├── turbo.json                       # Turborepo config
└── .env.example                     # Variables de entorno (todas documentadas)
```

---

## Servicios y puertos

| Servicio          | Puerto | URL                        | Descripción                    |
|-------------------|--------|----------------------------|--------------------------------|
| **Dashboard**     | 3000   | http://localhost:3000      | Panel de control (Next.js)     |
| **API Node**      | 4000   | http://localhost:4000      | API REST (Fastify)             |
| **Agent Service** | 8000   | http://localhost:8000      | Agentes IA (FastAPI)           |
| **PostgreSQL**    | 5433   | localhost:5433             | Base de datos                  |
| **Redis**         | 6380   | localhost:6380             | Colas y caché                  |
| **MinIO API**     | 9000   | http://localhost:9000      | Almacenamiento S3              |
| **MinIO Console** | 9001   | http://localhost:9001      | UI de MinIO                    |
| **pgAdmin**       | 5050   | http://localhost:5050      | `make tools` para activar      |
| **Grafana**       | 3001   | http://localhost:3001      | `make observability` para activar |
| **Prometheus**    | 9090   | http://localhost:9090      | `make observability` para activar |

> **Nota**: PostgreSQL y Redis usan puertos host distintos (5433, 6380) para no chocar con instalaciones locales. Internamente en Docker siguen usando 5432 y 6379.

---

## Credenciales por defecto

| Servicio    | Usuario/Email         | Contraseña    | Rol     |
|-------------|-----------------------|---------------|---------|
| Dashboard   | `admin@example.com`   | `password123` | admin   |
| Dashboard   | `viewer@example.com`  | `password123` | viewer  |
| MinIO       | `minioadmin`          | `minioadmin`  |         |
| pgAdmin     | `admin@aicommerce.local` | `admin`    |         |
| Grafana     | `admin`               | `admin`       |         |

---

## API Reference

Todas las rutas protegidas requieren:
- Header `Authorization: Bearer <token>` (obtenido en login)
- Header `x-store-id: <uuid>` (obtenido en login, campo `memberships[0].store_id`)

### Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login con email + password → token + memberships |
| `GET` | `/auth/me` | Info del usuario autenticado |

### Tasks

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tasks` | Listar tareas (paginado) |
| `GET` | `/tasks/:id` | Detalle de una tarea |
| `POST` | `/tasks` | Crear tarea (admin) → se encola en BullMQ |
| `PATCH` | `/tasks/:id` | Actualizar tarea (admin) |

### Approvals

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/approvals` | Listar aprobaciones |
| `GET` | `/approvals/:id` | Detalle de una aprobación |
| `POST` | `/approvals` | Crear aprobación (admin) |
| `PATCH` | `/approvals/:id` | Cambiar estado: pending → approved/rejected/applied (admin) |

### Shopify — Datos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/shopify/shop` | Info de la tienda |
| `GET` | `/shopify/overview` | Resumen: tienda + counts + últimos pedidos |
| `GET` | `/shopify/products` | Productos (paginado) |
| `GET` | `/shopify/products/count` | Total de productos |
| `GET` | `/shopify/products/:id` | Detalle de un producto |
| `PUT` | `/shopify/products/:id` | Actualizar producto (REST) |
| `GET` | `/shopify/orders` | Pedidos (paginado, filtros por status/fecha) |
| `GET` | `/shopify/orders/count` | Total de pedidos |
| `GET` | `/shopify/orders/:id` | Detalle de un pedido |
| `GET` | `/shopify/customers` | Clientes (paginado) |
| `GET` | `/shopify/customers/count` | Total de clientes |
| `GET` | `/shopify/collections` | Colecciones |

### Shopify — GraphQL Mutations

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/shopify/graphql/product-update` | Actualizar producto vía GraphQL (título, tags, SEO, metafields) |

Body de ejemplo:
```json
{
  "productId": "9876543210",
  "title": "Nuevo título",
  "tags": ["tag1", "tag2"],
  "seo": { "title": "SEO Title", "description": "Meta description" },
  "metafields": [
    { "namespace": "custom", "key": "material", "value": "algodón", "type": "single_line_text_field" }
  ]
}
```

### Shopify — Webhooks

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/shopify/webhooks` | Listar webhooks registrados en Shopify |
| `POST` | `/shopify/webhooks` | Registrar un webhook individual |
| `POST` | `/shopify/webhooks/register-all` | Registrar todos los topics de golpe |
| `DELETE` | `/shopify/webhooks/:id` | Eliminar un webhook |
| `GET` | `/shopify/webhook-events` | Ver eventos recibidos (filtrable por topic/status) |
| `POST` | `/webhooks/shopify` | **Receptor** — endpoint donde Shopify envía los eventos |

### Tracking

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tracking/status` | Estado de configuración (Meta, TikTok, enabled) |
| `POST` | `/tracking/meta/test` | Test de conexión Meta CAPI (admin) |
| `POST` | `/tracking/tiktok/test` | Test de conexión TikTok Events API (admin) |
| `POST` | `/tracking/test-event` | Enviar evento de prueba a todas las plataformas (admin) |
| `GET` | `/tracking/events` | Historial de eventos enviados (filtrable por platform/status) |
| `GET` | `/tracking/stats` | Estadísticas de eventos por plataforma |

### Agents

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/agents` | Listar agentes con estado, último run, conteo |
| `PATCH` | `/agents/:name/toggle` | Activar/desactivar agente — kill switch (admin) |
| `POST` | `/agents/run` | Ejecutar agente manualmente con nota opcional (admin) |
| `GET` | `/agents/runs` | Historial de ejecuciones (filtrable por agente/status) |
| `GET` | `/agents/runs/:id` | Detalle de un run: acciones, artifacts, audit trail |
| `GET` | `/agents/schedule` | Info del scheduler (jobs programados) |
| `POST` | `/agents/schedule/trigger` | Forzar ejecución de un job programado (admin) |

Body de ejemplo para `POST /agents/run`:
```json
{
  "agent_name": "reporting",
  "dry_run": false,
  "user_note": "Enfócate en los pedidos de las últimas 48h, ignora pedidos de prueba"
}
```

### Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado básico del servicio (sin logs) |
| `GET` | `/ready` | Readiness check: verifica DB + Redis (log level warn) |

---

## Comandos Make

```bash
make help           # Ver todos los comandos disponibles
make dev            # Construir + arrancar todo
make up             # Arrancar sin reconstruir
make down           # Parar todos los servicios
make restart        # Reiniciar servicios
make rebuild        # Parar + reconstruir + arrancar
make logs           # Ver logs de todos los servicios
make logs-api       # Ver logs del API
make logs-worker    # Ver logs del worker
make logs-dash      # Ver logs del dashboard
make logs-agent     # Ver logs del agent-service
make migrate        # Ejecutar migraciones de DB
make seed           # Crear datos de prueba (local)
make seed-docker    # Crear datos de prueba (dentro de Docker)
make smoke          # Ejecutar smoke tests
make ps             # Ver estado de los servicios
make clean          # Eliminar contenedores + volúmenes (¡borra datos!)
make observability  # Arrancar con OTEL + Prometheus + Grafana
make tools          # Arrancar pgAdmin
make shell-api      # Abrir shell en contenedor API
make shell-db       # Abrir psql en contenedor PostgreSQL
```

---

## Multi-tenancy y RBAC

### Multi-tenant

El sistema soporta múltiples tiendas. Cada request debe incluir el header `x-store-id` para identificar a qué tienda pertenece. El middleware `extractTenant` verifica que el usuario tiene una membresía activa en esa tienda.

### Roles

| Rol      | Tasks    | Approvals | Shopify Webhooks | Ver datos |
|----------|----------|-----------|------------------|-----------|
| `admin`  | CRUD     | CRUD      | Register/Delete  | Todo      |
| `viewer` | Solo ver | Solo ver  | Solo ver         | Todo      |

---

## Seguridad

El proyecto implementa múltiples capas de seguridad:

### Autenticación y secretos

- **JWT sin fallbacks inseguros**: `JWT_SECRET` y `NEXTAUTH_SECRET` no tienen valores por defecto en `docker-compose.yml`. Si no están en `.env`, el servicio no arranca.
- **Contraseñas fuertes**: Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un dígito. Validado con Zod en registro y cambio de contraseña.
- **Protección brute-force**: Login (`/auth/login`) tiene rate limiting por IP (máx 10 intentos/15 min) y por email (máx 5 intentos/15 min). Tras exceder el límite → lockout temporal.

### Comunicación entre servicios

- **INTERNAL_AUTH_TOKEN**: El `api-node` envía un Bearer token al `agent-service` en cada request proxy. El agent-service lo verifica en un middleware (excepto `/health`, `/ready`).
- **Token en `.env`**: Se configura una vez en `INTERNAL_AUTH_TOKEN` y ambos servicios lo comparten.

### Webhooks Shopify

- **HMAC obligatorio**: Si no hay `SHOPIFY_CLIENT_SECRET` configurado, los webhooks se rechazan con HTTP 401 (no se "skipea" la verificación).
- **Idempotencia**: Cada webhook se deduplica por `X-Shopify-Event-Id`.

### Multi-tenant

- **Service tokens restringidos**: Los tokens de servicio (`type: 'service'`) ya no obtienen rol `admin` por defecto. El rol viene del token y se verifica que la tienda exista y esté activa.
- **Tenant isolation en agentes**: El endpoint `/agents/runs/:id` filtra por `store_id`, impidiendo que un usuario vea runs de otra tienda.

### Privacidad (PII)

- **Meta/TikTok**: Todos los datos personales (email, teléfono, nombre, dirección) se hashean con SHA-256 antes de enviar a las APIs de tracking.
- **Logs de webhooks**: Emails y nombres de clientes se enmascaran en logs (`j***@example.com`, `J*** D***`).
- **Meta access_token**: Se envía en header `Authorization` en vez de query string para evitar filtración en logs.

### Variables de seguridad

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Secreto JWT (mínimo 32 chars, sin default) |
| `NEXTAUTH_SECRET` | Secreto NextAuth (mínimo 32 chars, sin default) |
| `INTERNAL_AUTH_TOKEN` | Token compartido api-node ↔ agent-service |
| `SHOPIFY_CLIENT_SECRET` | Secreto para verificar HMAC de webhooks |

---

## Shopify Integration

### Cómo funciona la autenticación

AI Commerce OS usa el flujo **OAuth client_credentials** de Shopify Dev Dashboard:

```
1. api-node necesita hacer una llamada a Shopify
2. ShopifyTokenManager comprueba si hay un token válido en caché
3. Si no → solicita uno nuevo a https://tu-tienda.myshopify.com/admin/oauth/access_token
4. Shopify devuelve un access_token con expiración
5. El token se cachea en memoria y se renueva automáticamente 5 min antes de expirar
```

No necesitas generar ni copiar tokens manualmente — el sistema gestiona todo automáticamente con el Client ID y Client Secret.

### Datos que se pueden leer

- **Shop**: nombre, dominio, plan, moneda, timezone, país
- **Products**: título, estado, variantes, precios, imágenes, tags
- **Orders**: nombre, precio total, estado financiero, estado de envío, line items
- **Customers**: email, nombre, pedidos, gasto total
- **Collections**: smart collections y custom collections

### Datos que se pueden escribir

- **Products** (REST): actualizar cualquier campo
- **Products** (GraphQL): actualizar título, descripción HTML, tags, SEO (title + description), metafields

> **Requisito**: El scope `write_products` debe estar configurado en tu app de Shopify.

---

## Webhooks

### ¿Qué son?

Los webhooks son notificaciones que Shopify envía automáticamente a tu servidor cuando algo ocurre en tu tienda. Son la base para que los agentes puedan reaccionar en tiempo real.

### Topics soportados

| Topic | Evento |
|-------|--------|
| `orders/create` | Nuevo pedido |
| `orders/paid` | Pedido pagado |
| `orders/updated` | Pedido actualizado |
| `orders/cancelled` | Pedido cancelado |
| `refunds/create` | Reembolso creado |
| `fulfillments/create` | Envío creado |
| `fulfillments/update` | Envío actualizado |
| `products/create` | Producto creado |
| `products/update` | Producto modificado |
| `products/delete` | Producto eliminado |
| `customers/create` | Cliente nuevo |
| `customers/update` | Cliente actualizado |
| `app/uninstalled` | App desinstalada |

### Seguridad

Cada webhook recibido se verifica con HMAC-SHA256 usando tu `SHOPIFY_CLIENT_SECRET`. Los webhooks con firma inválida se rechazan con HTTP 401.

### Procesamiento

1. El webhook llega a `POST /webhooks/shopify`
2. Se verifica la firma HMAC
3. Se comprueba idempotencia (por `X-Shopify-Event-Id`)
4. Se almacena en la tabla `webhook_events`
5. Se procesa de forma asíncrona (no bloquea la respuesta)
6. Se crea un registro en `audit_logs`
7. Se responde 200 inmediatamente a Shopify

---

## Tracking — Fase 3

### Descripción

El sistema envía eventos server-side a **Meta Conversions API (CAPI)** y **TikTok Events API** cuando ocurren conversiones en tu tienda. Esto complementa los pixels del navegador y mejora la atribución (especialmente con adblockers e iOS 14+).

### Eventos que se envían automáticamente

| Webhook Shopify | Evento Meta CAPI | Evento TikTok |
|-----------------|------------------|---------------|
| `orders/paid` | `Purchase` | `CompletePayment` |
| `refunds/create` | `Refund` (custom) | — |

### Configuración

1. **En Shopify**: Instala el canal "Facebook & Instagram" y activa data sharing al máximo
2. **En Meta Events Manager**: Obtén tu Pixel ID y crea un System User Token con permisos `ads_management`
3. **En tu `.env`**:

```env
TRACKING_ENABLED=true
STORE_URL=https://tu-tienda.myshopify.com
META_PIXEL_ID=123456789
META_ACCESS_TOKEN=EAAxxxxxxx
META_TEST_EVENT_CODE=TEST12345  # solo para dev
```

4. Reinicia los servicios: `make rebuild`
5. Ve al dashboard → **Tracking** → **Test Connection** para verificar

### Seguridad de datos (PII)

Todos los datos personales (email, teléfono, nombre, dirección) se hashean con **SHA-256** antes de enviarse a Meta/TikTok, cumpliendo con sus requisitos de privacidad. Los datos originales nunca salen de tu servidor.

### Test Mode

Configura `META_TEST_EVENT_CODE` con el código de tu pestaña "Test Events" en Meta Events Manager. Los eventos aparecerán ahí en tiempo real sin afectar tus datos de producción.

---

## Agentes IA — Fase 6

### Descripción

AI Commerce OS incluye un sistema de **agentes autónomos** que analizan tu tienda, detectan problemas y generan reportes — todo con supervisión humana mediante un sistema de aprobaciones y un kill switch por agente.

Los agentes corren en el **agent-service** (Python/FastAPI), se comunican con un LLM (Claude o OpenAI) y usan herramientas (tools) para consultar datos reales de Shopify y la base de datos.

### Arquitectura del Agent Service

```
Dashboard (Run Now + nota) → api-node (proxy + auth) → agent-service (FastAPI)
                                                             │
                                                    ┌────────┴────────┐
                                                    │  AgentRunner     │
                                                    │  1. Kill switch  │
                                                    │  2. Create run   │
                                                    │  3. Tool loop    │
                                                    │  4. Audit log    │
                                                    └────────┬────────┘
                                                             │
                                              ┌──────────────┼──────────────┐
                                              ▼              ▼              ▼
                                        LLM Provider    Agent Tools    PostgreSQL
                                      (Claude/OpenAI)  (Shopify,DB,   (agent_runs,
                                                        Email,S3)     audit_logs)
```

**Flujo de una ejecución:**

1. El usuario pulsa "Run Now" en el dashboard (opcionalmente añade una nota)
2. `api-node` verifica JWT + tenant + rol admin y proxea a `agent-service` con `INTERNAL_AUTH_TOKEN`
3. `AgentRunner` comprueba el kill switch, crea un registro en `agent_runs` y lanza el agente
4. El agente construye un system prompt + user message y entra en el **tool loop** (máx 15 iteraciones):
   - Envía mensajes al LLM → el LLM puede pedir tool calls
   - Se ejecutan las tools (consultar pedidos, métricas, emails...)
   - Se devuelve el resultado al LLM → repite hasta que el LLM responda sin tools
5. El resultado (acciones, métricas, artifacts) se guarda en DB y se muestra en el dashboard

### Agentes disponibles

| Agente | Descripción | Riesgo | Tools | Scheduling |
|--------|-------------|--------|-------|------------|
| **ops** | Detecta pedidos en riesgo: direcciones incompletas, impagos, alto valor, retrasos de envío, patrones de devolución | Medium | `get_recent_orders`, `get_order_details`, `get_refund_stats`, `get_store_overview` | — |
| **support** | Revisa email IMAP, clasifica emails de clientes, busca contexto de pedidos, sugiere respuestas, envía auto-acknowledgment | Medium | `get_pending_emails`, `search_orders_by_email`, `get_order_details`, `get_recent_orders`, `get_product_details`, `get_refund_stats` | Diario 08:30 |
| **reporting** | Genera informe diario con KPIs, top productos, alertas, acciones sugeridas. Sube report a S3 y guarda métricas en DB | Low | `get_store_overview`, `get_orders`, `get_orders_summary`, `get_refund_stats`, `get_metrics_daily` | Diario 09:00 |

### System Prompts

Cada agente define su system prompt en el método `get_system_prompt(ctx)`:

| Agente | Archivo | Línea |
|--------|---------|-------|
| ops | `services/agent-service/app/agents/ops.py` | 21 |
| support | `services/agent-service/app/agents/support.py` | 24 |
| reporting | `services/agent-service/app/agents/reporting.py` | 22 |

Puedes editar estos prompts directamente para adaptar el comportamiento de cada agente a tu tienda.

### Nota del operador

Al ejecutar un agente manualmente desde el dashboard, puedes escribir una **nota personal** (máx 1000 chars). Esta nota se inyecta automáticamente en el system prompt del LLM:

```
--- OPERATOR NOTE ---
The store operator has left the following note for this run. Take it into account:
"tu comentario aquí"
--- END NOTE ---
```

Ejemplos de uso:
- *"Enfócate en los pedidos de las últimas 24h"*
- *"Ignora el pedido #1052, es de prueba"*
- *"Revisa si hay algún patrón de devoluciones en la colección de verano"*

La nota también se guarda en `input_payload` del run y en el audit log.

### Kill Switch

Cada agente tiene un **kill switch** individual por tienda. Desde el dashboard puedes activar/desactivar cualquier agente. Si un agente está desactivado:
- No se ejecuta ni manual ni programáticamente
- El scheduler lo salta
- Se registra en audit_logs

### Configuración de LLM

| Variable | Default | Descripción |
|----------|---------|-------------|
| `LLM_PROVIDER` | `mock` | Proveedor: `anthropic`, `openai`, o `mock` |
| `ANTHROPIC_API_KEY` | — | API key de Anthropic (para Claude) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Modelo Claude a usar |
| `OPENAI_API_KEY` | — | API key de OpenAI |
| `OPENAI_MODEL` | `gpt-4o` | Modelo OpenAI a usar |
| `DRY_RUN` | `true` | Si `true`, los agentes analizan pero no ejecutan acciones |

> **Recomendación**: Empieza con `DRY_RUN=true` y `LLM_PROVIDER=mock` para probar el flujo sin gastar tokens. Luego cambia a `anthropic` o `openai` con tu API key.

### Email del soporte (SupportAgent)

| Variable | Descripción |
|----------|-------------|
| `IMAP_HOST` | Servidor IMAP (ej: `imap.gmail.com`) |
| `IMAP_PORT` | Puerto IMAP (ej: `993`) |
| `IMAP_USER` | Email de la cuenta de soporte |
| `IMAP_PASSWORD` | Contraseña o app password |
| `SMTP_HOST` | Servidor SMTP (ej: `smtp.gmail.com`) |
| `SMTP_PORT` | Puerto SMTP (ej: `587`) |
| `SMTP_USER` | Email para enviar respuestas |
| `SMTP_PASSWORD` | Contraseña SMTP |

### Umbrales de agentes

| Variable | Default | Descripción |
|----------|---------|-------------|
| `OPS_HIGH_VALUE_THRESHOLD` | `500` | Pedidos por encima de este valor (EUR) se marcan como high-value |
| `OPS_UNPAID_HOURS_THRESHOLD` | `24` | Horas sin pagar antes de marcar como riesgo |

### Scheduling automático

Con `SCHEDULER_ENABLED=true`, el agent-service programa automáticamente:

| Job | Horario | Agente |
|-----|---------|--------|
| Daily reporting | 09:00 UTC | reporting |
| Email check | 08:30 UTC | support |

Los jobs se gestionan con APScheduler. Puedes forzar un trigger manual desde la API:

```bash
curl -X POST "http://localhost:4000/agents/schedule/trigger?agent_name=reporting" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-store-id: $STORE_ID"
```

### Dashboard de agentes

El dashboard incluye:

- **Cards de agentes**: Nombre, descripción, riesgo, toggle on/off, botón Run Now
- **Modal de ejecución**: Al pulsar Run Now, aparece un modal con textarea para nota del operador
- **Historial de runs**: Lista filtrable por agente y estado
- **Detalle de run**: Acciones ejecutadas, acciones propuestas, artifacts, tokens usados, audit trail

---

## Observabilidad

Para activar el stack de observabilidad:

```bash
make observability
```

Esto levanta:
- **OpenTelemetry Collector** — Recolecta trazas y métricas
- **Prometheus** — Almacena métricas (http://localhost:9090)
- **Grafana** — Visualiza dashboards (http://localhost:3001, user: `admin`, pass: `admin`)

Configurar en `.env`:
```env
OTEL_ENABLED=true
```

---

## Feature Flags

| Flag | Default | Descripción |
|------|---------|-------------|
| `DRY_RUN` | `true` | Modo seguro: agentes analizan pero no ejecutan acciones reales |
| `TRACKING_ENABLED` | `false` | Habilita envío de eventos server-side a Meta CAPI / TikTok |
| `SCHEDULER_ENABLED` | `false` | Habilita ejecución automática de agentes (reporting diario, email check) |
| `ENABLE_RLS` | `false` | Habilita Row-Level Security en PostgreSQL para aislamiento multi-tenant |
| `OTEL_ENABLED` | `false` | Habilita envío de trazas/métricas a OpenTelemetry |

---

## Troubleshooting

### Los servicios no arrancan

```bash
# Ver logs de infraestructura
docker compose logs postgres redis minio

# Limpiar todo y empezar de cero
make clean && make dev
```

### La migración falla

```bash
# Ver logs de migración
docker compose logs migrate

# Ver migraciones aplicadas
docker compose exec postgres psql -U postgres -d aicommerce -c "SELECT * FROM _migrations"
```

### Shopify devuelve error

```bash
# Verificar credenciales
docker compose logs api-node | grep -i shopify

# Causas comunes:
# - SHOPIFY_SHOP_DOMAIN incorrecto
# - SHOPIFY_CLIENT_ID o SHOPIFY_CLIENT_SECRET incorrectos
# - App no instalada en la tienda
# - Scopes insuficientes (ej: falta write_products para mutaciones)
```

### El worker no procesa tareas

```bash
# Ver logs del worker
make logs-worker

# Verificar cola Redis
docker compose exec redis redis-cli KEYS "bull:tasks:*"
```

### MinIO bucket no existe

```bash
docker compose logs minio-init
docker compose run --rm minio-init
```

### El agent-service no responde

```bash
# Ver logs del agent-service
make logs-agent

# Causas comunes:
# - INTERNAL_AUTH_TOKEN no coincide entre api-node y agent-service
# - LLM_PROVIDER configurado pero sin API key correspondiente
# - Puerto 8000 ocupado por otro proceso
```

### Los agentes fallan al ejecutarse

```bash
# Ver detalle del run en el dashboard → Agents → Runs → click en el run

# Causas comunes:
# - LLM_PROVIDER=mock solo devuelve respuestas de prueba
# - ANTHROPIC_API_KEY o OPENAI_API_KEY no configurada
# - DRY_RUN=true (no es un error, es el comportamiento esperado)
# - IMAP no configurado (SupportAgent skipea fetch pero funciona)
```

### Conflictos de puerto

Los puertos host de la infraestructura están desplazados para no chocar con servicios locales:
- PostgreSQL: **5433** (host) → 5432 (container)
- Redis: **6380** (host) → 6379 (container)

Si sigues teniendo conflictos:
```bash
# Ver qué ocupa el puerto
sudo lsof -i :5433

# Parar contenedores huérfanos
docker rm -f $(docker ps -aq)

# Cambiar puertos en docker-compose.yml si es necesario
```

---

## Roadmap

### Fases completadas

- **Fase 0** — Preparación: nicho elegido, tienda creada
- **Fase 1** — Shopify: productos cargados, moneda, impuestos, envíos
- **Fase 2** — Dominio y estética mínima del theme
- **Fase 3** — Tracking y canales: Meta CAPI, TikTok Events API, UTMs, PII hashing SHA-256
- **Fase 4** — Infraestructura: monorepo, Docker, auth multi-tenant, RBAC, DB, S3, workers, dashboard
- **Fase 5** — Integraciones Shopify: conector REST/GraphQL, OAuth auto-token, webhooks, dashboard pages
- **Fase 6** — Agentes IA MVP: Conector LLM real, AgentRunner con tool-loop (máx 15 iteraciones), audit logging, kill switch por agente, nota del operador, scheduling automático, dashboard

### Fase 7 — Ads + Creatividades (próximo)

- Meta Marketing API real + Agente Ads Meta
- TikTok Ads API real + Agente Ads TikTok
- Generación de creatividades con IA (DALL-E / Stable Diffusion)
- Asset pipeline (S3)

### Fase 8 — Escalado

- Agentes adicionales: CRO, Pricing, SEO, Fraud detection
- Attribution modeling
- Auto-escalado de workers
- Métricas y alertas avanzadas

---

## Licencia

Proyecto privado. Todos los derechos reservados.
