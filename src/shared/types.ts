export type PermissionKey =
  | 'dashboard.view'
  | 'pos.create_order'
  | 'pos.apply_discount'
  | 'pos.void_order'
  | 'menu.view'
  | 'menu.manage'
  | 'tables.view'
  | 'tables.manage'
  | 'inventory.view'
  | 'inventory.manage'
  | 'accounting.view'
  | 'accounting.manage_expenses'
  | 'accounting.audit'
  | 'reports.export'
  | 'users.manage'
  | 'settings.manage';

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  group: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { key: 'dashboard.view', label: 'عرض لوحة التحكم والإحصائيات', group: 'لوحة التحكم' },
  { key: 'pos.create_order', label: 'إنشاء فواتير ونقطة البيع (POS)', group: 'نقطة البيع والطلبات' },
  { key: 'pos.apply_discount', label: 'تطبيق خصومات على الفواتير', group: 'نقطة البيع والطلبات' },
  { key: 'pos.void_order', label: 'إلغاء الفواتير وعكس المخزون', group: 'نقطة البيع والطلبات' },
  { key: 'menu.view', label: 'عرض قائمة الطعام والأصناف', group: 'قائمة الطعام' },
  { key: 'menu.manage', label: 'إضافة وتعديل وحذف الأقسام والأحجام والوجبات', group: 'قائمة الطعام' },
  { key: 'tables.view', label: 'عرض الطاولات وحالة الصالة', group: 'الطاولات والمطبخ' },
  { key: 'tables.manage', label: 'إدارة الطاولات وتحديث حالة الطلبات', group: 'الطاولات والمطبخ' },
  { key: 'inventory.view', label: 'عرض المخزون والمكونات والوصفات', group: 'المخزون والمشتريات' },
  { key: 'inventory.manage', label: 'إدارة الموردين والمشتريات وتسوية الجرد', group: 'المخزون والمشتريات' },
  { key: 'accounting.view', label: 'عرض التقارير المالية وقائمة الدخل', group: 'المحاسبة والتدقيق' },
  { key: 'accounting.manage_expenses', label: 'إضافة وحذف المصروفات التشغيلية', group: 'المحاسبة والتدقيق' },
  { key: 'accounting.audit', label: 'تشغيل التدقيق الحسابي وسجل الرقابة', group: 'المحاسبة والتدقيق' },
  { key: 'reports.export', label: 'تصدير ملفات Excel و PDF', group: 'التقارير والتصدير' },
  { key: 'users.manage', label: 'إدارة المستخدمين والأدوار والصلاحيات', group: 'الإدارة والأمان' },
  { key: 'settings.manage', label: 'تعديل إعدادات المطعم والضريبة', group: 'الإدارة والأمان' },
];

export interface Role {
  id: number;
  name: string;
  display_name: string;
  description: string;
  permissions: PermissionKey[];
  is_system: number;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name?: string;
  role_display_name?: string;
  permissions: PermissionKey[];
  active: number;
  created_at: string;
}

export interface RestaurantSettings {
  id: number;
  restaurant_name: string;
  tax_number: string;
  phone: string;
  address: string;
  currency_symbol: string;
  vat_rate: number;
  tax_inclusive: number; // 1 = prices include VAT, 0 = VAT added on top
  receipt_footer: string;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  active: number;
}

export interface Size {
  id: number;
  name: string;
  code: string;
  sort_order: number;
  active: number;
}

export interface Ingredient {
  id: number;
  name: string;
  sku: string;
  unit: string;
  stock_qty: number;
  min_threshold: number;
  unit_cost: number;
  supplier_name: string;
  updated_at: string;
}

export interface RecipeEntry {
  id?: number;
  item_size_id?: number;
  ingredient_id: number;
  ingredient_name?: string;
  unit?: string;
  unit_cost?: number;
  qty_required: number;
}

export interface ItemSize {
  id: number;
  menu_item_id: number;
  size_id: number;
  size_name: string;
  size_code?: string;
  price: number;
  cost_override: number | null;
  computed_cost: number;
  sku: string;
  active: number;
  recipes: RecipeEntry[];
}

export interface MenuItem {
  id: number;
  category_id: number;
  category_name?: string;
  name: string;
  description: string;
  image_url: string;
  active: number;
  featured: number;
  prep_minutes: number;
  sizes: ItemSize[];
}

export interface Addon {
  id: number;
  name: string;
  price: number;
  cost: number;
  active: number;
}

export interface RestaurantTable {
  id: number;
  table_number: string;
  zone: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  current_order_id: number | null;
  current_order_total?: number | null;
  current_invoice_no?: string | null;
}

export interface OrderItemAddon {
  id: number;
  name: string;
  price: number;
  cost: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  item_name: string;
  item_size_id: number;
  size_name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  addons: OrderItemAddon[];
  addons_total: number;
  line_total: number;
  line_cogs: number;
  notes: string;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'preparing' | 'ready' | 'completed' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'transfer';

export interface Order {
  id: number;
  invoice_no: string;
  order_type: OrderType;
  table_id: number | null;
  table_number?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  discount_type: 'none' | 'percent' | 'fixed';
  discount_value: number;
  discount_amount: number;
  net_before_tax: number;
  tax_rate: number;
  tax_inclusive: number;
  tax_amount: number;
  delivery_fee: number;
  grand_total: number;
  paid_amount: number;
  change_amount: number;
  total_cogs: number;
  notes: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  voided_by?: number | null;
  voided_reason?: string | null;
  voided_at?: string | null;
  items: OrderItem[];
}

export interface Expense {
  id: number;
  title: string;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_no: string;
  expense_date: string;
  notes: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface StockMovement {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  movement_type: 'purchase' | 'sale_deduction' | 'void_restore' | 'waste' | 'adjustment';
  qty_delta: number;
  unit_cost: number;
  reference_no: string;
  notes: string;
  created_by_name?: string;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  tax_number: string;
  active: number;
}

export interface PurchaseInvoice {
  id: number;
  invoice_no: string;
  supplier_id: number;
  supplier_name?: string;
  total_amount: number;
  paid_amount: number;
  payment_method: PaymentMethod;
  notes: string;
  created_by_name?: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DashboardData {
  kpis: {
    totalRevenue: number;
    netSalesBeforeTax: number;
    totalTax: number;
    totalDiscounts: number;
    totalCogs: number;
    totalExpenses: number;
    netProfit: number;
    grossProfitMargin: number;
    orderCount: number;
    voidedCount: number;
    averageOrderValue: number;
    todayRevenue: number;
    todayOrders: number;
    lowStockCount: number;
  };
  bestSellers: Array<{
    menu_item_id: number;
    item_name: string;
    size_name: string;
    category_name: string;
    qty_sold: number;
    revenue: number;
    cogs: number;
    profit: number;
  }>;
  categoryBreakdown: Array<{
    category_name: string;
    qty_sold: number;
    revenue: number;
  }>;
  dailySeries: Array<{
    date: string;
    revenue: number;
    cogs: number;
    expenses: number;
    profit: number;
    orders: number;
  }>;
  weeklySeries: Array<{
    weekStart: string;
    label: string;
    revenue: number;
    cogs: number;
    expenses: number;
    profit: number;
    orders: number;
  }>;
  orderTypeBreakdown: Array<{
    order_type: OrderType;
    count: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{
    payment_method: PaymentMethod;
    count: number;
    revenue: number;
  }>;
  lowStockIngredients: Ingredient[];
  recentOrders: Order[];
}

export interface FinancialAuditReport {
  generatedAt: string;
  summary: {
    grossSalesWithTax: number;
    totalDiscounts: number;
    netSalesExclTax: number;
    totalVatCollected: number;
    totalDeliveryFees: number;
    totalGrandRevenue: number;
    totalCogs: number;
    grossProfit: number;
    operatingExpenses: number;
    netOperatingProfit: number;
    netProfitMarginPct: number;
    cashSalesTotal: number;
    cardSalesTotal: number;
    transferSalesTotal: number;
    cashExpensesTotal: number;
    expectedCashInDrawer: number;
    voidedOrdersCount: number;
    voidedOrdersValue: number;
  };
  integrityChecks: Array<{
    checkId: string;
    title: string;
    passed: boolean;
    expectedValue: number;
    actualValue: number;
    variance: number;
    details: string;
  }>;
  orderAudits: Array<{
    order_id: number;
    invoice_no: string;
    created_at: string;
    status: OrderStatus;
    recorded_grand_total: number;
    recomputed_grand_total: number;
    variance: number;
    passed: boolean;
  }>;
  allPassed: boolean;
}
