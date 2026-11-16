import React, { useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Printer,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { apiRequest } from '../lib/api.ts';
import { exportFullErpWorkbook, exportSingleSheetExcel } from '../lib/exportExcel.ts';
import { formatMoney } from '../shared/money.ts';
import type { DashboardData, RestaurantSettings, Order } from '../shared/types.ts';

interface DashboardViewProps {
  settings: RestaurantSettings;
  canExport: boolean;
  onNavigate: (tab: string) => void;
  onInspectOrder: (order: Order) => void;
}

interface ChartPoint {
  label: string;
  fullDate: string;
  revenue: number;
  profit: number;
  costs: number;
  orders: number;
}

interface SalesTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
  currency: string;
  granularity: 'daily' | 'weekly';
}

const SalesChartTooltip: React.FC<SalesTooltipProps> = ({
  active,
  payload,
  currency,
  granularity,
}) => {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const pt = payload[0].payload;

  return (
    <div className="min-w-[210px] rounded-xl border border-[#132A4A] bg-[#0B1D36] p-3.5 text-xs text-white shadow-xl">
      <div className="mb-2 flex items-center justify-between border-b border-white/15 pb-1.5">
        <span className="font-bold text-teal-300">
          {granularity === 'weekly' ? `بداية الأسبوع: ${pt.fullDate}` : `التاريخ: ${pt.fullDate}`}
        </span>
        <span className="font-mono-num text-[11px] text-orange-300">{pt.orders} طلب</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-200">
            <span className="h-2 w-2 rounded-xs bg-white" />
            صافي المبيعات
          </span>
          <span className="font-mono-num font-bold text-white">{formatMoney(pt.revenue, currency)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-teal-200">
            <span className="h-2 w-2 rounded-xs bg-teal-400" />
            صافي الربح
          </span>
          <span
            className={`font-mono-num font-bold ${
              pt.profit >= 0 ? 'text-teal-300' : 'text-rose-300'
            }`}
          >
            {formatMoney(pt.profit, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-orange-400" />
            التكاليف والمصروفات
          </span>
          <span className="font-mono-num font-semibold text-orange-200">
            {formatMoney(pt.costs, currency)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  canExport,
  onNavigate,
  onInspectOrder,
}) => {
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');
  const [chartStyle, setChartStyle] = useState<'bar' | 'area'>('bar');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard(rangeDays: number) {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<DashboardData>(`/api/dashboard?days=${rangeDays}`);
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard(days);
  }, [days]);

  const cur = settings.currency_symbol;

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    if (granularity === 'weekly') {
      return (data.weeklySeries || []).map((w) => ({
        label: w.label,
        fullDate: w.weekStart,
        revenue: w.revenue,
        profit: w.profit,
        costs: Number((w.cogs + w.expenses).toFixed(2)),
        orders: w.orders,
      }));
    }
    return data.dailySeries.map((d) => ({
      label: d.date.slice(5),
      fullDate: d.date,
      revenue: d.revenue,
      profit: d.profit,
      costs: Number((d.cogs + d.expenses).toFixed(2)),
      orders: d.orders,
    }));
  }, [data, granularity]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-center text-sm text-rose-700">
        {error || 'تعذر تحميل بيانات لوحة التحكم'}
      </div>
    );
  }

  const {
    kpis,
    bestSellers,
    categoryBreakdown,
    orderTypeBreakdown,
    paymentBreakdown,
    lowStockIngredients,
    recentOrders,
  } = data;

  const orderTypeLabels: Record<string, string> = {
    dine_in: 'محلي (طاولات)',
    takeaway: 'سفري',
    delivery: 'توصيل',
  };

  const paymentLabels: Record<string, string> = {
    cash: 'نقدي',
    card: 'شبكة / مدى',
    transfer: 'تحويل بنكي',
  };

  const periodOptions = [
    { d: 1, label: 'اليوم' },
    { d: 7, label: '7 أيام' },
    { d: 30, label: '30 يوماً' },
    { d: 90, label: '90 يوماً' },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(11,29,54,0.03)]">
          {periodOptions.map((opt) => (
            <button
              key={opt.d}
              onClick={() => setDays(opt.d)}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                days === opt.d
                  ? 'bg-[#0B1D36] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B1D36]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadDashboard(days)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#0B1D36] hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5 text-teal-600" />
            <span>تحديث</span>
          </button>

          {canExport && (
            <>
              <button
                onClick={() =>
                  exportFullErpWorkbook({
                    settings,
                    dashboard: data,
                    orders: recentOrders,
                    ingredients: lowStockIngredients,
                  })
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-600/30 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
              >
                <FileSpreadsheet className="h-4 w-4 text-teal-700" />
                <span>تصدير Excel</span>
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0B1D36] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#132A4A]"
              >
                <Printer className="h-4 w-4 text-teal-300" />
                <span>طباعة / PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Print Header */}
      <div className="print-only border-b border-slate-300 pb-4">
        <h1 className="text-xl font-bold">{settings.restaurant_name} — التقرير التنفيذي</h1>
        <p className="text-xs text-slate-600">
          الفترة: آخر {days} يوم · الرقم الضريبي: {settings.tax_number} · تاريخ الطباعة:{' '}
          {new Date().toLocaleDateString('ar-SA')}
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="luxury-card rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>إجمالي المبيعات (شامل الضريبة)</span>
            <span className="h-1.5 w-6 rounded-full bg-[#0B1D36]" />
          </div>
          <div className="mt-2.5 font-mono-num text-2xl font-extrabold text-[#0B1D36]">
            {formatMoney(kpis.totalRevenue, cur)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            اليوم: <span className="font-semibold text-[#0B1D36]">{formatMoney(kpis.todayRevenue, cur)}</span> ·{' '}
            {kpis.todayOrders} طلب
          </div>
        </div>

        <div className="luxury-card rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>صافي الربح التشغيلي</span>
            <span className="h-1.5 w-6 rounded-full bg-teal-600" />
          </div>
          <div
            className={`mt-2.5 font-mono-num text-2xl font-extrabold ${
              kpis.netProfit >= 0 ? 'text-teal-700' : 'text-rose-700'
            }`}
          >
            {formatMoney(kpis.netProfit, cur)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            هامش إجمالي الربح: <span className="font-semibold text-teal-700">{kpis.grossProfitMargin}%</span> ·
            بعد التكلفة والمصروفات
          </div>
        </div>

        <div className="luxury-card rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>إجمالي الطلبات ومتوسط الفاتورة</span>
            <span className="h-1.5 w-6 rounded-full bg-orange-500" />
          </div>
          <div className="mt-2.5 font-mono-num text-2xl font-extrabold text-[#0B1D36]">
            {kpis.orderCount.toLocaleString('en-US')} طلب
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            متوسط الفاتورة:{' '}
            <span className="font-semibold text-[#0B1D36]">{formatMoney(kpis.averageOrderValue, cur)}</span> · ملغي:{' '}
            {kpis.voidedCount}
          </div>
        </div>

        <div className="luxury-card rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>الضريبة والتكاليف والمصروفات</span>
            <span className="h-1.5 w-6 rounded-full bg-slate-300" />
          </div>
          <div className="mt-2.5 font-mono-num text-2xl font-extrabold text-[#0B1D36]">
            {formatMoney(kpis.totalTax, cur)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            تكلفة البضاعة: {formatMoney(kpis.totalCogs, cur)} · مصروفات: {formatMoney(kpis.totalExpenses, cur)}
          </div>
        </div>
      </div>

      {/* Main Analytics Row: Interactive Recharts Sales Chart + Channel & Payment Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="luxury-card rounded-xl p-5 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-[#0B1D36]">
                {granularity === 'daily'
                  ? 'الأداء المالي والمبيعات اليومية'
                  : 'تحليل المبيعات والأرباح الأسبوعية'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {granularity === 'daily'
                  ? `عرض المبيعات اليومية وصافي الربح خلال آخر ${days === 1 ? 'يوم' : `${days} يوماً`}`
                  : `تجميع المبيعات وصافي الربح أسبوعياً (${days >= 56 ? `آخر ${days} يوماً` : 'آخر 8 أسابيع'})`}
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              {/* Daily / Weekly Granularity Switcher */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-[#F5F7FA] p-0.5">
                <button
                  type="button"
                  onClick={() => setGranularity('daily')}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                    granularity === 'daily'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-[#0B1D36]'
                  }`}
                >
                  يومي
                </button>
                <button
                  type="button"
                  onClick={() => setGranularity('weekly')}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                    granularity === 'weekly'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-[#0B1D36]'
                  }`}
                >
                  أسبوعي
                </button>
              </div>

              {/* Bar / Area Chart Type Switcher */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-[#F5F7FA] p-0.5">
                <button
                  type="button"
                  onClick={() => setChartStyle('bar')}
                  title="رسم أعمدة"
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    chartStyle === 'bar'
                      ? 'bg-[#0B1D36] text-white'
                      : 'text-slate-600 hover:text-[#0B1D36]'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>أعمدة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartStyle('area')}
                  title="منحنى مساحي"
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    chartStyle === 'area'
                      ? 'bg-[#0B1D36] text-white'
                      : 'text-slate-600 hover:text-[#0B1D36]'
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>منحنى</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0B1D36]" /> صافي المبيعات
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-600" /> صافي الربح
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-orange-500" /> التكاليف والمصروفات
              </span>
            </div>

            <div className="no-print flex items-center gap-1 text-[11px]">
              <span className="text-slate-500">النطاق:</span>
              {periodOptions.map((opt) => (
                <button
                  key={opt.d}
                  type="button"
                  onClick={() => setDays(opt.d)}
                  className={`rounded px-2 py-0.5 font-semibold transition-colors ${
                    days === opt.d
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-500">
              لا توجد بيانات مبيعات ضمن النطاق الزمني المحدد
            </div>
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                {chartStyle === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#475569', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(13, 148, 136, 0.08)' }}
                      content={<SalesChartTooltip currency={cur} granularity={granularity} />}
                    />
                    <Bar
                      dataKey="revenue"
                      name="صافي المبيعات"
                      fill="#0B1D36"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="profit"
                      name="صافي الربح"
                      fill="#0D9488"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="costs"
                      name="التكاليف والمصروفات"
                      fill="#EA580C"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={26}
                    />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0B1D36" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#0B1D36" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9488" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#475569', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      content={<SalesChartTooltip currency={cur} granularity={granularity} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="صافي المبيعات"
                      stroke="#0B1D36"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revGrad)"
                      activeDot={{ r: 5, fill: '#0B1D36', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="صافي الربح"
                      stroke="#0D9488"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#profGrad)"
                      activeDot={{ r: 5, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="costs"
                      name="التكاليف والمصروفات"
                      stroke="#EA580C"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fillOpacity={0}
                      activeDot={{ r: 4, fill: '#EA580C', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Breakdown Panel */}
        <div className="luxury-card flex flex-col justify-between rounded-xl p-5 lg:col-span-4">
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-extrabold text-[#0B1D36]">توزيع المبيعات حسب القناة</h3>
              <div className="mt-3 space-y-2.5">
                {orderTypeBreakdown.map((ot) => {
                  const pct = kpis.totalRevenue > 0 ? Math.round((ot.revenue / kpis.totalRevenue) * 100) : 0;
                  return (
                    <div key={ot.order_type}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">
                          {orderTypeLabels[ot.order_type] || ot.order_type} ({ot.count})
                        </span>
                        <span className="font-mono-num font-semibold text-[#0B1D36]">
                          {formatMoney(ot.revenue, cur)} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-teal-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-extrabold text-[#0B1D36]">توزيع طرق التحصيل</h3>
              <div className="mt-3 space-y-2">
                {paymentBreakdown.map((pm) => (
                  <div key={pm.payment_method} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      {paymentLabels[pm.payment_method] || pm.payment_method} ({pm.count} عملية)
                    </span>
                    <span className="font-mono-num font-semibold text-[#0B1D36]">
                      {formatMoney(pm.revenue, cur)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-extrabold text-[#0B1D36]">مبيعات الأقسام</h3>
              <div className="mt-3 space-y-2">
                {categoryBreakdown.slice(0, 5).map((cat) => (
                  <div key={cat.category_name} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-700">
                      {cat.category_name} ({cat.qty_sold} قطعة)
                    </span>
                    <span className="font-mono-num font-semibold text-[#0B1D36]">
                      {formatMoney(cat.revenue, cur)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Best Sellers Table + Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="luxury-card overflow-hidden rounded-xl lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-600" />
              <h2 className="text-base font-extrabold text-[#0B1D36]">الوجبات والأصناف الأكثر مبيعاً</h2>
            </div>
            {canExport && (
              <button
                onClick={() =>
                  exportSingleSheetExcel(
                    'Best_Sellers',
                    'الأكثر مبيعاً',
                    bestSellers.map((b, i) => ({
                      الترتيب: i + 1,
                      الوجبة: b.item_name,
                      الحجم: b.size_name,
                      القسم: b.category_name,
                      'الكمية المباعة': b.qty_sold,
                      'المبيعات': b.revenue,
                      'التكلفة': b.cogs,
                      'الربح': b.profit,
                    }))
                  )
                }
                className="no-print text-xs font-semibold text-teal-700 hover:underline"
              >
                تصدير الجدول Excel
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">الوجبة والحجم</th>
                  <th className="px-4 py-3 font-semibold">القسم</th>
                  <th className="px-4 py-3 text-center font-semibold">الكمية</th>
                  <th className="px-4 py-3 text-left font-semibold">المبيعات</th>
                  <th className="px-4 py-3 text-left font-semibold">التكلفة</th>
                  <th className="px-4 py-3 text-left font-semibold">مجمل الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bestSellers.map((item, idx) => (
                  <tr key={`${item.menu_item_id}-${item.size_name}`} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono-num text-xs text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-[#0B1D36]">{item.item_name}</span>
                      <span className="mr-1.5 text-xs text-slate-500">· {item.size_name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{item.category_name}</td>
                    <td className="px-4 py-2.5 text-center font-mono-num font-semibold text-[#0B1D36]">
                      {item.qty_sold}
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono-num text-[#0B1D36]">
                      {formatMoney(item.revenue, cur)}
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono-num text-slate-500">
                      {formatMoney(item.cogs, cur)}
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono-num font-bold text-teal-700">
                      {formatMoney(item.profit, cur)}
                    </td>
                  </tr>
                ))}
                {bestSellers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                      لا توجد مبيعات مسجلة حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock & Recent Orders */}
        <div className="space-y-6 lg:col-span-4">
          <div className="luxury-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-extrabold text-[#0B1D36]">تنبيهات نقص المخزون</h3>
              </div>
              <button
                onClick={() => onNavigate('inventory')}
                className="no-print text-xs font-semibold text-teal-700 hover:underline"
              >
                إدارة المستودع
              </button>
            </div>

            {lowStockIngredients.length === 0 ? (
              <p className="mt-4 text-xs text-teal-700">جميع المواد الأولية فوق حد الطلب الآمن.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {lowStockIngredients.map((ing) => (
                  <div key={ing.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-[#0B1D36]">{ing.name}</div>
                      <div className="text-slate-500">
                        الحد الأدنى: <span className="font-mono-num">{ing.min_threshold}</span> {ing.unit}
                      </div>
                    </div>
                    <div className="text-left font-mono-num font-bold text-orange-600">
                      {ing.stock_qty} {ing.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="luxury-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0B1D36]">أحدث الفواتير</h3>
              <button
                onClick={() => onNavigate('orders')}
                className="no-print text-xs font-semibold text-teal-700 hover:underline"
              >
                كل الطلبات
              </button>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {recentOrders.slice(0, 5).map((ord) => (
                <button
                  key={ord.id}
                  onClick={() => onInspectOrder(ord)}
                  className="flex w-full items-center justify-between py-2.5 text-right transition-colors hover:bg-slate-50"
                >
                  <div>
                    <div className="font-mono-num text-xs font-semibold text-[#0B1D36]">{ord.invoice_no}</div>
                    <div className="text-[11px] text-slate-500">
                      {orderTypeLabels[ord.order_type]} · {ord.created_at.slice(11, 16)}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-mono-num text-xs font-bold text-[#0B1D36]">
                      {formatMoney(ord.grand_total, cur)}
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        ord.status === 'voided'
                          ? 'text-rose-600'
                          : ord.status === 'completed'
                            ? 'text-teal-700'
                            : 'text-orange-600'
                      }`}
                    >
                      {ord.status === 'voided'
                        ? 'ملغي'
                        : ord.status === 'completed'
                          ? 'مكتمل'
                          : ord.status === 'ready'
                            ? 'جاهز'
                            : 'قيد التحضير'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
