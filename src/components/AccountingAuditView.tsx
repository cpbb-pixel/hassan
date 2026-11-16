import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  Plus,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { exportFullErpWorkbook } from '../lib/exportExcel.ts';
import { formatMoney } from '../shared/money.ts';
import type {
  AuditLog,
  Expense,
  FinancialAuditReport,
  PaymentMethod,
  RestaurantSettings,
} from '../shared/types.ts';

interface AccountingAuditViewProps {
  settings: RestaurantSettings;
  canManageExpenses: boolean;
  canExport: boolean;
}

export const AccountingAuditView: React.FC<AccountingAuditViewProps> = ({
  settings,
  canManageExpenses,
  canExport,
}) => {
  const [subTab, setSubTab] = useState<'audit' | 'expenses' | 'logs'>('audit');
  const [audit, setAudit] = useState<FinancialAuditReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');

  // New Expense Form
  const [expTitle, setExpTitle] = useState('');
  const [expCat, setExpCat] = useState('تشغيلية');
  const [expAmt, setExpAmt] = useState('');
  const [expPay, setExpPay] = useState<PaymentMethod>('cash');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expRef, setExpRef] = useState('');

  const cur = settings.currency_symbol;

  async function loadAll() {
    setError('');
    try {
      const [audRes, expRes, logRes] = await Promise.all([
        apiRequest<FinancialAuditReport>('/api/accounting/audit'),
        apiRequest<Expense[]>('/api/expenses'),
        apiRequest<AuditLog[]>('/api/audit-logs'),
      ]);
      setAudit(audRes);
      setExpenses(expRes);
      setLogs(logRes);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expTitle.trim() || Number(expAmt) <= 0) return;
    try {
      await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          title: expTitle,
          category: expCat,
          amount: Number(expAmt),
          payment_method: expPay,
          expense_date: expDate,
          reference_no: expRef,
        }),
      });
      setExpTitle('');
      setExpAmt('');
      setExpRef('');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteExpense(id: number) {
    await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setSubTab('audit')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'audit' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            قائمة الدخل والتدقيق الحسابي
          </button>
          <button
            onClick={() => setSubTab('expenses')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'expenses' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            المصروفات التشغيلية ({expenses.length})
          </button>
          <button
            onClick={() => setSubTab('logs')}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold ${
              subTab === 'logs' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            سجل الرقابة والأمان ({logs.length})
          </button>
        </div>

        {canExport && audit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportFullErpWorkbook({ settings, audit, expenses })}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>تصدير التدقيق Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0B1D36] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#132A4A]"
            >
              <Printer className="h-4 w-4" />
              <span>طباعة التقرير المالي PDF</span>
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</div>}

      {subTab === 'audit' && audit && (
        <div className="space-y-6">
          {/* Print Header */}
          <div className="print-only border-b border-slate-300 pb-4">
            <h1 className="text-xl font-bold">{settings.restaurant_name} — التقرير المالي والتدقيق المحاسبي</h1>
            <p className="text-xs text-slate-600">
              الرقم الضريبي: {settings.tax_number} · تاريخ التقرير: {new Date().toLocaleString('ar-SA')}
            </p>
          </div>

          {/* Audit Status Banner */}
          <div
            className={`flex items-center justify-between rounded-xl border p-4 ${
              audit.allPassed
                ? 'border-teal-200 bg-teal-50 text-teal-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {audit.allPassed ? (
                <ShieldCheck className="h-6 w-6 shrink-0 text-teal-700" />
              ) : (
                <AlertTriangle className="h-6 w-6 shrink-0 text-rose-700" />
              )}
              <div>
                <div className="text-sm font-bold">
                  {audit.allPassed
                    ? 'نتيجة التدقيق الحسابي: جميع المعادلات المحاسبية والفواتير مطابقة بنسبة 100%'
                    : 'تنبيه تدقيق: تم رصد فروقات حسابية تستدعي المراجعة'}
                </div>
                <div className="text-xs opacity-80">
                  تم فحص {audit.orderAudits.length} فاتورة وإجراء {audit.integrityChecks.length} فحوصات تطابق بالهللة
                </div>
              </div>
            </div>
            <button
              onClick={() => void loadAll()}
              className="no-print rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white"
            >
              إعادة التدقيق الآن
            </button>
          </div>

          {/* P&L Statement & Cash Reconciliation */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <h3 className="border-b border-slate-200 pb-3 text-base font-bold text-[#0B1D36]">
                قائمة الدخل والأرباح والخسائر (P&L)
              </h3>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">إجمالي المبيعات قبل الخصم</span>
                  <span className="font-mono-num font-semibold text-[#0B1D36]">
                    {formatMoney(audit.summary.grossSalesWithTax, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">(-) إجمالي الخصومات الممنوحة</span>
                  <span className="font-mono-num text-rose-700">
                    -{formatMoney(audit.summary.totalDiscounts, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">(-) ضريبة القيمة المضافة المحصلة (أمانة للهيئة)</span>
                  <span className="font-mono-num text-slate-700">
                    {formatMoney(audit.summary.totalVatCollected, cur)}
                  </span>
                </div>
                <div className="flex justify-between bg-slate-50 px-2 py-2.5 font-semibold">
                  <span className="text-[#0B1D36]">صافي الإيرادات (قبل الضريبة والتوصيل)</span>
                  <span className="font-mono-num text-[#0B1D36]">
                    {formatMoney(audit.summary.netSalesExclTax, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">(-) تكلفة البضاعة المباعة (COGS — وفق الوصفات)</span>
                  <span className="font-mono-num text-rose-700">-{formatMoney(audit.summary.totalCogs, cur)}</span>
                </div>
                <div className="flex justify-between py-2.5 font-bold">
                  <span className="text-[#0B1D36]">مجمل الربح (Gross Profit)</span>
                  <span className="font-mono-num text-teal-700">
                    {formatMoney(audit.summary.grossProfit, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">(-) المصروفات التشغيلية</span>
                  <span className="font-mono-num text-rose-700">
                    -{formatMoney(audit.summary.operatingExpenses, cur)}
                  </span>
                </div>
                <div className="flex justify-between bg-teal-50/70 px-2 py-3 text-base font-extrabold">
                  <span className="text-[#0B1D36]">
                    صافي الربح التشغيلي ({audit.summary.netProfitMarginPct}%)
                  </span>
                  <span
                    className={`font-mono-num ${
                      audit.summary.netOperatingProfit >= 0 ? 'text-teal-800' : 'text-rose-700'
                    }`}
                  >
                    {formatMoney(audit.summary.netOperatingProfit, cur)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <h3 className="border-b border-slate-200 pb-3 text-base font-bold text-[#0B1D36]">
                مطابقة الصندوق وقنوات التحصيل
              </h3>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">مبيعات نقدية (Cash)</span>
                  <span className="font-mono-num font-semibold text-[#0B1D36]">
                    {formatMoney(audit.summary.cashSalesTotal, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">مبيعات شبكة / مدى (Card)</span>
                  <span className="font-mono-num font-semibold text-[#0B1D36]">
                    {formatMoney(audit.summary.cardSalesTotal, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">تحويلات بنكية (Transfer)</span>
                  <span className="font-mono-num font-semibold text-[#0B1D36]">
                    {formatMoney(audit.summary.transferSalesTotal, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 font-semibold">
                  <span className="text-[#0B1D36]">إجمالي المقبوضات (شامل الضريبة والتوصيل)</span>
                  <span className="font-mono-num text-teal-700">
                    {formatMoney(audit.summary.totalGrandRevenue, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-600">(-) مصروفات مسددة نقداً من الدرج</span>
                  <span className="font-mono-num text-rose-700">
                    -{formatMoney(audit.summary.cashExpensesTotal, cur)}
                  </span>
                </div>
                <div className="flex justify-between bg-slate-50 px-2 py-3 font-extrabold">
                  <span className="text-[#0B1D36]">الرصيد النقدي المتوقع في الدرج</span>
                  <span className="font-mono-num text-[#0B1D36]">
                    {formatMoney(audit.summary.expectedCashInDrawer, cur)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 text-xs text-slate-500">
                  <span>فواتير ملغاة مستبعدة ({audit.summary.voidedOrdersCount})</span>
                  <span className="font-mono-num">{formatMoney(audit.summary.voidedOrdersValue, cur)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 5 Mathematical Integrity Checks */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold text-[#0B1D36]">اختبارات المطابقة والتدقيق الآلي</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">البند</th>
                    <th className="px-4 py-3 text-left font-semibold">القيمة المتوقعة</th>
                    <th className="px-4 py-3 text-left font-semibold">القيمة المسجلة</th>
                    <th className="px-4 py-3 text-left font-semibold">الفرق</th>
                    <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audit.integrityChecks.map((chk) => (
                    <tr key={chk.checkId}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0B1D36]">{chk.title}</div>
                        <div className="text-xs text-slate-500">{chk.details}</div>
                      </td>
                      <td className="px-4 py-3 text-left font-mono-num text-xs text-slate-700">
                        {chk.expectedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-left font-mono-num text-xs text-slate-700">
                        {chk.actualValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-left font-mono-num text-xs font-bold text-[#0B1D36]">
                        {chk.variance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold ${
                            chk.passed ? 'text-teal-700' : 'text-rose-700'
                          }`}
                        >
                          {chk.passed ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          <span>{chk.passed ? 'مطابق' : 'فرق'}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-invoice Verification */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-[#0B1D36]">سجل تدقيق الفواتير الفردية</h3>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">الفاتورة</th>
                    <th className="px-4 py-2.5 font-semibold">الحالة</th>
                    <th className="px-4 py-2.5 text-left font-semibold">المسجل</th>
                    <th className="px-4 py-2.5 text-left font-semibold">المعاد حسابه</th>
                    <th className="px-4 py-2.5 text-left font-semibold">الفرق</th>
                    <th className="px-4 py-2.5 text-center font-semibold">النتيجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audit.orderAudits.map((oa) => (
                    <tr key={oa.order_id}>
                      <td className="px-4 py-2 font-mono-num font-semibold text-[#0B1D36]">{oa.invoice_no}</td>
                      <td className="px-4 py-2 text-slate-600">{oa.status === 'voided' ? 'ملغي' : 'معتمد'}</td>
                      <td className="px-4 py-2 text-left font-mono-num">{formatMoney(oa.recorded_grand_total, cur)}</td>
                      <td className="px-4 py-2 text-left font-mono-num">{formatMoney(oa.recomputed_grand_total, cur)}</td>
                      <td className="px-4 py-2 text-left font-mono-num">{oa.variance.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center font-bold">
                        <span className={oa.passed ? 'text-teal-700' : 'text-rose-700'}>
                          {oa.passed ? 'صحيح' : 'خلل'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {canManageExpenses && (
            <form onSubmit={addExpense} className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
              <h3 className="text-sm font-bold text-[#0B1D36]">تسجيل مصروف تشغيلي</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="البيان (مثال: فاتورة غاز، رواتب)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
                <select
                  value={expCat}
                  onChange={(e) => setExpCat(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="تشغيلية">مصروفات تشغيلية</option>
                  <option value="إيجارات ومرافق">إيجارات ومرافق</option>
                  <option value="رواتب وأجور">رواتب وأجور</option>
                  <option value="كهرباء ومياه">كهرباء ومياه</option>
                  <option value="صيانة">صيانة</option>
                  <option value="تغليف وتشغيل">تغليف وتشغيل</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={expAmt}
                    onChange={(e) => setExpAmt(e.target.value)}
                    placeholder={`المبلغ (${cur})`}
                    className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                    required
                  />
                  <select
                    value={expPay}
                    onChange={(e) => setExpPay(e.target.value as PaymentMethod)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="cash">نقدي</option>
                    <option value="transfer">تحويل</option>
                    <option value="card">بطاقة</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-xs"
                  />
                  <input
                    type="text"
                    value={expRef}
                    onChange={(e) => setExpRef(e.target.value)}
                    placeholder="رقم المرجع"
                    className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  <Plus className="h-4 w-4" />
                  <span>إثبات المصروف</span>
                </button>
              </div>
            </form>
          )}

          <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${canManageExpenses ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">التاريخ</th>
                  <th className="px-4 py-3 font-semibold">البيان</th>
                  <th className="px-4 py-3 font-semibold">التصنيف</th>
                  <th className="px-4 py-3 text-left font-semibold">المبلغ</th>
                  {canManageExpenses && <th className="px-4 py-3 text-left font-semibold">حذف</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{ex.expense_date}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-[#0B1D36]">{ex.title}</div>
                      {ex.reference_no && <div className="font-mono-num text-[11px] text-slate-500">{ex.reference_no}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{ex.category}</td>
                    <td className="px-4 py-3 text-left font-mono-num text-xs font-bold text-rose-700">
                      {formatMoney(ex.amount, cur)}
                    </td>
                    {canManageExpenses && (
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => void deleteExpense(ex.id)}
                          className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">التوقيت</th>
                  <th className="px-4 py-3 font-semibold">المستخدم</th>
                  <th className="px-4 py-3 font-semibold">الإجراء</th>
                  <th className="px-4 py-3 font-semibold">الكيان</th>
                  <th className="px-4 py-3 font-semibold">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 font-mono-num text-slate-500">{l.created_at.slice(0, 19)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#0B1D36]">{l.username}</td>
                    <td className="px-4 py-2.5 font-mono-num text-teal-700">{l.action}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {l.entity_type} #{l.entity_id}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 font-mono-num text-[11px] text-slate-500">
                      {JSON.stringify(l.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
