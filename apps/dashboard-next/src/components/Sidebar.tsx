'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, ListTodo, ShieldCheck, LogOut, Store, Package, ShoppingCart, Users, Webhook } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/dashboard/approvals', label: 'Approvals', icon: ShieldCheck },
];

const shopifyItems = [
  { href: '/dashboard/shopify', label: 'Store Overview', icon: Store },
  { href: '/dashboard/shopify/products', label: 'Products', icon: Package },
  { href: '/dashboard/shopify/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/dashboard/shopify/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/shopify/webhooks', label: 'Webhooks', icon: Webhook },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">AI Commerce OS</h1>
        <p className="text-xs text-gray-400 mt-0.5">Control Center</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shopify</p>
        </div>
        {shopifyItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard/shopify' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition w-full"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
