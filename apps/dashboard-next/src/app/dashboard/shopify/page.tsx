'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface ShopOverview {
  shop: {
    name: string;
    domain: string;
    myshopify_domain: string;
    plan: string;
    currency: string;
    email: string;
    timezone: string;
    country: string;
  };
  counts: {
    products: number;
    orders: number;
    customers: number;
  };
  recentOrders: {
    id: number;
    name: string;
    total_price: string;
    currency: string;
    financial_status: string;
    fulfillment_status: string | null;
    created_at: string;
    customer_email: string;
    items_count: number;
  }[];
  recentRevenue: number;
}

export default function ShopifyOverviewPage() {
  const { data: session } = useSession();
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    const s = session as any;
    apiClient('/shopify/overview', {
      token: s.accessToken,
      storeId: s.storeId,
    })
      .then((res) => setOverview(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [session]);

  const financialColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-red-100 text-red-800',
    partially_refunded: 'bg-orange-100 text-orange-800',
    authorized: 'bg-blue-100 text-blue-800',
    voided: 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Connecting to Shopify...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl">
        <h2 className="font-bold mb-1">Error connecting to Shopify</h2>
        <p className="text-sm">{error}</p>
        <p className="text-xs mt-2 text-red-500">Make sure SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN are set in .env</p>
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shopify Store</h1>
          <p className="text-sm text-gray-500 mt-1">
            {overview.shop.name} — {overview.shop.myshopify_domain}
          </p>
        </div>
        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
          {overview.shop.plan}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Link href="/dashboard/shopify/products" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Products</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{overview.counts.products}</p>
        </Link>
        <Link href="/dashboard/shopify/orders" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Orders</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{overview.counts.orders}</p>
        </Link>
        <Link href="/dashboard/shopify/customers" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm font-medium text-gray-500">Customers</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{overview.counts.customers}</p>
        </Link>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Recent Revenue</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {overview.recentRevenue.toFixed(2)} {overview.shop.currency}
          </p>
          <p className="text-xs text-gray-400 mt-1">Last 5 orders</p>
        </div>
      </div>

      {/* Shop Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Store Info</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Domain</dt><dd className="font-medium">{overview.shop.domain}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="font-medium">{overview.shop.email}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Currency</dt><dd className="font-medium">{overview.shop.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Timezone</dt><dd className="font-medium">{overview.shop.timezone}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Country</dt><dd className="font-medium">{overview.shop.country}</dd></div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Quick Links</h3>
          <div className="space-y-2">
            <Link href="/dashboard/shopify/products" className="block px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700">
              📦 View Products
            </Link>
            <Link href="/dashboard/shopify/orders" className="block px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700">
              🛒 View Orders
            </Link>
            <Link href="/dashboard/shopify/customers" className="block px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700">
              👥 View Customers
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Orders</h3>
          <Link href="/dashboard/shopify/orders" className="text-sm text-blue-600 hover:text-blue-800">View all →</Link>
        </div>
        {overview.recentOrders.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Payment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fulfillment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overview.recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{order.name}</td>
                  <td className="px-4 py-3 text-gray-600">{order.customer_email}</td>
                  <td className="px-4 py-3 font-medium">{order.total_price} {order.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${financialColor[order.financial_status] || 'bg-gray-100 text-gray-800'}`}>
                      {order.financial_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {order.fulfillment_status || <span className="text-gray-400">unfulfilled</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
