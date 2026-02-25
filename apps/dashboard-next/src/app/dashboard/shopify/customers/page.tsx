'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Customer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
}

export default function ShopifyCustomersPage() {
  const { data: session } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [prevPage, setPrevPage] = useState<string | undefined>();
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();

  const fetchCustomers = (pageInfo?: string) => {
    if (!session) return;
    setLoading(true);
    const s = session as any;
    const params = pageInfo ? `?limit=25&page_info=${pageInfo}` : '?limit=25';
    apiClient(`/shopify/customers${params}`, {
      token: s.accessToken,
      storeId: s.storeId,
    })
      .then((res) => {
        setCustomers(res.data);
        setNextPage(res.nextPageInfo);
        setPrevPage(res.prevPageInfo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers(currentCursor);
  }, [session, currentCursor]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard/shopify" className="hover:text-blue-600">Shopify</Link>
            <span>/</span>
            <span>Customers</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-500">Loading customers...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No customers found in your Shopify store.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Orders</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total Spent</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        {c.orders_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{c.total_spent}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => prevPage && setCurrentCursor(prevPage)}
              disabled={!prevPage}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">{customers.length} customers shown</span>
            <button
              onClick={() => nextPage && setCurrentCursor(nextPage)}
              disabled={!nextPage}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
