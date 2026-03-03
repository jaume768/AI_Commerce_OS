'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, Bot, Coins, FileJson, ShieldCheck } from 'lucide-react';
import DiffViewer from '@/components/DiffViewer';

interface RunDetail {
  id: string;
  store_id: string;
  agent_name: string;
  status: string;
  trigger: string;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, any>;
  actions_taken: Array<Record<string, any>>;
  actions_proposed: Array<Record<string, any>>;
  artifacts: Array<Record<string, any>>;
  tokens_used: Record<string, number>;
  duration_ms: number | null;
  dry_run: boolean;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  audit_logs: Array<Record<string, unknown>>;
}

export default function RunDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['actions_taken', 'actions_proposed']));

  const token = (session as any)?.accessToken;
  const storeId = (session as any)?.storeId;

  useEffect(() => {
    if (!token || !storeId || !runId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/runs/${runId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-store-id': storeId,
          },
        });
        const data = await res.json();
        setRun(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [token, storeId, runId]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Run not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/agents/runs" className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{run.agent_name} Agent Run</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{run.id}</p>
        </div>
      </div>

      {/* Header cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Status</p>
          <div className="flex items-center gap-1.5">
            {run.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : run.status === 'failed' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            )}
            <span className="font-semibold text-gray-900 capitalize">{run.status}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Duration</p>
          <p className="font-semibold text-gray-900">
            {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Tokens</p>
          <p className="font-semibold text-gray-900">{run.tokens_used?.total_tokens || 0}</p>
          <p className="text-xs text-gray-400">
            {run.tokens_used?.prompt_tokens || 0}↑ {run.tokens_used?.completion_tokens || 0}↓
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Trigger</p>
          <p className="font-semibold text-gray-900 capitalize">{run.trigger}</p>
          {run.dry_run && (
            <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">DRY RUN</span>
          )}
        </div>
      </div>

      {/* Error */}
      {run.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-medium text-red-700 mb-1">Error</p>
          <pre className="text-xs text-red-600 whitespace-pre-wrap">{run.error}</pre>
        </div>
      )}

      {/* Summary */}
      {run.output_payload?.summary && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Summary</h3>
          <p className="text-sm text-gray-600">{String(run.output_payload.summary)}</p>
        </div>
      )}

      {/* Actions Taken */}
      <CollapsibleSection
        title={`Actions Taken (${run.actions_taken.length})`}
        icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
        expanded={expandedSections.has('actions_taken')}
        onToggle={() => toggleSection('actions_taken')}
      >
        {run.actions_taken.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No actions were auto-executed.</p>
        ) : (
          <div className="space-y-3">
            {run.actions_taken.map((action, i) => (
              <div key={i} className="p-3 bg-green-50 border border-green-100 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-green-800">{String(action.action_type ?? '')}</span>
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    {String(action.risk_level ?? 'low')} risk
                  </span>
                </div>
                <p className="text-sm text-green-700">{String(action.description ?? '')}</p>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Actions Proposed (Approvals) */}
      <CollapsibleSection
        title={`Actions Proposed (${run.actions_proposed.length})`}
        icon={<ShieldCheck className="w-4 h-4 text-yellow-500" />}
        expanded={expandedSections.has('actions_proposed')}
        onToggle={() => toggleSection('actions_proposed')}
      >
        {run.actions_proposed.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No actions require approval.</p>
        ) : (
          <div className="space-y-3">
            {run.actions_proposed.map((action, i) => (
              <div key={i} className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-yellow-800">{String(action.action_type ?? '')}</span>
                  <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                    {String(action.risk_level ?? 'medium')} risk
                  </span>
                </div>
                <p className="text-sm text-yellow-700 mb-2">{String(action.description ?? '')}</p>
                {action.approval_id && (
                  <Link
                    href={`/dashboard/approvals`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    View Approval →
                  </Link>
                )}
                {action.payload && typeof action.payload === 'object' && (
                  <details className="mt-2">
                    <summary className="text-xs text-yellow-600 cursor-pointer">Payload</summary>
                    <pre className="text-xs text-yellow-700 bg-yellow-100 rounded p-2 mt-1 overflow-x-auto">
                      {JSON.stringify(action.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Artifacts */}
      {run.artifacts.length > 0 && (
        <CollapsibleSection
          title={`Artifacts (${run.artifacts.length})`}
          icon={<FileJson className="w-4 h-4 text-blue-500" />}
          expanded={expandedSections.has('artifacts')}
          onToggle={() => toggleSection('artifacts')}
        >
          <div className="space-y-2">
            {run.artifacts.map((artifact, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-blue-800">{String(artifact.key ?? artifact.name ?? `artifact-${i}`)}</p>
                  <p className="text-xs text-blue-600">{String(artifact.content_type ?? '')} — {artifact.size ? `${String(artifact.size)} bytes` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Input Payload */}
      <CollapsibleSection
        title="Input Payload"
        icon={<FileJson className="w-4 h-4 text-gray-400" />}
        expanded={expandedSections.has('input')}
        onToggle={() => toggleSection('input')}
      >
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto">
          {JSON.stringify(run.input_payload, null, 2)}
        </pre>
      </CollapsibleSection>

      {/* Output Payload */}
      <CollapsibleSection
        title="Output Payload"
        icon={<FileJson className="w-4 h-4 text-gray-400" />}
        expanded={expandedSections.has('output')}
        onToggle={() => toggleSection('output')}
      >
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto">
          {JSON.stringify(run.output_payload, null, 2)}
        </pre>
      </CollapsibleSection>

      {/* Audit Timeline */}
      {run.audit_logs.length > 0 && (
        <CollapsibleSection
          title={`Audit Timeline (${run.audit_logs.length})`}
          icon={<Clock className="w-4 h-4 text-gray-400" />}
          expanded={expandedSections.has('audit')}
          onToggle={() => toggleSection('audit')}
        >
          <div className="space-y-2">
            {run.audit_logs.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 p-2">
                <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 font-medium">{String(entry.action)}</p>
                  <p className="text-xs text-gray-400">
                    {entry.created_at ? new Date(String(entry.created_at)).toLocaleString() : ''}
                    {' — '}{String(entry.actor_type)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-6 py-4 text-left hover:bg-gray-50 transition"
      >
        {icon}
        <span className="text-sm font-semibold text-gray-700 flex-1">{title}</span>
        <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}
