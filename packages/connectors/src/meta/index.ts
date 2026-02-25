// Meta (Facebook/Instagram) Ads connector — stub for Fase 4
// Real implementation in Fase 5+

export interface MetaAdsConfig {
  accessToken: string;
  adAccountId: string;
  pixelId?: string;
  apiVersion: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  [key: string]: unknown;
}

export interface MetaConnector {
  getCampaign(id: string): Promise<MetaCampaign | null>;
  listCampaigns(): Promise<MetaCampaign[]>;
  createCampaign(data: Partial<MetaCampaign>): Promise<MetaCampaign>;
  sendServerEvent(event: Record<string, unknown>): Promise<void>;
}

export function createMetaConnector(_config: MetaAdsConfig): MetaConnector {
  return {
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
    async sendServerEvent(event: Record<string, unknown>) {
      console.log('[STUB] Meta sendServerEvent', event);
    },
  };
}
