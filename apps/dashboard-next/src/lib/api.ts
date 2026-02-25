const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function apiClient(
  path: string,
  options: {
    token?: string;
    storeId?: string;
    method?: string;
    body?: unknown;
  } = {},
) {
  const { token, storeId, method = 'GET', body } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (storeId) headers['x-store-id'] = storeId;

  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `API error: ${res.status}`);
  }

  return res.json();
}
