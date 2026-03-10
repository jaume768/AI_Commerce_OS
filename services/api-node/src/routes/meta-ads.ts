import { FastifyInstance } from 'fastify';
import { createMetaConnector } from '@ai-commerce-os/connectors';
import { createLogger } from '@ai-commerce-os/shared';

const log = createLogger('api-node');

function getMetaAdsConnector() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || '';
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error('META_ACCESS_TOKEN is required for Meta Ads analytics');
  }
  if (!adAccountId) {
    throw new Error('META_AD_ACCOUNT_ID is required for Meta Ads analytics');
  }

  return createMetaConnector({
    accessToken,
    pixelId,
    adAccountId,
    apiVersion: process.env.META_API_VERSION || 'v21.0',
  });
}

export async function metaAdsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // === Account Info ===
  app.get('/meta-ads/account', async (_request, reply) => {
    try {
      const meta = getMetaAdsConnector();
      const account = await meta.getAccountInfo();
      return reply.send({ ok: true, account });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads account error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  // === Campaigns ===
  app.get('/meta-ads/campaigns', async (request, reply) => {
    try {
      const meta = getMetaAdsConnector();
      const { status_filter } = request.query as { status_filter?: string };
      let filtering: Record<string, unknown>[] | undefined;
      if (status_filter && status_filter !== 'all') {
        filtering = [{ field: 'effective_status', operator: 'IN', value: status_filter.split(',') }];
      }
      const campaigns = await meta.listCampaigns(undefined, filtering);
      return reply.send({ ok: true, campaigns });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads campaigns error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/campaigns/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const meta = getMetaAdsConnector();
      const campaign = await meta.getCampaign(id);
      if (!campaign) return reply.status(404).send({ ok: false, error: 'Campaign not found' });
      return reply.send({ ok: true, campaign });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  // === Ad Sets ===
  app.get('/meta-ads/adsets', async (request, reply) => {
    try {
      const { campaign_id } = request.query as { campaign_id?: string };
      const meta = getMetaAdsConnector();
      const adsets = await meta.listAdSets(campaign_id);
      return reply.send({ ok: true, adsets });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads adsets error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/adsets/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const meta = getMetaAdsConnector();
      const adset = await meta.getAdSet(id);
      if (!adset) return reply.status(404).send({ ok: false, error: 'Ad Set not found' });
      return reply.send({ ok: true, adset });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  // === Ads ===
  app.get('/meta-ads/ads', async (request, reply) => {
    try {
      const { adset_id } = request.query as { adset_id?: string };
      const meta = getMetaAdsConnector();
      const ads = await meta.listAds(adset_id);
      return reply.send({ ok: true, ads });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads ads error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/ads/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const meta = getMetaAdsConnector();
      const ad = await meta.getAd(id);
      if (!ad) return reply.status(404).send({ ok: false, error: 'Ad not found' });
      return reply.send({ ok: true, ad });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  // === Insights ===
  app.get('/meta-ads/insights', async (request, reply) => {
    try {
      const {
        level, date_preset, since, until, time_increment, breakdowns, limit,
      } = request.query as Record<string, string>;

      const meta = getMetaAdsConnector();
      const insights = await meta.getInsights({
        level: level as any,
        date_preset: (date_preset || 'last_30d') as any,
        since,
        until,
        time_increment,
        breakdowns: breakdowns ? breakdowns.split(',') : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return reply.send({ ok: true, insights });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads insights error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/campaigns/:id/insights', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { date_preset, since, until, time_increment } = request.query as Record<string, string>;

      const meta = getMetaAdsConnector();
      const insights = await meta.getCampaignInsights(id, {
        date_preset: (date_preset || 'last_30d') as any,
        since,
        until,
        time_increment,
      });
      return reply.send({ ok: true, insights });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/adsets/:id/insights', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { date_preset, since, until, time_increment } = request.query as Record<string, string>;

      const meta = getMetaAdsConnector();
      const insights = await meta.getAdSetInsights(id, {
        date_preset: (date_preset || 'last_30d') as any,
        since,
        until,
        time_increment,
      });
      return reply.send({ ok: true, insights });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  app.get('/meta-ads/ads/:id/insights', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { date_preset, since, until, time_increment } = request.query as Record<string, string>;

      const meta = getMetaAdsConnector();
      const insights = await meta.getAdInsights(id, {
        date_preset: (date_preset || 'last_30d') as any,
        since,
        until,
        time_increment,
      });
      return reply.send({ ok: true, insights });
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });

  // === Full overview (campaigns + insights in one call) ===
  app.get('/meta-ads/overview', async (request, reply) => {
    try {
      const { date_preset } = request.query as { date_preset?: string };
      const meta = getMetaAdsConnector();

      const [account, campaigns, insights] = await Promise.all([
        meta.getAccountInfo(),
        meta.listCampaigns(),
        meta.getInsights({
          level: 'campaign',
          date_preset: (date_preset || 'last_30d') as any,
        }),
      ]);

      return reply.send({ ok: true, account, campaigns, insights });
    } catch (err: any) {
      log.error({ err: err.message }, 'Meta Ads overview error');
      return reply.status(400).send({ ok: false, error: err.message });
    }
  });
}
