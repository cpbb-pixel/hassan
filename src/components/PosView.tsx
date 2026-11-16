import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  CheckCircle2,
  X,
  Maximize2,
  Minimize2,
  Keyboard,
  PauseCircle,
  PlayCircle,
  ReceiptText,
  RotateCcw,
  Printer,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  enqueueOfflineOrder,
  loadPosCache,
  savePosCache,
} from '../lib/offlinePosQueue.ts';
import { calculateOrderFinancials, formatMoney, fromCents, toCents } from '../shared/money.ts';
import type {
  Addon,
  Category,
  ItemSize,
  MenuItem,
  Order,
  OrderType,
  PaymentMethod,
  RestaurantSettings,
  RestaurantTable,
} from '../shared/types.ts';

interface PosViewProps {
  settings: RestaurantSettings;
  canApplyDiscount: boolean;
  onOrderCreated: (order: Order) => void;
  isFullscreenPos?: boolean;
  onToggleFullscreenPos?: () => void;
}

interface CartLine {
  uid: string;
  menuItem: MenuItem;
  itemSize: ItemSize;
  qty: number;
  addons: Addon[];
  notes: string;
}

interface HeldOrder {
  id: string;
  savedAt: string;
  label: string;
  orderType: OrderType;
  tableId: number | '';
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryFee: number;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  paymentMethod: PaymentMethod;
  grandTotal: number;
  cart: CartLine[];
}

const HELD_ORDERS_KEY = 'sufra_held_orders_v1';

function readHeldOrders(): HeldOrder[] {
  try {
    const raw = localStorage.getItem(HELD_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HeldOrder[]) : [];
  } catch {
    return [];
  }
}

export const PosView: React.FC<PosViewProps> = ({
  settings,
  canApplyDiscount,
  onOrderCreated,
  isFullscreenPos = false,
  onToggleFullscreenPos,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [pickedSize, setPickedSize] = useState<ItemSize | null>(null);
  const [pickedAddonIds, setPickedAddonIds] = useState<number[]>([]);
  const [itemNotes, setItemNotes] = useState('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableId, setTableId] = useState<number | ''>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(15);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [offlineSavedMsg, setOfflineSavedMsg] = useState('');

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => readHeldOrders());
  const [heldModalOpen, setHeldModalOpen] = useState(false);

  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutRef = useRef<() => void>(() => {});

  const cur = settings.currency_symbol;

  async function loadPosData() {
    setLoading(true);
    try {
      const [menuRes, tblRes] = await Promise.all([
        apiRequest<{ categories: Category[]; items: MenuItem[]; addons: Addon[] }>('/api/menu'),
        apiRequest<RestaurantTable[]>('/api/tables'),
      ]);
      const activeCats = menuRes.categories.filter((c) => c.active === 1);
      const activeItems = menuRes.items.filter((i) => i.active === 1 && i.sizes.length > 0);
      const activeAddons = menuRes.addons.filter((a) => a.active === 1);
      setCategories(activeCats);
      setItems(activeItems);
      setAddons(activeAddons);
      setTables(tblRes);
      savePosCache({
        categories: activeCats,
        items: activeItems,
        addons: activeAddons,
        tables: tblRes,
      });
      const firstAvail = tblRes.find((t) => t.status === 'available');
      if (firstAvail) setTableId(firstAvail.id);
    } catch (err) {
      const cached = loadPosCache();
      if (cached) {
        setCategories(cached.categories);
        setItems(cached.items);
        setAddons(cached.addons);
        setTables(cached.tables);
        const firstAvail = cached.tables.find((t) => t.status === 'available');
        if (firstAvail) setTableId(firstAvail.id);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPosData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (selectedCategoryId !== 'all' && it.category_id !== selectedCategoryId) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, selectedCategoryId, search]);

  const financials = useMemo(() => {
    return calculateOrderFinancials({
      lines: cart.map((c) => ({
        qty: c.qty,
        unitPrice: c.itemSize.price,
        unitCost: c.itemSize.computed_cost,
        addonsTotalPerUnit: c.addons.reduce((s, a) => s + a.price, 0),
        addonsCostPerUnit: c.addons.reduce((s, a) => s + a.cost, 0),
      })),
      discountType: canApplyDiscount ? discountType : 'none',
      discountValue: canApplyDiscount ? discountValue : 0,
      taxRate: settings.vat_rate,
      taxInclusive: settings.tax_inclusive === 1,
      deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
    });
  }, [cart, discountType, discountValue, canApplyDiscount, settings, orderType, deliveryFee]);

  function persistHeld(next: HeldOrder[]) {
    setHeldOrders(next);
    try {
      localStorage.setItem(HELD_ORDERS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function openItemPicker(item: MenuItem) {
    setActiveItem(item);
    setPickedSize(item.sizes[0] || null);
    setPickedAddonIds([]);
    setItemNotes('');
  }

  function quickAddDefaultSize(e: React.MouseEvent, item: MenuItem) {
    e.stopPropagation();
    const defaultSize = item.sizes[0];
    if (!defaultSize) return;
    const existingIdx = cart.findIndex(
      (l) => l.itemSize.id === defaultSize.id && l.addons.length === 0 && l.notes === ''
    );
    if (existingIdx >= 0) {
      const next = [...cart];
      next[existingIdx].qty += 1;
      setCart(next);
    } else {
      setCart((prev) => [
        ...prev,
        {
          uid: `${Date.now()}-${Math.random()}`,
          menuItem: item,
          itemSize: defaultSize,
          qty: 1,
          addons: [],
          notes: '',
        },
      ]);
    }
  }

  function addPickedToCart() {
    if (!activeItem || !pickedSize) return;
    const chosenAddons = addons.filter((a) => pickedAddonIds.includes(a.id));
    const addonKey = chosenAddons.map((a) => a.id).sort().join(',');
    const existingIdx = cart.findIndex(
      (l) =>
        l.itemSize.id === pickedSize.id &&
        l.addons.map((a) => a.id).sort().join(',') === addonKey &&
        l.notes === itemNotes.trim()
    );

    if (existingIdx >= 0) {
      const next = [...cart];
      next[existingIdx].qty += 1;
      setCart(next);
    } else {
      setCart((prev) => [
        ...prev,
        {
          uid: `${Date.now()}-${Math.random()}`,
          menuItem: activeItem,
          itemSize: pickedSize,
          qty: 1,
          addons: chosenAddons,
          notes: itemNotes.trim(),
        },
      ]);
    }
    setActiveItem(null);
  }

  function resetCartAndForm() {
    setCart([]);
    setDiscountType('none');
    setDiscountValue(0);
    setPaidAmount('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setError('');
  }

  function handleParkOrder() {
    if (cart.length === 0) return;
    const tableObj = tables.find((t) => t.id === tableId);
    const label =
      orderType === 'dine_in' && tableObj
        ? `طاولة ${tableObj.table_number}`
        : orderType === 'delivery' && customerName
        ? `توصيل: ${customerName}`
        : orderType === 'takeaway'
        ? 'طلب سفري معلق'
        : 'طلب معلق';

    const entry: HeldOrder = {
      id: `HOLD-${Date.now()}`,
      savedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      label,
      orderType,
      tableId,
      customerName,
      customerPhone,
      customerAddress,
      deliveryFee,
      discountType,
      discountValue,
      paymentMethod,
      grandTotal: financials.grandTotal,
      cart,
    };
    persistHeld([entry, ...heldOrders]);
    resetCartAndForm();
  }

  function handleResumeHeldOrder(held: HeldOrder) {
    setCart(held.cart);
    setOrderType(held.orderType);
    setTableId(held.tableId);
    setCustomerName(held.customerName);
    setCustomerPhone(held.customerPhone);
    setCustomerAddress(held.customerAddress);
    setDeliveryFee(held.deliveryFee);
    setDiscountType(held.discountType);
    setDiscountValue(held.discountValue);
    setPaymentMethod(held.paymentMethod);
    persistHeld(heldOrders.filter((h) => h.id !== held.id));
    setHeldModalOpen(false);
  }

  async function openShiftSummary() {
    setShiftModalOpen(true);
    setShiftLoading(true);
    try {
      const all = await apiRequest<Order[]>('/api/orders?limit=250');
      const todayIso = new Date().toISOString().slice(0, 10);
      setTodayOrders(all.filter((o) => o.created_at.slice(0, 10) === todayIso));
    } catch {
      setTodayOrders([]);
    } finally {
      setShiftLoading(false);
    }
  }

  const shiftStats = useMemo(() => {
    const active = todayOrders.filter((o) => o.status !== 'voided');
    let cashCents = 0;
    let cardCents = 0;
    let transferCents = 0;
    let vatCents = 0;
    let totalCents = 0;
    for (const o of active) {
      const g = toCents(o.grand_total);
      totalCents += g;
      vatCents += toCents(o.tax_amount);
      if (o.payment_method === 'cash') cashCents += g;
      else if (o.payment_method === 'card') cardCents += g;
      else transferCents += g;
    }
    return {
      count: active.length,
      voidedCount: todayOrders.length - active.length,
      cash: fromCents(cashCents),
      card: fromCents(cardCents),
      transfer: fromCents(transferCents),
      vat: fromCents(vatCents),
      total: fromCents(totalCents),
    };
  }, [todayOrders]);

  async function handleCheckout() {
    if (cart.length === 0 || submitting) return;
    setError('');
    setOfflineSavedMsg('');
    if (orderType === 'dine_in' && !tableId) {
      setError('يرجى اختيار طاولة للطلب المحلي');
      return;
    }

    const paidNum = paidAmount ? Number(paidAmount) : financials.grandTotal;
    const orderPayload = {
      order_type: orderType,
      table_id: orderType === 'dine_in' ? Number(tableId) : null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      payment_method: paymentMethod,
      discount_type: canApplyDiscount ? discountType : ('none' as const),
      discount_value: canApplyDiscount ? discountValue : 0,
      delivery_fee: orderType === 'delivery' ? deliveryFee : 0,
      paid_amount: Math.max(financials.grandTotal, paidNum),
      items: cart.map((c) => ({
        item_size_id: c.itemSize.id,
        qty: c.qty,
        addon_ids: c.addons.map((a) => a.id),
        notes: c.notes,
      })),
    };

    if (!navigator.onLine) {
      const localId = `OFFLINE-${String(Date.now()).slice(-6)}`;
      enqueueOfflineOrder({
        local_id: localId,
        created_at: new Date().toISOString(),
        grand_total_preview: financials.grandTotal,
        payload: orderPayload,
      });
      resetCartAndForm();
      setOfflineSavedMsg(`تم حفظ الفاتورة محلياً (${localId}) — ستُرفع تلقائياً عند عودة الاتصال.`);
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiRequest<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });
      resetCartAndForm();
      await loadPosData();
      onOrderCreated(created);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!navigator.onLine || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        const localId = `OFFLINE-${String(Date.now()).slice(-6)}`;
        enqueueOfflineOrder({
          local_id: localId,
          created_at: new Date().toISOString(),
          grand_total_preview: financials.grandTotal,
          payload: orderPayload,
        });
        resetCartAndForm();
        setOfflineSavedMsg(`تعذر الاتصال بالسيرفر — تم حفظ الفاتورة (${localId}) للمزامنة التلقائية.`);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  checkoutRef.current = () => {
    void handleCheckout();
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F9') {
        e.preventDefault();
        checkoutRef.current();
      } else if (e.key === 'Escape') {
        if (activeItem) setActiveItem(null);
        if (heldModalOpen) setHeldModalOpen(false);
        if (shiftModalOpen) setShiftModalOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeItem, heldModalOpen, shiftModalOpen]);

  const paidNum = Number(paidAmount) || financials.grandTotal;
  const changePreview = Math.max(0, Number((paidNum - financials.grandTotal).toFixed(2)));

  return (
    <div className="space-y-4">
      {/* Desktop POS Terminal Shortcut, Shift Z-Report, Held Orders & Fullscreen Bar */}
      <div className="luxury-card no-print flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-bold text-[#0B1D36]">
            <Keyboard className="h-4 w-4 text-teal-600" />
            <span>اختصارات سطح المكتب:</span>
          </span>
          <span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0B1D36]">
              F2
            </kbd>{' '}
            بحث سريع
          </span>
          <span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0B1D36]">
              F9
            </kbd>{' '}
            إصدار الفاتورة
          </span>
          <span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0B1D36]">
              Esc
            </kbd>{' '}
            إغلاق النافذة
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHeldModalOpen(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0B1D36] hover:border-orange-500 hover:text-orange-700"
          >
            <PauseCircle className="h-3.5 w-3.5 text-orange-600" />
            <span>المعلقة</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono-num text-[11px] font-extrabold text-[#0B1D36]">
              {heldOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void openShiftSummary()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0B1D36] hover:border-teal-600 hover:text-teal-700"
          >
            <ReceiptText className="h-3.5 w-3.5 text-teal-600" />
            <span>ملخص الوردية اليومية</span>
          </button>

          {onToggleFullscreenPos && (
            <button
              type="button"
              onClick={onToggleFullscreenPos}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                isFullscreenPos
                  ? 'bg-[#0B1D36] text-white hover:bg-[#132A4A]'
                  : 'border border-teal-600/30 bg-teal-50 text-teal-800 hover:bg-teal-600 hover:text-white'
              }`}
            >
              {isFullscreenPos ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>إظهار القائمة الجانبية للنظام</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>وضع شاشة البيع الكاملة (POS)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {offlineSavedMsg && (
        <div className="no-print flex items-center justify-between gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-xs font-bold text-teal-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
            <span>{offlineSavedMsg}</span>
          </div>
          <button type="button" onClick={() => setOfflineSavedMsg('')} className="text-teal-700 hover:text-teal-950">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="no-print grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Right Column: Categories + Menu Grid */}
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="luxury-card flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن وجبة أو صنف (F2)..."
                className="w-full rounded-lg border border-slate-200 bg-[#F5F7FA] py-2 pr-9 pl-3 text-sm text-[#0B1D36] outline-none focus:border-teal-600 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedCategoryId('all')}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedCategoryId === 'all'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                كل الأقسام
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const minPrice = Math.min(...item.sizes.map((s) => s.price));
                return (
                  <div
                    key={item.id}
                    onClick={() => openItemPicker(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openItemPicker(item);
                    }}
                    className="luxury-card group flex cursor-pointer flex-col overflow-hidden rounded-xl text-right transition-all hover:border-teal-600"
                  >
                    <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                          <UtensilsCrossed className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="text-[11px] text-slate-500">
                          {item.category_name} · {item.sizes.length} {item.sizes.length === 1 ? 'حجم' : 'أحجام'}
                        </div>
                        <h3 className="mt-1 text-sm font-bold text-[#0B1D36]">{item.name}</h3>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                        <span className="font-mono-num text-sm font-extrabold text-teal-700">
                          {item.sizes.length > 1 ? `من ${formatMoney(minPrice, cur)}` : formatMoney(minPrice, cur)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => quickAddDefaultSize(e, item)}
                          className="rounded-md bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 transition-colors hover:bg-orange-600 hover:text-white"
                          title="إضافة سريعة بالحجم الافتراضي"
                        >
                          + إضافة سريعة
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Left Column: Active Order Cart & Financial Checkout */}
        <div className="luxury-card flex flex-col overflow-hidden rounded-xl lg:col-span-5 xl:col-span-4">
          <div className="border-b border-slate-200 bg-[#0B1D36] p-4 text-white">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-teal-300">فاتورة البيع الحالية</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleParkOrder}
                  className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:border-teal-400 hover:bg-teal-600/30 disabled:opacity-40"
                >
                  <PauseCircle className="h-3 w-3" />
                  <span>تعليق</span>
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={resetCartAndForm}
                  className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>إفراغ</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#071324] p-1">
              <button
                onClick={() => setOrderType('dine_in')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                  orderType === 'dine_in' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <UtensilsCrossed className="h-3.5 w-3.5" />
                <span>محلي</span>
              </button>
              <button
                onClick={() => setOrderType('takeaway')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                  orderType === 'takeaway' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>سفري</span>
              </button>
              <button
                onClick={() => setOrderType('delivery')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                  orderType === 'delivery' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Truck className="h-3.5 w-3.5" />
                <span>توصيل</span>
              </button>
            </div>

            {orderType === 'dine_in' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-teal-200">اختيار الطاولة</label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-lg border border-white/15 bg-[#132A4A] px-3 py-2 text-xs font-medium text-white outline-none focus:border-teal-400"
                >
                  <option value="">-- اختر طاولة --</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>
                      طاولة {t.table_number} ({t.zone}) — {t.capacity} مقاعد{' '}
                      {t.status === 'occupied' ? '[مشغولة]' : t.status === 'reserved' ? '[محجوزة]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="اسم العميل"
                  className="rounded-lg border border-white/15 bg-[#132A4A] px-2.5 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-teal-400"
                />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="رقم الجوال"
                  className="rounded-lg border border-white/15 bg-[#132A4A] px-2.5 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-teal-400"
                />
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="العنوان بالتفصيل"
                  className="col-span-2 rounded-lg border border-white/15 bg-[#132A4A] px-2.5 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-teal-400"
                />
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-4 py-2" style={{ maxHeight: '340px' }}>
            {cart.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center text-xs text-slate-400">
                <ShoppingBag className="mb-2 h-8 w-8 text-slate-300" />
                <span>السلة فارغة — اختر الوجبات والأحجام من القائمة</span>
              </div>
            ) : (
              cart.map((line) => {
                const unitTotal = line.itemSize.price + line.addons.reduce((s, a) => s + a.price, 0);
                return (
                  <div key={line.uid} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#0B1D36]">
                          {line.menuItem.name}{' '}
                          <span className="text-xs font-medium text-slate-500">({line.itemSize.size_name})</span>
                        </div>
                        {line.addons.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            + {line.addons.map((a) => a.name).join('، ')}
                          </div>
                        )}
                        {line.notes && <div className="mt-0.5 text-[11px] text-orange-700">ملاحظة: {line.notes}</div>}
                      </div>
                      <button
                        onClick={() => setCart((p) => p.filter((x) => x.uid !== line.uid))}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label="حذف الصنف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setCart((p) =>
                              p
                                .map((x) => (x.uid === line.uid ? { ...x, qty: x.qty - 1 } : x))
                                .filter((x) => x.qty > 0)
                            )
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-[#0B1D36] hover:bg-slate-100"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center font-mono-num text-xs font-bold">{line.qty}</span>
                        <button
                          onClick={() =>
                            setCart((p) => p.map((x) => (x.uid === line.uid ? { ...x, qty: x.qty + 1 } : x)))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-[#0B1D36] hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-[#0B1D36]">
                        {formatMoney(unitTotal * line.qty, cur)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Financial Summary & Checkout */}
          <div className="space-y-3 border-t border-slate-200 bg-[#F5F7FA] p-4">
            {canApplyDiscount && (
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'none' | 'percent' | 'fixed')}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-600"
                >
                  <option value="none">بدون خصم</option>
                  <option value="percent">خصم نسبة %</option>
                  <option value="fixed">خصم مبلغ ثابت</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  disabled={discountType === 'none'}
                  value={discountType === 'none' ? '' : discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  placeholder="قيمة الخصم"
                  className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono-num text-xs outline-none focus:border-teal-600 disabled:bg-slate-100"
                />
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">رسوم التوصيل</span>
                <input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)}
                  className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-left font-mono-num text-xs"
                />
              </div>
            )}

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span className="font-mono-num">{formatMoney(financials.subtotal, cur)}</span>
              </div>
              {financials.discountAmount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>الخصم</span>
                  <span className="font-mono-num">-{formatMoney(financials.discountAmount, cur)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>الصافي قبل الضريبة</span>
                <span className="font-mono-num">{formatMoney(financials.netBeforeTax, cur)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  الضريبة ({settings.vat_rate}% {settings.tax_inclusive ? 'شاملة' : 'مضافة'})
                </span>
                <span className="font-mono-num">{formatMoney(financials.taxAmount, cur)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-[#0B1D36]">
                <span>الإجمالي المطلوب</span>
                <span className="font-mono-num text-teal-700">{formatMoney(financials.grandTotal, cur)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { k: 'cash', label: 'نقدي' },
                { k: 'card', label: 'شبكة' },
                { k: 'transfer', label: 'تحويل' },
              ].map((pm) => (
                <button
                  key={pm.k}
                  type="button"
                  onClick={() => setPaymentMethod(pm.k as PaymentMethod)}
                  className={`rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                    paymentMethod === pm.k
                      ? 'border-[#0B1D36] bg-[#0B1D36] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && cart.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">المبلغ المدفوع:</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={String(financials.grandTotal)}
                    className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left font-mono-num text-xs"
                  />
                  <span className="font-mono-num font-semibold text-teal-700">
                    الباقي: {formatMoney(changePreview, cur)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaidAmount(String(financials.grandTotal))}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-[#0B1D36] hover:border-teal-600"
                  >
                    مطابق
                  </button>
                  {[50, 100, 200, 500].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPaidAmount(String(val))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 font-mono-num text-[11px] font-bold text-[#0B1D36] hover:border-teal-600"
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={() => void handleCheckout()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-orange-600/25 transition-all hover:from-orange-700 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitting ? 'جاري تسجيل الفاتورة...' : 'تأكيد الطلب وإصدار الفاتورة (F9)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Held / Parked Orders Modal */}
      {heldModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-extrabold text-[#0B1D36]">الطلبات المعلقة</h3>
                <p className="text-xs text-slate-500">استرجاع الفواتير التي تم إيقافها مؤقتاً لاستكمال الحساب</p>
              </div>
              <button
                onClick={() => setHeldModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto p-4">
              {heldOrders.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  لا توجد فواتير معلقة حالياً
                </div>
              ) : (
                heldOrders.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="text-sm font-bold text-[#0B1D36]">{h.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        الساعة {h.savedAt} · {h.cart.reduce((s, l) => s + l.qty, 0)} أصناف ·{' '}
                        <span className="font-mono-num font-bold text-teal-700">
                          {formatMoney(h.grandTotal, cur)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResumeHeldOrder(h)}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        <span>استرجاع</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => persistHeld(heldOrders.filter((x) => x.id !== h.id))}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-600"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Cashier Shift Summary / Z-Report Modal */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="no-print flex items-center justify-between border-b border-slate-200 bg-[#0B1D36] px-5 py-4 text-white">
              <div>
                <h3 className="text-base font-extrabold">ملخص وردية الكاشير اليومية (Z-Report)</h3>
                <p className="text-xs text-teal-300/90">إجمالي المبيعات والتحصيل لهذا اليوم</p>
              </div>
              <button
                onClick={() => setShiftModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              {shiftLoading ? (
                <div className="py-10 text-center text-xs text-slate-500">جاري حساب ملخص الوردية...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
                      <div className="text-[11px] text-slate-500">إجمالي مبيعات اليوم</div>
                      <div className="mt-1 font-mono-num text-lg font-extrabold text-teal-700">
                        {formatMoney(shiftStats.total, cur)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
                      <div className="text-[11px] text-slate-500">عدد الفواتير الفعالة</div>
                      <div className="mt-1 font-mono-num text-lg font-extrabold text-[#0B1D36]">
                        {shiftStats.count}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
                      <div className="text-[11px] text-slate-500">ضريبة القيمة المضافة</div>
                      <div className="mt-1 font-mono-num text-lg font-extrabold text-[#0B1D36]">
                        {formatMoney(shiftStats.vat, cur)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="text-[11px] text-slate-500">تحصيل نقدي (الكاش)</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#0B1D36]">
                        {formatMoney(shiftStats.cash, cur)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="text-[11px] text-slate-500">تحصيل الشبكة / البطاقة</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#0B1D36]">
                        {formatMoney(shiftStats.card, cur)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="text-[11px] text-slate-500">تحويلات بنكية</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#0B1D36]">
                        {formatMoney(shiftStats.transfer, cur)}
                      </div>
                    </div>
                  </div>

                  {todayOrders.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-right text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">رقم الفاتورة</th>
                            <th className="px-3 py-2.5 font-semibold">الوقت</th>
                            <th className="px-3 py-2.5 font-semibold">الدفع</th>
                            <th className="px-3 py-2.5 font-semibold">الإجمالي</th>
                            <th className="no-print px-3 py-2.5 font-semibold">عرض</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {todayOrders.slice(0, 15).map((ord) => (
                            <tr key={ord.id} className={ord.status === 'voided' ? 'bg-rose-50/40 text-slate-400' : ''}>
                              <td className="px-3 py-2 font-mono-num font-bold text-[#0B1D36]">{ord.invoice_no}</td>
                              <td className="px-3 py-2 font-mono-num">{ord.created_at.slice(11, 16)}</td>
                              <td className="px-3 py-2">
                                {ord.payment_method === 'cash' ? 'نقدي' : ord.payment_method === 'card' ? 'شبكة' : 'تحويل'}
                              </td>
                              <td className="px-3 py-2 font-mono-num font-bold text-teal-700">
                                {formatMoney(ord.grand_total, cur)}
                              </td>
                              <td className="no-print px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShiftModalOpen(false);
                                    onOrderCreated(ord);
                                  }}
                                  className="text-xs font-bold text-orange-600 hover:text-orange-700"
                                >
                                  فاتورة
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="no-print flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setShiftModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1D36] px-4 py-2 text-xs font-bold text-white hover:bg-[#132A4A]"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>طباعة ملخص الوردية</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Size & Addons Selection Modal */}
      {activeItem && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-extrabold text-[#0B1D36]">{activeItem.name}</h3>
                <p className="text-xs text-slate-500">{activeItem.description}</p>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label className="mb-2 block text-xs font-bold text-[#0B1D36]">اختر الحجم</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {activeItem.sizes.map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setPickedSize(sz)}
                      className={`rounded-lg border p-3 text-right transition-colors ${
                        pickedSize?.id === sz.id
                          ? 'border-teal-600 bg-teal-50 text-[#0B1D36]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-bold">{sz.size_name}</div>
                      <div className="mt-1 font-mono-num text-xs font-bold text-teal-700">
                        {formatMoney(sz.price, cur)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {addons.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-bold text-[#0B1D36]">الإضافات والمعدلات (اختياري)</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {addons.map((ad) => {
                      const checked = pickedAddonIds.includes(ad.id);
                      return (
                        <label
                          key={ad.id}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-xs ${
                            checked ? 'border-teal-600 bg-teal-50' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) setPickedAddonIds((p) => [...p, ad.id]);
                                else setPickedAddonIds((p) => p.filter((x) => x !== ad.id));
                              }}
                              className="accent-teal-600"
                            />
                            <span className="font-medium text-[#0B1D36]">{ad.name}</span>
                          </div>
                          <span className="font-mono-num font-semibold text-slate-700">
                            +{formatMoney(ad.price, cur)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#0B1D36]">ملاحظات المطبخ</label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="مثال: بدون بصل، شوي زيادة..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
              <button
                onClick={() => setActiveItem(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={addPickedToCart}
                disabled={!pickedSize}
                className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2 text-xs font-bold text-white hover:from-orange-700 hover:to-orange-600"
              >
                إضافة إلى الفاتورة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
