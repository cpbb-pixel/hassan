import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  Ban,
  Plus,
  Trash2,
  Clock,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { exportSingleSheetExcel } from '../lib/exportExcel.ts';
import { formatMoney } from '../shared/money.ts';
import type { Order, OrderStatus, RestaurantSettings, RestaurantTable } from '../shared/types.ts';

interface TablesOrdersViewProps {
  settings: RestaurantSettings;
  canManageTables: boolean;
  canVoid: boolean;
  canExport: boolean;
  onInspectOrder: (order: Order) => void;
}

export const TablesOrdersView: React.FC<TablesOrdersViewProps> = ({
  settings,
  canManageTables,
  canVoid,
  canExport,
  onInspectOrder,
}) => {
  const [subTab, setSubTab] = useState<'orders' | 'tables'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState('');

  // New Table Form
  const [newTableNo, setNewTableNo] = useState('');
  const [newZone, setNewZone] = useState('الصالة الرئيسية');
  const [newCap, setNewCap] = useState(4);

  // Void Modal
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const cur = settings.currency_symbol;

  async function loadData() {
    setError('');
    try {
      const [ordRes, tblRes] = await Promise.all([
        apiRequest<Order[]>(`/api/orders?status=${statusFilter}&limit=150`),
        apiRequest<RestaurantTable[]>('/api/tables'),
      ]);
      setOrders(ordRes);
      setTables(tblRes);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadData();
  }, [statusFilter]);

  async function updateOrderStatus(id: number, status: OrderStatus) {
    try {
      await apiRequest(`/api/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmVoidOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    try {
      await apiRequest(`/api/orders/${voidTarget.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason || 'إلغاء فاتورة' }),
      });
      setVoidTarget(null);
      setVoidReason('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableNo.trim()) return;
    try {
      await apiRequest('/api/tables', {
        method: 'POST',
        body: JSON.stringify({ table_number: newTableNo.trim(), zone: newZone, capacity: newCap }),
      });
      setNewTableNo('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateTableStatus(tbl: RestaurantTable, status: RestaurantTable['status']) {
    await apiRequest(`/api/tables/${tbl.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    await loadData();
  }

  async function deleteTable(id: number) {
    await apiRequest(`/api/tables/${id}`, { method: 'DELETE' });
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setSubTab('orders')}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
              subTab === 'orders' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            سجل الطلبات والمطبخ ({orders.length})
          </button>
          <button
            onClick={() => setSubTab('tables')}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
              subTab === 'tables' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            خريطة الطاولات ({tables.length})
          </button>
        </div>

        {subTab === 'orders' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none"
            >
              <option value="all">جميع الحالات</option>
              <option value="preparing">قيد التحضير</option>
              <option value="ready">جاهز</option>
              <option value="completed">مكتمل</option>
              <option value="voided">ملغي</option>
            </select>
            {canExport && (
              <button
                onClick={() =>
                  exportSingleSheetExcel(
                    'Orders_Register',
                    'سجل الفواتير',
                    orders.map((o) => ({
                      'رقم الفاتورة': o.invoice_no,
                      التاريخ: o.created_at,
                      النوع: o.order_type === 'dine_in' ? 'محلي' : o.order_type === 'takeaway' ? 'سفري' : 'توصيل',
                      الحالة: o.status,
                      'المجموع الفرعي': o.subtotal,
                      الخصم: o.discount_amount,
                      الضريبة: o.tax_amount,
                      'الإجمالي النهائي': o.grand_total,
                      التكلفة: o.total_cogs,
                      الموظف: o.created_by_name || '',
                    }))
                  )
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>تصدير Excel</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</div>}

      {subTab === 'orders' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">الفاتورة</th>
                  <th className="px-4 py-3 font-semibold">النوع / الطاولة</th>
                  <th className="px-4 py-3 font-semibold">الأصناف</th>
                  <th className="px-4 py-3 text-left font-semibold">الإجمالي</th>
                  <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-left font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-mono-num text-xs font-bold text-[#0B1D36]">{o.invoice_no}</div>
                      <div className="font-mono-num text-[11px] text-slate-500">{o.created_at.slice(0, 16)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {o.order_type === 'dine_in'
                        ? `محلي${o.table_number ? ` · ${o.table_number}` : ''}`
                        : o.order_type === 'takeaway'
                          ? 'سفري'
                          : 'توصيل'}
                      <div className="text-[11px] text-slate-500">
                        {o.payment_method === 'cash' ? 'نقدي' : o.payment_method === 'card' ? 'شبكة' : 'تحويل'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {o.items.map((it) => `${it.item_name} (${it.size_name}) ×${it.qty}`).join('، ')}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="font-mono-num text-xs font-bold text-[#0B1D36]">
                        {formatMoney(o.grand_total, cur)}
                      </div>
                      <div className="font-mono-num text-[11px] text-slate-500">
                        ضريبة: {formatMoney(o.tax_amount, cur)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold">
                      {o.status === 'preparing' && <span className="text-amber-700">قيد التحضير</span>}
                      {o.status === 'ready' && <span className="text-sky-700">جاهز</span>}
                      {o.status === 'completed' && <span className="text-teal-700">مكتمل</span>}
                      {o.status === 'voided' && <span className="text-rose-700">ملغي</span>}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => onInspectOrder(o)}
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                          title="طباعة الفاتورة"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {canManageTables && o.status === 'preparing' && (
                          <button
                            onClick={() => void updateOrderStatus(o.id, 'ready')}
                            className="rounded-md border border-sky-200 bg-sky-50 p-1.5 text-sky-700 hover:bg-sky-100"
                            title="تعيين كجاهز"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canManageTables && (o.status === 'preparing' || o.status === 'ready') && (
                          <button
                            onClick={() => void updateOrderStatus(o.id, 'completed')}
                            className="rounded-md border border-teal-200 bg-teal-50 p-1.5 text-teal-700 hover:bg-teal-100"
                            title="إتمام الطلب"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canVoid && o.status !== 'voided' && (
                          <button
                            onClick={() => setVoidTarget(o)}
                            className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                            title="إلغاء الفاتورة وعكس المخزون"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'tables' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {canManageTables && (
            <form onSubmit={addTable} className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
              <h3 className="text-sm font-bold text-[#0B1D36]">إضافة طاولة جديدة</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={newTableNo}
                  onChange={(e) => setNewTableNo(e.target.value)}
                  placeholder="رقم / رمز الطاولة (مثال: T-05)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  required
                />
                <select
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="الصالة الرئيسية">الصالة الرئيسية</option>
                  <option value="قسم العائلات">قسم العائلات</option>
                  <option value="التراس الخارجي">التراس الخارجي</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newCap}
                  onChange={(e) => setNewCap(Number(e.target.value))}
                  placeholder="عدد المقاعد"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  <Plus className="h-4 w-4" />
                  <span>إضافة الطاولة</span>
                </button>
              </div>
            </form>
          )}

          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${canManageTables ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            {tables.map((t) => (
              <div key={t.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono-num text-lg font-extrabold text-[#0B1D36]">{t.table_number}</span>
                    <span
                      className={`text-xs font-bold ${
                        t.status === 'available'
                          ? 'text-teal-700'
                          : t.status === 'occupied'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {t.status === 'available' ? 'شاغرة' : t.status === 'occupied' ? 'مشغولة' : 'محجوزة'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.zone} · <span className="font-mono-num">{t.capacity}</span> مقاعد
                  </div>
                  {t.current_invoice_no && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
                      <div className="font-mono-num font-semibold text-slate-800">{t.current_invoice_no}</div>
                      <div className="font-mono-num text-teal-700">
                        {formatMoney(t.current_order_total || 0, cur)}
                      </div>
                    </div>
                  )}
                </div>

                {canManageTables && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <select
                      value={t.status}
                      onChange={(e) => void updateTableStatus(t, e.target.value as RestaurantTable['status'])}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="available">شاغرة</option>
                      <option value="occupied">مشغولة</option>
                      <option value="reserved">محجوزة</option>
                    </select>
                    <button
                      onClick={() => void deleteTable(t.id)}
                      className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                      title="حذف الطاولة"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Void Order Confirmation Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={confirmVoidOrder} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0B1D36]">إلغاء الفاتورة {voidTarget.invoice_no}</h3>
            <p className="mt-1 text-xs text-slate-500">
              سيتم استرجاع كميات المخزون المخصومة تلقائياً وتسجيل قيد عكسي في سجل التدقيق.
            </p>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="سبب الإلغاء (إلزامي للتدقيق)"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-500"
              required
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                تراجع
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
              >
                تأكيد الإلغاء وعكس المخزون
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
