import * as XLSX from 'xlsx';
import type {
  DashboardData,
  FinancialAuditReport,
  Order,
  Ingredient,
  Expense,
  RestaurantSettings,
} from '../shared/types.ts';

function makeSheet(rows: Array<Record<string, unknown>>): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!views'] = [{ rightToLeft: true }];
  return ws;
}

export function exportFullErpWorkbook(params: {
  settings: RestaurantSettings;
  dashboard?: DashboardData | null;
  audit?: FinancialAuditReport | null;
  orders?: Order[];
  ingredients?: Ingredient[];
  expenses?: Expense[];
}): void {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  if (params.dashboard) {
    const k = params.dashboard.kpis;
    const summaryRows = [
      { البند: 'اسم المطعم', القيمة: params.settings.restaurant_name },
      { البند: 'الرقم الضريبي', القيمة: params.settings.tax_number },
      { البند: 'إجمالي المبيعات (شامل الضريبة)', القيمة: k.totalRevenue },
      { البند: 'صافي المبيعات (قبل الضريبة)', القيمة: k.netSalesBeforeTax },
      { البند: 'ضريبة القيمة المضافة المحصلة', القيمة: k.totalTax },
      { البند: 'إجمالي الخصومات', القيمة: k.totalDiscounts },
      { البند: 'تكلفة البضاعة المباعة (COGS)', القيمة: k.totalCogs },
      { البند: 'المصروفات التشغيلية', القيمة: k.totalExpenses },
      { البند: 'صافي الربح التشغيلي', القيمة: k.netProfit },
      { البند: 'هامش الربح الإجمالي %', القيمة: k.grossProfitMargin },
      { البند: 'عدد الطلبات الصالحة', القيمة: k.orderCount },
      { البند: 'متوسط قيمة الفاتورة', القيمة: k.averageOrderValue },
    ];
    XLSX.utils.book_append_sheet(wb, makeSheet(summaryRows), 'الملخص التنفيذي');

    const bestRows = params.dashboard.bestSellers.map((b, i) => ({
      '#': i + 1,
      الوجبة: b.item_name,
      الحجم: b.size_name,
      القسم: b.category_name,
      'الكمية المباعة': b.qty_sold,
      'إجمالي المبيعات': b.revenue,
      'التكلفة (COGS)': b.cogs,
      'مجمل الربح': b.profit,
    }));
    XLSX.utils.book_append_sheet(wb, makeSheet(bestRows), 'الأكثر مبيعاً');
  }

  if (params.orders && params.orders.length > 0) {
    const orderRows = params.orders.map((o) => ({
      'رقم الفاتورة': o.invoice_no,
      التاريخ: o.created_at,
      'نوع الطلب': o.order_type === 'dine_in' ? 'محلي' : o.order_type === 'takeaway' ? 'سفري' : 'توصيل',
      الحالة: o.status === 'completed' ? 'مكتمل' : o.status === 'voided' ? 'ملغي' : o.status === 'ready' ? 'جاهز' : 'قيد التحضير',
      'طريقة الدفع': o.payment_method === 'cash' ? 'نقدي' : o.payment_method === 'card' ? 'شبكة' : 'تحويل',
      'المجموع الفرعي': o.subtotal,
      الخصم: o.discount_amount,
      'الصافي قبل الضريبة': o.net_before_tax,
      الضريبة: o.tax_amount,
      التوصيل: o.delivery_fee,
      'الإجمالي النهائي': o.grand_total,
      'التكلفة (COGS)': o.total_cogs,
      الكاشير: o.created_by_name || '',
    }));
    XLSX.utils.book_append_sheet(wb, makeSheet(orderRows), 'الفواتير والمبيعات');
  }

  if (params.audit) {
    const auditRows = params.audit.integrityChecks.map((c) => ({
      المعرف: c.checkId,
      'فحص التدقيق': c.title,
      النتيجة: c.passed ? 'مطابق' : 'يوجد فرق',
      'القيمة المتوقعة': c.expectedValue,
      'القيمة الفعلية': c.actualValue,
      الفرق: c.variance,
      التفاصيل: c.details,
    }));
    XLSX.utils.book_append_sheet(wb, makeSheet(auditRows), 'التدقيق الحسابي');
  }

  if (params.ingredients && params.ingredients.length > 0) {
    const ingRows = params.ingredients.map((ing) => ({
      الرمز: ing.sku,
      المادة: ing.name,
      الوحدة: ing.unit,
      'الرصيد الحالي': ing.stock_qty,
      'حد الطلب': ing.min_threshold,
      'متوسط التكلفة': ing.unit_cost,
      'قيمة المخزون': Number((ing.stock_qty * ing.unit_cost).toFixed(2)),
      المورد: ing.supplier_name,
    }));
    XLSX.utils.book_append_sheet(wb, makeSheet(ingRows), 'المخزون والمستودع');
  }

  if (params.expenses && params.expenses.length > 0) {
    const expRows = params.expenses.map((e) => ({
      التاريخ: e.expense_date,
      البيان: e.title,
      التصنيف: e.category,
      المبلغ: e.amount,
      'طريقة السداد': e.payment_method === 'cash' ? 'نقدي' : e.payment_method === 'card' ? 'شبكة' : 'تحويل',
      المرجع: e.reference_no,
      ملاحظات: e.notes,
    }));
    XLSX.utils.book_append_sheet(wb, makeSheet(expRows), 'المصروفات');
  }

  const fileName = `Sufra_ERP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportSingleSheetExcel(filenamePrefix: string, sheetName: string, rows: Array<Record<string, unknown>>): void {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, makeSheet(rows), sheetName.slice(0, 30));
  XLSX.writeFile(wb, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
