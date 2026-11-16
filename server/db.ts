import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { calculateOrderFinancials, toCents, fromCents } from '../src/shared/money.ts';
import type { PermissionKey } from '../src/shared/types.ts';

const DB_PATH = path.resolve(process.cwd(), 'restaurant_erp.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      restaurant_name TEXT NOT NULL,
      tax_number TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      currency_symbol TEXT NOT NULL DEFAULT 'ر.س',
      vat_rate REAL NOT NULL DEFAULT 15,
      tax_inclusive INTEGER NOT NULL DEFAULT 1,
      receipt_footer TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit TEXT NOT NULL,
      stock_qty REAL NOT NULL DEFAULT 0,
      min_threshold REAL NOT NULL DEFAULT 5,
      unit_cost REAL NOT NULL DEFAULT 0,
      supplier_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      prep_minutes INTEGER NOT NULL DEFAULT 12,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS item_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      size_id INTEGER NOT NULL,
      price REAL NOT NULL,
      cost_override REAL NULL,
      sku TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (size_id) REFERENCES sizes(id)
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_size_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      qty_required REAL NOT NULL,
      FOREIGN KEY (item_size_id) REFERENCES item_sizes(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    CREATE TABLE IF NOT EXISTS addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS dining_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT NOT NULL UNIQUE,
      zone TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'available',
      current_order_id INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL,
      table_id INTEGER NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'preparing',
      payment_method TEXT NOT NULL DEFAULT 'cash',
      subtotal REAL NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      net_before_tax REAL NOT NULL,
      tax_rate REAL NOT NULL,
      tax_inclusive INTEGER NOT NULL DEFAULT 1,
      tax_amount REAL NOT NULL,
      delivery_fee REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      change_amount REAL NOT NULL DEFAULT 0,
      total_cogs REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      voided_by INTEGER NULL,
      voided_reason TEXT NULL,
      voided_at TEXT NULL,
      FOREIGN KEY (table_id) REFERENCES dining_tables(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_size_id INTEGER NOT NULL,
      size_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL,
      addons_json TEXT NOT NULL DEFAULT '[]',
      addons_total REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      line_cogs REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reference_no TEXT NOT NULL DEFAULT '',
      expense_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      qty_delta REAL NOT NULL,
      unit_cost REAL NOT NULL,
      reference_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      tax_number TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      paid_amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'transfer',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    seedInitialData();
  }
}

function seedInitialData(): void {
  const seedTx = db.transaction(() => {
    // 1. Settings
    db.prepare(`
      INSERT INTO settings (id, restaurant_name, tax_number, phone, address, currency_symbol, vat_rate, tax_inclusive, receipt_footer)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'مطعم ومشويات سُفرة الأصيل',
      '310482910400003',
      '0550192834',
      'الرياض — طريق الملك فهد، حي العليا',
      'ر.س',
      15,
      1,
      'شكراً لزيارتكم — نسعد بخدمتكم دائماً'
    );

    // 2. Roles & Permissions
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

    const managerPerms: PermissionKey[] = [
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
    ];

    const cashierPerms: PermissionKey[] = [
      'pos.create_order',
      'pos.apply_discount',
      'menu.view',
      'tables.view',
      'tables.manage',
    ];

    const accountantPerms: PermissionKey[] = [
      'dashboard.view',
      'menu.view',
      'inventory.view',
      'inventory.manage',
      'accounting.view',
      'accounting.manage_expenses',
      'accounting.audit',
      'reports.export',
    ];

    const insertRole = db.prepare('INSERT INTO roles (name, display_name, description, permissions_json, is_system) VALUES (?, ?, ?, ?, ?)');
    const rAdmin = insertRole.run('super_admin', 'المدير العام (أدمن أساسي)', 'صلاحيات كاملة لإدارة النظام والأصناف والمحاسبة والمستخدمين والتدقيق', JSON.stringify(allPerms), 1).lastInsertRowid;
    const rManager = insertRole.run('branch_manager', 'مدير الفرع', 'إدارة التشغيل اليومي والمنيو والمخزون والمبيعات', JSON.stringify(managerPerms), 1).lastInsertRowid;
    const rCashier = insertRole.run('cashier', 'كاشير نقطة البيع', 'استقبال الطلبات وإدارة الطاولات وإصدار الفواتير', JSON.stringify(cashierPerms), 1).lastInsertRowid;
    const rAccountant = insertRole.run('accountant', 'محاسب مالي ومخزون', 'التقارير المالية والمصروفات والتدقيق الحسابي وتصدير Excel/PDF', JSON.stringify(accountantPerms), 1).lastInsertRowid;

    // 3. Users
    const insertUser = db.prepare('INSERT INTO users (username, full_name, password_hash, role_id, active) VALUES (?, ?, ?, ?, 1)');
    const uAdminId = Number(insertUser.run('admin', 'فهد العتيبي (المدير العام)', bcrypt.hashSync('admin123', 10), rAdmin).lastInsertRowid);
    insertUser.run('manager', 'خالد الدوسري', bcrypt.hashSync('123456', 10), rManager);
    const uCashierId = Number(insertUser.run('cashier', 'سارة القحطاني', bcrypt.hashSync('123456', 10), rCashier).lastInsertRowid);
    insertUser.run('accountant', 'عبدالرحمن السبيعي', bcrypt.hashSync('123456', 10), rAccountant);

    // 4. Categories
    const insertCat = db.prepare('INSERT INTO categories (name, sort_order, active) VALUES (?, ?, 1)');
    const cGrill = Number(insertCat.run('المشويات والأطباق الرئيسية', 1).lastInsertRowid);
    const cBurger = Number(insertCat.run('البرجر الفاخر', 2).lastInsertRowid);
    const cPizza = Number(insertCat.run('البيتزا على الحطب', 3).lastInsertRowid);
    const cAppetizer = Number(insertCat.run('المقبلات والسلطات', 4).lastInsertRowid);
    const cDessert = Number(insertCat.run('الحلويات الشرقية', 5).lastInsertRowid);
    const cDrinks = Number(insertCat.run('المشروبات الطازجة', 6).lastInsertRowid);

    // 5. Sizes
    const insertSize = db.prepare('INSERT INTO sizes (name, code, sort_order, active) VALUES (?, ?, ?, 1)');
    const sSingle = Number(insertSize.run('مفرد', 'SGL', 1).lastInsertRowid);
    const sSmall = Number(insertSize.run('صغير', 'SM', 2).lastInsertRowid);
    const sMedium = Number(insertSize.run('وسط', 'MD', 3).lastInsertRowid);
    const sLarge = Number(insertSize.run('كبير', 'LG', 4).lastInsertRowid);
    const sFamily = Number(insertSize.run('عائلي', 'FAM', 5).lastInsertRowid);

    // 6. Suppliers
    const insertSupplier = db.prepare('INSERT INTO suppliers (name, phone, tax_number, active) VALUES (?, ?, ?, 1)');
    insertSupplier.run('شركة المراعي الطازجة للحوم', '0114829100', '300192837100003');
    insertSupplier.run('مؤسسة سنابل للمخابز والأجبان', '0112948102', '300481920400003');
    insertSupplier.run('توريدات الخليج للخضار والزيوت', '0118472910', '300918273600003');

    // 7. Ingredients (ERP Warehouse)
    const insertIng = db.prepare('INSERT INTO ingredients (name, sku, unit, stock_qty, min_threshold, unit_cost, supplier_name) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const iLamb = Number(insertIng.run('لحم غنم نعيمي طازج', 'ING-001', 'كجم', 42.5, 10, 58.00, 'شركة المراعي الطازجة للحوم').lastInsertRowid);
    const iBeef = Number(insertIng.run('لحم بقري أنجوس مفروم', 'ING-002', 'كجم', 35.0, 8, 46.00, 'شركة المراعي الطازجة للحوم').lastInsertRowid);
    const iChicken = Number(insertIng.run('صدور دجاج متبلة', 'ING-003', 'كجم', 50.0, 12, 24.00, 'شركة المراعي الطازجة للحوم').lastInsertRowid);
    const iFlour = Number(insertIng.run('دقيق بيتزا إيطالي 00', 'ING-004', 'كجم', 65.0, 15, 7.50, 'مؤسسة سنابل للمخابز والأجبان').lastInsertRowid);
    const iMozz = Number(insertIng.run('جبن موزاريلا طبيعي', 'ING-005', 'كجم', 28.0, 8, 34.00, 'مؤسسة سنابل للمخابز والأجبان').lastInsertRowid);
    const iCheddar = Number(insertIng.run('شرائح جبن شيدر معتق', 'ING-006', 'كجم', 18.0, 5, 38.00, 'مؤسسة سنابل للمخابز والأجبان').lastInsertRowid);
    const iBrioche = Number(insertIng.run('خبز بريوش طازج', 'ING-007', 'حبة', 180, 40, 2.20, 'مؤسسة سنابل للمخابز والأجبان').lastInsertRowid);
    const iHummus = Number(insertIng.run('حمص مطحون وطحينة', 'ING-008', 'كجم', 22.0, 6, 16.00, 'توريدات الخليج للخضار والزيوت').lastInsertRowid);
    const iKunafa = Number(insertIng.run('عجينة كنافة طازجة + قشطة', 'ING-009', 'كجم', 16.0, 5, 28.00, 'مؤسسة سنابل للمخابز والأجبان').lastInsertRowid);
    const iPistachio = Number(insertIng.run('فستق حلبي مجروش', 'ING-010', 'كجم', 4.2, 5, 92.00, 'توريدات الخليج للخضار والزيوت').lastInsertRowid); // intentionally low-stock alert!
    const iOliveOil = Number(insertIng.run('زيت زيتون بكر ممتاز', 'ING-011', 'لتر', 19.0, 5, 36.00, 'توريدات الخليج للخضار والزيوت').lastInsertRowid);
    const iLemon = Number(insertIng.run('ليمون ونعناع طازج', 'ING-012', 'كجم', 3.8, 6, 9.50, 'توريدات الخليج للخضار والزيوت').lastInsertRowid); // intentionally low-stock alert!

    // 8. Menu Items + Sizes + Recipes (BOM)
    const insertItem = db.prepare('INSERT INTO menu_items (category_id, name, description, image_url, active, featured, prep_minutes) VALUES (?, ?, ?, ?, 1, ?, ?)');
    const insertItemSize = db.prepare('INSERT INTO item_sizes (menu_item_id, size_id, price, cost_override, sku, active) VALUES (?, ?, ?, NULL, ?, 1)');
    const insertRecipe = db.prepare('INSERT INTO recipes (item_size_id, ingredient_id, qty_required) VALUES (?, ?, ?)');

    const imgGrill = '/src/assets/images/dish_mixed_grill_1794818558133.jpg';
    const imgBurger = '/src/assets/images/dish_artisan_burger_1794818558397.jpg';
    const imgPizza = '/src/assets/images/dish_woodfired_pizza_1794818559696.jpg';
    const imgAppetizer = '/src/assets/images/dish_fresh_appetizer_1794818559243.jpg';
    const imgKunafa = '/src/assets/images/dish_kunafa_dessert_1794818560098.jpg';

    // Item 1: مشويات مشكلة
    const m1 = Number(insertItem.run(cGrill, 'طبق مشويات سُفرة المشكل', 'أوصال لحم نعيمي، شيش طاووق، كباب مشوي على الفحم مع خبز التنور', imgGrill, 1, 18).lastInsertRowid);
    const m1s1 = Number(insertItemSize.run(m1, sSingle, 68, 'GRL-01-S').lastInsertRowid);
    insertRecipe.run(m1s1, iLamb, 0.25);
    insertRecipe.run(m1s1, iChicken, 0.20);
    const m1s2 = Number(insertItemSize.run(m1, sMedium, 118, 'GRL-01-M').lastInsertRowid);
    insertRecipe.run(m1s2, iLamb, 0.45);
    insertRecipe.run(m1s2, iChicken, 0.35);
    const m1s3 = Number(insertItemSize.run(m1, sFamily, 215, 'GRL-01-F').lastInsertRowid);
    insertRecipe.run(m1s3, iLamb, 0.85);
    insertRecipe.run(m1s3, iChicken, 0.65);

    // Item 2: شيش طاووق
    const m2 = Number(insertItem.run(cGrill, 'شيش طاووق على الفحم', 'صدور دجاج متبلة بالزبادي والزعفران مع ثومية وبطاطس', imgGrill, 0, 15).lastInsertRowid);
    const m2s1 = Number(insertItemSize.run(m2, sSingle, 46, 'GRL-02-S').lastInsertRowid);
    insertRecipe.run(m2s1, iChicken, 0.32);
    const m2s2 = Number(insertItemSize.run(m2, sLarge, 78, 'GRL-02-L').lastInsertRowid);
    insertRecipe.run(m2s2, iChicken, 0.55);

    // Item 3: سماش برجر أنجوس
    const m3 = Number(insertItem.run(cBurger, 'سماش برجر أنجوس دبل', 'شريحتا لحم أنجوس طازج، جبن شيدر معتق، صوص خاص، خبز بريوش', imgBurger, 1, 12).lastInsertRowid);
    const m3s1 = Number(insertItemSize.run(m3, sSingle, 38, 'BRG-01-S').lastInsertRowid);
    insertRecipe.run(m3s1, iBeef, 0.16);
    insertRecipe.run(m3s1, iCheddar, 0.04);
    insertRecipe.run(m3s1, iBrioche, 1);
    const m3s2 = Number(insertItemSize.run(m3, sLarge, 52, 'BRG-01-L').lastInsertRowid);
    insertRecipe.run(m3s2, iBeef, 0.28);
    insertRecipe.run(m3s2, iCheddar, 0.07);
    insertRecipe.run(m3s2, iBrioche, 1);

    // Item 4: برجر دجاج مقرمش
    const m4 = Number(insertItem.run(cBurger, 'ترافل تشيكن برجر', 'صدر دجاج مشوي مع جبن شيدر وصلصة الكمأة الفاخرة', imgBurger, 0, 12).lastInsertRowid);
    const m4s1 = Number(insertItemSize.run(m4, sSingle, 34, 'BRG-02-S').lastInsertRowid);
    insertRecipe.run(m4s1, iChicken, 0.18);
    insertRecipe.run(m4s1, iCheddar, 0.03);
    insertRecipe.run(m4s1, iBrioche, 1);

    // Item 5: بيتزا مارغريتا
    const m5 = Number(insertItem.run(cPizza, 'بيتزا مارغريتا نابوليتانا', 'عجينة مخمرة 48 ساعة، صلصة طماطم سان مارزانو، موزاريلا وريحان', imgPizza, 1, 14).lastInsertRowid);
    const m5s1 = Number(insertItemSize.run(m5, sSmall, 36, 'PIZ-01-SM').lastInsertRowid);
    insertRecipe.run(m5s1, iFlour, 0.22);
    insertRecipe.run(m5s1, iMozz, 0.12);
    const m5s2 = Number(insertItemSize.run(m5, sMedium, 52, 'PIZ-01-MD').lastInsertRowid);
    insertRecipe.run(m5s2, iFlour, 0.32);
    insertRecipe.run(m5s2, iMozz, 0.18);
    const m5s3 = Number(insertItemSize.run(m5, sLarge, 68, 'PIZ-01-LG').lastInsertRowid);
    insertRecipe.run(m5s3, iFlour, 0.44);
    insertRecipe.run(m5s3, iMozz, 0.26);

    // Item 6: بيتزا الدجاج والباربكيو
    const m6 = Number(insertItem.run(cPizza, 'بيتزا دجاج مشوي وأجبان', 'دجاج متبل مع موزاريلا وفلفل مشوي مخبوزة على الحطب', imgPizza, 0, 15).lastInsertRowid);
    const m6s1 = Number(insertItemSize.run(m6, sMedium, 58, 'PIZ-02-MD').lastInsertRowid);
    insertRecipe.run(m6s1, iFlour, 0.32);
    insertRecipe.run(m6s1, iMozz, 0.18);
    insertRecipe.run(m6s1, iChicken, 0.14);
    const m6s2 = Number(insertItemSize.run(m6, sLarge, 76, 'PIZ-02-LG').lastInsertRowid);
    insertRecipe.run(m6s2, iFlour, 0.44);
    insertRecipe.run(m6s2, iMozz, 0.26);
    insertRecipe.run(m6s2, iChicken, 0.22);

    // Item 7: طبق حمص وفلافل
    const m7 = Number(insertItem.run(cAppetizer, 'حمص بالطحينة وفلافل مقرمشة', 'حمص كريمي بزيت الزيتون البكر وحبوب الرمان مع فلافل ساخنة', imgAppetizer, 1, 8).lastInsertRowid);
    const m7s1 = Number(insertItemSize.run(m7, sSmall, 22, 'APP-01-SM').lastInsertRowid);
    insertRecipe.run(m7s1, iHummus, 0.22);
    insertRecipe.run(m7s1, iOliveOil, 0.03);
    const m7s2 = Number(insertItemSize.run(m7, sLarge, 34, 'APP-01-LG').lastInsertRowid);
    insertRecipe.run(m7s2, iHummus, 0.38);
    insertRecipe.run(m7s2, iOliveOil, 0.05);

    // Item 8: كنافة بالقشطة والفستق
    const m8 = Number(insertItem.run(cDessert, 'كنافة نابلسية بالقشطة والفستق', 'كنافة ذهبية مقرمشة محشوة بالقشطة الطازجة والفستق الحلبي', imgKunafa, 1, 10).lastInsertRowid);
    const m8s1 = Number(insertItemSize.run(m8, sSingle, 28, 'DES-01-S').lastInsertRowid);
    insertRecipe.run(m8s1, iKunafa, 0.18);
    insertRecipe.run(m8s1, iPistachio, 0.02);
    const m8s2 = Number(insertItemSize.run(m8, sFamily, 78, 'DES-01-F').lastInsertRowid);
    insertRecipe.run(m8s2, iKunafa, 0.55);
    insertRecipe.run(m8s2, iPistachio, 0.06);

    // Item 9: ليمون بالنعناع
    const m9 = Number(insertItem.run(cDrinks, 'عصير ليمون بالنعناع الطازج', 'عصير ليمون طبيعي مع أوراق النعناع المنعشة والثلج المجروش', '', 0, 4).lastInsertRowid);
    const m9s1 = Number(insertItemSize.run(m9, sMedium, 16, 'DRK-01-MD').lastInsertRowid);
    insertRecipe.run(m9s1, iLemon, 0.15);
    const m9s2 = Number(insertItemSize.run(m9, sLarge, 22, 'DRK-01-LG').lastInsertRowid);
    insertRecipe.run(m9s2, iLemon, 0.24);

    // Item 10: مياه غازية / معدنية
    const m10 = Number(insertItem.run(cDrinks, 'مشروبات غازية ومياه فوارة', 'تشكيلة مشروبات باردة', '', 0, 2).lastInsertRowid);
    insertItemSize.run(m10, sSingle, 8, 'DRK-02-S');

    // 9. Addons
    const insertAddon = db.prepare('INSERT INTO addons (name, price, cost, active) VALUES (?, ?, ?, 1)');
    const aCheese = Number(insertAddon.run('إضافة جبن شيدر / موزاريلا', 6, 2.20).lastInsertRowid);
    const aFries = Number(insertAddon.run('بطاطس مقرمشة جانبية', 10, 3.00).lastInsertRowid);
    const aGarlic = Number(insertAddon.run('صوص ثومية / ترافل إضافي', 4, 0.90).lastInsertRowid);
    const aBread = Number(insertAddon.run('سلة خبز تنور ساخن', 5, 1.20).lastInsertRowid);

    // 10. Dining Tables
    const insertTable = db.prepare('INSERT INTO dining_tables (table_number, zone, capacity, status) VALUES (?, ?, ?, ?)');
    insertTable.run('T-01', 'الصالة الرئيسية', 4, 'available');
    insertTable.run('T-02', 'الصالة الرئيسية', 4, 'available');
    insertTable.run('T-03', 'الصالة الرئيسية', 6, 'available');
    insertTable.run('T-04', 'الصالة الرئيسية', 2, 'available');
    insertTable.run('F-01', 'قسم العائلات', 6, 'available');
    insertTable.run('F-02', 'قسم العائلات', 8, 'available');
    insertTable.run('F-03', 'قسم العائلات', 6, 'reserved');
    insertTable.run('V-01', 'التراس الخارجي', 4, 'available');
    insertTable.run('V-02', 'التراس الخارجي', 4, 'available');

    // 11. Historical Orders (16 mathematically verified orders across 7 days)
    const sizeCostCache = new Map<number, { id: number; price: number; cost: number; menu_item_id: number; item_name: string; size_name: string }>();
    const allSizesRows = db.prepare(`
      SELECT isz.id, isz.menu_item_id, isz.price, mi.name as item_name, sz.name as size_name
      FROM item_sizes isz
      JOIN menu_items mi ON mi.id = isz.menu_item_id
      JOIN sizes sz ON sz.id = isz.size_id
    `).all() as Array<{ id: number; menu_item_id: number; price: number; item_name: string; size_name: string }>;

    for (const row of allSizesRows) {
      const recRows = db.prepare('SELECT r.qty_required, i.unit_cost FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.item_size_id = ?').all(row.id) as Array<{ qty_required: number; unit_cost: number }>;
      let costCents = 0;
      for (const r of recRows) {
        costCents += toCents(r.qty_required * r.unit_cost);
      }
      if (costCents === 0) costCents = toCents(row.price * 0.30);
      sizeCostCache.set(row.id, { ...row, cost: fromCents(costCents) });
    }

    const seedOrdersPlan: Array<{
      daysAgo: number;
      type: 'dine_in' | 'takeaway' | 'delivery';
      payment: 'cash' | 'card' | 'transfer';
      status: 'completed' | 'preparing' | 'voided';
      discountType: 'none' | 'percent' | 'fixed';
      discountValue: number;
      deliveryFee: number;
      lines: Array<{ sizeId: number; qty: number; addons?: Array<{ id: number; name: string; price: number; cost: number }> }>;
    }> = [
      { daysAgo: 6, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 2 }, { sizeId: m7s1, qty: 2 }, { sizeId: m9s2, qty: 3 }] },
      { daysAgo: 6, type: 'delivery', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m3s1, qty: 3, addons: [{ id: aFries, name: 'بطاطس مقرمشة جانبية', price: 10, cost: 3 }] }, { sizeId: m5s3, qty: 1 }] },
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
      { daysAgo: 0, type: 'dine_in', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s2, qty: 2, addons: [{ id: aBread, name: 'سلة خبز تنور ساخن', price: 5, cost: 1.2 }] }, { sizeId: m7s2, qty: 1 }, { sizeId: m8s1, qty: 2 }] },
      { daysAgo: 0, type: 'takeaway', payment: 'cash', status: 'completed', discountType: 'percent', discountValue: 5, deliveryFee: 0, lines: [{ sizeId: m3s1, qty: 3, addons: [{ id: aCheese, name: 'إضافة جبن شيدر / موزاريلا', price: 6, cost: 2.2 }] }, { sizeId: m9s2, qty: 2 }] },
      { daysAgo: 0, type: 'delivery', payment: 'card', status: 'completed', discountType: 'none', discountValue: 0, deliveryFee: 15, lines: [{ sizeId: m5s3, qty: 2 }, { sizeId: m3s2, qty: 2 }] },
      { daysAgo: 0, type: 'dine_in', payment: 'cash', status: 'preparing', discountType: 'none', discountValue: 0, deliveryFee: 0, lines: [{ sizeId: m1s1, qty: 2 }, { sizeId: m7s1, qty: 1 }] },
    ];

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        invoice_no, order_type, table_id, customer_name, customer_phone, customer_address,
        status, payment_method, subtotal, discount_type, discount_value, discount_amount,
        net_before_tax, tax_rate, tax_inclusive, tax_amount, delivery_fee, grand_total,
        paid_amount, change_amount, total_cogs, notes, created_by, created_at,
        voided_by, voided_reason, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (
        order_id, menu_item_id, item_name, item_size_id, size_name, qty,
        unit_price, unit_cost, addons_json, addons_total, line_total, line_cogs, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date();
    seedOrdersPlan.forEach((plan, idx) => {
      const dt = new Date(now.getTime() - plan.daysAgo * 86400000 - (16 - idx) * 1800000);
      const isoDate = dt.toISOString().slice(0, 19).replace('T', ' ');
      const invoiceNo = `INV-${dt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(1001 + idx)}`;

      const calcLines = plan.lines.map((l) => {
        const info = sizeCostCache.get(l.sizeId)!;
        const addonsTotalPerUnit = (l.addons || []).reduce((acc, a) => acc + a.price, 0);
        const addonsCostPerUnit = (l.addons || []).reduce((acc, a) => acc + a.cost, 0);
        return {
          info,
          qty: l.qty,
          addons: l.addons || [],
          addonsTotalPerUnit,
          addonsCostPerUnit,
        };
      });

      const fin = calculateOrderFinancials({
        lines: calcLines.map((c) => ({
          qty: c.qty,
          unitPrice: c.info.price,
          unitCost: c.info.cost,
          addonsTotalPerUnit: c.addonsTotalPerUnit,
          addonsCostPerUnit: c.addonsCostPerUnit,
        })),
        discountType: plan.discountType,
        discountValue: plan.discountValue,
        taxRate: 15,
        taxInclusive: true,
        deliveryFee: plan.deliveryFee,
      });

      const tableId = plan.status === 'preparing' ? 1 : plan.type === 'dine_in' ? ((idx % 4) + 1) : null;
      const orderId = Number(
        insertOrder.run(
          invoiceNo,
          plan.type,
          tableId,
          plan.type === 'delivery' ? 'عميل توصيل' : '',
          plan.type === 'delivery' ? '0509182736' : '',
          plan.type === 'delivery' ? 'حي النرجس، الرياض' : '',
          plan.status,
          plan.payment,
          fin.subtotal,
          plan.discountType,
          plan.discountValue,
          fin.discountAmount,
          fin.netBeforeTax,
          15,
          1,
          fin.taxAmount,
          fin.deliveryFee,
          fin.grandTotal,
          fin.grandTotal,
          0,
          fin.totalCogs,
          '',
          uCashierId,
          isoDate,
          plan.status === 'voided' ? uAdminId : null,
          plan.status === 'voided' ? 'تعديل طلب العميل قبل التحضير' : null,
          plan.status === 'voided' ? isoDate : null
        ).lastInsertRowid
      );

      if (plan.status === 'preparing' && tableId) {
        db.prepare('UPDATE dining_tables SET status = ?, current_order_id = ? WHERE id = ?').run('occupied', orderId, tableId);
      }

      for (const c of calcLines) {
        const lineTotal = fromCents((toCents(c.info.price) + toCents(c.addonsTotalPerUnit)) * c.qty);
        const lineCogs = fromCents((toCents(c.info.cost) + toCents(c.addonsCostPerUnit)) * c.qty);
        insertOrderItem.run(
          orderId,
          c.info.menu_item_id,
          c.info.item_name,
          c.info.id,
          c.info.size_name,
          c.qty,
          c.info.price,
          c.info.cost,
          JSON.stringify(c.addons),
          c.addonsTotalPerUnit,
          lineTotal,
          lineCogs,
          ''
        );
      }
    });

    // 12. Expenses
    const insertExp = db.prepare('INSERT INTO expenses (title, category, amount, payment_method, reference_no, expense_date, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const todayStr = now.toISOString().slice(0, 10);
    const d2 = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const d4 = new Date(now.getTime() - 4 * 86400000).toISOString().slice(0, 10);
    const d5 = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);

    insertExp.run('إيجار المطبخ والصالة (حصة الأسبوع)', 'إيجارات ومرافق', 450, 'transfer', 'EXP-901', d5, 'سداد أسبوعي منتظم', uAdminId, `${d5} 10:00:00`);
    insertExp.run('فاتورة الكهرباء والمياه', 'كهرباء ومياه', 185.50, 'transfer', 'EXP-902', d4, 'فاتورة شهرية جزئية', uAdminId, `${d4} 12:30:00`);
    insertExp.run('مواد تغليف وعلب توصيل حرارية', 'تغليف وتشغيل', 140, 'cash', 'EXP-903', d2, 'من الصندوق النقدي', uAdminId, `${d2} 15:20:00`);
    insertExp.run('صيانة فرن البيتزا وتنظيف المداخن', 'صيانة', 120, 'cash', 'EXP-904', todayStr, 'صيانة دورية', uAdminId, `${todayStr} 09:15:00`);

    // 13. Initial Audit Log
    db.prepare('INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)').run(
      uAdminId,
      'admin',
      'SYSTEM_INITIALIZED',
      'system',
      '1',
      JSON.stringify({ message: 'تهيئة نظام سُفرة ERP وقاعدة البيانات المحاسبية' })
    );
  });

  seedTx();
}
