import React from 'react';
import { Printer, X } from 'lucide-react';
import { formatMoney } from '../shared/money.ts';
import type { Order, RestaurantSettings } from '../shared/types.ts';

interface ReceiptModalProps {
  order: Order | null;
  settings: RestaurantSettings;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ order, settings, onClose }) => {
  if (!order) return null;

  const orderTypeLabel =
    order.order_type === 'dine_in'
      ? `محلي${order.table_number ? ` — طاولة ${order.table_number}` : ''}`
      : order.order_type === 'takeaway'
        ? 'سفري'
        : 'توصيل';

  const paymentLabel =
    order.payment_method === 'cash' ? 'نقدي' : order.payment_method === 'card' ? 'شبكة / بطاقة' : 'تحويل بنكي';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-base font-extrabold text-[#0B1D36]">معاينة الفاتورة الضريبية المبسطة</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0B1D36]"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div id="printable-receipt" className="max-h-[70vh] overflow-y-auto p-6 text-[#0B1D36]">
          <div className="border-b border-dashed border-slate-300 pb-4 text-center">
            <h2 className="text-lg font-extrabold text-[#0B1D36]">{settings.restaurant_name}</h2>
            <p className="mt-0.5 text-xs text-slate-600">{settings.address}</p>
            <p className="text-xs text-slate-600">
              هاتف: <span className="font-mono-num">{settings.phone}</span> · الرقم الضريبي:{' '}
              <span className="font-mono-num">{settings.tax_number}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-y-1.5 border-b border-dashed border-slate-300 py-3 text-xs">
            <div>
              <span className="text-slate-500">رقم الفاتورة: </span>
              <span className="font-mono-num font-semibold">{order.invoice_no}</span>
            </div>
            <div className="text-left">
              <span className="text-slate-500">النوع: </span>
              <span className="font-semibold">{orderTypeLabel}</span>
            </div>
            <div>
              <span className="text-slate-500">التاريخ: </span>
              <span className="font-mono-num">{order.created_at.slice(0, 16)}</span>
            </div>
            <div className="text-left">
              <span className="text-slate-500">الدفع: </span>
              <span className="font-semibold">{paymentLabel}</span>
            </div>
            {order.customer_name && (
              <div className="col-span-2">
                <span className="text-slate-500">العميل: </span>
                <span>
                  {order.customer_name} ({order.customer_phone})
                </span>
              </div>
            )}
          </div>

          <table className="w-full border-b border-dashed border-slate-300 py-2 text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-right font-medium">الصنف / الحجم</th>
                <th className="py-2 text-center font-medium">ك</th>
                <th className="py-2 text-left font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2">
                    <div className="font-semibold text-[#0B1D36]">
                      {it.item_name} <span className="text-slate-500">({it.size_name})</span>
                    </div>
                    {it.addons.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        + {it.addons.map((a) => a.name).join('، ')}
                      </div>
                    )}
                    {it.notes && <div className="text-[11px] text-orange-700">ملاحظة: {it.notes}</div>}
                  </td>
                  <td className="py-2 text-center font-mono-num">{it.qty}</td>
                  <td className="py-2 text-left font-mono-num font-medium">
                    {formatMoney(it.line_total, settings.currency_symbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 border-b border-dashed border-slate-300 py-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">المجموع الفرعي</span>
              <span className="font-mono-num">{formatMoney(order.subtotal, settings.currency_symbol)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>الخصم</span>
                <span className="font-mono-num">-{formatMoney(order.discount_amount, settings.currency_symbol)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">الصافي الخاضع للضريبة</span>
              <span className="font-mono-num">{formatMoney(order.net_before_tax, settings.currency_symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">
                ضريبة القيمة المضافة ({order.tax_rate}% {order.tax_inclusive ? 'شاملة' : 'مضافة'})
              </span>
              <span className="font-mono-num">{formatMoney(order.tax_amount, settings.currency_symbol)}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">رسوم التوصيل</span>
                <span className="font-mono-num">{formatMoney(order.delivery_fee, settings.currency_symbol)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-[#0B1D36]">
              <span>الإجمالي النهائي</span>
              <span className="font-mono-num text-teal-700">{formatMoney(order.grand_total, settings.currency_symbol)}</span>
            </div>
            {order.payment_method === 'cash' && order.change_amount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>المدفوع / الباقي</span>
                <span className="font-mono-num">
                  {formatMoney(order.paid_amount, settings.currency_symbol)} /{' '}
                  {formatMoney(order.change_amount, settings.currency_symbol)}
                </span>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">{settings.receipt_footer}</p>
        </div>

        <div className="no-print flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            إغلاق
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-sm font-bold text-white hover:from-orange-700 hover:to-orange-600"
          >
            <Printer className="h-4 w-4" />
            <span>طباعة / حفظ PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
