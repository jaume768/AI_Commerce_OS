'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Order {
  id: number;
  name: string;
  email: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  line_items: { id: number; title: string; quantity: number; price: string }[];
  customer: { first_name: string; last_name: string; email: string } | null;
  order_number: number;
}

export default function ShopifyOrdersPage() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [prevPage, setPrevPage] = useState<string | undefined>();
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();

  const fetchOrders = (pageInfo?: string) => {
    if (!session) return;
    setLoading(true);
    const s = session as any;
    const params = pageInfo ? `?limit=25&page_info=${pageInfo}` : '?limit=25';
    apiClient(`/shopify/orders${params}`, {
      token: s.accessToken,
      storeId: s.storeId,
    })
      .then((res) => {
        setOrders(res.data);
        setNextPage(res.nextPageInfo);
        setPrevPage(res.prevPageInfo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders(currentCursor);
  }, [session, currentCursor]);

  const financialColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-red-100 text-red-800',
    partially_refunded: 'bg-orange-100 text-orange-800',
    authorized: 'bg-blue-100 text-blue-800',
    voided: 'bg-gray-100 text-gray-800',
  };

  const fulfillmentColor: Record<string, string> = {
    fulfilled: 'bg-green-100 text-green-800',
    partial: 'bg-yellow-100 text-yellow-800',
    unfulfilled: 'bg-orange-100 text-orange-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard/shopify" className="hover:text-blue-600">Shopify</Link>
            <span>/</span>
            <span>Orders</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-500">Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No orders found in your Shopify store.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Payment</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fulfillment</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Items</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => {
                  const customerName = o.customer
                    ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
                    : o.email || '—';
                  const fulfillment = o.fulfillment_status || 'unfulfilled';
                  return (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{customerName}</p>
                        {o.customer && <p className="text-xs text-gray-400">{o.customer.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{o.total_price} {o.currency}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${financialColor[o.financial_status] || 'bg-gray-100 text-gray-800'}`}>
                          {o.financial_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${fulfillmentColor[fulfillment] || 'bg-gray-100 text-gray-800'}`}>
                          {fulfillment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{o.line_items.length}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
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
            <span className="text-sm text-gray-500">{orders.length} orders shown</span>
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
