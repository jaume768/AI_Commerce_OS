export interface NamingConvention {
  campaignPrefix: string;
  separator: string;
  utmSource: string;
  utmMedium: string;
}

const DEFAULT_CONVENTION: NamingConvention = {
  campaignPrefix: 'acos',
  separator: '_',
  utmSource: 'ai-commerce-os',
  utmMedium: 'automated',
};

export function buildCampaignName(
  parts: {
    storeSlug: string;
    channel: string;
    type: string;
    date?: string;
    variant?: string;
  },
  convention: NamingConvention = DEFAULT_CONVENTION,
): string {
  const segments = [
    convention.campaignPrefix,
    parts.storeSlug,
    parts.channel,
    parts.type,
    parts.date || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  ];
  if (parts.variant) segments.push(parts.variant);
  return segments.join(convention.separator);
}

export function buildUTMParams(
  params: {
    campaign: string;
    content?: string;
    term?: string;
  },
  convention: NamingConvention = DEFAULT_CONVENTION,
): Record<string, string> {
  const utm: Record<string, string> = {
    utm_source: convention.utmSource,
    utm_medium: convention.utmMedium,
    utm_campaign: params.campaign,
  };
  if (params.content) utm.utm_content = params.content;
  if (params.term) utm.utm_term = params.term;
  return utm;
}

export function getDefaultConvention(): NamingConvention {
  return { ...DEFAULT_CONVENTION };
}
