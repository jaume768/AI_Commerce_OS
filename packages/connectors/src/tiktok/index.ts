// TikTok connector — Fase 3
// Events API for server-side event tracking
// Ads Management stubs remain for Fase 7

import { createHash, randomBytes } from 'crypto';

// ============================================================
// Types
// ============================================================

export interface TikTokConfig {
  accessToken: string;
  pixelId: string;
  testEventCode?: string;    // for testing in TikTok Events Manager
  advertiserId?: string;     // used later for ads management (Fase 7)
}

export interface TikTokUserData {
  email?: string;
  phone?: string;
  externalId?: string;
  ip?: string;
  userAgent?: string;
  ttclid?: string;            // TikTok click ID (from URL param)
  ttp?: string;               // _ttp cookie
}

export interface TikTokContentItem {
  contentId: string;
  contentType?: string;       // "product" or "product_group"
  contentName?: string;
  contentCategory?: string;
  quantity?: number;
  price?: number;
  brand?: string;
}

export interface TikTokProperties {
  currency?: string;
  value?: number;
  contents?: TikTokContentItem[];
  contentType?: string;
  description?: string;
  query?: string;
  orderId?: string;
  shopId?: string;
  [key: string]: unknown;
}

export type TikTokEventName =
  | 'CompletePayment'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'ViewContent'
  | 'PlaceAnOrder'
  | 'Contact'
  | 'CompleteRegistration'
  | 'AddPaymentInfo'
  | 'Search'
  | 'SubmitForm'
  | string;

export interface TikTokServerEvent {
  eventName: TikTokEventName;
  eventTime?: number;          // unix seconds — defaults to now
  eventId?: string;            // for deduplication
  userData: TikTokUserData;
  properties?: TikTokProperties;
  page?: {
    url?: string;
    referrer?: string;
  };
}

export interface TikTokEventResponse {
  code: number;
  message: string;
}

export interface TikTokCampaign {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface TikTokConnector {
  // Events API (Fase 3)
  sendEvent(event: TikTokServerEvent): Promise<TikTokEventResponse>;
  sendEvents(events: TikTokServerEvent[]): Promise<TikTokEventResponse>;
  testConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }>;
  // Ads Management (stubs for Fase 7)
  getCampaign(id: string): Promise<TikTokCampaign | null>;
  listCampaigns(): Promise<TikTokCampaign[]>;
  createCampaign(data: Partial<TikTokCampaign>): Promise<TikTokCampaign>;
}

// ============================================================
// Helpers — PII hashing (SHA-256, lowercase, trimmed)
// ============================================================

function hashSha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function buildUserContext(userData: TikTokUserData): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  if (userData.email) ctx.sha256_email = hashSha256(userData.email);
  if (userData.phone) ctx.sha256_phone = hashSha256(userData.phone.replace(/\D/g, ''));
  if (userData.externalId) ctx.external_id = hashSha256(userData.externalId);
  if (userData.ip) ctx.ip = userData.ip;
  if (userData.userAgent) ctx.user_agent = userData.userAgent;
  if (userData.ttclid) ctx.ttclid = userData.ttclid;
  if (userData.ttp) ctx.ttp = userData.ttp;

  return ctx;
}

function buildContents(contents?: TikTokContentItem[]): Record<string, unknown>[] | undefined {
  if (!contents || contents.length === 0) return undefined;
  return contents.map((item) => ({
    content_id: item.contentId,
    content_type: item.contentType || 'product',
    content_name: item.contentName,
    content_category: item.contentCategory,
    quantity: item.quantity,
    price: item.price,
    brand: item.brand,
  }));
}

function buildProperties(props?: TikTokProperties): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const result: Record<string, unknown> = {};

  if (props.currency) result.currency = props.currency.toUpperCase();
  if (props.value !== undefined) result.value = props.value;
  if (props.contents) result.contents = buildContents(props.contents);
  if (props.contentType) result.content_type = props.contentType;
  if (props.description) result.description = props.description;
  if (props.query) result.query = props.query;
  if (props.orderId) result.order_id = props.orderId;
  if (props.shopId) result.shop_id = props.shopId;

  return result;
}

export function generateTikTokEventId(): string {
  return randomBytes(16).toString('hex');
}

// ============================================================
// Connector factory
// ============================================================

export function createTikTokConnector(config: TikTokConfig): TikTokConnector {
  const { accessToken, pixelId, testEventCode } = config;
  const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  async function postEvents(events: TikTokServerEvent[]): Promise<TikTokEventResponse> {
    const batch = events.map((event) => ({
      event: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      event_id: event.eventId || generateTikTokEventId(),
      user: buildUserContext(event.userData),
      properties: buildProperties(event.properties),
      page: event.page ? {
        url: event.page.url,
        referrer: event.page.referrer,
      } : undefined,
    }));

    const body: Record<string, unknown> = {
      pixel_code: pixelId,
      batch,
    };

    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`TikTok Events API error (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { code: number; message: string };

    if (json.code !== 0) {
      throw new Error(`TikTok Events API error (code ${json.code}): ${json.message}`);
    }

    return { code: json.code, message: json.message };
  }

  return {
    // === Events API ===
    async sendEvent(event: TikTokServerEvent): Promise<TikTokEventResponse> {
      return postEvents([event]);
    },

    async sendEvents(events: TikTokServerEvent[]): Promise<TikTokEventResponse> {
      if (events.length === 0) {
        return { code: 0, message: 'No events to send' };
      }
      // TikTok supports max 50 events per batch
      if (events.length > 50) {
        throw new Error('TikTok Events API supports max 50 events per batch');
      }
      return postEvents(events);
    },

    async testConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }> {
      try {
        await postEvents([{
          eventName: 'ViewContent',
          eventId: `test_${generateTikTokEventId()}`,
          userData: {},
        }]);
        return { ok: true, pixelId };
      } catch (err: any) {
        return { ok: false, pixelId, error: err.message };
      }
    },

    // === Ads Management (stubs for Fase 7) ===
    async getCampaign(id: string) {
      console.log(`[STUB] TikTok getCampaign: ${id}`);
      return { id, name: 'Mock TikTok Campaign', status: 'DISABLE' };
    },
    async listCampaigns() {
      console.log('[STUB] TikTok listCampaigns');
      return [];
    },
    async createCampaign(data: Partial<TikTokCampaign>) {
      console.log('[STUB] TikTok createCampaign', data);
      return { id: 'mock-tt-1', name: 'Mock', status: 'DISABLE', ...data };
    },
  };
}
