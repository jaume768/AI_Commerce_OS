// ============================================================
// UTM & Campaign Naming Convention — Fase 3
// Convention: {prefix}_{store}_{channel}_{objective}_{audience}_{date}[_{variant}]
// UTM: utm_source={channel}, utm_medium=paid|organic, utm_campaign={name}, utm_content={ad}
// ============================================================

export interface NamingConvention {
  campaignPrefix: string;
  separator: string;
  utmSource: string;
  utmMedium: string;
}

export type AdChannel = 'meta' | 'tiktok' | 'google' | 'organic' | 'email';
export type AdObjective = 'sales' | 'traffic' | 'awareness' | 'engagement' | 'leads' | 'retargeting';

const DEFAULT_CONVENTION: NamingConvention = {
  campaignPrefix: 'acos',
  separator: '_',
  utmSource: 'ai-commerce-os',
  utmMedium: 'automated',
};

const CHANNEL_UTM_SOURCE: Record<AdChannel, string> = {
  meta: 'facebook',
  tiktok: 'tiktok',
  google: 'google',
  organic: 'organic',
  email: 'email',
};

export function buildCampaignName(
  parts: {
    storeSlug: string;
    channel: AdChannel;
    objective?: AdObjective | string;
    audience?: string;
    date?: string;
    variant?: string;
  },
  convention: NamingConvention = DEFAULT_CONVENTION,
): string {
  const segments = [
    convention.campaignPrefix,
    parts.storeSlug,
    parts.channel,
    parts.objective || 'sales',
    parts.audience || 'broad',
    parts.date || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  ];
  if (parts.variant) segments.push(parts.variant);
  return segments.join(convention.separator);
}

export function buildAdSetName(
  parts: {
    campaignName: string;
    targeting: string;
    placement?: string;
  },
  convention: NamingConvention = DEFAULT_CONVENTION,
): string {
  return [parts.campaignName, parts.targeting, parts.placement || 'auto']
    .join(convention.separator);
}

export function buildAdName(
  parts: {
    adSetName: string;
    creativeType: string;
    index?: number;
  },
  convention: NamingConvention = DEFAULT_CONVENTION,
): string {
  const segments = [parts.adSetName, parts.creativeType];
  if (parts.index !== undefined) segments.push(String(parts.index + 1).padStart(2, '0'));
  return segments.join(convention.separator);
}

export function buildUTMParams(
  params: {
    channel: AdChannel;
    medium?: 'paid' | 'organic' | 'cpc' | 'cpm' | 'email';
    campaign: string;
    content?: string;
    term?: string;
  },
): Record<string, string> {
  const utm: Record<string, string> = {
    utm_source: CHANNEL_UTM_SOURCE[params.channel] || params.channel,
    utm_medium: params.medium || 'paid',
    utm_campaign: params.campaign,
  };
  if (params.content) utm.utm_content = params.content;
  if (params.term) utm.utm_term = params.term;
  return utm;
}

export function buildUTMQueryString(params: Parameters<typeof buildUTMParams>[0]): string {
  const utm = buildUTMParams(params);
  return Object.entries(utm)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function appendUTMToUrl(url: string, params: Parameters<typeof buildUTMParams>[0]): string {
  const qs = buildUTMQueryString(params);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${qs}`;
}

export function getDefaultConvention(): NamingConvention {
  return { ...DEFAULT_CONVENTION };
}
