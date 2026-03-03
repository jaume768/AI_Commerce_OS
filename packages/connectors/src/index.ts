export { createS3Client } from './storage/s3-client';
export { StoragePaths } from './storage/types';
export type {
  StorageClient,
  StorageConfig,
  UploadParams,
  UploadResult,
  DownloadParams,
  DownloadResult,
  PresignedUrlParams,
  ObjectMetadata,
} from './storage/types';

export { createShopifyConnector, verifyShopifyWebhookHMAC } from './shopify/index';
export type {
  ShopifyConnector,
  ShopifyConfig,
  ShopifyProduct,
  ShopifyVariant,
  ShopifyOrder,
  ShopifyLineItem,
  ShopifyCustomer,
  ShopifyShop,
  ShopifyCollection,
  ShopifyWebhook,
  ShopifyListParams,
  ShopifyPaginatedResult,
} from './shopify/index';

export { createMetaConnector, generateEventId } from './meta/index';
export type {
  MetaConnector,
  MetaConfig,
  MetaCampaign,
  MetaServerEvent,
  MetaEventResponse,
  MetaUserData,
  MetaCustomData,
  MetaEventName,
} from './meta/index';

export { createTikTokConnector, generateTikTokEventId } from './tiktok/index';
export type {
  TikTokConnector,
  TikTokConfig,
  TikTokCampaign,
  TikTokServerEvent,
  TikTokEventResponse,
  TikTokUserData,
  TikTokProperties,
  TikTokContentItem,
  TikTokEventName,
} from './tiktok/index';

export { createLLMConnector } from './llm/index';
export type { LLMConnector, LLMConfig, LLMResponse, ImageGenResponse } from './llm/index';
