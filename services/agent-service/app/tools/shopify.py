from __future__ import annotations
import httpx
import structlog
from typing import Any

from app.config import settings

log = structlog.get_logger(service="agent-service", module="tools.shopify")


class ShopifyTools:
    """Tools that call api-node HTTP endpoints to interact with Shopify data."""

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

    async def _post(self, path: str, body: dict | None = None) -> Any:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            resp = await client.post(path, headers=self._headers(), json=body or {})
            resp.raise_for_status()
            return resp.json()

    async def _put(self, path: str, body: dict | None = None) -> Any:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            resp = await client.put(path, headers=self._headers(), json=body or {})
            resp.raise_for_status()
            return resp.json()

    # === Shop ===
    async def get_shop_info(self) -> dict:
        log.info("tool_call", tool="get_shop_info", store_id=self.store_id)
        return await self._get("/shopify/shop")

    # === Products ===
    async def get_products(self, limit: int = 50, status: str | None = None) -> dict:
        log.info("tool_call", tool="get_products", limit=limit, status=status)
        params: dict[str, Any] = {"limit": str(limit)}
        if status:
            params["status"] = status
        return await self._get("/shopify/products", params=params)

    async def get_product(self, product_id: int) -> dict:
        log.info("tool_call", tool="get_product", product_id=product_id)
        return await self._get(f"/shopify/products/{product_id}")

    async def get_product_count(self) -> dict:
        return await self._get("/shopify/products/count")

    async def update_product(self, product_id: int, updates: dict) -> dict:
        log.info("tool_call", tool="update_product", product_id=product_id, updates=list(updates.keys()))
        return await self._put(f"/shopify/products/{product_id}", updates)

    # === Orders ===
    async def get_orders(
        self,
        limit: int = 50,
        status: str = "any",
        created_at_min: str | None = None,
        created_at_max: str | None = None,
    ) -> dict:
        log.info("tool_call", tool="get_orders", limit=limit, status=status)
        params: dict[str, Any] = {"limit": str(limit), "status": status}
        if created_at_min:
            params["created_at_min"] = created_at_min
        if created_at_max:
            params["created_at_max"] = created_at_max
        return await self._get("/shopify/orders", params=params)

    async def get_order(self, order_id: int) -> dict:
        log.info("tool_call", tool="get_order", order_id=order_id)
        return await self._get(f"/shopify/orders/{order_id}")

    async def get_order_count(self) -> dict:
        return await self._get("/shopify/orders/count")

    # === Customers ===
    async def get_customers(self, limit: int = 50) -> dict:
        log.info("tool_call", tool="get_customers", limit=limit)
        return await self._get("/shopify/customers", params={"limit": str(limit)})

    async def get_customer_count(self) -> dict:
        return await self._get("/shopify/customers/count")

    # === Collections ===
    async def get_collections(self, limit: int = 50) -> dict:
        log.info("tool_call", tool="get_collections", limit=limit)
        return await self._get("/shopify/collections", params={"limit": str(limit)})

    # === Overview ===
    async def get_overview(self) -> dict:
        log.info("tool_call", tool="get_overview")
        return await self._get("/shopify/overview")
