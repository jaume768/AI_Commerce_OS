'use client';

interface DiffViewerProps {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  title?: string;
}

export default function DiffViewer({ before, after, title }: DiffViewerProps) {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes = allKeys.filter((key) => {
    return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  });

  if (changes.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
        No changes detected.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {title && (
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-700">{title}</h4>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {changes.map((key) => {
          const beforeVal = before[key];
          const afterVal = after[key];
          const isNew = !(key in before);
          const isRemoved = !(key in after);

          return (
            <div key={key} className="px-4 py-3">
              <div className="text-xs font-mono text-gray-500 mb-1">{key}</div>
              <div className="flex flex-col gap-1">
                {!isNew && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded shrink-0">−</span>
                    <pre className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 overflow-x-auto flex-1 whitespace-pre-wrap break-all">
                      {typeof beforeVal === 'object' ? JSON.stringify(beforeVal, null, 2) : String(beforeVal ?? 'null')}
                    </pre>
                  </div>
                )}
                {!isRemoved && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0">+</span>
                    <pre className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 overflow-x-auto flex-1 whitespace-pre-wrap break-all">
                      {typeof afterVal === 'object' ? JSON.stringify(afterVal, null, 2) : String(afterVal ?? 'null')}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
