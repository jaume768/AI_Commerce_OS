import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageClient,
  StorageConfig,
  UploadParams,
  UploadResult,
  DownloadParams,
  DownloadResult,
  PresignedUrlParams,
  DeleteParams,
  HeadParams,
  ObjectMetadata,
} from './types';

export function createS3Client(config: StorageConfig): StorageClient {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  const defaultBucket = config.bucket;

  return {
    async upload(params: UploadParams): Promise<UploadResult> {
      const bucket = params.bucket || defaultBucket;
      const body =
        typeof params.body === 'string'
          ? Buffer.from(params.body)
          : params.body;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: body as any,
        ContentType: params.contentType || 'application/octet-stream',
        Metadata: params.metadata,
      });

      const response = await client.send(command);

      const size =
        typeof params.body === 'string'
          ? Buffer.byteLength(params.body)
          : params.body instanceof Buffer
            ? params.body.length
            : 0;

      return {
        key: params.key,
        bucket,
        size,
        etag: response.ETag,
        contentType: params.contentType,
      };
    },

    async download(params: DownloadParams): Promise<DownloadResult> {
      const bucket = params.bucket || defaultBucket;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: params.key,
      });

      const response = await client.send(command);

      return {
        body: response.Body as any,
        contentType: response.ContentType,
        size: response.ContentLength,
        etag: response.ETag,
        metadata: response.Metadata,
      };
    },

    async getPresignedUrl(params: PresignedUrlParams): Promise<string> {
      const bucket = params.bucket || defaultBucket;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: params.key,
      });

      return getSignedUrl(client, command, {
        expiresIn: params.expiresIn || 3600,
      });
    },

    async delete(params: DeleteParams): Promise<void> {
      const bucket = params.bucket || defaultBucket;

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: params.key,
      });

      await client.send(command);
    },

    async headObject(params: HeadParams): Promise<ObjectMetadata> {
      const bucket = params.bucket || defaultBucket;

      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: params.key,
      });

      const response = await client.send(command);

      return {
        key: params.key,
        size: response.ContentLength || 0,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    },
  };
}
