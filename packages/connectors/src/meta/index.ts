// Meta (Facebook/Instagram) connector — Fase 3
// Conversions API (CAPI) for server-side event tracking
// Ads Management stubs remain for Fase 7

import { createHash, randomBytes } from 'crypto';

// ============================================================
// Types
// ============================================================

export interface MetaConfig {
  accessToken: string;
  pixelId: string;
  apiVersion?: string;       // default "v21.0"
  testEventCode?: string;    // for testing in Meta Events Manager
  adAccountId?: string;      // used later for ads management (Fase 7)
}

export interface MetaUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;              // _fbc cookie
  fbp?: string;              // _fbp cookie
}

export interface MetaCustomData {
  currency?: string;
  value?: number;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;      // "product" or "product_group"
  contents?: { id: string; quantity: number; item_price?: number }[];
  numItems?: number;
  orderId?: string;
  searchString?: string;
  status?: string;
  [key: string]: unknown;
}

export type MetaEventName =
  | 'Purchase'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'ViewContent'
  | 'PageView'
  | 'Lead'
  | 'CompleteRegistration'
  | 'AddPaymentInfo'
  | 'Search'
  | string;

export interface MetaServerEvent {
  eventName: MetaEventName;
  eventTime?: number;        // unix seconds — defaults to now
  eventId?: string;          // for deduplication with browser pixel
  eventSourceUrl?: string;
  actionSource: 'website' | 'app' | 'email' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'other';
  userData: MetaUserData;
  customData?: MetaCustomData;
  optOut?: boolean;
}

export interface MetaEventResponse {
  eventsReceived: number;
  messages: string[];
  fbTraceId: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  [key: string]: unknown;
}

export interface MetaConnector {
  // Conversions API (Fase 3)
  sendEvent(event: MetaServerEvent): Promise<MetaEventResponse>;
  sendEvents(events: MetaServerEvent[]): Promise<MetaEventResponse>;
  testConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }>;
  // Ads Management (stubs for Fase 7)
  getCampaign(id: string): Promise<MetaCampaign | null>;
  listCampaigns(): Promise<MetaCampaign[]>;
  createCampaign(data: Partial<MetaCampaign>): Promise<MetaCampaign>;
}

// ============================================================
// Helpers — PII hashing (SHA-256, lowercase, trimmed)
// ============================================================

function hashSha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function hashUserData(userData: MetaUserData): Record<string, unknown> {
  const hashed: Record<string, unknown> = {};

  if (userData.email) hashed.em = [hashSha256(userData.email)];
  if (userData.phone) hashed.ph = [hashSha256(userData.phone.replace(/\D/g, ''))];
  if (userData.firstName) hashed.fn = [hashSha256(userData.firstName)];
  if (userData.lastName) hashed.ln = [hashSha256(userData.lastName)];
  if (userData.city) hashed.ct = [hashSha256(userData.city)];
  if (userData.state) hashed.st = [hashSha256(userData.state)];
  if (userData.zip) hashed.zp = [hashSha256(userData.zip)];
  if (userData.country) hashed.country = [hashSha256(userData.country)];
  if (userData.externalId) hashed.external_id = [hashSha256(userData.externalId)];
  if (userData.clientIpAddress) hashed.client_ip_address = userData.clientIpAddress;
  if (userData.clientUserAgent) hashed.client_user_agent = userData.clientUserAgent;
  if (userData.fbc) hashed.fbc = userData.fbc;
  if (userData.fbp) hashed.fbp = userData.fbp;

  return hashed;
}

function buildCustomData(customData?: MetaCustomData): Record<string, unknown> | undefined {
  if (!customData) return undefined;
  const result: Record<string, unknown> = {};

  if (customData.currency) result.currency = customData.currency.toUpperCase();
  if (customData.value !== undefined) result.value = customData.value;
  if (customData.contentName) result.content_name = customData.contentName;
  if (customData.contentCategory) result.content_category = customData.contentCategory;
  if (customData.contentIds) result.content_ids = customData.contentIds;
  if (customData.contentType) result.content_type = customData.contentType;
  if (customData.contents) result.contents = customData.contents;
  if (customData.numItems !== undefined) result.num_items = customData.numItems;
  if (customData.orderId) result.order_id = customData.orderId;
  if (customData.searchString) result.search_string = customData.searchString;
  if (customData.status) result.status = customData.status;

  return result;
}

export function generateEventId(): string {
  return randomBytes(16).toString('hex');
}

// ============================================================
// Connector factory
// ============================================================

export function createMetaConnector(config: MetaConfig): MetaConnector {
  const { accessToken, pixelId, apiVersion = 'v21.0', testEventCode } = config;
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;

  async function postEvents(events: MetaServerEvent[]): Promise<MetaEventResponse> {
    const data = events.map((event) => ({
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      event_id: event.eventId || generateEventId(),
      event_source_url: event.eventSourceUrl,
      action_source: event.actionSource,
      opt_out: event.optOut,
      user_data: hashUserData(event.userData),
      custom_data: buildCustomData(event.customData),
    }));

    const body: Record<string, unknown> = { data };
    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Meta CAPI error (${res.status}): ${text}`);
    }

    const json = (await res.json()) as {
      events_received: number;
      messages: string[];
      fbtrace_id: string;
    };

    return {
      eventsReceived: json.events_received,
      messages: json.messages || [],
      fbTraceId: json.fbtrace_id,
    };
  }

  return {
    // === Conversions API ===
    async sendEvent(event: MetaServerEvent): Promise<MetaEventResponse> {
      return postEvents([event]);
    },

    async sendEvents(events: MetaServerEvent[]): Promise<MetaEventResponse> {
      if (events.length === 0) {
        return { eventsReceived: 0, messages: [], fbTraceId: '' };
      }
      // Meta recommends max 1000 events per request
      if (events.length > 1000) {
        throw new Error('Meta CAPI supports max 1000 events per request');
      }
      return postEvents(events);
    },

    async testConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }> {
      try {
        // Send a minimal PageView event to verify connectivity
        // Meta CAPI requires at least one user_data parameter
        const result = await postEvents([{
          eventName: 'PageView',
          actionSource: 'system_generated',
          eventTime: Math.floor(Date.now() / 1000),
          eventId: `test_${generateEventId()}`,
          userData: {
            externalId: 'test_connection_check',
            clientIpAddress: '127.0.0.1',
            clientUserAgent: 'AI-Commerce-OS/1.0',
          },
        }]);
        return { ok: result.eventsReceived > 0, pixelId };
      } catch (err: any) {
        return { ok: false, pixelId, error: err.message };
      }
    },

    // === Ads Management (stubs for Fase 7) ===
    async getCampaign(id: string) {
      console.log(`[STUB] Meta getCampaign: ${id}`);
      return { id, name: 'Mock Campaign', status: 'PAUSED', objective: 'CONVERSIONS' };
    },
    async listCampaigns() {
      console.log('[STUB] Meta listCampaigns');
      return [];
    },
    async createCampaign(data: Partial<MetaCampaign>) {
      console.log('[STUB] Meta createCampaign', data);
      return { id: 'mock-meta-1', name: 'Mock', status: 'PAUSED', objective: 'CONVERSIONS', ...data };
    },
  };
}
