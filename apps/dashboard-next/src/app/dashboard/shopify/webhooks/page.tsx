'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Webhook {
  id: number;
  topic: string;
  address: string;
  format: string;
  created_at: string;
}

interface WebhookEvent {
  id: string;
  topic: string;
  shopify_id: string | null;
  shopify_event_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

export default function ShopifyWebhooksPage() {
  const { data: session } = useSession();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registerUrl, setRegisterUrl] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<any>(null);

  const getAuth = () => {
    const s = session as any;
    return { token: s.accessToken, storeId: s.storeId };
  };

  const fetchData = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [whRes, evRes] = await Promise.all([
        apiClient('/shopify/webhooks', getAuth()),
        apiClient('/shopify/webhook-events?limit=20', getAuth()),
      ]);
      setWebhooks(whRes.webhooks || []);
      setEvents(evRes.events || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [session]);

  const handleRegisterAll = async () => {
    if (!registerUrl) return;
    setRegistering(true);
    setRegisterResult(null);
    try {
      const res = await apiClient('/shopify/webhooks/register-all', {
        ...getAuth(),
        method: 'POST',
        body: { baseUrl: registerUrl },
      });
      setRegisterResult(res);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient(`/shopify/webhooks/${id}`, { ...getAuth(), method: 'DELETE' });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusColor: Record<string, string> = {
    received: 'bg-blue-100 text-blue-800',
    processing: 'bg-yellow-100 text-yellow-800',
    processed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard/shopify" className="hover:text-blue-600">Shopify</Link>
            <span>/</span>
            <span>Webhooks</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {/* Register All Webhooks */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Register Webhooks</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter your public URL (e.g. ngrok tunnel) to register all webhook topics at once.
          Shopify will send events to <code className="bg-gray-100 px-1 rounded">{'{url}'}/webhooks/shopify</code>
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={registerUrl}
            onChange={(e) => setRegisterUrl(e.target.value)}
            placeholder="https://your-tunnel.ngrok.io or https://your-domain.com"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleRegisterAll}
            disabled={registering || !registerUrl}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {registering ? 'Registering...' : 'Register All'}
          </button>
        </div>
        {registerResult && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4 text-xs overflow-auto max-h-48">
            <p className="font-medium mb-2">URL: {registerResult.webhookUrl}</p>
            {registerResult.results?.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className={`w-2 h-2 rounded-full ${r.status === 'created' ? 'bg-green-500' : r.status === 'already_exists' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="font-mono">{r.topic}</span>
                <span className="text-gray-400">— {r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Active Webhooks */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm">Active Webhooks ({webhooks.length})</h2>
            </div>
            {webhooks.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No webhooks registered yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Address</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Created</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {webhooks.map((wh) => (
                    <tr key={wh.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{wh.topic}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs truncate max-w-xs">{wh.address}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{new Date(wh.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleDelete(wh.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Events */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm">Recent Webhook Events</h2>
            </div>
            {events.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No webhook events received yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Shopify ID</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{ev.topic}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{ev.shopify_id || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[ev.status] || 'bg-gray-100 text-gray-800'}`}>
                          {ev.status}
                        </span>
                        {ev.error && <span className="ml-2 text-red-500 text-xs">{ev.error}</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{new Date(ev.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
