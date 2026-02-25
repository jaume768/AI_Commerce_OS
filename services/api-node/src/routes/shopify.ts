import { FastifyInstance } from 'fastify';
import { createShopifyConnector, ShopifyConnector } from '@ai-commerce-os/connectors';
import { config } from '../config';

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
}
