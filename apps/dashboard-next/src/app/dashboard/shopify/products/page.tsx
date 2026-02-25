'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Product {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  status: string;
  handle: string;
  variants: { id: number; price: string; inventory_quantity: number; sku: string | null }[];
  image: { src: string } | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

export default function ShopifyProductsPage() {
  const { data: session } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [prevPage, setPrevPage] = useState<string | undefined>();
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();

  const fetchProducts = (pageInfo?: string) => {
    if (!session) return;
    setLoading(true);
    const s = session as any;
    const params = pageInfo ? `?limit=25&page_info=${pageInfo}` : '?limit=25';
    apiClient(`/shopify/products${params}`, {
      token: s.accessToken,
      storeId: s.storeId,
    })
      .then((res) => {
        setProducts(res.data);
        setNextPage(res.nextPageInfo);
        setPrevPage(res.prevPageInfo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts(currentCursor);
  }, [session, currentCursor]);

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-100 text-gray-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard/shopify" className="hover:text-blue-600">Shopify</Link>
            <span>/</span>
            <span>Products</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-500">Loading products...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No products found in your Shopify store.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Image</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Inventory</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => {
                  const mainVariant = p.variants[0];
                  const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {p.image ? (
                          <img src={p.image.src} alt={p.title} className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-xs">N/A</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.title}</p>
                        {p.tags && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{p.tags}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[p.status] || 'bg-gray-100 text-gray-800'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.vendor || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.product_type || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{mainVariant?.price || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={totalInventory <= 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                          {totalInventory}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.updated_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => prevPage && setCurrentCursor(prevPage)}
              disabled={!prevPage}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">{products.length} products shown</span>
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
