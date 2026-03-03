'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Play, History, Power, PowerOff, Loader2, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

interface AgentInfo {
  name: string;
  description: string;
  risk_level: string;
  enabled: boolean;
  last_run: {
    id: string;
    status: string;
    trigger: string;
    duration_ms: number | null;
    started_at: string | null;
  } | null;
  run_count: number;
}

const AGENT_ICONS: Record<string, string> = {
  ops: '🔧',
  support: '📧',
  reporting: '📊',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-600 bg-green-50',
  medium: 'text-yellow-600 bg-yellow-50',
  high: 'text-red-600 bg-red-50',
};

export default function AgentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [error, setError] = useState('');

  const token = (session as any)?.accessToken;
  const storeId = (session as any)?.storeId;

  const fetchAgents = async () => {
    if (!token || !storeId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-store-id': storeId,
        },
      });
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [token, storeId]);

  const toggleAgent = async (name: string, enabled: boolean) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${name}/toggle`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-store-id': storeId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });
      await fetchAgents();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runAgent = async (name: string) => {
    setRunningAgent(name);
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-store-id': storeId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_name: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || 'Run failed');
      if (data.run_id) {
        router.push(`/dashboard/agents/runs/${data.run_id}`);
        return;
      }
      await fetchAgents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningAgent(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and monitor AI agents</p>
        </div>
        <Link
          href="/dashboard/agents/runs"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <History className="w-4 h-4" />
          View All Runs
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={`bg-white rounded-xl shadow-sm border p-6 transition ${
              agent.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{AGENT_ICONS[agent.name] || '🤖'}</span>
                <div>
                  <h3 className="font-semibold text-gray-900 capitalize">{agent.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_COLORS[agent.risk_level] || 'text-gray-600 bg-gray-50'}`}>
                    {agent.risk_level} risk
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleAgent(agent.name, !agent.enabled)}
                className={`p-2 rounded-lg transition ${
                  agent.enabled
                    ? 'text-green-600 hover:bg-green-50'
                    : 'text-gray-400 hover:bg-gray-50'
                }`}
                title={agent.enabled ? 'Disable agent' : 'Enable agent'}
              >
                {agent.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{agent.description}</p>

            <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
              <span className="flex items-center gap-1">
                <History className="w-3.5 h-3.5" />
                {agent.run_count} runs
              </span>
              {agent.last_run && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {agent.last_run.duration_ms ? `${(agent.last_run.duration_ms / 1000).toFixed(1)}s` : '—'}
                </span>
              )}
            </div>

            {agent.last_run && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Last run</span>
                  <span className={`font-medium ${
                    agent.last_run.status === 'completed' ? 'text-green-600' :
                    agent.last_run.status === 'failed' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {agent.last_run.status === 'completed' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                    {agent.last_run.status}
                  </span>
                </div>
                {agent.last_run.started_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(agent.last_run.started_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => runAgent(agent.name)}
                disabled={!agent.enabled || runningAgent === agent.name}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {runningAgent === agent.name ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {runningAgent === agent.name ? 'Running...' : 'Run Now'}
              </button>
              <Link
                href={`/dashboard/agents/runs?agent=${agent.name}`}
                className="px-3 py-2 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                Runs
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
