import { calculateOrderFinancials, fromCents, roundMoney, toCents } from '../shared/money.ts';
import type {
  Addon,
  AuditLog,
  Category,
  DashboardData,
  Expense,
  FinancialAuditReport,
  Ingredient,
  ItemSize,
  MenuItem,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PermissionKey,
  PurchaseInvoice,
  RecipeEntry,
  RestaurantSettings,
  RestaurantTable,
  Role,
  Size,
  StockMovement,
  Supplier,
  User,
} from '../shared/types.ts';

const DB_KEY = 'sufra_standalone_db_v1';
const SESSION_KEY = 'sufra_standalone_sessions_v1';

interface StoredUser {
  id: number;
  username: string;
  full_name: string;
  password: string;
  role_id: number;
  active: number;
  created_at: string;
}

interface StoredMenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  image_url: string;
  active: number;
  featured: number;
  prep_minutes: number;
}

interface StoredItemSize {
  id: number;
  menu_item_id: number;
  size_id: number;
  price: number;
  cost_override: number | null;
  sku: string;
  active: number;
}

interface StoredOrder {
  id: number;
  invoice_no: string;
  order_type: OrderType;
  table_id: number | null;
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
  created_at: string;
  voided_by: number | null;
  voided_reason: string | null;
  voided_at: string | null;
  items: Array<{
    id: number;
    order_id: number;
    menu_item_id: number;
    item_name: string;
    item_size_id: number;
    size_name: string;
    qty: number;
    unit_price: number;
    unit_cost: number;
    addons: Array<{ id: number; name: string; price: number; cost: number }>;
    addons_total: number;
    line_total: number;
    line_cogs: number;
    notes: string;
  }>;
}

interface StandaloneDb {
  nextId: number;
  settings: RestaurantSettings;
  roles: Role[];
  users: StoredUser[];
  categories: Category[];
  sizes: Size[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
  menu_items: StoredMenuItem[];
  item_sizes: StoredItemSize[];
  recipes: Array<{ id: number; item_size_id: number; ingredient_id: number; qty_required: number }>;
  addons: Addon[];
  tables: RestaurantTable[];
  orders: StoredOrder[];
  expenses: Expense[];
  stock_movements: StockMovement[];
  purchase_invoices: PurchaseInvoice[];
  audit_logs: AuditLog[];
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function createSeedDb(): StandaloneDb {
  let idSeq = 1;
  const nid = () => idSeq++;

  const settings: RestaurantSettings = {
    id: 1,
    restaurant_name: 'مطعم ومشويات سُفرة الأصيل',
    tax_number: '310482910400003',
    phone: '0550192834',
    address: 'الرياض — طريق الملك فهد، حي العليا',
    currency_symbol: 'ر.س',
    vat_rate: 15,
    tax_inclusive: 1,
    receipt_footer: 'شكراً لزيارتكم — نسعد بخدمتكم دائماً',
  };

  const allPerms: PermissionKey[] = [
    'dashboard.view',
    'pos.create_order',
    'pos.apply_discount',
    'pos.void_order',
    'menu.view',
    'menu.manage',
    'tables.view',
    'tables.manage',
    'inventory.view',
    'inventory.manage',
    'accounting.view',
    'accounting.manage_expenses',
    'accounting.audit',
    'reports.export',
    'users.manage',
    'settings.manage',
  ];

  const rAdmin: Role = {
    id: nid(),
    name: 'super_admin',
    display_name: 'المدير العام (أدمن أساسي)',
    description: 'صلاحيات كاملة لإدارة النظام والأصناف والمحاسبة والمستخدمين والتدقيق',
    permissions: allPerms,
    is_system: 1,
  };
  const rManager: Role = {
    id: nid(),
    name: 'branch_manager',
    display_name: 'مدير الفرع',
    description: 'إدارة التشغيل اليومي والمنيو والمخزون والمبيعات',
    permissions: [
      'dashboard.view',
      'pos.create_order',
      'pos.apply_discount',
      'pos.void_order',
      'menu.view',
      'menu.manage',
      'tables.view',
      'tables.manage',
      'inventory.view',
      'inventory.manage',
      'accounting.view',
      'accounting.manage_expenses',
      'reports.export',
    ],
    is_system: 1,
  };
  const rCashier: Role = {
    id: nid(),
    name: 'cashier',
    display_name: 'كاشير نقطة البيع',
    description: 'استقبال الطلبات وإدارة الطاولات وإصدار الفواتير',
    permissions: ['pos.create_order', 'pos.apply_discount', 'menu.view', 'tables.view', 'tables.manage'],
    is_system: 1,
  };
  const rAccountant: Role = {
    id: nid(),
    name: 'accountant',
    display_name: 'محاسب مالي ومخزون',
    description: 'التقارير المالية والمصروفات والتدقيق الحسابي وتصدير Excel/PDF',
    permissions: [
      'dashboard.view',
      'menu.view',
      'inventory.view',
      'inventory.manage',
      'accounting.view',
      'accounting.manage_expenses',
      'accounting.audit',
      'reports.export',
    ],
    is_system: 1,
  };

  const ts = nowSql();
  const uAdmin: StoredUser = { id: nid(), username: 'admin', full_name: 'فهد العتيبي (المدير العام)', password: 'admin123', role_id: rAdmin.id, active: 1, created_at: ts };
  const uManager: StoredUser = { id: nid(), username: 'manager', full_name: 'خالد الدوسري', password: '123456', role_id: rManager.id, active: 1, created_at: ts };
  const uCashier: StoredUser = { id: nid(), username: 'cashier', full_name: 'سارة القحطاني', password: '123456', role_id: rCashier.id, active: 1, created_at: ts };
  const uAccountant: StoredUser = { id: nid(), username: 'accountant', full_name: 'عبدالرحمن السبيعي', password: '123456', role_id: rAccountant.id, active: 1, created_at: ts };

  const cGrill: Category = { id: nid(), name: 'المشويات والأطباق الرئيسية', sort_order: 1, active: 1 };
  const cBurger: Category = { id: nid(), name: 'البرجر الفاخر', sort_order: 2, active: 1 };
  const cPizza: Category = { id: nid(), name: 'البيتزا على الحطب', sort_order: 3, active: 1 };
  const cAppetizer: Category = { id: nid(), name: 'المقبلات والسلطات', sort_order: 4, active: 1 };
  const cDessert: Category = { id: nid(), name: 'الحلويات الشرقية', sort_order: 5, active: 1 };
  const cDrinks: Category = { id: nid(), name: 'المشروبات الطازجة', sort_order: 6, active: 1 };

  const sSingle: Size = { id: nid(), name: 'مفرد', code: 'SGL', sort_order: 1, active: 1 };
  const sSmall: Size = { id: nid(), name: 'صغير', code: 'SM', sort_order: 2, active: 1 };
  const sMedium: Size = { id: nid(), name: 'وسط', code: 'MD', sort_order: 3, active: 1 };
  const sLarge: Size = { id: nid(), name: 'كبير', code: 'LG', sort_order: 4, active: 1 };
  const sFamily: Size = { id: nid(), name: 'عائلي', code: 'FAM', sort_order: 5, active: 1 };

  const suppliers: Supplier[] = [
    { id: nid(), name: 'شركة المراعي الطازجة للحوم', phone: '0114829100', tax_number: '300192837100003', active: 1 },
    { id: nid(), name: 'مؤسسة سنابل للمخابز والأجبان', phone: '0112948102', tax_number: '300481920400003', active: 1 },
    { id: nid(), name: 'توريدات الخليج للخضار والزيوت', phone: '0118472910', tax_number: '300918273600003', active: 1 },
  ];

  const iLamb: Ingredient = { id: nid(), name: 'لحم غنم نعيمي طازج', sku: 'ING-001', unit: 'كجم', stock_qty: 42.5, min_threshold: 10, unit_cost: 58, supplier_name: suppliers[0].name, updated_at: ts };
  const iBeef: Ingredient = { id: nid(), name: 'لحم بقري أنجوس مفروم', sku: 'ING-002', unit: 'كجم', stock_qty: 35, min_threshold: 8, unit_cost: 46, supplier_name: suppliers[0].name, updated_at: ts };
  const iChicken: Ingredient = { id: nid(), name: 'صدور دجاج متبلة', sku: 'ING-003', unit: 'كجم', stock_qty: 50, min_threshold: 12, unit_cost: 24, supplier_name: suppliers[0].name, updated_at: ts };
  const iFlour: Ingredient = { id: nid(), name: 'دقيق بيتزا إيطالي 00', sku: 'ING-004', unit: 'كجم', stock_qty: 65, min_threshold: 15, unit_cost: 7.5, supplier_name: suppliers[1].name, updated_at: ts };
  const iMozz: Ingredient = { id: nid(), name: 'جبن موزاريلا طبيعي', sku: 'ING-005', unit: 'كجم', stock_qty: 28, min_threshold: 8, unit_cost: 34, supplier_name: suppliers[1].name, updated_at: ts };
  const iCheddar: Ingredient = { id: nid(), name: 'شرائح جبن شيدر معتق', sku: 'ING-006', unit: 'كجم', stock_qty: 18, min_threshold: 5, unit_cost: 38, supplier_name: suppliers[1].name, updated_at: ts };
  const iBrioche: Ingredient = { id: nid(), name: 'خبز بريوش طازج', sku: 'ING-007', unit: 'حبة', stock_qty: 180, min_threshold: 40, unit_cost: 2.2, supplier_name: suppliers[1].name, updated_at: ts };
  const iHummus: Ingredient = { id: nid(), name: 'حمص مطحون وطحينة', sku: 'ING-008', unit: 'كجم', stock_qty: 22, min_threshold: 6, unit_cost: 16, supplier_name: suppliers[2].name, updated_at: ts };
  const iKunafa: Ingredient = { id: nid(), name: 'عجينة كنافة طازجة + قشطة', sku: 'ING-009', unit: 'كجم', stock_qty: 16, min_threshold: 5, unit_cost: 28, supplier_name: suppliers[1].name, updated_at: ts };
  const iPistachio: Ingredient = { id: nid(), name: 'فستق حلبي مجروش', sku: 'ING-010', unit: 'كجم', stock_qty: 4.2, min_threshold: 5, unit_cost: 92, supplier_name: suppliers[2].name, updated_at: ts };
  const iOliveOil: Ingredient = { id: nid(), name: 'زيت زيتون بكر ممتاز', sku: 'ING-011', unit: 'لتر', stock_qty: 19, min_threshold: 5, unit_cost: 36, supplier_name: suppliers[2].name, updated_at: ts };
  const iLemon: Ingredient = { id: nid(), name: 'ليمون ونعناع طازج', sku: 'ING-012', unit: 'كجم', stock_qty: 3.8, min_threshold: 6, unit_cost: 9.5, supplier_name: suppliers[2].name, updated_at: ts };

  const menu_items: StoredMenuItem[] = [];
  const item_sizes: StoredItemSize[] = [];
  const recipes: Array<{ id: number; item_size_id: number; ingredient_id: number; qty_required: number }> = [];

  function addItem(category_id: number, name: string, description: string, featured: number, prep_minutes: number) {
    const it: StoredMenuItem = { id: nid(), category_id, name, description, image_url: '', active: 1, featured, prep_minutes };
    menu_items.push(it);
    return it.id;
  }
  function addSize(menu_item_id: number, size_id: number, price: number, sku: string, recs: Array<[number, number]>) {
    const sz: StoredItemSize = { id: nid(), menu_item_id, size_id, price, cost_override: null, sku, active: 1 };
    item_sizes.push(sz);
    for (const [ingredient_id, qty_required] of recs) {
      recipes.push({ id: nid(), item_size_id: sz.id, ingredient_id, qty_required });
    }
    return sz.id;
  }

  const m1 = addItem(cGrill.id, 'طبق مشويات سُفرة المشكل', 'أوصال لحم نعيمي، شيش طاووق، كباب مشوي على الفحم مع خبز التنور', 1, 18);
  const m1s1 = addSize(m1, sSingle.id, 68, 'GRL-01-S', [[iLamb.id, 0.25], [iChicken.id, 0.2]]);
  const m1s2 = addSize(m1, sMedium.id, 118, 'GRL-01-M', [[iLamb.id, 0.45], [iChicken.id, 0.35]]);
  const m1s3 = addSize(m1, sFamily.id, 215, 'GRL-01-F', [[iLamb.id, 0.85], [iChicken.id, 0.65]]);

  const m2 = addItem(cGrill.id, 'شيش طاووق على الفحم', 'صدور دجاج متبلة بالزبادي والزعفران مع ثومية وبطاطس', 0, 15);
  const m2s1 = addSize(m2, sSingle.id, 46, 'GRL-02-S', [[iChicken.id, 0.32]]);
  const m2s2 = addSize(m2, sLarge.id, 78, 'GRL-02-L', [[iChicken.id, 0.55]]);

  const m3 = addItem(cBurger.id, 'سماش برجر أنجوس دبل', 'شريحتا لحم أنجوس طازج، جبن شيدر معتق، صوص خاص، خبز بريوش', 1, 12);
  const m3s1 = addSize(m3, sSingle.id, 38, 'BRG-01-S', [[iBeef.id, 0.16], [iCheddar.id, 0.04], [iBrioche.id, 1]]);
  const m3s2 = addSize(m3, sLarge.id, 52, 'BRG-01-L', [[iBeef.id, 0.28], [iCheddar.id, 0.07], [iBrioche.id, 1]]);

  const m4 = addItem(cBurger.id, 'ترافل تشيكن برجر', 'صدر دجاج مشوي مع جبن شيدر وصلصة الكمأة الفاخرة', 0, 12);
  const m4s1 = addSize(m4, sSingle.id, 34, 'BRG-02-S', [[iChicken.id, 0.18], [iCheddar.id, 0.03], [iBrioche.id, 1]]);

  const m5 = addItem(cPizza.id, 'بيتزا مارغريتا نابوليتانا', 'عجينة مخمرة 48 ساعة، صلصة طماطم سان مارزانو، موزاريلا وريحان', 1, 14);
  const m5s1 = addSize(m5, sSmall.id, 36, 'PIZ-01-SM', [[iFlour.id, 0.22], [iMozz.id, 0.12]]);
  const m5s2 = addSize(m5, sMedium.id, 52, 'PIZ-01-MD', [[iFlour.id, 0.32], [iMozz.id, 0.18]]);
  const m5s3 = addSize(m5, sLarge.id, 68, 'PIZ-01-LG', [[iFlour.id, 0.44], [iMozz.id, 0.26]]);

  const m6 = addItem(cPizza.id, 'بيتزا دجاج مشوي وأجبان', 'دجاج متبل مع موزاريلا وفلفل مشوي مخبوزة على الحطب', 0, 15);
  addSize(m6, sMedium.id, 58, 'PIZ-02-MD', [[iFlour.id, 0.32], [iMozz.id, 0.18], [iChicken.id, 0.14]]);
  const m6s2 = addSize(m6, sLarge.id, 76, 'PIZ-02-LG', [[iFlour.id, 0.44], [iMozz.id, 0.26], [iChicken.id, 0.22]]);

  const m7 = addItem(cAppetizer.id, 'حمص بالطحينة وفلافل مقرمشة', 'حمص كريمي بزيت الزيتون البكر وحبوب الرمان مع فلافل ساخنة', 1, 8);
  const m7s1 = addSize(m7, sSmall.id, 22, 'APP-01-SM', [[iHummus.id, 0.22], [iOliveOil.id, 0.03]]);
  const m7s2 = addSize(m7, sLarge.id, 34, 'APP-01-LG', [[iHummus.id, 0.38], [iOliveOil.id, 0.05]]);

  const m8 = addItem(cDessert.id, 'كنافة نابلسية بالقشطة والفستق', 'كنافة ذهبية مقرمشة محشوة بالقشطة الطازجة والفستق الحلبي', 1, 10);
  const m8s1 = addSize(m8, sSingle.id, 28, 'DES-01-S', [[iKunafa.id, 0.18], [iPistachio.id, 0.02]]);
  const m8s2 = addSize(m8, sFamily.id, 78, 'DES-01-F', [[iKunafa.id, 0.55], [iPistachio.id, 0.06]]);

  const m9 = addItem(cDrinks.id, 'عصير ليمون بالنعناع الطازج', 'عصير ليمون طبيعي مع أوراق النعناع المنعشة والثلج المجروش', 0, 4);
  const m9s1 = addSize(m9, sMedium.id, 16, 'DRK-01-MD', [[iLemon.id, 0.15]]);
  const m9s2 = addSize(m9, sLarge.id, 22, 'DRK-01-LG', [[iLemon.id, 0.24]]);

  const m10 = addItem(cDrinks.id, 'مشروبات غازية ومياه فوارة', 'تشكيلة مشروبات باردة', 0, 2);
  addSize(m10, sSingle.id, 8, 'DRK-02-S', []);

  const addons: Addon[] = [
    { id: nid(), name: 'إضافة جبن شيدر / موزاريلا', price: 6, cost: 2.2, active: 1 },
    { id: nid(), name: 'بطاطس مقرمشة جانبية', price: 10, cost: 3.0, active: 1 },
    { id: nid(), name: 'صوص ثومية / ترافل إضافي', price: 4, cost: 0.9, active: 1 },
    { id: nid(), name: 'سلة خبز تنور ساخن', price: 5, cost: 1.2, active: 1 },
  ];

  const tables: RestaurantTable[] = [
    { id: nid(), table_number: 'T-01', zone: 'الصالة الرئيسية', capacity: 4, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'T-02', zone: 'الصالة الرئيسية', capacity: 4, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'T-03', zone: 'الصالة الرئيسية', capacity: 6, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'T-04', zone: 'الصالة الرئيسية', capacity: 2, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'F-01', zone: 'قسم العائلات', capacity: 6, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'F-02', zone: 'قسم العائلات', capacity: 8, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'F-03', zone: 'قسم العائلات', capacity: 6, status: 'reserved', current_order_id: null },
    { id: nid(), table_number: 'V-01', zone: 'التراس الخارجي', capacity: 4, status: 'available', current_order_id: null },
    { id: nid(), table_number: 'V-02', zone: 'التراس الخارجي', capacity: 4, status: 'available', current_order_id: null },
  ];

  const sizes: Size[] = [sSingle, sSmall, sMedium, sLarge, sFamily];
  const ingredients: Ingredient[] = [iLamb, iBeef, iChicken, iFlour, iMozz, iCheddar, iBrioche, iHummus, iKunafa, iPistachio, iOliveOil, iLemon];
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const sizeMap = new Map(sizes.map((s) => [s.id, s]));
  const itemMap = new Map(menu_items.map((m) => [m.id, m]));
  const computeSizeCost = (sz: StoredItemSize): number => {
    if (sz.cost_override !== null && sz.cost_override !== undefined) return roundMoney(sz.cost_override);
    const recs = recipes.filter((r) => r.item_size_id === sz.id);
    if (recs.length === 0) return roundMoney(sz.price * 0.3);
    let c = 0;
    for (const r of recs) {
      const ing = ingMap.get(r.ingredient_id);
      if (ing) c += toCents(r.qty_required * ing.unit_cost);
    }
    return fromCents(c);
  };

  const itemSizeMap = new Map(item_sizes.map((sz) => [sz.id, sz]));

  const seedPlan: Array<{
    daysAgo: number;
    type: OrderType;
    payment: PaymentMethod;
    status: OrderStatus;
    discountType: 'none' | 'percent' | 'fixed';
    discountValue: number;
    deliveryFee: number;
    lines: Array<{ sizeId: number; qty: number; addonIdx?: number }>;
  }> = [
    { daysAgo: 6, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 2 }, { sizeId: m7s1, qty: 2 }, { sizeId: m9s2, qty: 3 }] },
    { daysAgo: 6, type: 'delivery', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m3s1, qty: 3, addonIdx: 1 }, { sizeId: m5s3, qty: 1 }] },
    { daysAgo: 5, type: 'takeaway', payment: 'cash', status: 'completed', discountType: 'percent', discountValue: 10, deliveryFee: 0, lines: [{ sizeId: m1s1, qty: 2 }, { sizeId: m8s1, qty: 2 }] },
    { daysAgo: 5, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s3, qty: 1 }, { sizeId: m7s2, qty: 1 }, { sizeId: m8s2, qty: 1 }] },
    { daysAgo: 4, type: 'delivery', payment: 'transfer', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m5s2, qty: 2 }, { sizeId: m6s2, qty: 1 }, { sizeId: m9s1, qty: 4 }] },
    { daysAgo: 4, type: 'takeaway', payment: 'cash', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m3s2, qty: 2 }, { sizeId: m4s1, qty: 2 }] },
    { daysAgo: 3, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 2 }, { sizeId: m2s2, qty: 1 }, { sizeId: m8s1, qty: 3 }] },
    { daysAgo: 3, type: 'takeaway', payment: 'cash', status: 'voided', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m5s1, qty: 2 }] },
    { daysAgo: 2, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'fixed', discountValue: 20, deliveryFee: 0, lines: [{ sizeId: m1s3, qty: 1 }, { sizeId: m7s2, qty: 2 }, { sizeId: m9s2, qty: 4 }] },
    { daysAgo: 2, type: 'delivery', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m3s1, qty: 4 }, { sizeId: m5s3, qty: 2 }] },
    { daysAgo: 1, type: 'takeaway', payment: 'cash', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m2s1, qty: 3 }, { sizeId: m7s1, qty: 2 }, { sizeId: m8s1, qty: 2 }] },
    { daysAgo: 1, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 3 }, { sizeId: m6s2, qty: 1 }, { sizeId: m9s1, qty: 4 }] },
    { daysAgo: 0, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 2, addonIdx: 3 }, { sizeId: m7s2, qty: 1 }, { sizeId: m8s1, qty: 2 }] },
    { daysAgo: 0, type: 'takeaway', payment: 'cash', status: 'completed', discountType: 'percent', discountValue: 5, deliveryFee: 0, lines: [{ sizeId: m3s1, qty: 3, addonIdx: 0 }, { sizeId: m9s2, qty: 2 }] },
    { daysAgo: 0, type: 'delivery', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m5s3, qty: 2 }, { sizeId: m3s2, qty: 2 }] },
    { daysAgo: 0, type: 'dine_in', payment: 'cash', status: 'preparing', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s1, qty: 2 }, { sizeId: m7s1, qty: 1 }] },
  ];

  const orders: StoredOrder[] = [];
  const now = new Date();

  seedPlan.forEach((p, idx) => {
    const dt = new Date(now.getTime() - p.daysAgo * 86400000 - (16 - idx) * 1800000);
    const isoDate = dt.toISOString().slice(0, 19).replace('T', ' ');
    const invoiceNo = `INV-${dt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(1001 + idx)}`;
    const orderId = nid();

    const lineObjs = p.lines.map((l) => {
      const sz = itemSizeMap.get(l.sizeId)!;
      const mi = itemMap.get(sz.menu_item_id)!;
      const sizeDef = sizeMap.get(sz.size_id)!;
      const unitCost = computeSizeCost(sz);
      const chosenAddons = l.addonIdx !== undefined ? [addons[l.addonIdx]] : [];
      const addonsTotalPerUnit = chosenAddons.reduce((s, a) => s + a.price, 0);
      const addonsCostPerUnit = chosenAddons.reduce((s, a) => s + a.cost, 0);
      const lineTotal = fromCents((toCents(sz.price) + toCents(addonsTotalPerUnit)) * l.qty);
      const lineCogs = fromCents((toCents(unitCost) + toCents(addonsCostPerUnit)) * l.qty);
      return {
        id: nid(),
        order_id: orderId,
        menu_item_id: mi.id,
        item_name: mi.name,
        item_size_id: sz.id,
        size_name: sizeDef.name,
        qty: l.qty,
        unit_price: sz.price,
        unit_cost: unitCost,
        addons: chosenAddons.map((a) => ({ id: a.id, name: a.name, price: a.price, cost: a.cost })),
        addons_total: addonsTotalPerUnit,
        line_total: lineTotal,
        line_cogs: lineCogs,
        notes: '',
        addonsCostPerUnit,
      };
    });

    const fin = calculateOrderFinancials({
      lines: lineObjs.map((l) => ({
        qty: l.qty,
        unitPrice: l.unit_price,
        unitCost: l.unit_cost,
        addonsTotalPerUnit: l.addons_total,
        addonsCostPerUnit: l.addonsCostPerUnit,
      })),
      discountType: p.discountType,
      discountValue: p.discountValue,
      taxRate: 15,
      taxInclusive: true,
      deliveryFee: p.deliveryFee,
    });

    const tblId = p.status === 'preparing' ? tables[0].id : p.type === 'dine_in' ? tables[idx % 4].id : null;
    if (p.status === 'preparing' && tblId) {
      tables[0].status = 'occupied';
      tables[0].current_order_id = orderId;
    }

    orders.push({
      id: orderId,
      invoice_no: invoiceNo,
      order_type: p.type,
      table_id: tblId,
      customer_name: p.type === 'delivery' ? 'عميل توصيل' : '',
      customer_phone: p.type === 'delivery' ? '0509182736' : '',
      customer_address: p.type === 'delivery' ? 'حي النرجس، الرياض' : '',
      status: p.status,
      payment_method: p.payment,
      subtotal: fin.subtotal,
      discount_type: p.discountType,
      discount_value: p.discountValue,
      discount_amount: fin.discountAmount,
      net_before_tax: fin.netBeforeTax,
      tax_rate: 15,
      tax_inclusive: 1,
      tax_amount: fin.taxAmount,
      delivery_fee: fin.deliveryFee,
      grand_total: fin.grandTotal,
      paid_amount: fin.grandTotal,
      change_amount: 0,
      total_cogs: fin.totalCogs,
      notes: '',
      created_by: uCashier.id,
      created_at: isoDate,
      voided_by: p.status === 'voided' ? uAdmin.id : null,
      voided_reason: p.status === 'voided' ? 'تعديل طلب العميل قبل التحضير' : null,
      voided_at: p.status === 'voided' ? isoDate : null,
      items: lineObjs.map(({ addonsCostPerUnit: _omit, ...rest }) => rest),
    });
  });

  const todayStr = now.toISOString().slice(0, 10);
  const d2 = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const d4 = new Date(now.getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const d5 = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);

  const expenses: Expense[] = [
    { id: nid(), title: 'إيجار المطبخ والصالة (حصة الأسبوع)', category: 'إيجارات ومرافق', amount: 450, payment_method: 'transfer', reference_no: 'EXP-901', expense_date: d5, notes: 'سداد أسبوعي منتظم', created_by: uAdmin.id, created_by_name: uAdmin.full_name, created_at: `${d5} 10:00:00` },
    { id: nid(), title: 'فاتورة الكهرباء والمياه', category: 'كهرباء ومياه', amount: 185.5, payment_method: 'transfer', reference_no: 'EXP-902', expense_date: d4, notes: 'فاتورة شهرية جزئية', created_by: uAdmin.id, created_by_name: uAdmin.full_name, created_at: `${d4} 12:30:00` },
    { id: nid(), title: 'مواد تغليف وعلب توصيل حرارية', category: 'تغليف وتشغيل', amount: 140, payment_method: 'cash', reference_no: 'EXP-903', expense_date: d2, notes: 'من الصندوق النقدي', created_by: uAdmin.id, created_by_name: uAdmin.full_name, created_at: `${d2} 15:20:00` },
    { id: nid(), title: 'صيانة فرن البيتزا وتنظيف المداخن', category: 'صيانة', amount: 120, payment_method: 'cash', reference_no: 'EXP-904', expense_date: todayStr, notes: 'صيانة دورية', created_by: uAdmin.id, created_by_name: uAdmin.full_name, created_at: `${todayStr} 09:15:00` },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: nid(),
      user_id: uAdmin.id,
      username: 'admin',
      action: 'SYSTEM_INITIALIZED',
      entity_type: 'system',
      entity_id: '1',
      details: { message: 'تهيئة نظام سُفرة POS لسطح المكتب وقاعدة البيانات المحلية' },
      created_at: ts,
    },
  ];

  return {
    nextId: idSeq,
    settings,
    roles: [rAdmin, rManager, rCashier, rAccountant],
    users: [uAdmin, uManager, uCashier, uAccountant],
    categories: [cGrill, cBurger, cPizza, cAppetizer, cDessert, cDrinks],
    sizes,
    suppliers,
    ingredients,
    menu_items,
    item_sizes,
    recipes,
    addons,
    tables,
    orders,
    expenses,
    stock_movements: [],
    purchase_invoices: [],
    audit_logs,
  };
}

function loadDb(): StandaloneDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as StandaloneDb;
  } catch {
    // ignore
  }
  const seeded = createSeedDb();
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveDb(db: StandaloneDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function getSessions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, number>): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
}

function hydrateUser(db: StandaloneDb, u: StoredUser): User {
  const role = db.roles.find((r) => r.id === u.role_id) || db.roles[0];
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    role_id: u.role_id,
    role_name: role.name,
    role_display_name: role.display_name,
    permissions: role.permissions,
    active: u.active,
    created_at: u.created_at,
  };
}

function hydrateMenu(db: StandaloneDb) {
  const catMap = new Map(db.categories.map((c) => [c.id, c]));
  const sizeMap = new Map(db.sizes.map((s) => [s.id, s]));
  const ingMap = new Map(db.ingredients.map((i) => [i.id, i]));

  const items: MenuItem[] = db.menu_items.map((mi) => {
    const szRows = db.item_sizes.filter((isz) => isz.menu_item_id === mi.id);
    const sizes: ItemSize[] = szRows.map((isz) => {
      const szDef = sizeMap.get(isz.size_id);
      const recs: RecipeEntry[] = db.recipes
        .filter((r) => r.item_size_id === isz.id)
        .map((r) => {
          const ing = ingMap.get(r.ingredient_id);
          return {
            id: r.id,
            item_size_id: r.item_size_id,
            ingredient_id: r.ingredient_id,
            ingredient_name: ing?.name || '',
            unit: ing?.unit || '',
            unit_cost: ing?.unit_cost || 0,
            qty_required: r.qty_required,
          };
        });
      let computedCost = isz.cost_override !== null && isz.cost_override !== undefined ? roundMoney(isz.cost_override) : 0;
      if (isz.cost_override === null || isz.cost_override === undefined) {
        if (recs.length === 0) computedCost = roundMoney(isz.price * 0.3);
        else {
          let cents = 0;
          for (const rc of recs) cents += toCents(rc.qty_required * (rc.unit_cost || 0));
          computedCost = fromCents(cents);
        }
      }
      return {
        id: isz.id,
        menu_item_id: isz.menu_item_id,
        size_id: isz.size_id,
        size_name: szDef?.name || '',
        size_code: szDef?.code || '',
        price: isz.price,
        cost_override: isz.cost_override,
        computed_cost: computedCost,
        sku: isz.sku,
        active: isz.active,
        recipes: recs,
      };
    });
    return {
      ...mi,
      category_name: catMap.get(mi.category_id)?.name || '',
      sizes,
    };
  });

  return {
    categories: [...db.categories].sort((a, b) => a.sort_order - b.sort_order),
    sizes: [...db.sizes].sort((a, b) => a.sort_order - b.sort_order),
    items,
    addons: db.addons,
  };
}

function hydrateOrders(db: StandaloneDb, orders: StoredOrder[]): Order[] {
  const tblMap = new Map(db.tables.map((t) => [t.id, t.table_number]));
  const userMap = new Map(db.users.map((u) => [u.id, u.full_name]));
  return orders.map((o) => ({
    ...o,
    table_number: o.table_id ? tblMap.get(o.table_id) || null : null,
    created_by_name: userMap.get(o.created_by) || 'النظام',
  }));
}

function addAudit(db: StandaloneDb, user: User | null, action: string, entityType: string, entityId: string | number, details: Record<string, unknown>) {
  db.audit_logs.unshift({
    id: db.nextId++,
    user_id: user?.id ?? null,
    username: user?.username ?? 'system',
    action,
    entity_type: entityType,
    entity_id: String(entityId),
    details,
    created_at: nowSql(),
  });
}

function requireSessionUser(db: StandaloneDb, token: string | null, perm?: PermissionKey): User {
  if (!token) throw new Error('يرجى تسجيل الدخول للمتابعة');
  const sessions = getSessions();
  const uid = sessions[token];
  const rawUser = db.users.find((u) => u.id === uid && u.active === 1);
  if (!rawUser) throw new Error('انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول');
  const user = hydrateUser(db, rawUser);
  if (perm && !user.permissions.includes(perm)) {
    throw new Error('ليس لديك صلاحية تنفيذ هذا الإجراء');
  }
  return user;
}

export async function handleStandaloneRequest<T>(path: string, options: RequestInit = {}, token: string | null): Promise<T> {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {};
  const db = loadDb();

  // Auth
  if (pathname === '/api/auth/login' && method === 'POST') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const u = db.users.find((x) => x.username === username && x.active === 1);
    if (!u || u.password !== password) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    const newToken = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessions = getSessions();
    sessions[newToken] = u.id;
    saveSessions(sessions);
    const hydrated = hydrateUser(db, u);
    addAudit(db, hydrated, 'LOGIN', 'users', u.id, { mode: 'desktop_standalone' });
    saveDb(db);
    return { token: newToken, user: hydrated } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (token) {
      const sessions = getSessions();
      delete sessions[token];
      saveSessions(sessions);
    }
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = requireSessionUser(db, token);
    return { user, settings: db.settings } as T;
  }

  // Settings
  if (pathname === '/api/settings' && method === 'GET') {
    requireSessionUser(db, token);
    return db.settings as T;
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    const user = requireSessionUser(db, token, 'settings.manage');
    db.settings = {
      ...db.settings,
      restaurant_name: String(body.restaurant_name || db.settings.restaurant_name),
      tax_number: String(body.tax_number || ''),
      phone: String(body.phone || ''),
      address: String(body.address || ''),
      currency_symbol: String(body.currency_symbol || 'ر.س'),
      vat_rate: Math.max(0, Number(body.vat_rate) || 0),
      tax_inclusive: body.tax_inclusive ? 1 : 0,
      receipt_footer: String(body.receipt_footer || ''),
    };
    addAudit(db, user, 'SETTINGS_UPDATED', 'settings', 1, db.settings as unknown as Record<string, unknown>);
    saveDb(db);
    return db.settings as T;
  }

  if (pathname === '/api/php-mysql-bundle' && method === 'GET') {
    requireSessionUser(db, token);
    return { files: [] } as T;
  }

  // Menu & Categories & Sizes & Addons
  if (pathname === '/api/menu' && method === 'GET') {
    requireSessionUser(db, token, 'menu.view');
    return hydrateMenu(db) as T;
  }

  if (pathname === '/api/categories' && method === 'POST') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = db.nextId++;
    db.categories.push({ id, name: String(body.name || ''), sort_order: Number(body.sort_order) || 1, active: Number(body.active ?? 1) });
    addAudit(db, user, 'CATEGORY_CREATED', 'categories', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'PUT') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx >= 0) db.categories[idx] = { ...db.categories[idx], name: String(body.name || db.categories[idx].name), sort_order: Number(body.sort_order ?? db.categories[idx].sort_order), active: Number(body.active ?? db.categories[idx].active) };
    addAudit(db, user, 'CATEGORY_UPDATED', 'categories', id, body);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    if (db.menu_items.some((m) => m.category_id === id)) throw new Error('لا يمكن حذف قسم يحتوي على وجبات');
    db.categories = db.categories.filter((c) => c.id !== id);
    addAudit(db, user, 'CATEGORY_DELETED', 'categories', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/sizes' && method === 'POST') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = db.nextId++;
    db.sizes.push({ id, name: String(body.name || ''), code: String(body.code || ''), sort_order: Number(body.sort_order) || 1, active: 1 });
    saveDb(db);
    addAudit(db, user, 'SIZE_CREATED', 'sizes', id, body);
    return { id } as T;
  }

  if (pathname.startsWith('/api/sizes/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    if (db.item_sizes.some((isz) => isz.size_id === id)) throw new Error('هذا الحجم مرتبط بوجبات حالية');
    db.sizes = db.sizes.filter((s) => s.id !== id);
    addAudit(db, user, 'SIZE_DELETED', 'sizes', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/addons' && method === 'POST') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = db.nextId++;
    db.addons.push({ id, name: String(body.name || ''), price: Number(body.price) || 0, cost: Number(body.cost) || 0, active: 1 });
    addAudit(db, user, 'ADDON_CREATED', 'addons', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/addons/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    db.addons = db.addons.filter((a) => a.id !== id);
    addAudit(db, user, 'ADDON_DELETED', 'addons', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/menu-items' && method === 'POST') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = db.nextId++;
    db.menu_items.push({
      id,
      category_id: Number(body.category_id),
      name: String(body.name || ''),
      description: String(body.description || ''),
      image_url: String(body.image_url || ''),
      active: Number(body.active ?? 1),
      featured: Number(body.featured ?? 0),
      prep_minutes: Number(body.prep_minutes ?? 12),
    });
    const szList = (body.sizes as Array<{ size_id: number; price: number; cost_override?: number | null; sku?: string; recipes?: Array<{ ingredient_id: number; qty_required: number }> }>) || [];
    for (const s of szList) {
      const szId = db.nextId++;
      db.item_sizes.push({
        id: szId,
        menu_item_id: id,
        size_id: Number(s.size_id),
        price: Number(s.price),
        cost_override: s.cost_override ?? null,
        sku: String(s.sku || ''),
        active: 1,
      });
      for (const r of s.recipes || []) {
        db.recipes.push({ id: db.nextId++, item_size_id: szId, ingredient_id: Number(r.ingredient_id), qty_required: Number(r.qty_required) });
      }
    }
    addAudit(db, user, 'MENU_ITEM_CREATED', 'menu_items', id, { name: body.name });
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/menu-items/') && method === 'PUT') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    const idx = db.menu_items.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error('الوجبة غير موجودة');
    db.menu_items[idx] = {
      ...db.menu_items[idx],
      category_id: Number(body.category_id),
      name: String(body.name || ''),
      description: String(body.description || ''),
      image_url: String(body.image_url || ''),
      active: Number(body.active ?? 1),
      featured: Number(body.featured ?? 0),
      prep_minutes: Number(body.prep_minutes ?? 12),
    };
    const oldSizeIds = db.item_sizes.filter((isz) => isz.menu_item_id === id).map((isz) => isz.id);
    db.recipes = db.recipes.filter((r) => !oldSizeIds.includes(r.item_size_id));
    db.item_sizes = db.item_sizes.filter((isz) => isz.menu_item_id !== id);
    const szList = (body.sizes as Array<{ size_id: number; price: number; cost_override?: number | null; sku?: string; recipes?: Array<{ ingredient_id: number; qty_required: number }> }>) || [];
    for (const s of szList) {
      const szId = db.nextId++;
      db.item_sizes.push({
        id: szId,
        menu_item_id: id,
        size_id: Number(s.size_id),
        price: Number(s.price),
        cost_override: s.cost_override ?? null,
        sku: String(s.sku || ''),
        active: 1,
      });
      for (const r of s.recipes || []) {
        db.recipes.push({ id: db.nextId++, item_size_id: szId, ingredient_id: Number(r.ingredient_id), qty_required: Number(r.qty_required) });
      }
    }
    addAudit(db, user, 'MENU_ITEM_UPDATED', 'menu_items', id, { name: body.name });
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/menu-items/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'menu.manage');
    const id = Number(pathname.split('/').pop());
    const oldSizeIds = db.item_sizes.filter((isz) => isz.menu_item_id === id).map((isz) => isz.id);
    db.recipes = db.recipes.filter((r) => !oldSizeIds.includes(r.item_size_id));
    db.item_sizes = db.item_sizes.filter((isz) => isz.menu_item_id !== id);
    db.menu_items = db.menu_items.filter((m) => m.id !== id);
    addAudit(db, user, 'MENU_ITEM_DELETED', 'menu_items', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  // Tables
  if (pathname === '/api/tables' && method === 'GET') {
    requireSessionUser(db, token, 'tables.view');
    const orderMap = new Map(db.orders.map((o) => [o.id, o]));
    return db.tables.map((t) => {
      const curOrd = t.current_order_id ? orderMap.get(t.current_order_id) : undefined;
      return {
        ...t,
        current_order_total: curOrd?.grand_total ?? null,
        current_invoice_no: curOrd?.invoice_no ?? null,
      };
    }) as T;
  }

  if (pathname === '/api/tables' && method === 'POST') {
    const user = requireSessionUser(db, token, 'tables.manage');
    const id = db.nextId++;
    db.tables.push({
      id,
      table_number: String(body.table_number || ''),
      zone: String(body.zone || 'الصالة الرئيسية'),
      capacity: Number(body.capacity || 4),
      status: 'available',
      current_order_id: null,
    });
    addAudit(db, user, 'TABLE_CREATED', 'dining_tables', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/tables/') && method === 'PUT') {
    const user = requireSessionUser(db, token, 'tables.manage');
    const id = Number(pathname.split('/').pop());
    const tbl = db.tables.find((t) => t.id === id);
    if (tbl) {
      tbl.status = (body.status as RestaurantTable['status']) || tbl.status;
      if (tbl.status === 'available') tbl.current_order_id = null;
    }
    addAudit(db, user, 'TABLE_UPDATED', 'dining_tables', id, body);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/tables/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'tables.manage');
    const id = Number(pathname.split('/').pop());
    db.tables = db.tables.filter((t) => t.id !== id);
    addAudit(db, user, 'TABLE_DELETED', 'dining_tables', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  // Orders
  if (pathname === '/api/orders' && method === 'GET') {
    requireSessionUser(db, token, 'tables.view');
    const statusParam = url.searchParams.get('status') || 'all';
    const limit = Number(url.searchParams.get('limit') || 150);
    let list = [...db.orders].sort((a, b) => b.id - a.id);
    if (statusParam !== 'all') list = list.filter((o) => o.status === statusParam);
    return hydrateOrders(db, list.slice(0, limit)) as T;
  }

  if (pathname === '/api/orders' && method === 'POST') {
    const user = requireSessionUser(db, token, 'pos.create_order');
    const itemsInput = (body.items as Array<{ item_size_id: number; qty: number; addon_ids?: number[]; notes?: string }>) || [];
    if (itemsInput.length === 0) throw new Error('السلة فارغة، أضف وجبة واحدة على الأقل');

    const discountType = (body.discount_type as 'none' | 'percent' | 'fixed') || 'none';
    const discountValue = Number(body.discount_value) || 0;
    if (discountType !== 'none' && discountValue > 0 && !user.permissions.includes('pos.apply_discount')) {
      throw new Error('ليس لديك صلاحية تطبيق الخصومات');
    }

    const orderId = db.nextId++;
    const now = new Date();
    const invoiceNo = `INV-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const ingMap = new Map(db.ingredients.map((i) => [i.id, i]));
    const sizeDefMap = new Map(db.sizes.map((s) => [s.id, s]));
    const itemDefMap = new Map(db.menu_items.map((m) => [m.id, m]));

    const lines: Array<{
      id: number;
      order_id: number;
      menu_item_id: number;
      item_name: string;
      item_size_id: number;
      size_name: string;
      qty: number;
      unit_price: number;
      unit_cost: number;
      addons: Array<{ id: number; name: string; price: number; cost: number }>;
      addons_total: number;
      line_total: number;
      line_cogs: number;
      notes: string;
      addonsCostPerUnit: number;
    }> = [];

    for (const line of itemsInput) {
      const sz = db.item_sizes.find((s) => s.id === Number(line.item_size_id));
      if (!sz) throw new Error('أحد الأحجام المختارة غير موجود في القائمة');
      const mi = itemDefMap.get(sz.menu_item_id)!;
      const szDef = sizeDefMap.get(sz.size_id)!;
      const qty = Math.max(1, Math.floor(Number(line.qty) || 1));

      const recs = db.recipes.filter((r) => r.item_size_id === sz.id);
      let unitCost = 0;
      if (sz.cost_override !== null && sz.cost_override !== undefined) {
        unitCost = roundMoney(sz.cost_override);
      } else if (recs.length === 0) {
        unitCost = roundMoney(sz.price * 0.3);
      } else {
        let cents = 0;
        for (const r of recs) {
          const ing = ingMap.get(r.ingredient_id);
          if (ing) cents += toCents(r.qty_required * ing.unit_cost);
        }
        unitCost = fromCents(cents);
      }

      const chosenAddons = (line.addon_ids || [])
        .map((aid) => db.addons.find((a) => a.id === aid))
        .filter((a): a is Addon => Boolean(a))
        .map((a) => ({ id: a.id, name: a.name, price: a.price, cost: a.cost }));

      const addonsTotalCents = chosenAddons.reduce((s, a) => s + toCents(a.price), 0);
      const addonsCostCents = chosenAddons.reduce((s, a) => s + toCents(a.cost), 0);
      const addonsTotalPerUnit = fromCents(addonsTotalCents);
      const addonsCostPerUnit = fromCents(addonsCostCents);
      const lineTotal = fromCents((toCents(sz.price) + addonsTotalCents) * qty);
      const lineCogs = fromCents((toCents(unitCost) + addonsCostCents) * qty);

      for (const r of recs) {
        const ing = ingMap.get(r.ingredient_id);
        if (ing) {
          const delta = roundMoney(r.qty_required * qty * 100) / 100;
          ing.stock_qty = Math.round((ing.stock_qty - delta) * 10000) / 10000;
          ing.updated_at = nowSql();
          db.stock_movements.unshift({
            id: db.nextId++,
            ingredient_id: ing.id,
            ingredient_name: ing.name,
            unit: ing.unit,
            movement_type: 'sale_deduction',
            qty_delta: -delta,
            unit_cost: ing.unit_cost,
            reference_no: invoiceNo,
            notes: `بيع ${mi.name} (${szDef.name}) × ${qty}`,
            created_by_name: user.full_name,
            created_at: nowSql(),
          });
        }
      }

      lines.push({
        id: db.nextId++,
        order_id: orderId,
        menu_item_id: mi.id,
        item_name: mi.name,
        item_size_id: sz.id,
        size_name: szDef.name,
        qty,
        unit_price: sz.price,
        unit_cost: unitCost,
        addons: chosenAddons,
        addons_total: addonsTotalPerUnit,
        line_total: lineTotal,
        line_cogs: lineCogs,
        notes: line.notes || '',
        addonsCostPerUnit,
      });
    }

    const orderType = (body.order_type as OrderType) || 'dine_in';
    const deliveryFee = orderType === 'delivery' ? Math.max(0, roundMoney(Number(body.delivery_fee) || 0)) : 0;
    const fin = calculateOrderFinancials({
      lines: lines.map((l) => ({
        qty: l.qty,
        unitPrice: l.unit_price,
        unitCost: l.unit_cost,
        addonsTotalPerUnit: l.addons_total,
        addonsCostPerUnit: l.addonsCostPerUnit,
      })),
      discountType,
      discountValue,
      taxRate: db.settings.vat_rate,
      taxInclusive: db.settings.tax_inclusive === 1,
      deliveryFee,
    });

    const paidAmount = Math.max(fin.grandTotal, roundMoney(Number(body.paid_amount) || fin.grandTotal));
    const changeAmount = fromCents(Math.max(0, toCents(paidAmount) - toCents(fin.grandTotal)));
    const status: OrderStatus = orderType === 'dine_in' ? 'preparing' : 'completed';
    const tableId = orderType === 'dine_in' && body.table_id ? Number(body.table_id) : null;

    if (tableId) {
      const tbl = db.tables.find((t) => t.id === tableId);
      if (tbl) {
        tbl.status = 'occupied';
        tbl.current_order_id = orderId;
      }
    }

    const storedOrder: StoredOrder = {
      id: orderId,
      invoice_no: invoiceNo,
      order_type: orderType,
      table_id: tableId,
      customer_name: String(body.customer_name || ''),
      customer_phone: String(body.customer_phone || ''),
      customer_address: String(body.customer_address || ''),
      status,
      payment_method: (body.payment_method as PaymentMethod) || 'cash',
      subtotal: fin.subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: fin.discountAmount,
      net_before_tax: fin.netBeforeTax,
      tax_rate: db.settings.vat_rate,
      tax_inclusive: db.settings.tax_inclusive,
      tax_amount: fin.taxAmount,
      delivery_fee: fin.deliveryFee,
      grand_total: fin.grandTotal,
      paid_amount: paidAmount,
      change_amount: changeAmount,
      total_cogs: fin.totalCogs,
      notes: String(body.notes || ''),
      created_by: user.id,
      created_at: nowSql(),
      voided_by: null,
      voided_reason: null,
      voided_at: null,
      items: lines.map(({ addonsCostPerUnit: _o, ...rest }) => rest),
    };

    db.orders.unshift(storedOrder);
    addAudit(db, user, 'ORDER_CREATED', 'orders', orderId, { invoice_no: invoiceNo, grand_total: fin.grandTotal });
    saveDb(db);
    return hydrateOrders(db, [storedOrder])[0] as T;
  }

  if (/^\/api\/orders\/\d+\/status$/.test(pathname) && method === 'PATCH') {
    const user = requireSessionUser(db, token, 'tables.manage');
    const id = Number(pathname.split('/')[3]);
    const ord = db.orders.find((o) => o.id === id);
    if (!ord) throw new Error('الطلب غير موجود');
    ord.status = (body.status as OrderStatus) || ord.status;
    if ((ord.status === 'completed' || ord.status === 'voided') && ord.table_id) {
      const tbl = db.tables.find((t) => t.id === ord.table_id);
      if (tbl && tbl.current_order_id === id) {
        tbl.status = 'available';
        tbl.current_order_id = null;
      }
    }
    addAudit(db, user, 'ORDER_STATUS_UPDATED', 'orders', id, { status: ord.status });
    saveDb(db);
    return { ok: true } as T;
  }

  if (/^\/api\/orders\/\d+\/void$/.test(pathname) && method === 'POST') {
    const user = requireSessionUser(db, token, 'pos.void_order');
    const id = Number(pathname.split('/')[3]);
    const ord = db.orders.find((o) => o.id === id);
    if (!ord) throw new Error('الطلب غير موجود');
    if (ord.status === 'voided') throw new Error('الفاتورة ملغاة مسبقاً');

    ord.status = 'voided';
    ord.voided_by = user.id;
    ord.voided_reason = String(body.reason || 'إلغاء فاتورة');
    ord.voided_at = nowSql();

    if (ord.table_id) {
      const tbl = db.tables.find((t) => t.id === ord.table_id);
      if (tbl && tbl.current_order_id === id) {
        tbl.status = 'available';
        tbl.current_order_id = null;
      }
    }

    const ingMap = new Map(db.ingredients.map((i) => [i.id, i]));
    for (const item of ord.items) {
      const recs = db.recipes.filter((r) => r.item_size_id === item.item_size_id);
      for (const r of recs) {
        const ing = ingMap.get(r.ingredient_id);
        if (ing) {
          const delta = roundMoney(r.qty_required * item.qty * 100) / 100;
          ing.stock_qty = Math.round((ing.stock_qty + delta) * 10000) / 10000;
          ing.updated_at = nowSql();
          db.stock_movements.unshift({
            id: db.nextId++,
            ingredient_id: ing.id,
            ingredient_name: ing.name,
            unit: ing.unit,
            movement_type: 'void_restore',
            qty_delta: delta,
            unit_cost: ing.unit_cost,
            reference_no: ord.invoice_no,
            notes: `عكس مخزون لإلغاء الفاتورة ${ord.invoice_no}`,
            created_by_name: user.full_name,
            created_at: nowSql(),
          });
        }
      }
    }

    addAudit(db, user, 'ORDER_VOIDED', 'orders', id, { reason: ord.voided_reason });
    saveDb(db);
    return { ok: true } as T;
  }

  // Inventory & Purchases
  if (pathname === '/api/inventory' && method === 'GET') {
    requireSessionUser(db, token, 'inventory.view');
    return {
      ingredients: db.ingredients,
      movements: db.stock_movements.slice(0, 100),
      suppliers: db.suppliers,
      purchases: db.purchase_invoices.slice(0, 50),
    } as T;
  }

  if (pathname === '/api/ingredients' && method === 'POST') {
    const user = requireSessionUser(db, token, 'inventory.manage');
    const id = db.nextId++;
    db.ingredients.push({
      id,
      name: String(body.name || ''),
      sku: String(body.sku || `ING-${id}`),
      unit: String(body.unit || 'كجم'),
      stock_qty: Number(body.stock_qty) || 0,
      min_threshold: Number(body.min_threshold) || 5,
      unit_cost: Number(body.unit_cost) || 0,
      supplier_name: String(body.supplier_name || ''),
      updated_at: nowSql(),
    });
    addAudit(db, user, 'INGREDIENT_CREATED', 'ingredients', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname === '/api/inventory/adjust' && method === 'POST') {
    const user = requireSessionUser(db, token, 'inventory.manage');
    const ing = db.ingredients.find((i) => i.id === Number(body.ingredient_id));
    if (!ing) throw new Error('المادة غير موجودة');
    const qtyDelta = Number(body.qty_delta) || 0;
    ing.stock_qty = Math.round((ing.stock_qty + qtyDelta) * 10000) / 10000;
    ing.updated_at = nowSql();
    db.stock_movements.unshift({
      id: db.nextId++,
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      unit: ing.unit,
      movement_type: (body.movement_type as 'waste' | 'adjustment') || 'adjustment',
      qty_delta: qtyDelta,
      unit_cost: ing.unit_cost,
      reference_no: `ADJ-${Date.now()}`,
      notes: String(body.notes || ''),
      created_by_name: user.full_name,
      created_at: nowSql(),
    });
    addAudit(db, user, 'INVENTORY_ADJUSTED', 'ingredients', ing.id, body);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/purchases' && method === 'POST') {
    const user = requireSessionUser(db, token, 'inventory.manage');
    const sup = db.suppliers.find((s) => s.id === Number(body.supplier_id));
    const lines = (body.items as Array<{ ingredient_id: number; qty: number; unit_cost: number }>) || [];
    let totalCents = 0;
    const invoiceNo = `PUR-${Date.now()}`;
    for (const l of lines) {
      const ing = db.ingredients.find((i) => i.id === Number(l.ingredient_id));
      if (!ing) continue;
      const oldVal = Math.max(0, ing.stock_qty) * ing.unit_cost;
      const newVal = l.qty * l.unit_cost;
      const nextQty = Math.max(0.0001, Math.max(0, ing.stock_qty) + l.qty);
      ing.unit_cost = roundMoney((oldVal + newVal) / nextQty);
      ing.stock_qty = Math.round((ing.stock_qty + l.qty) * 10000) / 10000;
      ing.updated_at = nowSql();
      totalCents += toCents(newVal);
      db.stock_movements.unshift({
        id: db.nextId++,
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.unit,
        movement_type: 'purchase',
        qty_delta: l.qty,
        unit_cost: l.unit_cost,
        reference_no: invoiceNo,
        notes: 'فاتورة مشتريات',
        created_by_name: user.full_name,
        created_at: nowSql(),
      });
    }
    const totalAmount = fromCents(totalCents);
    const id = db.nextId++;
    db.purchase_invoices.unshift({
      id,
      invoice_no: invoiceNo,
      supplier_id: Number(body.supplier_id),
      supplier_name: sup?.name || '',
      total_amount: totalAmount,
      paid_amount: Number(body.paid_amount ?? totalAmount),
      payment_method: (body.payment_method as PaymentMethod) || 'transfer',
      notes: String(body.notes || ''),
      created_by_name: user.full_name,
      created_at: nowSql(),
    });
    addAudit(db, user, 'PURCHASE_CREATED', 'purchase_invoices', id, { invoice_no: invoiceNo, totalAmount });
    saveDb(db);
    return { id, invoice_no: invoiceNo } as T;
  }

  // Expenses & Accounting Audit
  if (pathname === '/api/expenses' && method === 'GET') {
    requireSessionUser(db, token, 'accounting.view');
    return db.expenses as T;
  }

  if (pathname === '/api/expenses' && method === 'POST') {
    const user = requireSessionUser(db, token, 'accounting.manage_expenses');
    const id = db.nextId++;
    db.expenses.unshift({
      id,
      title: String(body.title || ''),
      category: String(body.category || 'تشغيل'),
      amount: roundMoney(Number(body.amount) || 0),
      payment_method: (body.payment_method as PaymentMethod) || 'cash',
      reference_no: String(body.reference_no || ''),
      expense_date: String(body.expense_date || new Date().toISOString().slice(0, 10)),
      notes: String(body.notes || ''),
      created_by: user.id,
      created_by_name: user.full_name,
      created_at: nowSql(),
    });
    addAudit(db, user, 'EXPENSE_CREATED', 'expenses', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/expenses/') && method === 'DELETE') {
    const user = requireSessionUser(db, token, 'accounting.manage_expenses');
    const id = Number(pathname.split('/').pop());
    db.expenses = db.expenses.filter((e) => e.id !== id);
    addAudit(db, user, 'EXPENSE_DELETED', 'expenses', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/audit-logs' && method === 'GET') {
    requireSessionUser(db, token, 'accounting.view');
    return db.audit_logs.slice(0, 120) as T;
  }

  if (pathname === '/api/accounting/audit' && method === 'GET') {
    requireSessionUser(db, token, 'accounting.view');
    const validOrders = db.orders.filter((o) => o.status !== 'voided');
    const voidedOrders = db.orders.filter((o) => o.status === 'voided');

    let grossSalesWithTaxCents = 0;
    let totalDiscountsCents = 0;
    let netSalesExclTaxCents = 0;
    let totalVatCents = 0;
    let totalDeliveryCents = 0;
    let totalGrandRevenueCents = 0;
    let totalCogsCents = 0;
    let cashSalesCents = 0;
    let cardSalesCents = 0;
    let transferSalesCents = 0;

    const orderAudits: FinancialAuditReport['orderAudits'] = [];

    for (const o of db.orders) {
      let lineSumCents = 0;
      for (const it of o.items) lineSumCents += toCents(it.line_total);
      const recomputed = calculateOrderFinancials({
        lines: o.items.map((it) => ({
          qty: it.qty,
          unitPrice: it.unit_price,
          unitCost: it.unit_cost,
          addonsTotalPerUnit: it.addons_total,
          addonsCostPerUnit: it.addons.reduce((s, a) => s + a.cost, 0),
        })),
        discountType: o.discount_type,
        discountValue: o.discount_value,
        taxRate: o.tax_rate,
        taxInclusive: o.tax_inclusive === 1,
        deliveryFee: o.delivery_fee,
      });
      const variance = fromCents(Math.abs(toCents(o.grand_total) - toCents(recomputed.grandTotal)));
      const lineOk = Math.abs(lineSumCents - toCents(o.subtotal)) <= 1;
      orderAudits.push({
        order_id: o.id,
        invoice_no: o.invoice_no,
        created_at: o.created_at,
        status: o.status,
        recorded_grand_total: o.grand_total,
        recomputed_grand_total: recomputed.grandTotal,
        variance,
        passed: variance <= 0.02 && lineOk,
      });
    }

    for (const o of validOrders) {
      grossSalesWithTaxCents += toCents(o.subtotal);
      totalDiscountsCents += toCents(o.discount_amount);
      netSalesExclTaxCents += toCents(o.net_before_tax);
      totalVatCents += toCents(o.tax_amount);
      totalDeliveryCents += toCents(o.delivery_fee);
      totalGrandRevenueCents += toCents(o.grand_total);
      totalCogsCents += toCents(o.total_cogs);
      if (o.payment_method === 'cash') cashSalesCents += toCents(o.grand_total);
      else if (o.payment_method === 'card') cardSalesCents += toCents(o.grand_total);
      else transferSalesCents += toCents(o.grand_total);
    }

    let opExpCents = 0;
    let cashExpCents = 0;
    for (const e of db.expenses) {
      opExpCents += toCents(e.amount);
      if (e.payment_method === 'cash') cashExpCents += toCents(e.amount);
    }

    const grossProfitCents = netSalesExclTaxCents + totalDeliveryCents - totalCogsCents;
    const netOperatingProfitCents = grossProfitCents - opExpCents;
    const expectedCashCents = cashSalesCents - cashExpCents;

    const allOrdersPassed = orderAudits.every((a) => a.passed);
    const equationVariance = fromCents(Math.abs(totalGrandRevenueCents - (netSalesExclTaxCents + totalVatCents + totalDeliveryCents)));
    const paymentSumVariance = fromCents(Math.abs(totalGrandRevenueCents - (cashSalesCents + cardSalesCents + transferSalesCents)));

    const integrityChecks: FinancialAuditReport['integrityChecks'] = [
      {
        checkId: 'CHK-01',
        title: 'مطابقة إعادة حساب بنود وضرائب كل فاتورة',
        passed: allOrdersPassed,
        expectedValue: orderAudits.length,
        actualValue: orderAudits.filter((a) => a.passed).length,
        variance: orderAudits.filter((a) => !a.passed).length,
        details: allOrdersPassed ? 'جميع الفواتير مطابقة حسابياً 100%.' : 'توجد فروقات في بعض الفواتير.',
      },
      {
        checkId: 'CHK-02',
        title: 'توازن معادلة الإيراد الكلي (الصافي + الضريبة + التوصيل = الإجمالي)',
        passed: equationVariance <= 0.05,
        expectedValue: fromCents(netSalesExclTaxCents + totalVatCents + totalDeliveryCents),
        actualValue: fromCents(totalGrandRevenueCents),
        variance: equationVariance,
        details: 'التحقق من تطابق صافي المبيعات والضريبة ورسوم التوصيل مع إجمالي الفواتير.',
      },
      {
        checkId: 'CHK-03',
        title: 'تطابق وسائل الدفع (نقدي + شبكة + تحويل) مع المبيعات',
        passed: paymentSumVariance <= 0.05,
        expectedValue: fromCents(totalGrandRevenueCents),
        actualValue: fromCents(cashSalesCents + cardSalesCents + transferSalesCents),
        variance: paymentSumVariance,
        details: 'التحقق من عدم وجود مبيعات غير مصنفة ضمن طرق الدفع المعتمدة.',
      },
    ];

    const report: FinancialAuditReport = {
      generatedAt: nowSql(),
      summary: {
        grossSalesWithTax: fromCents(grossSalesWithTaxCents),
        totalDiscounts: fromCents(totalDiscountsCents),
        netSalesExclTax: fromCents(netSalesExclTaxCents),
        totalVatCollected: fromCents(totalVatCents),
        totalDeliveryFees: fromCents(totalDeliveryCents),
        totalGrandRevenue: fromCents(totalGrandRevenueCents),
        totalCogs: fromCents(totalCogsCents),
        grossProfit: fromCents(grossProfitCents),
        operatingExpenses: fromCents(opExpCents),
        netOperatingProfit: fromCents(netOperatingProfitCents),
        netProfitMarginPct: netSalesExclTaxCents > 0 ? roundMoney((netOperatingProfitCents / netSalesExclTaxCents) * 100) : 0,
        cashSalesTotal: fromCents(cashSalesCents),
        cardSalesTotal: fromCents(cardSalesCents),
        transferSalesTotal: fromCents(transferSalesCents),
        cashExpensesTotal: fromCents(cashExpCents),
        expectedCashInDrawer: fromCents(expectedCashCents),
        voidedOrdersCount: voidedOrders.length,
        voidedOrdersValue: fromCents(voidedOrders.reduce((s, o) => s + toCents(o.grand_total), 0)),
      },
      integrityChecks,
      orderAudits,
      allPassed: integrityChecks.every((c) => c.passed),
    };
    return report as T;
  }

  // Dashboard
  if (pathname === '/api/dashboard' && method === 'GET') {
    requireSessionUser(db, token, 'dashboard.view');
    const days = Math.max(1, Number(url.searchParams.get('days') || 30));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const validOrders = db.orders.filter((o) => o.status !== 'voided' && o.created_at.slice(0, 10) >= cutoff);
    const voidedOrders = db.orders.filter((o) => o.status === 'voided' && o.created_at.slice(0, 10) >= cutoff);
    const validExpenses = db.expenses.filter((e) => e.expense_date >= cutoff);

    let revCents = 0;
    let netSalesCents = 0;
    let taxCents = 0;
    let discCents = 0;
    let cogsCents = 0;
    let todayRevCents = 0;
    let todayOrders = 0;

    for (const o of validOrders) {
      revCents += toCents(o.grand_total);
      netSalesCents += toCents(o.net_before_tax);
      taxCents += toCents(o.tax_amount);
      discCents += toCents(o.discount_amount);
      cogsCents += toCents(o.total_cogs);
      if (o.created_at.slice(0, 10) === todayStr) {
        todayRevCents += toCents(o.grand_total);
        todayOrders += 1;
      }
    }

    const expCents = validExpenses.reduce((s, e) => s + toCents(e.amount), 0);
    const netProfitCents = netSalesCents - cogsCents - expCents;
    const grossProfitMargin = netSalesCents > 0 ? roundMoney(((netSalesCents - cogsCents) / netSalesCents) * 100) : 0;

    const itemMap = new Map(db.menu_items.map((m) => [m.id, m]));
    const catMap = new Map(db.categories.map((c) => [c.id, c.name]));

    const bestSellerMap = new Map<string, DashboardData['bestSellers'][0]>();
    const catBreakdownMap = new Map<string, { category_name: string; qty_sold: number; revenue: number }>();
    const dailyMap = new Map<string, { date: string; revenue: number; cogs: number; expenses: number; profit: number; orders: number }>();
    const orderTypeMap = new Map<OrderType, { order_type: OrderType; count: number; revenue: number }>();
    const payMap = new Map<PaymentMethod, { payment_method: PaymentMethod; count: number; revenue: number }>();

    for (const o of validOrders) {
      const dKey = o.created_at.slice(0, 10);
      const dEntry = dailyMap.get(dKey) || { date: dKey, revenue: 0, cogs: 0, expenses: 0, profit: 0, orders: 0 };
      dEntry.revenue = roundMoney(dEntry.revenue + o.grand_total);
      dEntry.cogs = roundMoney(dEntry.cogs + o.total_cogs);
      dEntry.profit = roundMoney(dEntry.profit + (o.net_before_tax - o.total_cogs));
      dEntry.orders += 1;
      dailyMap.set(dKey, dEntry);

      const ot = orderTypeMap.get(o.order_type) || { order_type: o.order_type, count: 0, revenue: 0 };
      ot.count += 1;
      ot.revenue = roundMoney(ot.revenue + o.grand_total);
      orderTypeMap.set(o.order_type, ot);

      const pm = payMap.get(o.payment_method) || { payment_method: o.payment_method, count: 0, revenue: 0 };
      pm.count += 1;
      pm.revenue = roundMoney(pm.revenue + o.grand_total);
      payMap.set(o.payment_method, pm);

      for (const it of o.items) {
        const mi = itemMap.get(it.menu_item_id);
        const catName = mi ? catMap.get(mi.category_id) || 'أخرى' : 'أخرى';
        const bsKey = `${it.menu_item_id}-${it.size_name}`;
        const bs = bestSellerMap.get(bsKey) || {
          menu_item_id: it.menu_item_id,
          item_name: it.item_name,
          size_name: it.size_name,
          category_name: catName,
          qty_sold: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
        };
        bs.qty_sold += it.qty;
        bs.revenue = roundMoney(bs.revenue + it.line_total);
        bs.cogs = roundMoney(bs.cogs + it.line_cogs);
        bs.profit = roundMoney(bs.revenue - bs.cogs);
        bestSellerMap.set(bsKey, bs);

        const cb = catBreakdownMap.get(catName) || { category_name: catName, qty_sold: 0, revenue: 0 };
        cb.qty_sold += it.qty;
        cb.revenue = roundMoney(cb.revenue + it.line_total);
        catBreakdownMap.set(catName, cb);
      }
    }

    for (const e of validExpenses) {
      const dEntry = dailyMap.get(e.expense_date) || { date: e.expense_date, revenue: 0, cogs: 0, expenses: 0, profit: 0, orders: 0 };
      dEntry.expenses = roundMoney(dEntry.expenses + e.amount);
      dEntry.profit = roundMoney(dEntry.profit - e.amount);
      dailyMap.set(e.expense_date, dEntry);
    }

    const getWeekStart = (isoDate: string): string => {
      const dt = new Date(`${isoDate}T00:00:00Z`);
      const daysSinceSat = (dt.getUTCDay() + 1) % 7;
      return new Date(dt.getTime() - daysSinceSat * 86400000).toISOString().slice(0, 10);
    };

    const weeklyMap = new Map<string, { revenue: number; cogs: number; expenses: number; profit: number; orders: number }>();
    for (const d of dailyMap.values()) {
      const wk = getWeekStart(d.date);
      const w = weeklyMap.get(wk) || { revenue: 0, cogs: 0, expenses: 0, profit: 0, orders: 0 };
      w.revenue = roundMoney(w.revenue + d.revenue);
      w.cogs = roundMoney(w.cogs + d.cogs);
      w.expenses = roundMoney(w.expenses + d.expenses);
      w.profit = roundMoney(w.profit + d.profit);
      w.orders += d.orders;
      weeklyMap.set(wk, w);
    }

    const weeklySeries = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        label: `أسبوع ${weekStart.slice(5)}`,
        revenue: v.revenue,
        cogs: v.cogs,
        expenses: v.expenses,
        profit: v.profit,
        orders: v.orders,
      }));

    const lowStock = db.ingredients.filter((i) => i.stock_qty <= i.min_threshold);

    const data: DashboardData = {
      kpis: {
        totalRevenue: fromCents(revCents),
        netSalesBeforeTax: fromCents(netSalesCents),
        totalTax: fromCents(taxCents),
        totalDiscounts: fromCents(discCents),
        totalCogs: fromCents(cogsCents),
        totalExpenses: fromCents(expCents),
        netProfit: fromCents(netProfitCents),
        grossProfitMargin,
        orderCount: validOrders.length,
        voidedCount: voidedOrders.length,
        averageOrderValue: validOrders.length > 0 ? fromCents(Math.round(revCents / validOrders.length)) : 0,
        todayRevenue: fromCents(todayRevCents),
        todayOrders,
        lowStockCount: lowStock.length,
      },
      bestSellers: Array.from(bestSellerMap.values()).sort((a, b) => b.qty_sold - a.qty_sold).slice(0, 10),
      categoryBreakdown: Array.from(catBreakdownMap.values()).sort((a, b) => b.revenue - a.revenue),
      dailySeries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      weeklySeries,
      orderTypeBreakdown: Array.from(orderTypeMap.values()),
      paymentBreakdown: Array.from(payMap.values()),
      lowStockIngredients: lowStock,
      recentOrders: hydrateOrders(db, [...db.orders].sort((a, b) => b.id - a.id).slice(0, 8)),
    };
    return data as T;
  }

  // Users & Roles
  if (pathname === '/api/users' && method === 'GET') {
    requireSessionUser(db, token, 'users.manage');
    return db.users.map((u) => hydrateUser(db, u)) as T;
  }

  if (pathname === '/api/users' && method === 'POST') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const username = String(body.username || '').trim();
    if (db.users.some((u) => u.username === username)) throw new Error('اسم المستخدم مسجل مسبقاً');
    const id = db.nextId++;
    db.users.push({
      id,
      username,
      full_name: String(body.full_name || ''),
      password: String(body.password || '123456'),
      role_id: Number(body.role_id),
      active: Number(body.active ?? 1),
      created_at: nowSql(),
    });
    addAudit(db, adminUser, 'USER_CREATED', 'users', id, { username });
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const id = Number(pathname.split('/').pop());
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new Error('المستخدم غير موجود');
    u.full_name = String(body.full_name || u.full_name);
    u.role_id = Number(body.role_id ?? u.role_id);
    u.active = Number(body.active ?? u.active);
    if (body.password && String(body.password).trim()) u.password = String(body.password);
    addAudit(db, adminUser, 'USER_UPDATED', 'users', id, { full_name: u.full_name });
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const id = Number(pathname.split('/').pop());
    if (id === adminUser.id || id === 1) throw new Error('لا يمكن حذف المدير الأساسي للنظام');
    db.users = db.users.filter((u) => u.id !== id);
    addAudit(db, adminUser, 'USER_DELETED', 'users', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/roles' && method === 'GET') {
    requireSessionUser(db, token, 'users.manage');
    return db.roles as T;
  }

  if (pathname === '/api/roles' && method === 'POST') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const id = db.nextId++;
    db.roles.push({
      id,
      name: String(body.name || `role_${id}`),
      display_name: String(body.display_name || ''),
      description: String(body.description || ''),
      permissions: (body.permissions as PermissionKey[]) || [],
      is_system: 0,
    });
    addAudit(db, adminUser, 'ROLE_CREATED', 'roles', id, body);
    saveDb(db);
    return { id } as T;
  }

  if (pathname.startsWith('/api/roles/') && method === 'PUT') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const id = Number(pathname.split('/').pop());
    const r = db.roles.find((x) => x.id === id);
    if (r) {
      r.display_name = String(body.display_name || r.display_name);
      r.description = String(body.description ?? r.description);
      r.permissions = (body.permissions as PermissionKey[]) || r.permissions;
    }
    addAudit(db, adminUser, 'ROLE_UPDATED', 'roles', id, body);
    saveDb(db);
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/roles/') && method === 'DELETE') {
    const adminUser = requireSessionUser(db, token, 'users.manage');
    const id = Number(pathname.split('/').pop());
    const r = db.roles.find((x) => x.id === id);
    if (r?.is_system) throw new Error('لا يمكن حذف الأدوار الأساسية للنظام');
    db.roles = db.roles.filter((x) => x.id !== id);
    addAudit(db, adminUser, 'ROLE_DELETED', 'roles', id, {});
    saveDb(db);
    return { ok: true } as T;
  }

  throw new Error(`المسار غير مدعوم محلياً: ${pathname}`);
}
