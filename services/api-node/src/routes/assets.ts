import { FastifyInstance } from 'fastify';
import { PaginationSchema } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';
import { createS3Client, StoragePaths } from '@ai-commerce-os/connectors';
import { config } from '../config';

const storage = createS3Client({
  endpoint: config.S3_ENDPOINT,
  accessKey: config.S3_ACCESS_KEY,
  secretKey: config.S3_SECRET_KEY,
  bucket: config.S3_BUCKET,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});

export async function assetRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // List assets
  app.get('/assets', async (request) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;
    const storeId = (request as any).storeId;

    const assets = await query(
      'SELECT * FROM assets WHERE store_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [storeId, limit, offset],
    );

    return { data: assets, pagination: { page, limit } };
  });

  // Get presigned URL for an asset
  app.get('/assets/:id/url', async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;

    const asset = await queryOne<{ storage_key: string }>(
      'SELECT storage_key FROM assets WHERE id = $1 AND store_id = $2',
      [id, storeId],
    );

    if (!asset) return reply.status(404).send({ error: 'Asset not found' });

    const url = await storage.getPresignedUrl({ key: asset.storage_key, expiresIn: 3600 });
    return { url, expiresIn: 3600 };
  });
}
