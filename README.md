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
- [Shopify Integration](#shopify-integration)
- [Webhooks](#webhooks)
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
│  Auth (JWT) │ RBAC │ Shopify routes │ Webhook receiver   │
│  Tasks │ Approvals │ Assets │ GraphQL mutations          │
└──────┬───────────────┬──────────────────┬────────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐
│  PostgreSQL │ │    Redis    │ │   MinIO (S3-compatible)  │
│  (datos)    │ │  (colas)    │ │   (archivos/assets)     │
└─────────────┘ └──────┬──────┘ └─────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Worker (BullMQ) │
              │  (tareas async)  │
              └─────────────────┘

┌──────────────────────────────────────────────────────────┐
│              dashboard-next (Next.js 14)                 │
│  Login │ Overview │ Tasks │ Approvals │ Shopify pages    │
│  Products │ Orders │ Customers │ Webhooks management     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│           agent-service (FastAPI / Python)                │
│  (Placeholder para agentes IA — Fase 6+)                │
└──────────────────────────────────────────────────────────┘
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
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/aicommerce` | Conexión PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Conexión Redis |
| `JWT_SECRET` | `change-me...` | Secreto para tokens JWT |
| `JWT_EXPIRES_IN` | `24h` | Duración de tokens JWT |
| `NEXTAUTH_SECRET` | `change-me...` | Secreto para NextAuth |
| `NEXTAUTH_URL` | `http://localhost:3000` | URL del dashboard |
| `S3_ENDPOINT` | `http://localhost:9000` | Endpoint MinIO/S3 |
| `S3_ACCESS_KEY` | `minioadmin` | Access key MinIO |
| `S3_SECRET_KEY` | `minioadmin` | Secret key MinIO |
| `S3_BUCKET` | `ai-commerce-os` | Nombre del bucket S3 |
| `SHOPIFY_SHOP_DOMAIN` | — | **Tu dominio myshopify.com** |
| `SHOPIFY_CLIENT_ID` | — | **Client ID de tu app** |
| `SHOPIFY_CLIENT_SECRET` | — | **Client Secret de tu app** |
| `SHOPIFY_API_VERSION` | `2024-10` | Versión API Shopify |
| `DRY_RUN` | `true` | Modo seguro (no ejecuta acciones reales) |
| `CORS_ORIGIN` | `http://localhost:3000` | Origen CORS permitido |
| `OTEL_ENABLED` | `false` | Habilitar OpenTelemetry |

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
│   └── dashboard-next/          # Dashboard (Next.js 14 + App Router + Tailwind)
│       └── src/app/dashboard/
│           ├── page.tsx              # Overview
│           ├── tasks/page.tsx        # Gestión de tareas
│           ├── approvals/page.tsx    # Aprobaciones
│           └── shopify/
│               ├── page.tsx          # Store Overview
│               ├── products/page.tsx # Productos Shopify
│               ├── orders/page.tsx   # Pedidos
│               ├── customers/page.tsx# Clientes
│               └── webhooks/page.tsx # Gestión de webhooks
├── services/
│   ├── api-node/                # API REST (Fastify 4)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── auth.ts           # Login, registro, /me
│   │       │   ├── tasks.ts          # CRUD tareas + cola BullMQ
│   │       │   ├── approvals.ts      # CRUD aprobaciones + state machine
│   │       │   ├── assets.ts         # Upload/download S3
│   │       │   ├── shopify.ts        # Shopify data + webhook mgmt + GraphQL
│   │       │   └── shopify-webhooks.ts # Receptor de webhooks Shopify
│   │       ├── plugins/
│   │       │   ├── auth.ts           # JWT auth decorator
│   │       │   └── tenant.ts         # Multi-tenant extraction
│   │       └── middleware/
│   │           └── rbac.ts           # Control de acceso por rol
│   ├── workers/                 # Worker async (BullMQ consumer)
│   └── agent-service/           # Agentes IA (Python/FastAPI) — placeholder
├── packages/
│   ├── shared/                  # Tipos, config Zod, logger, helpers
│   └── connectors/              # Conectores a servicios externos
│       └── src/
│           ├── shopify/index.ts      # Conector Shopify real (REST + GraphQL + OAuth)
│           ├── meta/index.ts         # Meta Ads (stub)
│           ├── tiktok/index.ts       # TikTok Ads (stub)
│           ├── llm/index.ts          # LLM / Image gen (stub)
│           └── storage/              # Cliente S3
├── infra/
│   ├── docker/                  # Dockerfiles + configs OTEL/Prometheus
│   ├── migrations/              # Migraciones SQL + runner
│   └── scripts/                 # Seed, smoke tests
├── docker-compose.yml           # Orquestación de todos los servicios
├── Makefile                     # Comandos útiles
├── pnpm-workspace.yaml          # Configuración monorepo
└── .env.example                 # Variables de entorno de ejemplo
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

### Tracking — Fase 3

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tracking/status` | Estado de configuración (Meta, TikTok, enabled) |
| `POST` | `/tracking/meta/test` | Test de conexión Meta CAPI (admin) |
| `POST` | `/tracking/tiktok/test` | Test de conexión TikTok Events API (admin) |
| `POST` | `/tracking/test-event` | Enviar evento de prueba a todas las plataformas (admin) |
| `GET` | `/tracking/events` | Historial de eventos enviados (filtrable por platform/status) |
| `GET` | `/tracking/stats` | Estadísticas de eventos por plataforma |

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
| `DRY_RUN` | `true` | Modo seguro: los workers simulan tareas sin ejecutar acciones reales |
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

### Conflictos de puerto

Los puertos host de la infraestructura están desplazados para no chocar con servicios locales:
- PostgreSQL: **5433** (host) → 5432 (container)
- Redis: **6380** (host) → 6379 (container)

Si sigues teniendo conflictos, detén tus servicios locales o cambia los puertos en `docker-compose.yml`.

---

## Roadmap

### Fases completadas

- **Fase 0** — Preparación: nicho elegido, tienda creada
- **Fase 1** — Shopify: productos cargados, moneda, impuestos, envíos
- **Fase 2** — Dominio y estética mínima del theme
- **Fase 3** — Tracking y canales: Meta CAPI, TikTok Events API, UTMs (ver sección Tracking)
- **Fase 4** — Infraestructura: monorepo, Docker, auth multi-tenant, RBAC, DB, S3, workers, dashboard
- **Fase 5** — Integraciones Shopify: conector REST/GraphQL, OAuth auto-token, webhooks, dashboard pages

### Fase 6 — Agentes MVP (próximo)

- Conector LLM real (Claude/OpenAI)
- Agente Ops: detección de pedidos en riesgo
- Agente Support: respuestas automáticas
- Agente Reporting: informes diarios programados
- Scheduling de jobs (BullMQ repeatable)
- Kill switch en dashboard

### Fase 7 — Ads + Creatividades

- Meta Marketing API real + Agente Ads Meta
- TikTok Ads API real + Agente Ads TikTok
- Generación de creatividades con IA
- Asset pipeline (S3)

### Fase 8 — Escalado

- Agentes adicionales: CRO, Pricing, SEO, Fraud detection
- Attribution modeling
- Auto-escalado de workers

---

## Licencia

Proyecto privado. Todos los derechos reservados.
