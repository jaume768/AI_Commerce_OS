import { FastifyInstance } from 'fastify';
import { createShopifyConnector, ShopifyConnector } from '@ai-commerce-os/connectors';
import { config } from '../config';
import { query } from '../db';
import { requireRole } from '../middleware/rbac';

let _shopifyClient: ShopifyConnector | null = null;

function getShopifyClient(): ShopifyConnector {
  if (_shopifyClient) return _shopifyClient;

  const shopDomain = (config as any).SHOPIFY_SHOP_DOMAIN;
  const apiVersion = (config as any).SHOPIFY_API_VERSION || '2024-10';
  const accessToken = (config as any).SHOPIFY_ACCESS_TOKEN;
  const clientId = (config as any).SHOPIFY_CLIENT_ID;
  const clientSecret = (config as any).SHOPIFY_CLIENT_SECRET;

  if (!shopDomain) {
    throw new Error('Shopify not configured. Set SHOPIFY_SHOP_DOMAIN in .env');
  }

  if (!accessToken && (!clientId || !clientSecret)) {
    throw new Error(
      'Shopify credentials not configured. Set either SHOPIFY_ACCESS_TOKEN (legacy) or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard) in .env',
    );
  }

  _shopifyClient = createShopifyConnector({
    shopDomain,
    apiVersion,
    ...(accessToken ? { accessToken } : {}),
    ...(clientId ? { clientId, clientSecret } : {}),
  });
  return _shopifyClient;
}

export async function shopifyRoutes(app: FastifyInstance) {
  // === Shop Info ===
  app.get('/shopify/shop', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const shop = await shopify.getShop();
      return { shop };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Products ===
  app.get('/shopify/products', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { limit, page_info, status } = request.query as Record<string, string>;
      const shopify = getShopifyClient();
      const result = await shopify.listProducts({
        limit: limit ? parseInt(limit, 10) : 50,
        ...(page_info ? { page_info } : {}),
        ...(status ? { status } : {}),
      });
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.get('/shopify/products/count', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const count = await shopify.countProducts();
      return { count };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.get('/shopify/products/:id', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const shopify = getShopifyClient();
      const product = await shopify.getProduct(parseInt(id, 10));
      if (!product) return reply.status(404).send({ error: 'Product not found' });
      return { product };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Orders ===
  app.get('/shopify/orders', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { limit, page_info, status, created_at_min, created_at_max } = request.query as Record<string, string>;
      const shopify = getShopifyClient();
      const result = await shopify.listOrders({
        limit: limit ? parseInt(limit, 10) : 50,
        ...(page_info ? { page_info } : {}),
        ...(status ? { status } : {}),
        ...(created_at_min ? { created_at_min } : {}),
        ...(created_at_max ? { created_at_max } : {}),
      });
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.get('/shopify/orders/count', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const count = await shopify.countOrders();
      return { count };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.get('/shopify/orders/:id', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const shopify = getShopifyClient();
      const order = await shopify.getOrder(parseInt(id, 10));
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      return { order };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Customers ===
  app.get('/shopify/customers', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { limit, page_info } = request.query as Record<string, string>;
      const shopify = getShopifyClient();
      const result = await shopify.listCustomers({
        limit: limit ? parseInt(limit, 10) : 50,
        ...(page_info ? { page_info } : {}),
      });
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.get('/shopify/customers/count', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const count = await shopify.countCustomers();
      return { count };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Collections ===
  app.get('/shopify/collections', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const { limit } = request.query as Record<string, string>;
      const shopify = getShopifyClient();
      const result = await shopify.listCollections({
        limit: limit ? parseInt(limit, 10) : 50,
      });
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Overview / Dashboard Summary ===
  app.get('/shopify/overview', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const [shop, productCount, orderCount, customerCount, recentOrders] = await Promise.all([
        shopify.getShop(),
        shopify.countProducts(),
        shopify.countOrders(),
        shopify.countCustomers(),
        shopify.listOrders({ limit: 5 }),
      ]);

      // Calculate revenue from recent orders
      const totalRevenue = recentOrders.data.reduce(
        (sum, o) => sum + parseFloat(o.total_price || '0'),
        0,
      );

      return {
        shop: {
          name: shop.name,
          domain: shop.domain,
          myshopify_domain: shop.myshopify_domain,
          plan: shop.plan_name,
          currency: shop.currency,
          email: shop.email,
          timezone: shop.timezone,
          country: shop.country_name,
        },
        counts: {
          products: productCount,
          orders: orderCount,
          customers: customerCount,
        },
        recentOrders: recentOrders.data.map((o) => ({
          id: o.id,
          name: o.name,
          total_price: o.total_price,
          currency: o.currency,
          financial_status: o.financial_status,
          fulfillment_status: o.fulfillment_status,
          created_at: o.created_at,
          customer_email: o.customer?.email || o.email,
          items_count: o.line_items.length,
        })),
        recentRevenue: totalRevenue,
      };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Webhook Management ===
  app.get('/shopify/webhooks', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (_request, reply) => {
    try {
      const shopify = getShopifyClient();
      const webhooks = await shopify.listWebhooks();
      return { webhooks };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.post('/shopify/webhooks', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (request, reply) => {
    try {
      const { topic, address } = request.body as { topic: string; address: string };
      if (!topic || !address) {
        return reply.status(400).send({ error: 'topic and address are required' });
      }
      const shopify = getShopifyClient();
      const webhook = await shopify.createWebhook(topic, address);
      return reply.status(201).send({ webhook });
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.post('/shopify/webhooks/register-all', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (request, reply) => {
    try {
      const { baseUrl } = request.body as { baseUrl: string };
      if (!baseUrl) {
        return reply.status(400).send({ error: 'baseUrl is required (your public URL for webhooks)' });
      }
      const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/webhooks/shopify`;
      const topics = [
        'orders/create', 'orders/paid', 'orders/updated', 'orders/cancelled',
        'refunds/create', 'fulfillments/create', 'fulfillments/update',
        'products/create', 'products/update', 'products/delete',
        'customers/create', 'customers/update',
      ];

      const shopify = getShopifyClient();
      // Get existing webhooks to avoid duplicates
      const existing = await shopify.listWebhooks();
      const existingTopics = new Set(existing.map((w) => w.topic));

      const results: { topic: string; status: string; id?: number }[] = [];
      for (const topic of topics) {
        if (existingTopics.has(topic)) {
          results.push({ topic, status: 'already_exists' });
          continue;
        }
        try {
          const wh = await shopify.createWebhook(topic, webhookUrl);
          results.push({ topic, status: 'created', id: wh.id });
        } catch (err: any) {
          results.push({ topic, status: `error: ${err.message}` });
        }
      }

      return { webhookUrl, results };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  app.delete('/shopify/webhooks/:id', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const shopify = getShopifyClient();
      await shopify.deleteWebhook(parseInt(id, 10));
      return { deleted: true };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // === Webhook Events Log (from our DB) ===
  app.get('/shopify/webhook-events', {
    preHandler: [app.authenticate, app.extractTenant],
  }, async (request, reply) => {
    try {
      const storeId = (request as any).storeId;
      const { limit, topic, status } = request.query as Record<string, string>;
      const qLimit = Math.min(parseInt(limit || '50', 10), 100);

      let sql = 'SELECT * FROM webhook_events WHERE store_id = $1';
      const params: any[] = [storeId];
      let idx = 2;

      if (topic) {
        sql += ` AND topic = $${idx}`;
        params.push(topic);
        idx++;
      }
      if (status) {
        sql += ` AND status = $${idx}`;
        params.push(status);
        idx++;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
      params.push(qLimit);

      const events = await query(sql, params);
      return { events };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // === GraphQL Mutations (Product updates) ===
  app.put('/shopify/products/:id', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updates = request.body as Record<string, unknown>;
      const shopify = getShopifyClient();
      const product = await shopify.updateProduct(parseInt(id, 10), updates);

      // Audit
      const storeId = (request as any).storeId;
      const userId = request.user.sub;
      await query(
        `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
         VALUES ($1, 'product', $2, 'shopify_product_updated', $3, 'user', $4)`,
        [storeId, id, userId, JSON.stringify(updates)],
      );

      return { product };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });

  // GraphQL product mutation (for advanced fields: metafields, SEO, media)
  app.post('/shopify/graphql/product-update', {
    preHandler: [app.authenticate, app.extractTenant, requireRole('admin')],
  }, async (request, reply) => {
    try {
      const { productId, title, descriptionHtml, tags, metafields, seo } = request.body as {
        productId: string;
        title?: string;
        descriptionHtml?: string;
        tags?: string[];
        metafields?: { namespace: string; key: string; value: string; type: string }[];
        seo?: { title?: string; description?: string };
      };

      if (!productId) {
        return reply.status(400).send({ error: 'productId is required (GID format: gid://shopify/Product/123)' });
      }

      // Build GraphQL mutation
      const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

      const input: Record<string, unknown> = { id: gid };
      if (title !== undefined) input.title = title;
      if (descriptionHtml !== undefined) input.descriptionHtml = descriptionHtml;
      if (tags !== undefined) input.tags = tags;
      if (seo) input.seo = seo;
      if (metafields) input.metafields = metafields;

      const mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              title
              descriptionHtml
              tags
              seo { title description }
              metafields(first: 10) {
                edges { node { namespace key value type } }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const shopify = getShopifyClient();
      const result = await shopify.graphql<{
        productUpdate: {
          product: unknown;
          userErrors: { field: string[]; message: string }[];
        };
      }>(mutation, { input });

      if (result.productUpdate.userErrors.length > 0) {
        return reply.status(422).send({
          error: 'Shopify validation errors',
          userErrors: result.productUpdate.userErrors,
        });
      }

      // Audit
      const storeId = (request as any).storeId;
      const userId = request.user.sub;
      await query(
        `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
         VALUES ($1, 'product', $2, 'shopify_graphql_product_update', $3, 'user', $4)`,
        [storeId, productId, userId, JSON.stringify(input)],
      );

      return { product: result.productUpdate.product };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Shopify API error', message: err.message });
    }
  });
}
