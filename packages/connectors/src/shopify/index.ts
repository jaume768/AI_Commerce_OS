// Shopify connector — stub for Fase 4
// Real implementation in Fase 5 (Shopify OAuth + webhooks)

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  status: string;
  variants: unknown[];
  [key: string]: unknown;
}

export interface ShopifyConnector {
  getProduct(id: string): Promise<ShopifyProduct | null>;
  listProducts(params?: Record<string, unknown>): Promise<ShopifyProduct[]>;
  updateProduct(id: string, data: Partial<ShopifyProduct>): Promise<ShopifyProduct>;
  createWebhook(topic: string, address: string): Promise<unknown>;
}

export function createShopifyConnector(_config: ShopifyConfig): ShopifyConnector {
  return {
    async getProduct(id: string): Promise<ShopifyProduct | null> {
      console.log(`[STUB] Shopify getProduct: ${id}`);
      return { id, title: 'Mock Product', status: 'active', variants: [] };
    },
    async listProducts(): Promise<ShopifyProduct[]> {
      console.log('[STUB] Shopify listProducts');
      return [{ id: 'mock-1', title: 'Mock Product', status: 'active', variants: [] }];
    },
    async updateProduct(id: string, data: Partial<ShopifyProduct>): Promise<ShopifyProduct> {
      console.log(`[STUB] Shopify updateProduct: ${id}`, data);
      return { id, title: 'Mock Product', status: 'active', variants: [], ...data };
    },
    async createWebhook(topic: string, address: string): Promise<unknown> {
      console.log(`[STUB] Shopify createWebhook: ${topic} -> ${address}`);
      return { id: 'mock-webhook', topic, address };
    },
  };
}
