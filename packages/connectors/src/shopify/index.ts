// Shopify connector — Real implementation using Admin REST API
// Supports both:
//   1. Static access token (shpat_xxx) — legacy custom apps
//   2. Client credentials OAuth flow — Dev Dashboard apps (token auto-refresh)

export interface ShopifyConfig {
  shopDomain: string;       // e.g. "my-store.myshopify.com" or "my-store"
  apiVersion?: string;      // e.g. "2024-10"
  // Option A: static token (legacy)
  accessToken?: string;     // e.g. "shpat_xxxxx"
  // Option B: client credentials (Dev Dashboard)
  clientId?: string;
  clientSecret?: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  image: { src: string } | null;
  images: { id: number; src: string; position: number }[];
  variants: ShopifyVariant[];
  tags: string;
  [key: string]: unknown;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string | null;
  inventory_quantity: number;
  [key: string]: unknown;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  order_number: number;
  tags: string;
  [key: string]: unknown;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  variant_id: number | null;
  product_id: number | null;
  [key: string]: unknown;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
  [key: string]: unknown;
}

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  plan_name: string;
  currency: string;
  money_format: string;
  timezone: string;
  country_name: string;
  created_at: string;
  [key: string]: unknown;
}

export interface ShopifyCollect {
  id: number;
  collection_id: number;
  product_id: number;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  published_at: string | null;
  sort_order: string;
  products_count?: number;
  [key: string]: unknown;
}

export interface ShopifyListParams {
  limit?: number;
  page_info?: string;
  since_id?: number;
  status?: string;
  created_at_min?: string;
  created_at_max?: string;
  fields?: string;
  [key: string]: unknown;
}

export interface ShopifyPaginatedResult<T> {
  data: T[];
  nextPageInfo?: string;
  prevPageInfo?: string;
}

export interface ShopifyConnector {
  // Shop
  getShop(): Promise<ShopifyShop>;
  // Products
  getProduct(id: number): Promise<ShopifyProduct | null>;
  listProducts(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyProduct>>;
  countProducts(params?: Record<string, string>): Promise<number>;
  updateProduct(id: number, data: Partial<ShopifyProduct>): Promise<ShopifyProduct>;
  // Orders
  getOrder(id: number): Promise<ShopifyOrder | null>;
  listOrders(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyOrder>>;
  countOrders(params?: Record<string, string>): Promise<number>;
  // Customers
  listCustomers(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyCustomer>>;
  countCustomers(): Promise<number>;
  // Collections
  listCollections(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyCollection>>;
  // Webhooks
  createWebhook(topic: string, address: string): Promise<unknown>;
  // Raw request
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

function parseLinkHeader(header: string | null): { next?: string; previous?: string } {
  const result: { next?: string; previous?: string } = {};
  if (!header) return result;
  const parts = header.split(',');
  for (const part of parts) {
    const match = part.match(/<[^>]*page_info=([^>&]*).*>;\s*rel="(\w+)"/);
    if (match) {
      const [, pageInfo, rel] = match;
      if (rel === 'next') result.next = pageInfo;
      if (rel === 'previous') result.previous = pageInfo;
    }
  }
  return result;
}

// --- Token Manager for client_credentials flow ---
interface TokenCache {
  accessToken: string;
  expiresAt: number; // unix ms
}

class ShopifyTokenManager {
  private cache: TokenCache | null = null;
  private pending: Promise<string> | null = null;
  private shopOrigin: string;
  private clientId: string;
  private clientSecret: string;

  constructor(shopOrigin: string, clientId: string, clientSecret: string) {
    this.shopOrigin = shopOrigin;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.cache && Date.now() < this.cache.expiresAt - 5 * 60 * 1000) {
      return this.cache.accessToken;
    }
    // Deduplicate concurrent refresh requests
    if (this.pending) return this.pending;
    this.pending = this.fetchToken();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(`${this.shopOrigin}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shopify token request failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { access_token: string; expires_in: number; scope: string };
    this.cache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  }
}

export function createShopifyConnector(config: ShopifyConfig): ShopifyConnector {
  const { apiVersion = '2024-10' } = config;

  // Normalize domain: strip protocol, trailing slashes, whitespace
  let shopDomain = config.shopDomain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  // If only shop name given (no dots), append .myshopify.com
  if (!shopDomain.includes('.')) {
    shopDomain = `${shopDomain}.myshopify.com`;
  }
  const shopOrigin = `https://${shopDomain}`;
  const baseUrl = `${shopOrigin}/admin/api/${apiVersion}`;

  // Determine auth strategy
  const hasStaticToken = !!config.accessToken;
  const hasClientCredentials = !!config.clientId && !!config.clientSecret;

  if (!hasStaticToken && !hasClientCredentials) {
    throw new Error(
      'Shopify: must provide either accessToken (legacy) or clientId + clientSecret (Dev Dashboard).',
    );
  }

  const tokenManager = hasClientCredentials
    ? new ShopifyTokenManager(shopOrigin, config.clientId!, config.clientSecret!)
    : null;

  async function getAccessToken(): Promise<string> {
    if (tokenManager) {
      return tokenManager.getToken();
    }
    return config.accessToken!;
  }

  async function shopifyFetch<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ data: T; linkHeader: string | null }> {
    const token = await getAccessToken();
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shopify API ${method} ${path} failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as T;
    return { data, linkHeader: res.headers.get('link') };
  }

  function buildQuery(params?: ShopifyListParams): string {
    if (!params) return '';
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }

  return {
    async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const { data } = await shopifyFetch<T>(method, path, body);
      return data;
    },

    // === Shop ===
    async getShop(): Promise<ShopifyShop> {
      const { data } = await shopifyFetch<{ shop: ShopifyShop }>('GET', '/shop.json');
      return data.shop;
    },

    // === Products ===
    async getProduct(id: number): Promise<ShopifyProduct | null> {
      try {
        const { data } = await shopifyFetch<{ product: ShopifyProduct }>('GET', `/products/${id}.json`);
        return data.product;
      } catch {
        return null;
      }
    },

    async listProducts(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyProduct>> {
      const qs = buildQuery({ limit: 50, ...params });
      const { data, linkHeader } = await shopifyFetch<{ products: ShopifyProduct[] }>('GET', `/products.json${qs}`);
      const links = parseLinkHeader(linkHeader);
      return { data: data.products, nextPageInfo: links.next, prevPageInfo: links.previous };
    },

    async countProducts(params?: Record<string, string>): Promise<number> {
      const qs = buildQuery(params);
      const { data } = await shopifyFetch<{ count: number }>('GET', `/products/count.json${qs}`);
      return data.count;
    },

    async updateProduct(id: number, updateData: Partial<ShopifyProduct>): Promise<ShopifyProduct> {
      const { data } = await shopifyFetch<{ product: ShopifyProduct }>('PUT', `/products/${id}.json`, {
        product: { id, ...updateData },
      });
      return data.product;
    },

    // === Orders ===
    async getOrder(id: number): Promise<ShopifyOrder | null> {
      try {
        const { data } = await shopifyFetch<{ order: ShopifyOrder }>('GET', `/orders/${id}.json`);
        return data.order;
      } catch {
        return null;
      }
    },

    async listOrders(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyOrder>> {
      const qs = buildQuery({ limit: 50, status: 'any', ...params });
      const { data, linkHeader } = await shopifyFetch<{ orders: ShopifyOrder[] }>('GET', `/orders.json${qs}`);
      const links = parseLinkHeader(linkHeader);
      return { data: data.orders, nextPageInfo: links.next, prevPageInfo: links.previous };
    },

    async countOrders(params?: Record<string, string>): Promise<number> {
      const qs = buildQuery({ status: 'any', ...params });
      const { data } = await shopifyFetch<{ count: number }>('GET', `/orders/count.json${qs}`);
      return data.count;
    },

    // === Customers ===
    async listCustomers(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyCustomer>> {
      const qs = buildQuery({ limit: 50, ...params });
      const { data, linkHeader } = await shopifyFetch<{ customers: ShopifyCustomer[] }>('GET', `/customers.json${qs}`);
      const links = parseLinkHeader(linkHeader);
      return { data: data.customers, nextPageInfo: links.next, prevPageInfo: links.previous };
    },

    async countCustomers(): Promise<number> {
      const { data } = await shopifyFetch<{ count: number }>('GET', '/customers/count.json');
      return data.count;
    },

    // === Collections ===
    async listCollections(params?: ShopifyListParams): Promise<ShopifyPaginatedResult<ShopifyCollection>> {
      const qs = buildQuery({ limit: 50, ...params });
      const { data, linkHeader } = await shopifyFetch<{ smart_collections: ShopifyCollection[] }>(
        'GET', `/smart_collections.json${qs}`,
      );
      // Also get custom collections
      const { data: data2 } = await shopifyFetch<{ custom_collections: ShopifyCollection[] }>(
        'GET', `/custom_collections.json${qs}`,
      );
      const links = parseLinkHeader(linkHeader);
      return {
        data: [...data.smart_collections, ...data2.custom_collections],
        nextPageInfo: links.next,
        prevPageInfo: links.previous,
      };
    },

    // === Webhooks ===
    async createWebhook(topic: string, address: string): Promise<unknown> {
      const { data } = await shopifyFetch<{ webhook: unknown }>('POST', '/webhooks.json', {
        webhook: { topic, address, format: 'json' },
      });
      return data.webhook;
    },
  };
}
