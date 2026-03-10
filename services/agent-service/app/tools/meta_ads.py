from __future__ import annotations
import httpx
import structlog
from typing import Any

from app.config import settings

log = structlog.get_logger(service="agent-service", module="tools.meta_ads")


class MetaAdsTools:
    """Tools that call api-node HTTP endpoints to interact with Meta Ads data."""

    def __init__(self, store_id: str):
        self.store_id = store_id
        self.base_url = settings.API_NODE_URL
        self.token = settings.API_NODE_TOKEN

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {
            "Content-Type": "application/json",
            "x-store-id": self.store_id,
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def _get(self, path: str, params: dict | None = None) -> Any:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            resp = await client.get(path, headers=self._headers(), params=params)
            resp.raise_for_status()
            return resp.json()

    # === Account ===
    async def get_account_info(self) -> dict:
        log.info("tool_call", tool="get_meta_account_info", store_id=self.store_id)
        return await self._get("/meta-ads/account")

    # === Campaigns ===
    async def get_campaigns(self, status_filter: str = "all") -> dict:
        log.info("tool_call", tool="get_meta_campaigns", status_filter=status_filter)
        params: dict[str, str] = {}
        if status_filter and status_filter != "all":
            params["status_filter"] = status_filter
        return await self._get("/meta-ads/campaigns", params=params)

    async def get_campaign(self, campaign_id: str) -> dict:
        log.info("tool_call", tool="get_meta_campaign", campaign_id=campaign_id)
        return await self._get(f"/meta-ads/campaigns/{campaign_id}")

    # === Ad Sets ===
    async def get_adsets(self, campaign_id: str | None = None) -> dict:
        log.info("tool_call", tool="get_meta_adsets", campaign_id=campaign_id)
        params: dict[str, str] = {}
        if campaign_id:
            params["campaign_id"] = campaign_id
        return await self._get("/meta-ads/adsets", params=params)

    async def get_adset(self, adset_id: str) -> dict:
        log.info("tool_call", tool="get_meta_adset", adset_id=adset_id)
        return await self._get(f"/meta-ads/adsets/{adset_id}")

    # === Ads ===
    async def get_ads(self, adset_id: str | None = None) -> dict:
        log.info("tool_call", tool="get_meta_ads", adset_id=adset_id)
        params: dict[str, str] = {}
        if adset_id:
            params["adset_id"] = adset_id
        return await self._get("/meta-ads/ads", params=params)

    async def get_ad(self, ad_id: str) -> dict:
        log.info("tool_call", tool="get_meta_ad", ad_id=ad_id)
        return await self._get(f"/meta-ads/ads/{ad_id}")

    # === Insights ===
    async def get_account_insights(
        self,
        date_preset: str = "last_30d",
        level: str = "campaign",
        time_increment: str | None = None,
        breakdowns: str | None = None,
    ) -> dict:
        log.info("tool_call", tool="get_meta_insights", date_preset=date_preset, level=level)
        params: dict[str, str] = {
            "date_preset": date_preset,
            "level": level,
        }
        if time_increment:
            params["time_increment"] = time_increment
        if breakdowns:
            params["breakdowns"] = breakdowns
        return await self._get("/meta-ads/insights", params=params)

    async def get_campaign_insights(
        self,
        campaign_id: str,
        date_preset: str = "last_30d",
        time_increment: str | None = None,
    ) -> dict:
        log.info("tool_call", tool="get_meta_campaign_insights", campaign_id=campaign_id)
        params: dict[str, str] = {"date_preset": date_preset}
        if time_increment:
            params["time_increment"] = time_increment
        return await self._get(f"/meta-ads/campaigns/{campaign_id}/insights", params=params)

    async def get_adset_insights(
        self,
        adset_id: str,
        date_preset: str = "last_30d",
        time_increment: str | None = None,
    ) -> dict:
        log.info("tool_call", tool="get_meta_adset_insights", adset_id=adset_id)
        params: dict[str, str] = {"date_preset": date_preset}
        if time_increment:
            params["time_increment"] = time_increment
        return await self._get(f"/meta-ads/adsets/{adset_id}/insights", params=params)

    async def get_ad_insights(
        self,
        ad_id: str,
        date_preset: str = "last_30d",
        time_increment: str | None = None,
    ) -> dict:
        log.info("tool_call", tool="get_meta_ad_insights", ad_id=ad_id)
        params: dict[str, str] = {"date_preset": date_preset}
        if time_increment:
            params["time_increment"] = time_increment
        return await self._get(f"/meta-ads/ads/{ad_id}/insights", params=params)

    # === Full overview ===
    async def get_overview(self, date_preset: str = "last_30d") -> dict:
        log.info("tool_call", tool="get_meta_ads_overview", date_preset=date_preset)
        return await self._get("/meta-ads/overview", params={"date_preset": date_preset})
