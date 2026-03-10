'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick,
  Play, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
  Target, ShoppingCart, Users, Clock, MessageSquare,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  created_time?: string;
}

interface Insight {
  campaign_id?: string;
  campaign_name?: string;
  impressions: string;
  clicks?: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  reach?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
}

interface AccountInfo {
  name?: string;
  account_id?: string;
  currency?: string;
  timezone_name?: string;
  amount_spent?: string;
  business_name?: string;
  account_status?: number;
}

interface AnalysisResult {
  run_id: string;
  status: string;
  summary: string;
  artifacts: { type: string; data: any }[];
  tokens_used: { total_tokens: number };
  dry_run: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-green-700 bg-green-50 border-green-200',
  PAUSED: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  ARCHIVED: 'text-gray-500 bg-gray-50 border-gray-200',
  DELETED: 'text-red-500 bg-red-50 border-red-200',
};

function formatCurrency(value: string | number | undefined, currency = 'EUR'): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(num / 100);
}

function formatNumber(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-ES').format(num);
}

function formatPercent(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return `${num.toFixed(2)}%`;
}

function formatSpend(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(num);
}

function getPurchases(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const purchase = actions.find(
    (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
  );
  return purchase ? parseInt(purchase.value, 10) : 0;
}

function getPurchaseValue(actionValues?: { action_type: string; value: string }[]): number {
  if (!actionValues) return 0;
  const purchase = actionValues.find(
    (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
  );
  return purchase ? parseFloat(purchase.value) : 0;
}

function calcROAS(actionValues?: { action_type: string; value: string }[], spend?: string): number {
  const revenue = getPurchaseValue(actionValues);
  const spendNum = parseFloat(spend || '0');
  if (spendNum === 0) return 0;
  return revenue / spendNum;
}

export default function MetaAdsPage() {
  const { data: session } = useSession();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  // Agent analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisReport, setAnalysisReport] = useState<any>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [userNote, setUserNote] = useState('');

  const token = (session as any)?.accessToken;
  const storeId = (session as any)?.storeId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchData = async () => {
    if (!token || !storeId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${apiUrl}/meta-ads/overview?date_preset=${datePreset}`,
        { headers: { Authorization: `Bearer ${token}`, 'x-store-id': storeId } }
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Error al conectar con Meta Ads');
        return;
      }
      setAccount(data.account || null);
      setCampaigns(data.campaigns || []);
      setInsights(data.insights || []);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, storeId, datePreset]);

  const runAnalysis = async () => {
    if (!token || !storeId) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisReport(null);
    try {
      const res = await fetch(`${apiUrl}/agents/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-store-id': storeId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_name: 'ads_meta',
          params: { date_preset: datePreset },
          dry_run: true,
          user_note: userNote || null,
        }),
      });
      const data = await res.json();
      setAnalysisResult(data);
      if (data.artifacts && data.artifacts.length > 0) {
        const report = data.artifacts.find((a: any) => a.type === 'meta_ads_report');
        if (report) setAnalysisReport(report.data);
      }
      setShowAnalysis(true);
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar análisis');
    } finally {
      setAnalyzing(false);
    }
  };

  const getInsightForCampaign = (campaignId: string): Insight | undefined =>
    insights.find((i) => i.campaign_id === campaignId);

  const totalSpend = insights.reduce((sum, i) => sum + parseFloat(i.spend || '0'), 0);
  const totalImpressions = insights.reduce((sum, i) => sum + parseInt(i.impressions || '0', 10), 0);
  const totalClicks = insights.reduce((sum, i) => sum + parseInt(i.clicks || '0', 10), 0);
  const totalPurchases = insights.reduce((sum, i) => sum + getPurchases(i.actions), 0);
  const totalRevenue = insights.reduce((sum, i) => sum + getPurchaseValue(i.action_values), 0);
  const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const DATE_PRESETS = [
    { value: 'last_7d', label: 'Últimos 7 días' },
    { value: 'last_14d', label: 'Últimos 14 días' },
    { value: 'last_30d', label: 'Últimos 30 días' },
    { value: 'last_90d', label: 'Últimos 90 días' },
    { value: 'this_month', label: 'Este mes' },
    { value: 'last_month', label: 'Mes pasado' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meta Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Análisis de campañas de Facebook e Instagram
            {account?.business_name && ` — ${account.business_name}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <p className="text-xs text-red-500 mt-1">
            Asegúrate de tener META_ACCESS_TOKEN y META_AD_ACCOUNT_ID configurados en .env
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-500">Cargando datos de Meta Ads...</span>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Gasto Total</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatSpend(totalSpend)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Impresiones</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(totalImpressions)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointerClick className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Clics</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(totalClicks)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">CTR</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatPercent(overallCTR)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Compras</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(totalPurchases)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">ROAS</p>
              </div>
              <p className={`text-xl font-bold ${overallROAS >= 2 ? 'text-green-600' : overallROAS >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallROAS.toFixed(2)}x
              </p>
            </div>
          </div>

          {/* AI Analysis Button */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-indigo-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Análisis con IA
                </h3>
                <p className="text-sm text-indigo-700 mt-1">
                  Ejecuta el agente de análisis para obtener un informe detallado con diagnóstico y recomendaciones de mejora para tus campañas.
                </p>
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Nota opcional: p.ej. 'Céntrate en la campaña de verano' o 'Quiero mejorar el ROAS'"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                </div>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="ml-4 mt-1 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
                ) : (
                  <><Play className="w-4 h-4" /> Analizar Campañas</>
                )}
              </button>
            </div>
          </div>

          {/* Analysis Result */}
          {showAnalysis && analysisResult && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    📊 Informe de Análisis
                  </h3>
                  <div className="flex items-center gap-3">
                    {analysisResult.tokens_used && (
                      <span className="text-xs text-gray-400">
                        {analysisResult.tokens_used.total_tokens} tokens
                      </span>
                    )}
                    <button
                      onClick={() => setShowAnalysis(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {analysisResult.summary && (
                  <p className="text-sm text-gray-600 mt-2">{analysisResult.summary}</p>
                )}
              </div>

              {analysisReport ? (
                <div className="p-5 space-y-5">
                  {/* Resumen ejecutivo */}
                  {analysisReport.resumen_ejecutivo && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-1">Resumen Ejecutivo</h4>
                      <p className="text-sm text-blue-800">{analysisReport.resumen_ejecutivo}</p>
                    </div>
                  )}

                  {/* Campaign analysis */}
                  {analysisReport.analisis_campañas && analysisReport.analisis_campañas.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Análisis por Campaña</h4>
                      <div className="space-y-3">
                        {analysisReport.analisis_campañas.map((c: any, i: number) => (
                          <div
                            key={i}
                            className={`border rounded-lg p-4 ${
                              c.diagnostico === 'bueno' ? 'border-green-200 bg-green-50/50' :
                              c.diagnostico === 'necesita_tiempo' ? 'border-blue-200 bg-blue-50/50' :
                              c.diagnostico === 'mejorable' ? 'border-yellow-200 bg-yellow-50/50' :
                              'border-red-200 bg-red-50/50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium text-gray-900">{c.nombre || c.campaign_id}</h5>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                c.diagnostico === 'bueno' ? 'bg-green-100 text-green-700' :
                                c.diagnostico === 'necesita_tiempo' ? 'bg-blue-100 text-blue-700' :
                                c.diagnostico === 'mejorable' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {c.diagnostico === 'bueno' ? '✅ Buen rendimiento' :
                                 c.diagnostico === 'necesita_tiempo' ? '⏳ Necesita tiempo' :
                                 c.diagnostico === 'mejorable' ? '⚠️ Mejorable' :
                                 '❌ Bajo rendimiento'}
                              </span>
                            </div>
                            {c.explicacion && (
                              <p className="text-sm text-gray-700 mb-2">{c.explicacion}</p>
                            )}
                            {c.metricas && (
                              <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                                <div><span className="text-gray-500">Gasto:</span> <span className="font-medium">{formatSpend(c.metricas.gasto)}</span></div>
                                <div><span className="text-gray-500">CTR:</span> <span className="font-medium">{formatPercent(c.metricas.ctr)}</span></div>
                                <div><span className="text-gray-500">CPC:</span> <span className="font-medium">{formatSpend(c.metricas.cpc)}</span></div>
                                <div><span className="text-gray-500">ROAS:</span> <span className={`font-medium ${(c.metricas.roas || 0) >= 2 ? 'text-green-600' : 'text-red-600'}`}>{(c.metricas.roas || 0).toFixed(2)}x</span></div>
                              </div>
                            )}
                            {c.recomendaciones && c.recomendaciones.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-600 mb-1">Recomendaciones:</p>
                                <ul className="text-xs text-gray-600 space-y-0.5">
                                  {c.recomendaciones.map((r: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1">
                                      <span className="text-indigo-500 mt-0.5">→</span> {r}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General recommendations */}
                  {analysisReport.recomendaciones_generales && analysisReport.recomendaciones_generales.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Recomendaciones Generales</h4>
                      <div className="space-y-2">
                        {analysisReport.recomendaciones_generales.map((r: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              r.prioridad === 'alta' ? 'bg-red-100 text-red-700' :
                              r.prioridad === 'media' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {r.prioridad}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm text-gray-800">{r.descripcion}</p>
                              {r.impacto_esperado && (
                                <p className="text-xs text-gray-500 mt-0.5">Impacto esperado: {r.impacto_esperado}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Próximos pasos */}
                  {analysisReport.proximos_pasos && analysisReport.proximos_pasos.length > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <h4 className="font-semibold text-indigo-900 mb-2">Próximos Pasos</h4>
                      <ol className="text-sm text-indigo-800 space-y-1 list-decimal list-inside">
                        {analysisReport.proximos_pasos.map((step: string, i: number) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : analysisResult.summary ? (
                <div className="p-5">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{analysisResult.summary}</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Campaigns Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Campañas ({campaigns.length})
              </h2>
            </div>

            {campaigns.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No se encontraron campañas</p>
                <p className="text-xs mt-1">Verifica tu META_AD_ACCOUNT_ID y META_ACCESS_TOKEN</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Campaña</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Objetivo</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Gasto</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Impresiones</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Clics</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">CTR</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">CPC</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Compras</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {campaigns.map((campaign) => {
                      const insight = getInsightForCampaign(campaign.id);
                      const roas = insight ? calcROAS(insight.action_values, insight.spend) : 0;
                      const purchases = insight ? getPurchases(insight.actions) : 0;
                      const status = campaign.effective_status || campaign.status;

                      return (
                        <tr
                          key={campaign.id}
                          className="hover:bg-gray-50 cursor-pointer transition"
                          onClick={() => setExpandedCampaign(
                            expandedCampaign === campaign.id ? null : campaign.id
                          )}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {expandedCampaign === campaign.id
                                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                : <ChevronDown className="w-4 h-4 text-gray-400" />
                              }
                              <div>
                                <p className="font-medium text-gray-900">{campaign.name}</p>
                                <p className="text-xs text-gray-400">{campaign.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full border ${
                              STATUS_COLORS[status] || 'text-gray-600 bg-gray-50 border-gray-200'
                            }`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-600 text-xs">{campaign.objective}</td>
                          <td className="px-3 py-3 text-right font-medium">{insight ? formatSpend(insight.spend) : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600">{insight ? formatNumber(insight.impressions) : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600">{insight ? formatNumber(insight.clicks) : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600">{insight ? formatPercent(insight.ctr) : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600">{insight ? formatSpend(insight.cpc) : '—'}</td>
                          <td className="px-3 py-3 text-right font-medium">{purchases > 0 ? purchases : '—'}</td>
                          <td className="px-5 py-3 text-right">
                            {roas > 0 ? (
                              <span className={`font-bold ${roas >= 2 ? 'text-green-600' : roas >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {roas.toFixed(2)}x
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
