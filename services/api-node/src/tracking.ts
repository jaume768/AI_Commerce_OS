// Tracking service — Fase 3
// Orchestrates sending server-side events to Meta CAPI and TikTok Events API
// Logs every attempt to the tracking_events table for audit

import {
  createMetaConnector,
  createTikTokConnector,
  generateEventId,
  generateTikTokEventId,
  type MetaConnector,
  type MetaServerEvent,
  type TikTokConnector,
  type TikTokServerEvent,
} from '@ai-commerce-os/connectors';
import { createLogger } from '@ai-commerce-os/shared';
import { config } from './config';
import { query } from './db';

const log = createLogger('tracking');

// ============================================================
// Singleton connectors — initialized lazily
// ============================================================

let _metaConnector: MetaConnector | null = null;
let _tiktokConnector: TikTokConnector | null = null;

function getMetaConnector(): MetaConnector | null {
  if (_metaConnector) return _metaConnector;

  const pixelId = (config as any).META_PIXEL_ID;
  const accessToken = (config as any).META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return null;
  }

  _metaConnector = createMetaConnector({
    pixelId,
    accessToken,
    apiVersion: (config as any).META_API_VERSION || 'v21.0',
    testEventCode: (config as any).META_TEST_EVENT_CODE || undefined,
  });

  log.info({ pixelId }, 'Meta CAPI connector initialized');
  return _metaConnector;
}

function getTikTokConnector(): TikTokConnector | null {
  if (_tiktokConnector) return _tiktokConnector;

  const pixelId = (config as any).TIKTOK_PIXEL_ID;
  const accessToken = (config as any).TIKTOK_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return null;
  }

  _tiktokConnector = createTikTokConnector({
    pixelId,
    accessToken,
    testEventCode: (config as any).TIKTOK_TEST_EVENT_CODE || undefined,
  });

  log.info({ pixelId }, 'TikTok Events API connector initialized');
  return _tiktokConnector;
}

// ============================================================
// Public API
// ============================================================

export function isTrackingEnabled(): boolean {
  return (config as any).TRACKING_ENABLED === true;
}

export function isMetaConfigured(): boolean {
  return !!((config as any).META_PIXEL_ID && (config as any).META_ACCESS_TOKEN);
}

export function isTikTokConfigured(): boolean {
  return !!((config as any).TIKTOK_PIXEL_ID && (config as any).TIKTOK_ACCESS_TOKEN);
}

export function getTrackingStatus() {
  return {
    enabled: isTrackingEnabled(),
    meta: {
      configured: isMetaConfigured(),
      pixelId: (config as any).META_PIXEL_ID || null,
      apiVersion: (config as any).META_API_VERSION || 'v21.0',
      testMode: !!(config as any).META_TEST_EVENT_CODE,
    },
    tiktok: {
      configured: isTikTokConfigured(),
      pixelId: (config as any).TIKTOK_PIXEL_ID || null,
      testMode: !!(config as any).TIKTOK_TEST_EVENT_CODE,
    },
    storeUrl: (config as any).STORE_URL || null,
  };
}

// ============================================================
// Send to Meta CAPI
// ============================================================

export async function sendMetaEvent(
  storeId: string,
  event: MetaServerEvent,
  source: string = 'webhook',
  sourceId?: string,
): Promise<{ success: boolean; eventId: string; error?: string }> {
  if (!isTrackingEnabled() || !isMetaConfigured()) {
    log.debug({ storeId, eventName: event.eventName }, 'Meta CAPI skipped (not enabled/configured)');
    return { success: false, eventId: '', error: 'not_configured' };
  }

  const connector = getMetaConnector();
  if (!connector) {
    return { success: false, eventId: '', error: 'connector_init_failed' };
  }

  const eventId = event.eventId || generateEventId();
  event.eventId = eventId;

  // Record attempt in DB
  const [record] = await query(
    `INSERT INTO tracking_events (store_id, platform, event_name, event_id, source, source_id, status, request_payload)
     VALUES ($1, 'meta', $2, $3, $4, $5, 'pending', $6)
     RETURNING id`,
    [storeId, event.eventName, eventId, source, sourceId || null, JSON.stringify(event)],
  );

  try {
    const response = await connector.sendEvent(event);

    await query(
      `UPDATE tracking_events SET status = 'sent', response_payload = $1, sent_at = NOW() WHERE id = $2`,
      [JSON.stringify(response), record.id],
    );

    log.info({
      storeId,
      trackingEventId: record.id,
      eventName: event.eventName,
      eventId,
      eventsReceived: response.eventsReceived,
      fbTraceId: response.fbTraceId,
    }, 'Meta CAPI event sent');

    return { success: true, eventId };
  } catch (err: any) {
    await query(
      `UPDATE tracking_events SET status = 'failed', error = $1 WHERE id = $2`,
      [err.message, record.id],
    );

    log.error({ storeId, eventName: event.eventName, err: err.message }, 'Meta CAPI event failed');
    return { success: false, eventId, error: err.message };
  }
}

// ============================================================
// Send to TikTok Events API
// ============================================================

export async function sendTikTokEvent(
  storeId: string,
  event: TikTokServerEvent,
  source: string = 'webhook',
  sourceId?: string,
): Promise<{ success: boolean; eventId: string; error?: string }> {
  if (!isTrackingEnabled() || !isTikTokConfigured()) {
    log.debug({ storeId, eventName: event.eventName }, 'TikTok Events API skipped (not enabled/configured)');
    return { success: false, eventId: '', error: 'not_configured' };
  }

  const connector = getTikTokConnector();
  if (!connector) {
    return { success: false, eventId: '', error: 'connector_init_failed' };
  }

  const eventId = event.eventId || generateTikTokEventId();
  event.eventId = eventId;

  // Record attempt in DB
  const [record] = await query(
    `INSERT INTO tracking_events (store_id, platform, event_name, event_id, source, source_id, status, request_payload)
     VALUES ($1, 'tiktok', $2, $3, $4, $5, 'pending', $6)
     RETURNING id`,
    [storeId, event.eventName, eventId, source, sourceId || null, JSON.stringify(event)],
  );

  try {
    const response = await connector.sendEvent(event);

    await query(
      `UPDATE tracking_events SET status = 'sent', response_payload = $1, sent_at = NOW() WHERE id = $2`,
      [JSON.stringify(response), record.id],
    );

    log.info({
      storeId,
      trackingEventId: record.id,
      eventName: event.eventName,
      eventId,
    }, 'TikTok event sent');

    return { success: true, eventId };
  } catch (err: any) {
    await query(
      `UPDATE tracking_events SET status = 'failed', error = $1 WHERE id = $2`,
      [err.message, record.id],
    );

    log.error({ storeId, eventName: event.eventName, err: err.message }, 'TikTok event failed');
    return { success: false, eventId, error: err.message };
  }
}

// ============================================================
// Send to ALL configured platforms
// ============================================================

export async function sendTrackingPurchase(
  storeId: string,
  order: {
    id: string | number;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    totalPrice: string;
    currency: string;
    lineItems: { productId?: string | number; title: string; quantity: number; price: string }[];
    sourceUrl?: string;
  },
  webhookEventId?: string,
): Promise<void> {
  const storeUrl = (config as any).STORE_URL || '';
  const orderId = String(order.id);

  // --- Meta CAPI: Purchase ---
  if (isMetaConfigured()) {
    const metaEvent: MetaServerEvent = {
      eventName: 'Purchase',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `purchase_${orderId}_meta`,
      eventSourceUrl: order.sourceUrl || storeUrl,
      actionSource: 'website',
      userData: {
        email: order.email,
        phone: order.phone,
        firstName: order.firstName,
        lastName: order.lastName,
        city: order.city,
        state: order.state,
        zip: order.zip,
        country: order.country,
        externalId: orderId,
      },
      customData: {
        currency: order.currency,
        value: parseFloat(order.totalPrice),
        orderId,
        contentType: 'product',
        contentIds: order.lineItems
          .filter((li) => li.productId)
          .map((li) => String(li.productId)),
        contents: order.lineItems.map((li) => ({
          id: String(li.productId || li.title),
          quantity: li.quantity,
          item_price: parseFloat(li.price),
        })),
        numItems: order.lineItems.reduce((sum, li) => sum + li.quantity, 0),
      },
    };
    sendMetaEvent(storeId, metaEvent, 'webhook', webhookEventId).catch(() => {});
  }

  // --- TikTok Events API: CompletePayment ---
  if (isTikTokConfigured()) {
    const ttEvent: TikTokServerEvent = {
      eventName: 'CompletePayment',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `purchase_${orderId}_tiktok`,
      userData: {
        email: order.email,
        phone: order.phone,
        externalId: orderId,
      },
      properties: {
        currency: order.currency,
        value: parseFloat(order.totalPrice),
        orderId,
        contentType: 'product',
        contents: order.lineItems.map((li) => ({
          contentId: String(li.productId || li.title),
          contentName: li.title,
          quantity: li.quantity,
          price: parseFloat(li.price),
        })),
      },
      page: {
        url: order.sourceUrl || storeUrl,
      },
    };
    sendTikTokEvent(storeId, ttEvent, 'webhook', webhookEventId).catch(() => {});
  }
}

export async function sendTrackingRefund(
  storeId: string,
  refund: {
    orderId: string | number;
    email?: string;
    totalRefund?: string;
    currency?: string;
  },
  webhookEventId?: string,
): Promise<void> {
  const storeUrl = (config as any).STORE_URL || '';

  // Meta doesn't have a native "Refund" event but we can send a custom event
  if (isMetaConfigured()) {
    const metaEvent: MetaServerEvent = {
      eventName: 'Refund',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `refund_${refund.orderId}_meta`,
      eventSourceUrl: storeUrl,
      actionSource: 'system_generated',
      userData: {
        email: refund.email,
        externalId: String(refund.orderId),
      },
      customData: {
        currency: refund.currency,
        value: refund.totalRefund ? parseFloat(refund.totalRefund) : undefined,
        orderId: String(refund.orderId),
      },
    };
    sendMetaEvent(storeId, metaEvent, 'webhook', webhookEventId).catch(() => {});
  }
}

// ============================================================
// Test connections
// ============================================================

export async function testMetaConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }> {
  const connector = getMetaConnector();
  if (!connector) return { ok: false, pixelId: '', error: 'Meta CAPI not configured' };
  return connector.testConnection();
}

export async function testTikTokConnection(): Promise<{ ok: boolean; pixelId: string; error?: string }> {
  const connector = getTikTokConnector();
  if (!connector) return { ok: false, pixelId: '', error: 'TikTok Events API not configured' };
  return connector.testConnection();
}
