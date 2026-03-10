// Meta (Facebook/Instagram) connector — Fase 3 + Fase 7 (Analytics)
// Conversions API (CAPI) for server-side event tracking
// Ads Analytics: real read endpoints for campaigns, ad sets, ads, insights
// Ads Creation: stubs remain for future phase

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
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
  [key: string]: unknown;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
  [key: string]: unknown;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  campaign_id?: string;
  status: string;
  effective_status: string;
  creative?: Record<string, unknown>;
  created_time?: string;
  updated_time?: string;
  preview_shareable_link?: string;
  [key: string]: unknown;
}

export interface MetaAdInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions: string;
  clicks?: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  reach?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
  [key: string]: unknown;
}

export type MetaInsightsLevel = 'account' | 'campaign' | 'adset' | 'ad';

export type MetaDatePreset =
  | 'today' | 'yesterday' | 'last_3d' | 'last_7d' | 'last_14d'
  | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'maximum';

export interface MetaInsightsParams {
  level?: MetaInsightsLevel;
  date_preset?: MetaDatePreset;
  since?: string;                // YYYY-MM-DD
  until?: string;                // YYYY-MM-DD
  time_increment?: string;       // '1' = daily, '7' = weekly, 'monthly'
  breakdowns?: string[];         // ['age', 'gender', 'country', 'placement', 'device_platform']
  fields?: string[];             // specific fields to request
  filtering?: Record<string, unknown>[];
  limit?: number;
}

export interface MetaConnector {
  // Conversions API (Fase 3)
  sendEvent(event: MetaServerEvent): Promise<MetaEventResponse>;
  sendEvents(events: MetaServerEvent[]): Promise<MetaEventResponse>;
  testConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }>;
  // Ads Analytics (Fase 7 — read-only)
  getAccountInfo(): Promise<Record<string, unknown>>;
  listCampaigns(fields?: string[], filtering?: Record<string, unknown>[]): Promise<MetaCampaign[]>;
  getCampaign(id: string, fields?: string[]): Promise<MetaCampaign | null>;
  listAdSets(campaignId?: string, fields?: string[]): Promise<MetaAdSet[]>;
  getAdSet(id: string, fields?: string[]): Promise<MetaAdSet | null>;
  listAds(adSetId?: string, fields?: string[]): Promise<MetaAd[]>;
  getAd(id: string, fields?: string[]): Promise<MetaAd | null>;
  getInsights(params?: MetaInsightsParams): Promise<MetaAdInsight[]>;
  getCampaignInsights(campaignId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]>;
  getAdSetInsights(adSetId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]>;
  getAdInsights(adId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]>;
  // Ads Creation (stubs — future phase)
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
  const { accessToken, pixelId, apiVersion = 'v21.0', testEventCode, adAccountId } = config;
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;
  const graphBase = `https://graph.facebook.com/${apiVersion}`;

  // Helper for Graph API GET requests
  async function graphGet<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${graphBase}${path}`);
    url.searchParams.set('access_token', accessToken);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Meta Graph API error (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // Paginate through all results
  async function graphGetAll<T = unknown>(path: string, params?: Record<string, string>): Promise<T[]> {
    const allData: T[] = [];
    let url: string | null = null;

    // First request
    const firstUrl = new URL(`${graphBase}${path}`);
    firstUrl.searchParams.set('access_token', accessToken);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) firstUrl.searchParams.set(k, v);
      }
    }
    url = firstUrl.toString();

    while (url) {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Meta Graph API error (${res.status}): ${text}`);
      }
      const json = await res.json() as { data: T[]; paging?: { next?: string } };
      allData.push(...(json.data || []));
      url = json.paging?.next || null;
      // Safety: max 500 items to avoid infinite loops
      if (allData.length > 500) break;
    }
    return allData;
  }

  function getAdAccountPath(): string {
    if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID is required for ads analytics. Set it in .env');
    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    return `/${id}`;
  }

  function buildInsightsParams(p?: MetaInsightsParams): Record<string, string> {
    const params: Record<string, string> = {};
    const defaultFields = [
      'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
      'impressions', 'clicks', 'spend', 'cpc', 'cpm', 'ctr', 'reach', 'frequency',
      'actions', 'action_values', 'cost_per_action_type',
    ];
    params.fields = (p?.fields || defaultFields).join(',');
    if (p?.level) params.level = p.level;
    if (p?.date_preset) params.date_preset = p.date_preset;
    if (p?.since && p?.until) {
      params.time_range = JSON.stringify({ since: p.since, until: p.until });
    }
    if (p?.time_increment) params.time_increment = p.time_increment;
    if (p?.breakdowns && p.breakdowns.length > 0) params.breakdowns = p.breakdowns.join(',');
    if (p?.filtering) params.filtering = JSON.stringify(p.filtering);
    params.limit = String(p?.limit || 100);
    return params;
  }

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

    // === Ads Analytics (real Graph API) ===
    async getAccountInfo(): Promise<Record<string, unknown>> {
      const path = getAdAccountPath();
      return graphGet(path, {
        fields: 'id,name,account_id,account_status,currency,timezone_name,amount_spent,balance,business_name,business_street,business_city,business_country_code,created_time',
      });
    },

    async listCampaigns(fields?: string[], filtering?: Record<string, unknown>[]): Promise<MetaCampaign[]> {
      const path = `${getAdAccountPath()}/campaigns`;
      const defaultFields = 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time';
      const params: Record<string, string> = {
        fields: fields?.join(',') || defaultFields,
        limit: '100',
      };
      if (filtering) params.filtering = JSON.stringify(filtering);
      return graphGetAll<MetaCampaign>(path, params);
    },

    async getCampaign(id: string, fields?: string[]): Promise<MetaCampaign | null> {
      try {
        const defaultFields = 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time';
        return await graphGet<MetaCampaign>(`/${id}`, {
          fields: fields?.join(',') || defaultFields,
        });
      } catch {
        return null;
      }
    },

    async listAdSets(campaignId?: string, fields?: string[]): Promise<MetaAdSet[]> {
      const basePath = campaignId ? `/${campaignId}` : getAdAccountPath();
      const path = `${basePath}/adsets`;
      const defaultFields = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_strategy,targeting,start_time,end_time,created_time,updated_time';
      return graphGetAll<MetaAdSet>(path, {
        fields: fields?.join(',') || defaultFields,
        limit: '100',
      });
    },

    async getAdSet(id: string, fields?: string[]): Promise<MetaAdSet | null> {
      try {
        const defaultFields = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_strategy,targeting,start_time,end_time,created_time,updated_time';
        return await graphGet<MetaAdSet>(`/${id}`, {
          fields: fields?.join(',') || defaultFields,
        });
      } catch {
        return null;
      }
    },

    async listAds(adSetId?: string, fields?: string[]): Promise<MetaAd[]> {
      const basePath = adSetId ? `/${adSetId}` : getAdAccountPath();
      const path = `${basePath}/ads`;
      const defaultFields = 'id,name,adset_id,campaign_id,status,effective_status,creative{id,name,title,body,image_url,thumbnail_url,url_tags,object_story_spec},created_time,updated_time';
      return graphGetAll<MetaAd>(path, {
        fields: fields?.join(',') || defaultFields,
        limit: '100',
      });
    },

    async getAd(id: string, fields?: string[]): Promise<MetaAd | null> {
      try {
        const defaultFields = 'id,name,adset_id,campaign_id,status,effective_status,creative{id,name,title,body,image_url,thumbnail_url,url_tags,object_story_spec},created_time,updated_time,preview_shareable_link';
        return await graphGet<MetaAd>(`/${id}`, {
          fields: fields?.join(',') || defaultFields,
        });
      } catch {
        return null;
      }
    },

    async getInsights(params?: MetaInsightsParams): Promise<MetaAdInsight[]> {
      const path = `${getAdAccountPath()}/insights`;
      return graphGetAll<MetaAdInsight>(path, buildInsightsParams(params));
    },

    async getCampaignInsights(campaignId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]> {
      return graphGetAll<MetaAdInsight>(`/${campaignId}/insights`, buildInsightsParams(params));
    },

    async getAdSetInsights(adSetId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]> {
      return graphGetAll<MetaAdInsight>(`/${adSetId}/insights`, buildInsightsParams(params));
    },

    async getAdInsights(adId: string, params?: MetaInsightsParams): Promise<MetaAdInsight[]> {
      return graphGetAll<MetaAdInsight>(`/${adId}/insights`, buildInsightsParams(params));
    },

    // === Ads Creation (stubs — future phase) ===
    async createCampaign(data: Partial<MetaCampaign>) {
      console.log('[STUB] Meta createCampaign', data);
      return { id: 'mock-meta-1', name: 'Mock', status: 'PAUSED', objective: 'CONVERSIONS', ...data };
    },
  };
}
