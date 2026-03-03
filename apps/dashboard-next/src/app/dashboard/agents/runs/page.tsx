'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Clock, Bot, Filter, ChevronRight } from 'lucide-react';

interface RunSummary {
  id: string;
  store_id: string;
  agent_name: string;
  status: string;
  trigger: string;
  summary: string;
  duration_ms: number | null;
  tokens_used: Record<string, number>;
  dry_run: boolean;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'text-green-700 bg-green-50 border-green-200',
  failed: 'text-red-700 bg-red-50 border-red-200',
  running: 'text-blue-700 bg-blue-50 border-blue-200',
  cancelled: 'text-gray-700 bg-gray-50 border-gray-200',
};

export default function AgentRunsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentFilter = searchParams.get('agent') || '';

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(agentFilter);
  const [selectedStatus, setSelectedStatus] = useState('');

  const token = (session as any)?.accessToken;
  const storeId = (session as any)?.storeId;

  const fetchRuns = async () => {
    if (!token || !storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (selectedAgent) params.set('agent_name', selectedAgent);
      if (selectedStatus) params.set('status', selectedStatus);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/runs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-store-id': storeId,
        },
      });
      const data = await res.json();
      setRuns(data.runs || []);
      setTotal(data.total || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [token, storeId, selectedAgent, selectedStatus]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/agents" className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Runs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total runs</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All agents</option>
          <option value="ops">Ops</option>
          <option value="support">Support</option>
          <option value="reporting">Reporting</option>
        </select>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No runs found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Trigger</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Summary</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tokens</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Started</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => router.push(`/dashboard/agents/runs/${run.id}`)}
                >
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/agents/runs/${run.id}`} className="font-medium text-gray-900 capitalize hover:text-brand-600">
                      {run.agent_name}
                    </Link>
                    {run.dry_run && (
                      <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">DRY</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[run.status] || STATUS_STYLES.cancelled}`}>
                      {run.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                      {run.status === 'failed' && <XCircle className="w-3 h-3" />}
                      {run.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{run.trigger}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{run.summary || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {run.tokens_used?.total_tokens || 0}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
