// TikTok Ads connector — stub for Fase 4
// Real implementation in Fase 5+

export interface TikTokAdsConfig {
  accessToken: string;
  advertiserId: string;
  pixelId?: string;
}

export interface TikTokCampaign {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface TikTokConnector {
  getCampaign(id: string): Promise<TikTokCampaign | null>;
  listCampaigns(): Promise<TikTokCampaign[]>;
  createCampaign(data: Partial<TikTokCampaign>): Promise<TikTokCampaign>;
  sendEvent(event: Record<string, unknown>): Promise<void>;
}

export function createTikTokConnector(_config: TikTokAdsConfig): TikTokConnector {
  return {
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
    async sendEvent(event: Record<string, unknown>) {
      console.log('[STUB] TikTok sendEvent', event);
    },
  };
}
