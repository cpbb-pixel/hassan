import React, { useEffect, useState } from 'react';
import { Plus, FileSpreadsheet, ArrowDownUp, ShoppingCart, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { exportSingleSheetExcel } from '../lib/exportExcel.ts';
import { formatMoney } from '../shared/money.ts';
import type {
  Ingredient,
  PaymentMethod,
  PurchaseInvoice,
  RestaurantSettings,
  StockMovement,
  Supplier,
} from '../shared/types.ts';

interface InventoryViewProps {
  settings: RestaurantSettings;
  canManage: boolean;
  canExport: boolean;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ settings, canManage, canExport }) => {
  const [subTab, setSubTab] = useState<'stock' | 'movements' | 'purchases'>('stock');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [onlyLow, setOnlyLow] = useState(false);
  const [error, setError] = useState('');

  // New Ingredient Modal
  const [showNewIng, setShowNewIng] = useState(false);
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState('كجم');
  const [ingQty, setIngQty] = useState(10);
  const [ingMin, setIngMin] = useState(5);
  const [ingCost, setIngCost] = useState(20);
  const [ingSup, setIngSup] = useState('');

  // Adjust Modal
  const [adjustIng, setAdjustIng] = useState<Ingredient | null>(null);
  const [adjType, setAdjType] = useState<'adjustment' | 'waste'>('adjustment');
  const [adjDelta, setAdjDelta] = useState(0);
  const [adjNotes, setAdjNotes] = useState('');

  // Purchase Invoice Modal
  const [showPurModal, setShowPurModal] = useState(false);
  const [purSupplierId, setPurSupplierId] = useState<number>(1);
  const [purPayment, setPurPayment] = useState<PaymentMethod>('transfer');
  const [purRecordExp, setPurRecordExp] = useState(true);
  const [purLines, setPurLines] = useState<Array<{ ingredient_id: number; qty: number; unit_cost: number }>>([]);
  const [purNotes, setPurNotes] = useState('');

  const cur = settings.currency_symbol;

  async function loadInventory() {
    setError('');
    try {
      const res = await apiRequest<{
        ingredients: Ingredient[];
        movements: StockMovement[];
        suppliers: Supplier[];
        purchases: PurchaseInvoice[];
      }>('/api/inventory');
      setIngredients(res.ingredients);
      setMovements(res.movements);
      setSuppliers(res.suppliers);
      setPurchases(res.purchases);
      if (res.suppliers[0]) setPurSupplierId(res.suppliers[0].id);
      if (res.ingredients[0] && purLines.length === 0) {
        setPurLines([{ ingredient_id: res.ingredients[0].id, qty: 10, unit_cost: res.ingredients[0].unit_cost }]);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  async function createIngredient(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          name: ingName,
          unit: ingUnit,
          stock_qty: ingQty,
          min_threshold: ingMin,
          unit_cost: ingCost,
          supplier_name: ingSup,
        }),
      });
      setShowNewIng(false);
      setIngName('');
      await loadInventory();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustIng) return;
    try {
      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          ingredient_id: adjustIng.id,
          movement_type: adjType,
          qty_delta: adjDelta,
          notes: adjNotes,
        }),
      });
      setAdjustIng(null);
      setAdjDelta(0);
      setAdjNotes('');
      await loadInventory();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitPurchase(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: purSupplierId,
          payment_method: purPayment,
          record_expense: purRecordExp,
          notes: purNotes,
          lines: purLines,
        }),
      });
      setShowPurModal(false);
      setPurNotes('');
      await loadInventory();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const displayedIngredients = onlyLow
    ? ingredients.filter((i) => i.stock_qty <= i.min_threshold)
    : ingredients;

  const totalInventoryValue = ingredients.reduce((s, i) => s + Math.max(0, i.stock_qty) * i.unit_cost, 0);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setSubTab('stock')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'stock' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            أرصدة المستودع ({ingredients.length})
          </button>
          <button
            onClick={() => setSubTab('purchases')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'purchases' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            فواتير المشتريات ({purchases.length})
          </button>
          <button
            onClick={() => setSubTab('movements')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'movements' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            حركات المخزون ({movements.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <button
              onClick={() =>
                exportSingleSheetExcel(
                  'Inventory_Report',
                  'المخزون',
                  ingredients.map((i) => ({
                    الرمز: i.sku,
                    المادة: i.name,
                    الوحدة: i.unit,
                    'الرصيد الحالي': i.stock_qty,
                    'حد التنبيه': i.min_threshold,
                    'تكلفة الوحدة': i.unit_cost,
                    'إجمالي القيمة': Number((i.stock_qty * i.unit_cost).toFixed(2)),
                  }))
                )
              }
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>تصدير Excel</span>
            </button>
          )}

          {canManage && (
            <>
              <button
                onClick={() => setShowPurModal(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>فاتورة مشتريات</span>
              </button>
              <button
                onClick={() => setShowNewIng(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
              >
                <Plus className="h-4 w-4" />
                <span>مادة خام جديدة</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</div>}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">إجمالي قيمة المخزون الحالي</div>
          <div className="mt-1 font-mono-num text-xl font-bold text-[#0B1D36]">
            {formatMoney(totalInventoryValue, cur)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">عدد المواد المسجلة</div>
          <div className="mt-1 font-mono-num text-xl font-bold text-[#0B1D36]">{ingredients.length} صنف</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">أصناف تحت الحد الأدنى</div>
          <div className="mt-1 font-mono-num text-xl font-bold text-amber-700">
            {ingredients.filter((i) => i.stock_qty <= i.min_threshold).length} صنف
          </div>
        </div>
      </div>

      {subTab === 'stock' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <span className="text-sm font-bold text-[#0B1D36]">أرصدة المواد الأولية</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="accent-teal-700"
              />
              <span>إظهار النواقص فقط</span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">الرمز</th>
                  <th className="px-4 py-3 font-semibold">المادة الخام</th>
                  <th className="px-4 py-3 text-center font-semibold">الرصيد المتاح</th>
                  <th className="px-4 py-3 text-center font-semibold">حد التنبيه</th>
                  <th className="px-4 py-3 text-left font-semibold">متوسط التكلفة</th>
                  <th className="px-4 py-3 text-left font-semibold">قيمة الرصيد</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold">تسوية / هالك</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedIngredients.map((ing) => {
                  const isLow = ing.stock_qty <= ing.min_threshold;
                  return (
                    <tr key={ing.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{ing.sku}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0B1D36]">{ing.name}</div>
                        <div className="text-[11px] text-slate-500">{ing.supplier_name}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono-num">
                        <span className={`font-bold ${isLow ? 'text-amber-700' : 'text-teal-700'}`}>
                          {ing.stock_qty} {ing.unit}
                        </span>
                        {isLow && <div className="text-[10px] font-semibold text-amber-700">تحت الحد</div>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono-num text-xs text-slate-500">
                        {ing.min_threshold} {ing.unit}
                      </td>
                      <td className="px-4 py-3 text-left font-mono-num text-xs text-slate-800">
                        {formatMoney(ing.unit_cost, cur)}
                      </td>
                      <td className="px-4 py-3 text-left font-mono-num text-xs font-bold text-[#0B1D36]">
                        {formatMoney(Math.max(0, ing.stock_qty) * ing.unit_cost, cur)}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-left">
                          <button
                            onClick={() => {
                              setAdjustIng(ing);
                              setAdjType('adjustment');
                              setAdjDelta(0);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ArrowDownUp className="h-3 w-3" />
                            <span>جرد</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'purchases' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">رقم الفاتورة</th>
                <th className="px-4 py-3 font-semibold">المورد</th>
                <th className="px-4 py-3 text-left font-semibold">المبلغ الإجمالي</th>
                <th className="px-4 py-3 font-semibold">الدفع</th>
                <th className="px-4 py-3 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono-num text-xs font-bold text-[#0B1D36]">{p.invoice_no}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-800">{p.supplier_name}</td>
                  <td className="px-4 py-3 text-left font-mono-num text-xs font-bold text-[#0B1D36]">
                    {formatMoney(p.total_amount, cur)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.payment_method === 'cash' ? 'نقدي' : p.payment_method === 'card' ? 'بطاقة' : 'تحويل'}
                  </td>
                  <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{p.created_at.slice(0, 16)}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                    لم يتم تسجيل فواتير مشتريات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'movements' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">المادة</th>
                  <th className="px-4 py-3 font-semibold">نوع الحركة</th>
                  <th className="px-4 py-3 text-center font-semibold">الكمية</th>
                  <th className="px-4 py-3 font-semibold">المرجع</th>
                  <th className="px-4 py-3 font-semibold">البيان</th>
                  <th className="px-4 py-3 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 text-xs font-semibold text-[#0B1D36]">{m.ingredient_name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {m.movement_type === 'sale_deduction'
                        ? 'خصم بيع تلقائي'
                        : m.movement_type === 'purchase'
                          ? 'توريد مشتريات'
                          : m.movement_type === 'void_restore'
                            ? 'عكس فاتورة ملغاة'
                            : m.movement_type === 'waste'
                              ? 'تالف / هالك'
                              : 'تسوية جرد'}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-center font-mono-num text-xs font-bold ${
                        m.qty_delta >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {m.qty_delta >= 0 ? `+${m.qty_delta}` : m.qty_delta} {m.unit}
                    </td>
                    <td className="px-4 py-2.5 font-mono-num text-xs text-slate-500">{m.reference_no}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{m.notes}</td>
                    <td className="px-4 py-2.5 font-mono-num text-xs text-slate-500">{m.created_at.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Ingredient Modal */}
      {showNewIng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={createIngredient} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#0B1D36]">إضافة مادة خام جديدة للمستودع</h3>
              <button type="button" onClick={() => setShowNewIng(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={ingName}
                onChange={(e) => setIngName(e.target.value)}
                placeholder="اسم المادة"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={ingUnit}
                  onChange={(e) => setIngUnit(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="كجم">كجم</option>
                  <option value="لتر">لتر</option>
                  <option value="حبة">حبة</option>
                  <option value="علبة">علبة</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  value={ingCost}
                  onChange={(e) => setIngCost(Number(e.target.value))}
                  placeholder="تكلفة الوحدة"
                  className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="0.1"
                    value={ingQty}
                    onChange={(e) => setIngQty(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">حد إعادة الطلب</label>
                  <input
                    type="number"
                    step="0.1"
                    value={ingMin}
                    onChange={(e) => setIngMin(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
              </div>
              <input
                type="text"
                value={ingSup}
                onChange={(e) => setIngSup(e.target.value)}
                placeholder="اسم المورد (اختياري)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewIng(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                إلغاء
              </button>
              <button type="submit" className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600">
                حفظ المادة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustIng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={submitAdjust} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0B1D36]">تسوية جرد: {adjustIng.name}</h3>
            <p className="mt-1 text-xs text-slate-500">
              الرصيد الحالي: <span className="font-mono-num font-bold">{adjustIng.stock_qty}</span> {adjustIng.unit}
            </p>
            <div className="mt-4 space-y-3">
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as 'adjustment' | 'waste')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="adjustment">تسوية جرد (+/-)</option>
                <option value="waste">تسجيل هالك / تالف (-)</option>
              </select>
              <input
                type="number"
                step="0.1"
                value={adjDelta}
                onChange={(e) => setAdjDelta(Number(e.target.value))}
                placeholder="الكمية"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                required
              />
              <input
                type="text"
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                placeholder="السبب / الملاحظة"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAdjustIng(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                إلغاء
              </button>
              <button type="submit" className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600">
                تأكيد الحركة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Purchase Invoice Modal */}
      {showPurModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={submitPurchase} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#0B1D36]">تسجيل فاتورة مشتريات وتحديث التكلفة المرجحة</h3>
              <button type="button" onClick={() => setShowPurModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">المورد</label>
                <select
                  value={purSupplierId}
                  onChange={(e) => setPurSupplierId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">طريقة السداد</label>
                <select
                  value={purPayment}
                  onChange={(e) => setPurPayment(e.target.value as PaymentMethod)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cash">نقدي من الصندوق</option>
                  <option value="card">بطاقة</option>
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">بنود الفاتورة</span>
                <button
                  type="button"
                  onClick={() =>
                    ingredients[0] &&
                    setPurLines((p) => [
                      ...p,
                      { ingredient_id: ingredients[0].id, qty: 5, unit_cost: ingredients[0].unit_cost },
                    ])
                  }
                  className="text-xs font-bold text-teal-700 hover:underline"
                >
                  + إضافة بند
                </button>
              </div>

              {purLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    value={line.ingredient_id}
                    onChange={(e) => {
                      const next = [...purLines];
                      const ing = ingredients.find((x) => x.id === Number(e.target.value));
                      next[idx].ingredient_id = Number(e.target.value);
                      if (ing) next[idx].unit_cost = ing.unit_cost;
                      setPurLines(next);
                    }}
                    className="col-span-6 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={line.qty}
                    onChange={(e) => {
                      const next = [...purLines];
                      next[idx].qty = Number(e.target.value);
                      setPurLines(next);
                    }}
                    placeholder="الكمية"
                    className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 font-mono-num text-xs"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={line.unit_cost}
                    onChange={(e) => {
                      const next = [...purLines];
                      next[idx].unit_cost = Number(e.target.value);
                      setPurLines(next);
                    }}
                    placeholder="سعر الوحدة"
                    className="col-span-3 rounded-lg border border-slate-200 px-2 py-1.5 font-mono-num text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setPurLines((p) => p.filter((_, i) => i !== idx))}
                    className="col-span-1 text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={purRecordExp}
                onChange={(e) => setPurRecordExp(e.target.checked)}
                className="accent-teal-700"
              />
              <span>إثبات قيمة الفاتورة تلقائياً في سجل المصروفات التشغيلية</span>
            </label>

            <input
              type="text"
              value={purNotes}
              onChange={(e) => setPurNotes(e.target.value)}
              placeholder="ملاحظات الفاتورة"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />

            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="font-mono-num text-sm font-bold text-[#0B1D36]">
                الإجمالي:{' '}
                {formatMoney(
                  purLines.reduce((s, l) => s + l.qty * l.unit_cost, 0),
                  cur
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPurModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                  إلغاء
                </button>
                <button type="submit" className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600">
                  ترحيل الفاتورة للمستودع
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
