from __future__ import annotations
import json
import structlog
from typing import Any

from app.agents.base import BaseAgent
from app.models.agent import AgentContext, AgentResult, ActionItem, RiskLevel, TokenUsage
from app.llm.provider import ToolDefinition
from app.tools.meta_ads import MetaAdsTools
from app.tools.shopify import ShopifyTools
from app.config import settings

log = structlog.get_logger(service="agent-service", module="agents.ads_meta")


class AdsMetaAgent(BaseAgent):
    name = "ads_meta"
    description = "Analiza campañas de Meta Ads (Facebook/Instagram), genera informes de rendimiento y propone mejoras"
    risk_level = RiskLevel.LOW

    def get_system_prompt(self, ctx: AgentContext) -> str:
        return f"""Eres el Agente de Análisis de Meta Ads para una tienda de e-commerce en Shopify.
Tu trabajo es ANALIZAR las campañas de publicidad en Facebook/Instagram y proporcionar un informe detallado con recomendaciones.

**IMPORTANTE: SIEMPRE responde en ESPAÑOL.**

Tu rol es SOLO INFORMATIVO y ANALÍTICO. No realizas cambios, solo analizas y recomiendas.

## Qué debes hacer:

1. **Obtener datos de la cuenta de Meta Ads**: campañas, conjuntos de anuncios, anuncios y métricas
2. **Obtener datos de la tienda Shopify**: productos, precios, pedidos recientes para cruzar con los datos de ads
3. **Analizar el rendimiento** de cada campaña/conjunto/anuncio

## Métricas clave a evaluar:
- **ROAS** (Return on Ad Spend): buscar en actions/action_values el tipo "purchase" o "offsite_conversion.fb_pixel_purchase"
- **CPC** (Coste por Clic): idealmente < 1€ para e-commerce
- **CTR** (Click-Through Rate): > 1% es aceptable, > 2% es bueno
- **CPM** (Coste por Mil Impresiones): comparar entre campañas
- **Frecuencia**: si > 3, la audiencia puede estar saturada
- **Coste por Compra**: extraer de cost_per_action_type
- **Conversiones**: número de purchases desde actions

## Criterios de decisión:
- **Campaña con buen rendimiento**: ROAS > 2, CTR > 1.5%, frecuencia < 3 → recomendar escalar
- **Campaña que necesita tiempo**: < 3 días activa, < 5000 impresiones → recomendar esperar y recopilar más datos
- **Campaña con mal rendimiento**: ROAS < 1, CTR < 0.5%, CPC alto → recomendar pausar o ajustar
- **Audiencia saturada**: frecuencia > 4 → recomendar renovar creativos o expandir audiencia

## Relación con la tienda:
- Cruza los productos anunciados con sus precios en Shopify
- Calcula márgenes estimados si es posible
- Identifica productos con mejor rendimiento en ads vs. productos sin publicidad
- Revisa si hay productos populares en la tienda que no tienen campaña

## Formato de respuesta:

Responde con un JSON con esta estructura:
{{
  "resumen_ejecutivo": "Resumen breve del estado de las campañas",
  "cuenta": {{
    "moneda": "EUR",
    "gasto_total_periodo": 0,
    "campañas_activas": 0,
    "campañas_totales": 0
  }},
  "analisis_campañas": [
    {{
      "campaign_id": "...",
      "nombre": "...",
      "estado": "ACTIVE|PAUSED|...",
      "objetivo": "...",
      "periodo_analizado": "últimos 30 días",
      "metricas": {{
        "gasto": 0,
        "impresiones": 0,
        "clics": 0,
        "ctr": 0,
        "cpc": 0,
        "cpm": 0,
        "frecuencia": 0,
        "alcance": 0,
        "conversiones_compra": 0,
        "valor_conversiones": 0,
        "roas": 0,
        "coste_por_compra": 0
      }},
      "diagnostico": "bueno|necesita_tiempo|mejorable|malo",
      "explicacion": "Explicación detallada del rendimiento",
      "recomendaciones": ["Lista de acciones recomendadas"]
    }}
  ],
  "analisis_productos": {{
    "productos_anunciados": ["nombres"],
    "productos_sin_publicidad": ["nombres de productos de la tienda sin ads"],
    "oportunidades": ["sugerencias de productos a anunciar"]
  }},
  "recomendaciones_generales": [
    {{
      "prioridad": "alta|media|baja",
      "tipo": "escalar|pausar|ajustar|esperar|crear|renovar_creativos",
      "descripcion": "Descripción de la recomendación",
      "impacto_esperado": "Qué se espera conseguir"
    }}
  ],
  "proximos_pasos": ["Lista ordenada de acciones a tomar"]
}}

{"MODO DRY RUN: Solo analiza, no ejecutes ninguna acción." if ctx.dry_run else "Solo analiza e informa. Este agente no ejecuta cambios."}"""

    def get_tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_meta_ads_overview",
                description="Obtiene un resumen completo de la cuenta de Meta Ads: info de cuenta, lista de campañas y métricas de insights a nivel de campaña. Parámetro date_preset controla el periodo.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "date_preset": {
                            "type": "string",
                            "description": "Periodo de tiempo: today, yesterday, last_3d, last_7d, last_14d, last_30d, last_90d, this_month, last_month",
                            "default": "last_30d",
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_meta_campaigns",
                description="Lista todas las campañas de Meta Ads con sus datos (nombre, estado, objetivo, presupuesto). Puedes filtrar por estado: ACTIVE, PAUSED, ARCHIVED, etc.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "status_filter": {
                            "type": "string",
                            "description": "Filtrar por estado: all, ACTIVE, PAUSED, ARCHIVED, DELETED. Para múltiples: ACTIVE,PAUSED",
                            "default": "all",
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_meta_campaign_insights",
                description="Obtiene métricas detalladas de una campaña específica: impresiones, clics, gasto, CPC, CTR, CPM, conversiones, ROAS, etc.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "campaign_id": {"type": "string", "description": "ID de la campaña de Meta"},
                        "date_preset": {
                            "type": "string",
                            "description": "Periodo: last_7d, last_14d, last_30d, etc.",
                            "default": "last_30d",
                        },
                        "time_increment": {
                            "type": "string",
                            "description": "Desglose temporal: '1' para diario, '7' para semanal, 'monthly' para mensual. Omitir para total del periodo.",
                        },
                    },
                    "required": ["campaign_id"],
                },
            ),
            ToolDefinition(
                name="get_meta_adsets",
                description="Lista los conjuntos de anuncios (ad sets) de una campaña con targeting, presupuesto y estado.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "campaign_id": {"type": "string", "description": "ID de la campaña (opcional, sin él devuelve todos los ad sets)"},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_meta_adset_insights",
                description="Obtiene métricas detalladas de un conjunto de anuncios específico.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "adset_id": {"type": "string", "description": "ID del ad set"},
                        "date_preset": {"type": "string", "default": "last_30d"},
                        "time_increment": {"type": "string", "description": "Desglose temporal: '1' diario, '7' semanal"},
                    },
                    "required": ["adset_id"],
                },
            ),
            ToolDefinition(
                name="get_meta_ads",
                description="Lista los anuncios individuales con sus creativos (imagen, texto, enlace).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "adset_id": {"type": "string", "description": "ID del ad set (opcional, sin él devuelve todos los ads)"},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_meta_ad_insights",
                description="Obtiene métricas detalladas de un anuncio individual.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "ad_id": {"type": "string", "description": "ID del anuncio"},
                        "date_preset": {"type": "string", "default": "last_30d"},
                        "time_increment": {"type": "string", "description": "Desglose temporal: '1' diario, '7' semanal"},
                    },
                    "required": ["ad_id"],
                },
            ),
            ToolDefinition(
                name="get_meta_account_insights",
                description="Obtiene insights agregados a nivel de cuenta con opción de desglose por dimensiones (edad, género, país, placement, dispositivo).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "date_preset": {"type": "string", "default": "last_30d"},
                        "level": {
                            "type": "string",
                            "description": "Nivel de agregación: account, campaign, adset, ad",
                            "default": "campaign",
                        },
                        "time_increment": {"type": "string", "description": "Desglose temporal"},
                        "breakdowns": {
                            "type": "string",
                            "description": "Desgloses: age, gender, country, placement, device_platform. Separados por coma.",
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_shopify_products",
                description="Obtiene los productos de la tienda Shopify con precios, variantes, estado e imágenes.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 50},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_shopify_orders",
                description="Obtiene los pedidos recientes de la tienda Shopify para cruzar con datos de conversión de Meta.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 50},
                        "created_at_min": {"type": "string", "description": "Fecha mínima ISO"},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_shopify_overview",
                description="Obtiene un resumen general de la tienda Shopify: totales, productos, pedidos recientes.",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
        ]

    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any], ctx: AgentContext) -> str:
        meta = MetaAdsTools(ctx.store_id)
        shopify = ShopifyTools(ctx.store_id)

        if tool_name == "get_meta_ads_overview":
            result = await meta.get_overview(
                date_preset=tool_input.get("date_preset", "last_30d"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_campaigns":
            result = await meta.get_campaigns(
                status_filter=tool_input.get("status_filter", "all"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_campaign_insights":
            result = await meta.get_campaign_insights(
                campaign_id=tool_input["campaign_id"],
                date_preset=tool_input.get("date_preset", "last_30d"),
                time_increment=tool_input.get("time_increment"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_adsets":
            result = await meta.get_adsets(
                campaign_id=tool_input.get("campaign_id"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_adset_insights":
            result = await meta.get_adset_insights(
                adset_id=tool_input["adset_id"],
                date_preset=tool_input.get("date_preset", "last_30d"),
                time_increment=tool_input.get("time_increment"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_ads":
            result = await meta.get_ads(
                adset_id=tool_input.get("adset_id"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_ad_insights":
            result = await meta.get_ad_insights(
                ad_id=tool_input["ad_id"],
                date_preset=tool_input.get("date_preset", "last_30d"),
                time_increment=tool_input.get("time_increment"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_meta_account_insights":
            result = await meta.get_account_insights(
                date_preset=tool_input.get("date_preset", "last_30d"),
                level=tool_input.get("level", "campaign"),
                time_increment=tool_input.get("time_increment"),
                breakdowns=tool_input.get("breakdowns"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_shopify_products":
            result = await shopify.get_products(
                limit=tool_input.get("limit", 50),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_shopify_orders":
            result = await shopify.get_orders(
                limit=tool_input.get("limit", 50),
                created_at_min=tool_input.get("created_at_min"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_shopify_overview":
            result = await shopify.get_overview()
            return json.dumps(result, default=str)

        return json.dumps({"error": f"Herramienta desconocida: {tool_name}"})

    async def run(self, ctx: AgentContext) -> AgentResult:
        run_log = log.bind(run_id=ctx.run_id, store_id=ctx.store_id)
        run_log.info("ads_meta_agent_started")

        from app.services.runner import AgentRunner
        runner = AgentRunner()
        tokens = TokenUsage()

        user_message = (
            "Analiza las campañas de Meta Ads (Facebook/Instagram) de esta tienda. "
            "Primero obtén el overview de Meta Ads para ver las campañas y métricas generales. "
            "Luego obtén los productos de Shopify para cruzar datos. "
            "Para cada campaña activa, analiza sus métricas en detalle (insights). "
            "Si hay campañas con conjuntos de anuncios, revísalos también. "
            "Finalmente, genera un informe completo en español con diagnóstico y recomendaciones. "
            "La moneda de la tienda es EUR."
        )

        if ctx.user_note:
            user_message += f"\n\nNota del operador: {ctx.user_note}"

        if ctx.params:
            if ctx.params.get("date_preset"):
                user_message += f"\nPeriodo de análisis: {ctx.params['date_preset']}"
            if ctx.params.get("campaign_id"):
                user_message += f"\nCéntrate especialmente en la campaña: {ctx.params['campaign_id']}"

        llm_response = ""
        try:
            llm_response, _ = await runner.run_tool_loop(
                agent=self,
                ctx=ctx,
                system_prompt=self.get_system_prompt(ctx),
                user_message=user_message,
                tools=self.get_tools(),
                tokens=tokens,
            )
        except Exception as e:
            run_log.error("ads_meta_llm_error", error=str(e))
            return AgentResult(
                success=False,
                summary=f"Error durante el análisis con LLM: {str(e)}. "
                        "Puede ser rate-limiting del proveedor. Inténtalo de nuevo en unos minutos.",
                error=str(e),
                tokens=tokens,
            )

        # Parse the analysis
        analysis: dict[str, Any] = {}
        try:
            content = llm_response.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            analysis = json.loads(content)
        except (json.JSONDecodeError, IndexError):
            run_log.warning("ads_meta_json_parse_failed", response_len=len(llm_response))
            analysis = {
                "resumen_ejecutivo": llm_response[:500],
                "raw_response": llm_response,
                "analisis_campañas": [],
                "recomendaciones_generales": [],
            }

        # Build proposed actions from recommendations
        actions_proposed: list[ActionItem] = []
        for rec in analysis.get("recomendaciones_generales", []):
            priority_map = {
                "alta": RiskLevel.MEDIUM,
                "media": RiskLevel.LOW,
                "baja": RiskLevel.LOW,
            }
            actions_proposed.append(ActionItem(
                action_type=f"ads_meta_{rec.get('tipo', 'info')}",
                description=rec.get("descripcion", "Recomendación de Meta Ads"),
                risk_level=priority_map.get(rec.get("prioridad", "media"), RiskLevel.LOW),
                payload={
                    "prioridad": rec.get("prioridad"),
                    "tipo": rec.get("tipo"),
                    "impacto_esperado": rec.get("impacto_esperado"),
                },
            ))

        num_campaigns = len(analysis.get("analisis_campañas", []))
        summary = analysis.get(
            "resumen_ejecutivo",
            f"Análisis de Meta Ads completado. {num_campaigns} campañas analizadas.",
        )

        return AgentResult(
            success=True,
            summary=summary,
            actions_taken=[],
            actions_proposed=actions_proposed,
            artifacts=[{
                "type": "meta_ads_report",
                "data": analysis,
            }],
            metrics={
                "campaigns_analyzed": num_campaigns,
                "recommendations": len(actions_proposed),
            },
            tokens=tokens,
        )
