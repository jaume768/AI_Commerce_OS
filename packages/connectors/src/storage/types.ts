export interface StorageClient {
  upload(params: UploadParams): Promise<UploadResult>;
  download(params: DownloadParams): Promise<DownloadResult>;
  getPresignedUrl(params: PresignedUrlParams): Promise<string>;
  delete(params: DeleteParams): Promise<void>;
  headObject(params: HeadParams): Promise<ObjectMetadata>;
}

export interface UploadParams {
  key: string;
  body: Buffer | ReadableStream | string;
  contentType?: string;
  metadata?: Record<string, string>;
  bucket?: string;
}

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  etag?: string;
  contentType?: string;
}

export interface DownloadParams {
  key: string;
  bucket?: string;
}

export interface DownloadResult {
  body: ReadableStream | Buffer;
  contentType?: string;
  size?: number;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface PresignedUrlParams {
  key: string;
  expiresIn?: number; // seconds, default 3600
  bucket?: string;
}

export interface DeleteParams {
  key: string;
  bucket?: string;
}

export interface HeadParams {
  key: string;
  bucket?: string;
}

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface StorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
}

// Standard path builders for multi-tenant storage
export const StoragePaths = {
  runArtifact: (storeId: string, runId: string, filename: string) =>
    `stores/${storeId}/runs/${runId}/${filename}`,

  assetImage: (storeId: string, assetId: string, ext = 'png') =>
    `stores/${storeId}/assets/images/${assetId}.${ext}`,

  dailyReport: (storeId: string, date: string, filename: string) =>
    `stores/${storeId}/reports/daily/${date}/${filename}`,

  approvalArtifact: (storeId: string, approvalId: string, filename: string) =>
    `stores/${storeId}/approvals/${approvalId}/${filename}`,
};
