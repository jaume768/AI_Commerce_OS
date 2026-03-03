'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';

interface TrackingStatus {
  enabled: boolean;
  meta: {
    configured: boolean;
    pixelId: string | null;
    apiVersion: string;
    testMode: boolean;
  };
  tiktok: {
    configured: boolean;
    pixelId: string | null;
    testMode: boolean;
  };
  storeUrl: string | null;
}

interface TrackingTotals {
  platform: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

interface TrackingEvent {
  id: string;
  platform: string;
  event_name: string;
  event_id: string;
  source: string;
  source_id: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export default function TrackingPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [totals, setTotals] = useState<TrackingTotals[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [testingMeta, setTestingMeta] = useState(false);
  const [testingTikTok, setTestingTikTok] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const s = session as any;

  async function loadData() {
    if (!session) return;
    try {
      const [statusRes, statsRes, eventsRes] = await Promise.all([
        apiClient('/tracking/status', { token: s.accessToken, storeId: s.storeId }),
        apiClient('/tracking/stats', { token: s.accessToken, storeId: s.storeId }),
        apiClient('/tracking/events?limit=20', { token: s.accessToken, storeId: s.storeId }),
      ]);
      setStatus(statusRes);
      setTotals(statsRes.totals || []);
      setEvents(eventsRes.events || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [session]);

  async function handleTestMeta() {
    setTestingMeta(true);
    setTestResult(null);
    try {
      const res = await apiClient('/tracking/meta/test', {
        token: s.accessToken,
        storeId: s.storeId,
        method: 'POST',
        body: {},
      });
      setTestResult(res.ok ? 'Meta CAPI: Connection OK' : `Meta CAPI: Failed — ${res.error}`);
      loadData();
    } catch (err: any) {
      setTestResult(`Meta CAPI: Error — ${err.message}`);
    } finally {
      setTestingMeta(false);
    }
  }

  async function handleTestTikTok() {
    setTestingTikTok(true);
    setTestResult(null);
    try {
      const res = await apiClient('/tracking/tiktok/test', {
        token: s.accessToken,
        storeId: s.storeId,
        method: 'POST',
        body: {},
      });
      setTestResult(res.ok ? 'TikTok Events API: Connection OK' : `TikTok: Failed — ${res.error}`);
      loadData();
    } catch (err: any) {
      setTestResult(`TikTok: Error — ${err.message}`);
    } finally {
      setTestingTikTok(false);
    }
  }

  async function handleSendTestEvent() {
    setTestResult(null);
    try {
      const res = await apiClient('/tracking/test-event', {
        token: s.accessToken,
        storeId: s.storeId,
        method: 'POST',
        body: {},
      });
      const parts: string[] = [];
      if (res.meta?.success) parts.push('Meta: sent');
      else if (res.meta) parts.push(`Meta: ${res.meta.error || 'failed'}`);
      if (res.tiktok?.success) parts.push('TikTok: sent');
      else if (res.tiktok) parts.push(`TikTok: ${res.tiktok.error || 'failed'}`);
      setTestResult(`Test event: ${parts.join(' | ') || 'no platforms configured'}`);
      loadData();
    } catch (err: any) {
      setTestResult(`Test event error: ${err.message}`);
    }
  }

  const statusColor: Record<string, string> = {
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tracking status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl">
        <h2 className="font-bold mb-1">Error loading tracking</h2>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tracking & Channels</h1>
          <p className="text-sm text-gray-500 mt-1">Fase 3 — Server-side event tracking (Meta CAPI + TikTok Events API)</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          status?.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {status?.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          testResult.includes('OK') || testResult.includes('sent')
            ? 'bg-green-50 text-green-700'
            : 'bg-yellow-50 text-yellow-700'
        }`}>
          {testResult}
        </div>
      )}

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Meta CAPI */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Meta (Facebook/Instagram)</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              status?.meta.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {status?.meta.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <dl className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <dt className="text-gray-500">Pixel ID</dt>
              <dd className="font-mono text-xs">{status?.meta.pixelId || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">API Version</dt>
              <dd>{status?.meta.apiVersion}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Test Mode</dt>
              <dd>{status?.meta.testMode ? <span className="text-yellow-600">Active</span> : 'Off'}</dd>
            </div>
            {totals.find((t) => t.platform === 'meta') && (
              <>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Events Sent</dt>
                  <dd className="font-medium text-green-700">{totals.find((t) => t.platform === 'meta')?.sent || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Events Failed</dt>
                  <dd className="font-medium text-red-600">{totals.find((t) => t.platform === 'meta')?.failed || 0}</dd>
                </div>
              </>
            )}
          </dl>
          <button
            onClick={handleTestMeta}
            disabled={!status?.meta.configured || testingMeta}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testingMeta ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* TikTok Events API */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">TikTok</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              status?.tiktok.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {status?.tiktok.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <dl className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <dt className="text-gray-500">Pixel ID</dt>
              <dd className="font-mono text-xs">{status?.tiktok.pixelId || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Test Mode</dt>
              <dd>{status?.tiktok.testMode ? <span className="text-yellow-600">Active</span> : 'Off'}</dd>
            </div>
            {totals.find((t) => t.platform === 'tiktok') && (
              <>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Events Sent</dt>
                  <dd className="font-medium text-green-700">{totals.find((t) => t.platform === 'tiktok')?.sent || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Events Failed</dt>
                  <dd className="font-medium text-red-600">{totals.find((t) => t.platform === 'tiktok')?.failed || 0}</dd>
                </div>
              </>
            )}
          </dl>
          <button
            onClick={handleTestTikTok}
            disabled={!status?.tiktok.configured || testingTikTok}
            className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testingTikTok ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Send test event */}
      {status?.enabled && (
        <div className="mb-8">
          <button
            onClick={handleSendTestEvent}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
          >
            Send Test Event to All Platforms
          </button>
        </div>
      )}

      {/* Setup guide */}
      {!status?.enabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Setup Guide</h3>
          <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
            <li>In Shopify Admin, install the <strong>Facebook & Instagram</strong> sales channel and connect your catalog</li>
            <li>In Meta Events Manager, get your <strong>Pixel ID</strong> and create a <strong>System User Token</strong></li>
            <li>Set <code className="bg-yellow-100 px-1 rounded">TRACKING_ENABLED=true</code>, <code className="bg-yellow-100 px-1 rounded">META_PIXEL_ID</code>, and <code className="bg-yellow-100 px-1 rounded">META_ACCESS_TOKEN</code> in your <code>.env</code></li>
            <li>Restart the API service and click "Test Connection" above</li>
            <li>Use <code className="bg-yellow-100 px-1 rounded">META_TEST_EVENT_CODE</code> to verify events in Meta Events Manager &gt; Test Events</li>
          </ol>
        </div>
      )}

      {/* Recent events */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Tracking Events</h3>
        </div>
        {events.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No tracking events yet. Events will appear here when orders are paid (via Shopify webhooks).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Platform</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Error</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        event.platform === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-gray-900 text-white'
                      }`}>
                        {event.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{event.event_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[event.status] || 'bg-gray-100 text-gray-800'}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{event.source}</td>
                    <td className="px-4 py-3 text-red-600 text-xs max-w-[200px] truncate">{event.error || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(event.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
