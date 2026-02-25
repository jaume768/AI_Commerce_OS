import { FastifyInstance } from 'fastify';
import { verifyShopifyWebhookHMAC } from '@ai-commerce-os/connectors';
import { createLogger } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';
import { config } from '../config';

const log = createLogger('shopify-webhooks');

// Topics we handle
const SUPPORTED_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'refunds/create',
  'fulfillments/create',
  'fulfillments/update',
  'products/create',
  'products/update',
  'products/delete',
  'customers/create',
  'customers/update',
  'app/uninstalled',
] as const;

type WebhookTopic = (typeof SUPPORTED_TOPICS)[number];

export async function shopifyWebhookRoutes(app: FastifyInstance) {
  // Fastify parses JSON by default — we need the raw body for HMAC verification.
  // Register a content type parser that keeps the raw body available.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      try {
        const json = JSON.parse(body.toString());
        // Attach raw body for HMAC verification
        (json as any).__rawBody = body;
        done(null, json);
      } catch (err: any) {
        done(err, undefined);
      }
    },
  );

  // === Main webhook receiver ===
  app.post('/webhooks/shopify', async (request, reply) => {
    const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
    const topic = request.headers['x-shopify-topic'] as string;
    const shopDomain = request.headers['x-shopify-shop-domain'] as string;
    const shopifyEventId = request.headers['x-shopify-event-id'] as string;
    const shopifyApiVersion = request.headers['x-shopify-api-version'] as string;

    // Basic header validation
    if (!hmacHeader || !topic || !shopDomain) {
      log.warn({ topic, shopDomain }, 'Webhook missing required headers');
      return reply.status(400).send({ error: 'Missing required Shopify headers' });
    }

    // HMAC verification
    const secret = (config as any).SHOPIFY_CLIENT_SECRET || (config as any).SHOPIFY_WEBHOOK_SECRET;
    if (secret) {
      const rawBody = (request.body as any).__rawBody as Buffer;
      if (!rawBody || !verifyShopifyWebhookHMAC(rawBody, hmacHeader, secret)) {
        log.warn({ topic, shopDomain }, 'Webhook HMAC verification failed');
        return reply.status(401).send({ error: 'HMAC verification failed' });
      }
    } else {
      log.warn('No webhook secret configured — skipping HMAC verification');
    }

    // Remove raw body before processing
    const payload = { ...(request.body as Record<string, unknown>) };
    delete payload.__rawBody;

    // Look up store by domain
    const store = await queryOne<{ id: string }>(
      `SELECT id FROM stores WHERE domain = $1 OR settings->>'myshopify_domain' = $1 LIMIT 1`,
      [shopDomain],
    );

    // Use first store if domain mapping not found (single-tenant fallback)
    const storeId = store?.id || await getDefaultStoreId();
    if (!storeId) {
      log.error({ shopDomain, topic }, 'No store found for webhook');
      // Still return 200 so Shopify doesn't retry
      return reply.status(200).send({ status: 'ignored', reason: 'no matching store' });
    }

    // Idempotency: check if event already processed
    if (shopifyEventId) {
      const existing = await queryOne(
        'SELECT id, status FROM webhook_events WHERE shopify_event_id = $1',
        [shopifyEventId],
      );
      if (existing) {
        log.info({ shopifyEventId, topic }, 'Duplicate webhook event, skipping');
        return reply.status(200).send({ status: 'duplicate' });
      }
    }

    // Store the event
    const shopifyResourceId = (payload as any).id?.toString() || null;
    const [event] = await query(
      `INSERT INTO webhook_events (store_id, topic, shopify_id, shopify_event_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'received')
       RETURNING id`,
      [storeId, topic, shopifyResourceId, shopifyEventId || null, JSON.stringify(payload)],
    );

    log.info({
      eventId: event.id,
      storeId,
      topic,
      shopDomain,
      shopifyEventId,
      apiVersion: shopifyApiVersion,
    }, 'Webhook received');

    // Process event asynchronously (don't block the response)
    processWebhookEvent(event.id, storeId, topic as WebhookTopic, payload).catch((err) => {
      log.error({ eventId: event.id, err: err.message }, 'Webhook processing failed');
    });

    // Always return 200 quickly so Shopify doesn't retry
    return reply.status(200).send({ status: 'accepted', eventId: event.id });
  });
}

// --- Event processing ---

async function processWebhookEvent(
  eventId: string,
  storeId: string,
  topic: WebhookTopic,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await query(
      "UPDATE webhook_events SET status = 'processing' WHERE id = $1",
      [eventId],
    );

    switch (topic) {
      case 'orders/create':
        await handleOrderCreate(storeId, payload);
        break;
      case 'orders/paid':
        await handleOrderPaid(storeId, payload);
        break;
      case 'orders/updated':
        await handleOrderUpdated(storeId, payload);
        break;
      case 'orders/cancelled':
        await handleOrderCancelled(storeId, payload);
        break;
      case 'refunds/create':
        await handleRefundCreate(storeId, payload);
        break;
      case 'fulfillments/create':
      case 'fulfillments/update':
        await handleFulfillment(storeId, topic, payload);
        break;
      case 'products/create':
      case 'products/update':
        await handleProductChange(storeId, topic, payload);
        break;
      case 'products/delete':
        await handleProductDelete(storeId, payload);
        break;
      case 'customers/create':
      case 'customers/update':
        await handleCustomerChange(storeId, topic, payload);
        break;
      case 'app/uninstalled':
        await handleAppUninstalled(storeId, payload);
        break;
      default:
        log.info({ topic, eventId }, 'Unhandled webhook topic');
    }

    await query(
      "UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE id = $1",
      [eventId],
    );
  } catch (err: any) {
    await query(
      "UPDATE webhook_events SET status = 'failed', error = $1 WHERE id = $2",
      [err.message, eventId],
    );
    throw err;
  }
}

// --- Individual handlers ---

async function handleOrderCreate(storeId: string, payload: Record<string, unknown>) {
  const order = payload as any;
  log.info({ storeId, orderId: order.id, name: order.name, total: order.total_price }, 'New order received');

  // Audit log
  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'order', $2, 'shopify_order_create', 'webhook', $3)`,
    [storeId, order.id?.toString(), JSON.stringify({
      name: order.name,
      total_price: order.total_price,
      currency: order.currency,
      customer_email: order.email,
      items_count: order.line_items?.length,
    })],
  );
}

async function handleOrderPaid(storeId: string, payload: Record<string, unknown>) {
  const order = payload as any;
  log.info({ storeId, orderId: order.id, name: order.name }, 'Order paid');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'order', $2, 'shopify_order_paid', 'webhook', $3)`,
    [storeId, order.id?.toString(), JSON.stringify({
      name: order.name,
      total_price: order.total_price,
      financial_status: order.financial_status,
    })],
  );
}

async function handleOrderUpdated(storeId: string, payload: Record<string, unknown>) {
  const order = payload as any;
  log.info({ storeId, orderId: order.id, name: order.name }, 'Order updated');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'order', $2, 'shopify_order_updated', 'webhook', $3)`,
    [storeId, order.id?.toString(), JSON.stringify({
      name: order.name,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
    })],
  );
}

async function handleOrderCancelled(storeId: string, payload: Record<string, unknown>) {
  const order = payload as any;
  log.info({ storeId, orderId: order.id, name: order.name }, 'Order cancelled');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'order', $2, 'shopify_order_cancelled', 'webhook', $3)`,
    [storeId, order.id?.toString(), JSON.stringify({
      name: order.name,
      cancel_reason: order.cancel_reason,
    })],
  );
}

async function handleRefundCreate(storeId: string, payload: Record<string, unknown>) {
  const refund = payload as any;
  log.info({ storeId, refundId: refund.id, orderId: refund.order_id }, 'Refund created');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'refund', $2, 'shopify_refund_create', 'webhook', $3)`,
    [storeId, refund.id?.toString(), JSON.stringify({
      order_id: refund.order_id,
      note: refund.note,
      transactions_count: refund.transactions?.length,
    })],
  );
}

async function handleFulfillment(storeId: string, topic: string, payload: Record<string, unknown>) {
  const fulfillment = payload as any;
  log.info({ storeId, fulfillmentId: fulfillment.id, topic }, 'Fulfillment event');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'fulfillment', $2, $3, 'webhook', $4)`,
    [storeId, fulfillment.id?.toString(), `shopify_${topic.replace('/', '_')}`, JSON.stringify({
      order_id: fulfillment.order_id,
      status: fulfillment.status,
      tracking_number: fulfillment.tracking_number,
      tracking_company: fulfillment.tracking_company,
    })],
  );
}

async function handleProductChange(storeId: string, topic: string, payload: Record<string, unknown>) {
  const product = payload as any;
  log.info({ storeId, productId: product.id, title: product.title, topic }, 'Product change');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'product', $2, $3, 'webhook', $4)`,
    [storeId, product.id?.toString(), `shopify_${topic.replace('/', '_')}`, JSON.stringify({
      title: product.title,
      status: product.status,
      variants_count: product.variants?.length,
    })],
  );
}

async function handleProductDelete(storeId: string, payload: Record<string, unknown>) {
  const product = payload as any;
  log.info({ storeId, productId: product.id }, 'Product deleted');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'product', $2, 'shopify_products_delete', 'webhook', $3)`,
    [storeId, product.id?.toString(), JSON.stringify({ id: product.id })],
  );
}

async function handleCustomerChange(storeId: string, topic: string, payload: Record<string, unknown>) {
  const customer = payload as any;
  log.info({ storeId, customerId: customer.id, email: customer.email, topic }, 'Customer change');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'customer', $2, $3, 'webhook', $4)`,
    [storeId, customer.id?.toString(), `shopify_${topic.replace('/', '_')}`, JSON.stringify({
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      orders_count: customer.orders_count,
    })],
  );
}

async function handleAppUninstalled(storeId: string, _payload: Record<string, unknown>) {
  log.warn({ storeId }, 'Shopify app uninstalled!');

  await query(
    `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes)
     VALUES ($1, 'store', $1, 'shopify_app_uninstalled', 'webhook', '{}')`,
    [storeId],
  );
}

// --- Helper ---

async function getDefaultStoreId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM stores WHERE status = 'active' ORDER BY created_at LIMIT 1",
    [],
  );
  return row?.id || null;
}
