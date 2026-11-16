import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';
import { getPhpMysqlBundle } from './server/phpBundle.ts';
import { buildZipArchive, getWindowsDesktopBundle } from './server/windowsDesktopBundle.ts';
import { calculateOrderFinancials, toCents, fromCents, roundMoney } from './src/shared/money.ts';
import type { PermissionKey, RestaurantSettings, OrderStatus, OrderType, PaymentMethod } from './src/shared/types.ts';

initDatabase();

interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name: string;
  role_display_name: string;
  permissions: PermissionKey[];
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function logAudit(user: AuthUser | undefined, action: string, entityType: string, entityId: string | number, details: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user?.id ?? null, user?.username ?? 'system', action, entityType, String(entityId), JSON.stringify(details));
}

function getSettings(): RestaurantSettings {
  return db.prepare('SELECT * FROM settings WHERE id = 1').get() as RestaurantSettings;
}

function getComputedItemSizeCost(itemSizeId: number, costOverride: number | null, fallbackPrice: number): number {
  if (costOverride !== null && costOverride !== undefined) {
    return roundMoney(costOverride);
  }
  const rows = db.prepare(`
    SELECT r.qty_required, i.unit_cost
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.item_size_id = ?
  `).all(itemSizeId) as Array<{ qty_required: number; unit_cost: number }>;

  if (rows.length === 0) {
    return roundMoney(fallbackPrice * 0.3);
  }
  let cents = 0;
  for (const r of rows) {
    cents += toCents(r.qty_required * r.unit_cost);
  }
  return fromCents(cents);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول للمتابعة' });
    return;
  }

  const row = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role_id, u.active,
           r.name as role_name, r.display_name as role_display_name, r.permissions_json,
           s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE s.token = ?
  `).get(token) as {
    id: number;
    username: string;
    full_name: string;
    role_id: number;
    active: number;
    role_name: string;
    role_display_name: string;
    permissions_json: string;
    expires_at: string;
  } | undefined;

  if (!row || row.active !== 1 || new Date(row.expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
    return;
  }

  req.user = {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role_id: row.role_id,
    role_name: row.role_name,
    role_display_name: row.role_display_name,
    permissions: JSON.parse(row.permissions_json) as PermissionKey[],
  };
  next();
}

function requirePermission(perm: PermissionKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'غير مصرح' });
      return;
    }
    if (!req.user.permissions.includes(perm)) {
      res.status(403).json({ error: 'ليس لديك صلاحية تنفيذ هذا الإجراء' });
      return;
    }
    next();
  };
}

function hydrateOrders(orderRows: Array<Record<string, unknown>>) {
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC');
  return orderRows.map((o) => {
    const items = (itemStmt.all(o.id) as Array<Record<string, unknown>>).map((it) => ({
      ...it,
      addons: JSON.parse((it.addons_json as string) || '[]'),
    }));
    return { ...o, items };
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // --- AUTH ---
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      return;
    }

    const userRow = db.prepare(`
      SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions_json
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ?
    `).get(username.trim()) as {
      id: number;
      username: string;
      full_name: string;
      password_hash: string;
      role_id: number;
      active: number;
      role_name: string;
      role_display_name: string;
      permissions_json: string;
    } | undefined;

    if (!userRow || userRow.active !== 1 || !bcrypt.compareSync(password, userRow.password_hash)) {
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب موقوف' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userRow.id, expiresAt);

    const user: AuthUser = {
      id: userRow.id,
      username: userRow.username,
      full_name: userRow.full_name,
      role_id: userRow.role_id,
      role_name: userRow.role_name,
      role_display_name: userRow.role_display_name,
      permissions: JSON.parse(userRow.permissions_json) as PermissionKey[],
    };

    logAudit(user, 'USER_LOGIN', 'users', user.id, { username: user.username });
    res.json({ token, user });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res: Response) => {
    const token = (req.headers.authorization || '').slice(7).trim();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user, settings: getSettings() });
  });

  // --- DASHBOARD ---
  app.get('/api/dashboard', requireAuth, requirePermission('dashboard.view'), (req: AuthedRequest, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const activeOrders = db.prepare(`
      SELECT * FROM orders WHERE status != 'voided' AND date(created_at) >= ?
    `).all(cutoff) as Array<Record<string, unknown>>;

    const voidedCount = (db.prepare(`
      SELECT COUNT(*) as c FROM orders WHERE status = 'voided' AND date(created_at) >= ?
    `).get(cutoff) as { c: number }).c;

    const expenseRows = db.prepare(`
      SELECT * FROM expenses WHERE date(expense_date) >= ?
    `).all(cutoff) as Array<{ amount: number; expense_date: string }>;

    let totalRevenueCents = 0;
    let netSalesExclTaxCents = 0;
    let totalTaxCents = 0;
    let totalDiscountsCents = 0;
    let totalCogsCents = 0;
    let todayRevenueCents = 0;
    let todayOrders = 0;

    const orderTypeMap = new Map<OrderType, { count: number; revenueCents: number }>();
    const paymentMap = new Map<PaymentMethod, { count: number; revenueCents: number }>();
    const dailyMap = new Map<string, { revenueCents: number; cogsCents: number; expensesCents: number; orders: number }>();

    for (const o of activeOrders) {
      const grandCents = toCents(Number(o.grand_total));
      const netCents = toCents(Number(o.net_before_tax));
      const taxCents = toCents(Number(o.tax_amount));
      const discCents = toCents(Number(o.discount_amount));
      const cogsCents = toCents(Number(o.total_cogs));
      const dayKey = String(o.created_at).slice(0, 10);

      totalRevenueCents += grandCents;
      netSalesExclTaxCents += netCents;
      totalTaxCents += taxCents;
      totalDiscountsCents += discCents;
      totalCogsCents += cogsCents;

      if (dayKey === todayStr) {
        todayRevenueCents += grandCents;
        todayOrders += 1;
      }

      const oType = o.order_type as OrderType;
      const ot = orderTypeMap.get(oType) || { count: 0, revenueCents: 0 };
      ot.count += 1;
      ot.revenueCents += grandCents;
      orderTypeMap.set(oType, ot);

      const pMethod = o.payment_method as PaymentMethod;
      const pm = paymentMap.get(pMethod) || { count: 0, revenueCents: 0 };
      pm.count += 1;
      pm.revenueCents += grandCents;
      paymentMap.set(pMethod, pm);

      const dEntry = dailyMap.get(dayKey) || { revenueCents: 0, cogsCents: 0, expensesCents: 0, orders: 0 };
      dEntry.revenueCents += netCents;
      dEntry.cogsCents += cogsCents;
      dEntry.orders += 1;
      dailyMap.set(dayKey, dEntry);
    }

    let totalExpensesCents = 0;
    for (const e of expenseRows) {
      const amtCents = toCents(Number(e.amount));
      totalExpensesCents += amtCents;
      const dKey = e.expense_date.slice(0, 10);
      const dEntry = dailyMap.get(dKey) || { revenueCents: 0, cogsCents: 0, expensesCents: 0, orders: 0 };
      dEntry.expensesCents += amtCents;
      dailyMap.set(dKey, dEntry);
    }

    const netProfitCents = netSalesExclTaxCents - totalCogsCents - totalExpensesCents;
    const grossProfitCents = netSalesExclTaxCents - totalCogsCents;
    const grossProfitMargin = netSalesExclTaxCents > 0 ? roundMoney((grossProfitCents / netSalesExclTaxCents) * 100) : 0;

    // Best Sellers (grouped by item + size)
    const bestSellers = db.prepare(`
      SELECT oi.menu_item_id, oi.item_name, oi.size_name,
             COALESCE(c.name, 'أخرى') as category_name,
             SUM(oi.qty) as qty_sold,
             ROUND(SUM(oi.line_total), 2) as revenue,
             ROUND(SUM(oi.line_cogs), 2) as cogs,
             ROUND(SUM(oi.line_total - oi.line_cogs), 2) as profit
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN categories c ON c.id = mi.category_id
      WHERE o.status != 'voided' AND date(o.created_at) >= ?
      GROUP BY oi.menu_item_id, oi.item_name, oi.size_name
      ORDER BY qty_sold DESC, revenue DESC
      LIMIT 10
    `).all(cutoff);

    const categoryBreakdown = db.prepare(`
      SELECT COALESCE(c.name, 'أخرى') as category_name,
             SUM(oi.qty) as qty_sold,
             ROUND(SUM(oi.line_total), 2) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN categories c ON c.id = mi.category_id
      WHERE o.status != 'voided' AND date(o.created_at) >= ?
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `).all(cutoff);

    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        revenue: fromCents(v.revenueCents),
        cogs: fromCents(v.cogsCents),
        expenses: fromCents(v.expensesCents),
        profit: fromCents(v.revenueCents - v.cogsCents - v.expensesCents),
        orders: v.orders,
      }));

    // Weekly aggregation across at least 56 days (or full selected days) for meaningful weekly comparison
    const weeklyCutoff = new Date(Date.now() - Math.max(days, 56) * 86400000).toISOString().slice(0, 10);
    const weeklyOrders =
      days >= 56
        ? activeOrders
        : (db.prepare(`SELECT * FROM orders WHERE status != 'voided' AND date(created_at) >= ?`).all(weeklyCutoff) as Array<Record<string, unknown>>);
    const weeklyExpenses =
      days >= 56
        ? expenseRows
        : (db.prepare(`SELECT amount, expense_date FROM expenses WHERE date(expense_date) >= ?`).all(weeklyCutoff) as Array<{ amount: number; expense_date: string }>);

    const getWeekStart = (isoDate: string): string => {
      const dt = new Date(`${isoDate}T00:00:00Z`);
      const daysSinceSat = (dt.getUTCDay() + 1) % 7;
      return new Date(dt.getTime() - daysSinceSat * 86400000).toISOString().slice(0, 10);
    };

    const weeklyMap = new Map<string, { revenueCents: number; cogsCents: number; expensesCents: number; orders: number }>();
    for (const o of weeklyOrders) {
      const wk = getWeekStart(String(o.created_at).slice(0, 10));
      const wEntry = weeklyMap.get(wk) || { revenueCents: 0, cogsCents: 0, expensesCents: 0, orders: 0 };
      wEntry.revenueCents += toCents(Number(o.net_before_tax));
      wEntry.cogsCents += toCents(Number(o.total_cogs));
      wEntry.orders += 1;
      weeklyMap.set(wk, wEntry);
    }
    for (const e of weeklyExpenses) {
      const wk = getWeekStart(e.expense_date.slice(0, 10));
      const wEntry = weeklyMap.get(wk) || { revenueCents: 0, cogsCents: 0, expensesCents: 0, orders: 0 };
      wEntry.expensesCents += toCents(Number(e.amount));
      weeklyMap.set(wk, wEntry);
    }

    const weeklySeries = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        label: `أسبوع ${weekStart.slice(5)}`,
        revenue: fromCents(v.revenueCents),
        cogs: fromCents(v.cogsCents),
        expenses: fromCents(v.expensesCents),
        profit: fromCents(v.revenueCents - v.cogsCents - v.expensesCents),
        orders: v.orders,
      }));

    const lowStockIngredients = db.prepare(`
      SELECT * FROM ingredients WHERE stock_qty <= min_threshold ORDER BY stock_qty ASC
    `).all();

    const recentOrdersRows = db.prepare(`
      SELECT o.*, t.table_number, u.full_name as created_by_name
      FROM orders o
      LEFT JOIN dining_tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.created_by
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 8
    `).all() as Array<Record<string, unknown>>;

    res.json({
      kpis: {
        totalRevenue: fromCents(totalRevenueCents),
        netSalesBeforeTax: fromCents(netSalesExclTaxCents),
        totalTax: fromCents(totalTaxCents),
        totalDiscounts: fromCents(totalDiscountsCents),
        totalCogs: fromCents(totalCogsCents),
        totalExpenses: fromCents(totalExpensesCents),
        netProfit: fromCents(netProfitCents),
        grossProfitMargin,
        orderCount: activeOrders.length,
        voidedCount,
        averageOrderValue: activeOrders.length > 0 ? fromCents(Math.round(totalRevenueCents / activeOrders.length)) : 0,
        todayRevenue: fromCents(todayRevenueCents),
        todayOrders,
        lowStockCount: lowStockIngredients.length,
      },
      bestSellers,
      categoryBreakdown,
      dailySeries,
      weeklySeries,
      orderTypeBreakdown: Array.from(orderTypeMap.entries()).map(([order_type, v]) => ({
        order_type,
        count: v.count,
        revenue: fromCents(v.revenueCents),
      })),
      paymentBreakdown: Array.from(paymentMap.entries()).map(([payment_method, v]) => ({
        payment_method,
        count: v.count,
        revenue: fromCents(v.revenueCents),
      })),
      lowStockIngredients,
      recentOrders: hydrateOrders(recentOrdersRows),
    });
  });

  // --- MENU: CATEGORIES, SIZES, ITEMS, ADDONS ---
  app.get('/api/menu', requireAuth, (req: AuthedRequest, res: Response) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
    const sizes = db.prepare('SELECT * FROM sizes ORDER BY sort_order ASC, id ASC').all();
    const addons = db.prepare('SELECT * FROM addons ORDER BY id ASC').all();
    const items = db.prepare(`
      SELECT mi.*, c.name as category_name
      FROM menu_items mi
      LEFT JOIN categories c ON c.id = mi.category_id
      ORDER BY mi.category_id ASC, mi.id ASC
    `).all() as Array<Record<string, unknown>>;

    const itemSizesStmt = db.prepare(`
      SELECT isz.*, s.name as size_name, s.code as size_code
      FROM item_sizes isz
      JOIN sizes s ON s.id = isz.size_id
      WHERE isz.menu_item_id = ?
      ORDER BY s.sort_order ASC, isz.id ASC
    `);
    const recipeStmt = db.prepare(`
      SELECT r.*, i.name as ingredient_name, i.unit, i.unit_cost
      FROM recipes r
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.item_size_id = ?
    `);

    const fullItems = items.map((item) => {
      const szRows = itemSizesStmt.all(item.id) as Array<Record<string, unknown>>;
      const enrichedSizes = szRows.map((sz) => {
        const recipes = recipeStmt.all(sz.id);
        const computed_cost = getComputedItemSizeCost(Number(sz.id), sz.cost_override as number | null, Number(sz.price));
        return { ...sz, computed_cost, recipes };
      });
      return { ...item, sizes: enrichedSizes };
    });

    res.json({ categories, sizes, items: fullItems, addons });
  });

  app.post('/api/categories', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, sort_order, active } = req.body as { name?: string; sort_order?: number; active?: number };
    if (!name?.trim()) {
      res.status(400).json({ error: 'اسم القسم مطلوب' });
      return;
    }
    const result = db.prepare('INSERT INTO categories (name, sort_order, active) VALUES (?, ?, ?)').run(name.trim(), Number(sort_order) || 0, active ?? 1);
    logAudit(req.user, 'CATEGORY_CREATED', 'categories', result.lastInsertRowid as number, { name });
    res.json({ id: result.lastInsertRowid });
  });

  app.put('/api/categories/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, sort_order, active } = req.body as { name?: string; sort_order?: number; active?: number };
    db.prepare('UPDATE categories SET name = ?, sort_order = ?, active = ? WHERE id = ?').run(name?.trim(), Number(sort_order) || 0, active ?? 1, Number(req.params.id));
    logAudit(req.user, 'CATEGORY_UPDATED', 'categories', req.params.id, { name });
    res.json({ ok: true });
  });

  app.delete('/api/categories/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const used = (db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE category_id = ?').get(Number(req.params.id)) as { c: number }).c;
    if (used > 0) {
      res.status(400).json({ error: 'لا يمكن حذف قسم يحتوي على وجبات، انقل الوجبات أو عطل القسم' });
      return;
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'CATEGORY_DELETED', 'categories', req.params.id, {});
    res.json({ ok: true });
  });

  app.post('/api/sizes', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, code, sort_order } = req.body as { name?: string; code?: string; sort_order?: number };
    if (!name?.trim()) {
      res.status(400).json({ error: 'اسم الحجم مطلوب' });
      return;
    }
    const result = db.prepare('INSERT INTO sizes (name, code, sort_order, active) VALUES (?, ?, ?, 1)').run(name.trim(), (code || name).trim().toUpperCase(), Number(sort_order) || 0);
    logAudit(req.user, 'SIZE_CREATED', 'sizes', result.lastInsertRowid as number, { name, code });
    res.json({ id: result.lastInsertRowid });
  });

  app.put('/api/sizes/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, code, sort_order, active } = req.body as { name?: string; code?: string; sort_order?: number; active?: number };
    db.prepare('UPDATE sizes SET name = ?, code = ?, sort_order = ?, active = ? WHERE id = ?').run(name?.trim(), code?.trim(), Number(sort_order) || 0, active ?? 1, Number(req.params.id));
    res.json({ ok: true });
  });

  app.delete('/api/sizes/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const used = (db.prepare('SELECT COUNT(*) as c FROM item_sizes WHERE size_id = ?').get(Number(req.params.id)) as { c: number }).c;
    if (used > 0) {
      res.status(400).json({ error: 'الحجم مرتبط بوجبات حالية، يمكنك تعطيله بدلاً من حذفه' });
      return;
    }
    db.prepare('DELETE FROM sizes WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/menu-items', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { category_id, name, description, image_url, active, featured, prep_minutes, sizes } = req.body as {
      category_id: number;
      name: string;
      description?: string;
      image_url?: string;
      active?: number;
      featured?: number;
      prep_minutes?: number;
      sizes: Array<{
        size_id: number;
        price: number;
        cost_override?: number | null;
        sku?: string;
        recipes?: Array<{ ingredient_id: number; qty_required: number }>;
      }>;
    };

    if (!name?.trim() || !category_id || !Array.isArray(sizes) || sizes.length === 0) {
      res.status(400).json({ error: 'يجب إدخال اسم الوجبة والقسم وحجم وسعر واحد على الأقل' });
      return;
    }

    const tx = db.transaction(() => {
      const itemRes = db.prepare(`
        INSERT INTO menu_items (category_id, name, description, image_url, active, featured, prep_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(category_id, name.trim(), description || '', image_url || '', active ?? 1, featured ?? 0, Number(prep_minutes) || 12);
      const menuItemId = Number(itemRes.lastInsertRowid);

      const insSize = db.prepare('INSERT INTO item_sizes (menu_item_id, size_id, price, cost_override, sku, active) VALUES (?, ?, ?, ?, ?, 1)');
      const insRec = db.prepare('INSERT INTO recipes (item_size_id, ingredient_id, qty_required) VALUES (?, ?, ?)');

      for (const s of sizes) {
        const isRes = insSize.run(menuItemId, s.size_id, roundMoney(Number(s.price)), s.cost_override ?? null, s.sku || '');
        const itemSizeId = Number(isRes.lastInsertRowid);
        for (const r of s.recipes || []) {
          if (r.ingredient_id && Number(r.qty_required) > 0) {
            insRec.run(itemSizeId, r.ingredient_id, Number(r.qty_required));
          }
        }
      }
      logAudit(req.user, 'MENU_ITEM_CREATED', 'menu_items', menuItemId, { name, sizesCount: sizes.length });
      return menuItemId;
    });

    const id = tx();
    res.json({ id });
  });

  app.put('/api/menu-items/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { category_id, name, description, image_url, active, featured, prep_minutes, sizes } = req.body as {
      category_id: number;
      name: string;
      description?: string;
      image_url?: string;
      active?: number;
      featured?: number;
      prep_minutes?: number;
      sizes: Array<{
        id?: number;
        size_id: number;
        price: number;
        cost_override?: number | null;
        sku?: string;
        active?: number;
        recipes?: Array<{ ingredient_id: number; qty_required: number }>;
      }>;
    };

    if (!name?.trim() || !category_id || !Array.isArray(sizes) || sizes.length === 0) {
      res.status(400).json({ error: 'بيانات الوجبة غير مكتملة' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE menu_items SET category_id = ?, name = ?, description = ?, image_url = ?, active = ?, featured = ?, prep_minutes = ?
        WHERE id = ?
      `).run(category_id, name.trim(), description || '', image_url || '', active ?? 1, featured ?? 0, Number(prep_minutes) || 12, id);

      db.prepare('DELETE FROM item_sizes WHERE menu_item_id = ?').run(id);

      const insSize = db.prepare('INSERT INTO item_sizes (menu_item_id, size_id, price, cost_override, sku, active) VALUES (?, ?, ?, ?, ?, ?)');
      const insRec = db.prepare('INSERT INTO recipes (item_size_id, ingredient_id, qty_required) VALUES (?, ?, ?)');

      for (const s of sizes) {
        const isRes = insSize.run(id, s.size_id, roundMoney(Number(s.price)), s.cost_override ?? null, s.sku || '', s.active ?? 1);
        const itemSizeId = Number(isRes.lastInsertRowid);
        for (const r of s.recipes || []) {
          if (r.ingredient_id && Number(r.qty_required) > 0) {
            insRec.run(itemSizeId, r.ingredient_id, Number(r.qty_required));
          }
        }
      }
      logAudit(req.user, 'MENU_ITEM_UPDATED', 'menu_items', id, { name });
    });

    tx();
    res.json({ ok: true });
  });

  app.delete('/api/menu-items/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    logAudit(req.user, 'MENU_ITEM_DELETED', 'menu_items', id, {});
    res.json({ ok: true });
  });

  app.post('/api/addons', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, price, cost } = req.body as { name: string; price: number; cost?: number };
    if (!name?.trim()) {
      res.status(400).json({ error: 'اسم الإضافة مطلوب' });
      return;
    }
    const r = db.prepare('INSERT INTO addons (name, price, cost, active) VALUES (?, ?, ?, 1)').run(name.trim(), roundMoney(Number(price) || 0), roundMoney(Number(cost) || 0));
    logAudit(req.user, 'ADDON_CREATED', 'addons', r.lastInsertRowid as number, { name, price });
    res.json({ id: r.lastInsertRowid });
  });

  app.put('/api/addons/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    const { name, price, cost, active } = req.body as { name: string; price: number; cost?: number; active?: number };
    db.prepare('UPDATE addons SET name = ?, price = ?, cost = ?, active = ? WHERE id = ?').run(name.trim(), roundMoney(Number(price) || 0), roundMoney(Number(cost) || 0), active ?? 1, Number(req.params.id));
    res.json({ ok: true });
  });

  app.delete('/api/addons/:id', requireAuth, requirePermission('menu.manage'), (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM addons WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- TABLES ---
  app.get('/api/tables', requireAuth, (req: AuthedRequest, res: Response) => {
    const rows = db.prepare(`
      SELECT t.*, o.grand_total as current_order_total, o.invoice_no as current_invoice_no
      FROM dining_tables t
      LEFT JOIN orders o ON o.id = t.current_order_id
      ORDER BY t.zone ASC, t.table_number ASC
    `).all();
    res.json(rows);
  });

  app.post('/api/tables', requireAuth, requirePermission('tables.manage'), (req: AuthedRequest, res: Response) => {
    const { table_number, zone, capacity } = req.body as { table_number: string; zone: string; capacity: number };
    if (!table_number?.trim()) {
      res.status(400).json({ error: 'رقم الطاولة مطلوب' });
      return;
    }
    const r = db.prepare('INSERT INTO dining_tables (table_number, zone, capacity, status) VALUES (?, ?, ?, ?)').run(table_number.trim(), zone || 'الصالة الرئيسية', Number(capacity) || 4, 'available');
    logAudit(req.user, 'TABLE_CREATED', 'dining_tables', r.lastInsertRowid as number, { table_number, zone });
    res.json({ id: r.lastInsertRowid });
  });

  app.put('/api/tables/:id', requireAuth, requirePermission('tables.manage'), (req: AuthedRequest, res: Response) => {
    const { table_number, zone, capacity, status } = req.body as { table_number?: string; zone?: string; capacity?: number; status?: string };
    const current = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
    if (!current) {
      res.status(404).json({ error: 'الطاولة غير موجودة' });
      return;
    }
    db.prepare('UPDATE dining_tables SET table_number = ?, zone = ?, capacity = ?, status = ?, current_order_id = ? WHERE id = ?').run(
      table_number ?? current.table_number,
      zone ?? current.zone,
      capacity ?? current.capacity,
      status ?? current.status,
      status === 'available' ? null : current.current_order_id,
      Number(req.params.id)
    );
    res.json({ ok: true });
  });

  app.delete('/api/tables/:id', requireAuth, requirePermission('tables.manage'), (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM dining_tables WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- ORDERS & POS ---
  app.get('/api/orders', requireAuth, (req: AuthedRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const limit = Math.min(250, Number(req.query.limit) || 100);
    let sql = `
      SELECT o.*, t.table_number, u.full_name as created_by_name
      FROM orders o
      LEFT JOIN dining_tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.created_by
    `;
    const params: unknown[] = [];
    if (status && status !== 'all') {
      sql += ' WHERE o.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY o.created_at DESC, o.id DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(hydrateOrders(rows));
  });

  app.post('/api/orders', requireAuth, requirePermission('pos.create_order'), (req: AuthedRequest, res: Response) => {
    const body = req.body as {
      order_type: OrderType;
      table_id?: number | null;
      customer_name?: string;
      customer_phone?: string;
      customer_address?: string;
      payment_method: PaymentMethod;
      discount_type?: 'none' | 'percent' | 'fixed';
      discount_value?: number;
      delivery_fee?: number;
      paid_amount?: number;
      notes?: string;
      items: Array<{
        item_size_id: number;
        qty: number;
        addon_ids?: number[];
        notes?: string;
      }>;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: 'السلة فارغة، أضف وجبة واحدة على الأقل' });
      return;
    }

    const discountType = body.discount_type || 'none';
    const discountValue = Number(body.discount_value) || 0;
    if (discountType !== 'none' && discountValue > 0 && !req.user!.permissions.includes('pos.apply_discount')) {
      res.status(403).json({ error: 'ليس لديك صلاحية تطبيق الخصومات' });
      return;
    }

    try {
      const createdOrder = db.transaction(() => {
        const settings = getSettings();
        const sizeStmt = db.prepare(`
          SELECT isz.id, isz.menu_item_id, isz.price, isz.cost_override, mi.name as item_name, sz.name as size_name
          FROM item_sizes isz
          JOIN menu_items mi ON mi.id = isz.menu_item_id
          JOIN sizes sz ON sz.id = isz.size_id
          WHERE isz.id = ?
        `);
        const addonStmt = db.prepare('SELECT id, name, price, cost FROM addons WHERE id = ?');
        const recipeStmt = db.prepare('SELECT r.ingredient_id, r.qty_required, i.unit_cost FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.item_size_id = ?');
        const deductIngStmt = db.prepare('UPDATE ingredients SET stock_qty = ROUND(stock_qty - ?, 4), updated_at = datetime(\'now\') WHERE id = ?');
        const insMoveStmt = db.prepare('INSERT INTO stock_movements (ingredient_id, movement_type, qty_delta, unit_cost, reference_no, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');

        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = String(Math.floor(1000 + Math.random() * 9000));
        const invoiceNo = `INV-${datePart}-${randPart}`;

        const verifiedLines: Array<{
          menu_item_id: number;
          item_name: string;
          item_size_id: number;
          size_name: string;
          qty: number;
          unit_price: number;
          unit_cost: number;
          addons: Array<{ id: number; name: string; price: number; cost: number }>;
          addonsTotalPerUnit: number;
          addonsCostPerUnit: number;
          line_total: number;
          line_cogs: number;
          notes: string;
        }> = [];

        for (const line of body.items) {
          const sz = sizeStmt.get(line.item_size_id) as {
            id: number;
            menu_item_id: number;
            price: number;
            cost_override: number | null;
            item_name: string;
            size_name: string;
          } | undefined;
          if (!sz) {
            throw new Error('أحد الأحجام المختارة غير موجود في القائمة');
          }

          const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
          const unitCost = getComputedItemSizeCost(sz.id, sz.cost_override, sz.price);

          const addons: Array<{ id: number; name: string; price: number; cost: number }> = [];
          let addonsTotalCents = 0;
          let addonsCostCents = 0;

          for (const aid of line.addon_ids || []) {
            const ad = addonStmt.get(aid) as { id: number; name: string; price: number; cost: number } | undefined;
            if (ad) {
              addons.push(ad);
              addonsTotalCents += toCents(ad.price);
              addonsCostCents += toCents(ad.cost);
            }
          }

          const addonsTotalPerUnit = fromCents(addonsTotalCents);
          const addonsCostPerUnit = fromCents(addonsCostCents);
          const lineTotal = fromCents((toCents(sz.price) + addonsTotalCents) * qty);
          const lineCogs = fromCents((toCents(unitCost) + addonsCostCents) * qty);

          // Deduct inventory via BOM recipe
          const recipes = recipeStmt.all(sz.id) as Array<{ ingredient_id: number; qty_required: number; unit_cost: number }>;
          for (const rec of recipes) {
            const delta = roundMoney(rec.qty_required * qty * 100) / 100;
            deductIngStmt.run(delta, rec.ingredient_id);
            insMoveStmt.run(rec.ingredient_id, 'sale_deduction', -delta, rec.unit_cost, invoiceNo, `بيع ${sz.item_name} (${sz.size_name}) × ${qty}`, req.user!.id);
          }

          verifiedLines.push({
            menu_item_id: sz.menu_item_id,
            item_name: sz.item_name,
            item_size_id: sz.id,
            size_name: sz.size_name,
            qty,
            unit_price: sz.price,
            unit_cost: unitCost,
            addons,
            addonsTotalPerUnit,
            addonsCostPerUnit,
            line_total: lineTotal,
            line_cogs: lineCogs,
            notes: line.notes || '',
          });
        }

        const deliveryFee = body.order_type === 'delivery' ? Math.max(0, roundMoney(Number(body.delivery_fee) || 0)) : 0;
        const fin = calculateOrderFinancials({
          lines: verifiedLines.map((l) => ({
            qty: l.qty,
            unitPrice: l.unit_price,
            unitCost: l.unit_cost,
            addonsTotalPerUnit: l.addonsTotalPerUnit,
            addonsCostPerUnit: l.addonsCostPerUnit,
          })),
          discountType,
          discountValue,
          taxRate: settings.vat_rate,
          taxInclusive: settings.tax_inclusive === 1,
          deliveryFee,
        });

        const paidAmount = Math.max(fin.grandTotal, roundMoney(Number(body.paid_amount) || fin.grandTotal));
        const changeAmount = fromCents(Math.max(0, toCents(paidAmount) - toCents(fin.grandTotal)));
        const initialStatus: OrderStatus = body.order_type === 'dine_in' ? 'preparing' : 'completed';

        const orderRes = db.prepare(`
          INSERT INTO orders (
            invoice_no, order_type, table_id, customer_name, customer_phone, customer_address,
            status, payment_method, subtotal, discount_type, discount_value, discount_amount,
            net_before_tax, tax_rate, tax_inclusive, tax_amount, delivery_fee, grand_total,
            paid_amount, change_amount, total_cogs, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          invoiceNo,
          body.order_type,
          body.order_type === 'dine_in' ? (body.table_id || null) : null,
          body.customer_name || '',
          body.customer_phone || '',
          body.customer_address || '',
          initialStatus,
          body.payment_method || 'cash',
          fin.subtotal,
          discountType,
          discountValue,
          fin.discountAmount,
          fin.netBeforeTax,
          settings.vat_rate,
          settings.tax_inclusive,
          fin.taxAmount,
          fin.deliveryFee,
          fin.grandTotal,
          paidAmount,
          changeAmount,
          fin.totalCogs,
          body.notes || '',
          req.user!.id
        );

        const orderId = Number(orderRes.lastInsertRowid);

        if (body.order_type === 'dine_in' && body.table_id) {
          db.prepare('UPDATE dining_tables SET status = ?, current_order_id = ? WHERE id = ?').run('occupied', orderId, body.table_id);
        }

        const insItem = db.prepare(`
          INSERT INTO order_items (
            order_id, menu_item_id, item_name, item_size_id, size_name, qty,
            unit_price, unit_cost, addons_json, addons_total, line_total, line_cogs, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const l of verifiedLines) {
          insItem.run(
            orderId,
            l.menu_item_id,
            l.item_name,
            l.item_size_id,
            l.size_name,
            l.qty,
            l.unit_price,
            l.unit_cost,
            JSON.stringify(l.addons),
            l.addonsTotalPerUnit,
            l.line_total,
            l.line_cogs,
            l.notes
          );
        }

        logAudit(req.user, 'ORDER_CREATED', 'orders', orderId, {
          invoice_no: invoiceNo,
          grand_total: fin.grandTotal,
          discount_amount: fin.discountAmount,
          cogs: fin.totalCogs,
        });

        const row = db.prepare(`
          SELECT o.*, t.table_number, u.full_name as created_by_name
          FROM orders o
          LEFT JOIN dining_tables t ON t.id = o.table_id
          LEFT JOIN users u ON u.id = o.created_by
          WHERE o.id = ?
        `).get(orderId) as Record<string, unknown>;

        return hydrateOrders([row])[0];
      });

      res.json(createdOrder);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/orders/:id/status', requireAuth, requirePermission('tables.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { status } = req.body as { status: OrderStatus };
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as { id: number; status: OrderStatus; table_id: number | null; invoice_no: string } | undefined;
    if (!order) {
      res.status(404).json({ error: 'الطلب غير موجود' });
      return;
    }
    if (order.status === 'voided') {
      res.status(400).json({ error: 'لا يمكن تعديل طلب ملغي' });
      return;
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    if (status === 'completed' && order.table_id) {
      db.prepare('UPDATE dining_tables SET status = ?, current_order_id = NULL WHERE id = ? AND current_order_id = ?').run('available', order.table_id, id);
    }
    logAudit(req.user, 'ORDER_STATUS_UPDATED', 'orders', id, { invoice_no: order.invoice_no, status });
    res.json({ ok: true });
  });

  app.post('/api/orders/:id/void', requireAuth, requirePermission('pos.void_order'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };

    const tx = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as { id: number; status: OrderStatus; table_id: number | null; invoice_no: string; grand_total: number } | undefined;
      if (!order) throw new Error('الطلب غير موجود');
      if (order.status === 'voided') throw new Error('الطلب ملغي مسبقاً');

      const items = db.prepare('SELECT item_size_id, qty, item_name, size_name FROM order_items WHERE order_id = ?').all(id) as Array<{ item_size_id: number; qty: number; item_name: string; size_name: string }>;
      const recipeStmt = db.prepare('SELECT r.ingredient_id, r.qty_required, i.unit_cost FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.item_size_id = ?');
      const restoreStmt = db.prepare('UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 4), updated_at = datetime(\'now\') WHERE id = ?');
      const insMove = db.prepare('INSERT INTO stock_movements (ingredient_id, movement_type, qty_delta, unit_cost, reference_no, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');

      for (const it of items) {
        const recs = recipeStmt.all(it.item_size_id) as Array<{ ingredient_id: number; qty_required: number; unit_cost: number }>;
        for (const r of recs) {
          const restoreQty = roundMoney(r.qty_required * it.qty * 100) / 100;
          restoreStmt.run(restoreQty, r.ingredient_id);
          insMove.run(r.ingredient_id, 'void_restore', restoreQty, r.unit_cost, order.invoice_no, `عكس مخزون لإلغاء فاتورة ${order.invoice_no}`, req.user!.id);
        }
      }

      db.prepare(`
        UPDATE orders SET status = 'voided', voided_by = ?, voided_reason = ?, voided_at = datetime('now') WHERE id = ?
      `).run(req.user!.id, reason || 'إلغاء فاتورة', id);

      if (order.table_id) {
        db.prepare('UPDATE dining_tables SET status = ?, current_order_id = NULL WHERE id = ? AND current_order_id = ?').run('available', order.table_id, id);
      }

      logAudit(req.user, 'ORDER_VOIDED', 'orders', id, { invoice_no: order.invoice_no, grand_total: order.grand_total, reason });
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- INVENTORY & PURCHASES ---
  app.get('/api/inventory', requireAuth, requirePermission('inventory.view'), (req: AuthedRequest, res: Response) => {
    const ingredients = db.prepare('SELECT * FROM ingredients ORDER BY name ASC').all();
    const movements = db.prepare(`
      SELECT sm.*, i.name as ingredient_name, i.unit, u.full_name as created_by_name
      FROM stock_movements sm
      JOIN ingredients i ON i.id = sm.ingredient_id
      LEFT JOIN users u ON u.id = sm.created_by
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 100
    `).all();
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
    const purchases = db.prepare(`
      SELECT p.*, s.name as supplier_name, u.full_name as created_by_name
      FROM purchase_invoices p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN users u ON u.id = p.created_by
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all();
    res.json({ ingredients, movements, suppliers, purchases });
  });

  app.post('/api/ingredients', requireAuth, requirePermission('inventory.manage'), (req: AuthedRequest, res: Response) => {
    const { name, sku, unit, stock_qty, min_threshold, unit_cost, supplier_name } = req.body as {
      name: string;
      sku?: string;
      unit: string;
      stock_qty: number;
      min_threshold: number;
      unit_cost: number;
      supplier_name?: string;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'اسم المادة مطلوب' });
      return;
    }
    const r = db.prepare(`
      INSERT INTO ingredients (name, sku, unit, stock_qty, min_threshold, unit_cost, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name.trim(), sku || `ING-${Date.now().toString().slice(-4)}`, unit || 'كجم', Number(stock_qty) || 0, Number(min_threshold) || 5, roundMoney(Number(unit_cost) || 0), supplier_name || '');
    logAudit(req.user, 'INGREDIENT_CREATED', 'ingredients', r.lastInsertRowid as number, { name, unit_cost });
    res.json({ id: r.lastInsertRowid });
  });

  app.put('/api/ingredients/:id', requireAuth, requirePermission('inventory.manage'), (req: AuthedRequest, res: Response) => {
    const { name, sku, unit, min_threshold, unit_cost, supplier_name } = req.body as {
      name: string;
      sku: string;
      unit: string;
      min_threshold: number;
      unit_cost: number;
      supplier_name?: string;
    };
    db.prepare(`
      UPDATE ingredients SET name = ?, sku = ?, unit = ?, min_threshold = ?, unit_cost = ?, supplier_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name.trim(), sku, unit, Number(min_threshold) || 0, roundMoney(Number(unit_cost) || 0), supplier_name || '', Number(req.params.id));
    logAudit(req.user, 'INGREDIENT_UPDATED', 'ingredients', req.params.id, { name, unit_cost });
    res.json({ ok: true });
  });

  app.post('/api/inventory/adjust', requireAuth, requirePermission('inventory.manage'), (req: AuthedRequest, res: Response) => {
    const { ingredient_id, movement_type, qty_delta, notes } = req.body as {
      ingredient_id: number;
      movement_type: 'adjustment' | 'waste' | 'purchase';
      qty_delta: number;
      notes?: string;
    };

    const tx = db.transaction(() => {
      const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredient_id) as { id: number; name: string; stock_qty: number; unit_cost: number } | undefined;
      if (!ing) throw new Error('المادة غير موجودة');

      const signedDelta = movement_type === 'waste' ? -Math.abs(Number(qty_delta)) : Number(qty_delta);
      db.prepare('UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 4), updated_at = datetime(\'now\') WHERE id = ?').run(signedDelta, ingredient_id);
      db.prepare('INSERT INTO stock_movements (ingredient_id, movement_type, qty_delta, unit_cost, reference_no, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        ingredient_id,
        movement_type,
        signedDelta,
        ing.unit_cost,
        `ADJ-${Date.now().toString().slice(-5)}`,
        notes || 'تسوية جرد يدوية',
        req.user!.id
      );
      logAudit(req.user, 'INVENTORY_ADJUSTED', 'ingredients', ingredient_id, { name: ing.name, signedDelta, movement_type });
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/purchases', requireAuth, requirePermission('inventory.manage'), (req: AuthedRequest, res: Response) => {
    const { supplier_id, payment_method, notes, record_expense, lines } = req.body as {
      supplier_id: number;
      payment_method: PaymentMethod;
      notes?: string;
      record_expense?: boolean;
      lines: Array<{ ingredient_id: number; qty: number; unit_cost: number }>;
    };

    if (!supplier_id || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'بيانات فاتورة الشراء غير مكتملة' });
      return;
    }

    const tx = db.transaction(() => {
      let totalCents = 0;
      const invoiceNo = `PUR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      for (const l of lines) {
        const qty = Math.max(0.01, Number(l.qty));
        const unitCost = Math.max(0, roundMoney(Number(l.unit_cost)));
        totalCents += toCents(qty * unitCost);

        const ing = db.prepare('SELECT stock_qty, unit_cost FROM ingredients WHERE id = ?').get(l.ingredient_id) as { stock_qty: number; unit_cost: number } | undefined;
        if (!ing) throw new Error('أحد المكونات غير موجود');

        // Weighted Average Cost calculation
        const oldVal = Math.max(0, ing.stock_qty) * ing.unit_cost;
        const newVal = qty * unitCost;
        const totalQty = Math.max(0, ing.stock_qty) + qty;
        const avgCost = totalQty > 0 ? roundMoney((oldVal + newVal) / totalQty) : unitCost;

        db.prepare('UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 4), unit_cost = ?, updated_at = datetime(\'now\') WHERE id = ?').run(qty, avgCost, l.ingredient_id);
        db.prepare('INSERT INTO stock_movements (ingredient_id, movement_type, qty_delta, unit_cost, reference_no, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          l.ingredient_id,
          'purchase',
          qty,
          unitCost,
          invoiceNo,
          notes || 'توريد فاتورة مشتريات',
          req.user!.id
        );
      }

      const totalAmount = fromCents(totalCents);
      const purRes = db.prepare(`
        INSERT INTO purchase_invoices (invoice_no, supplier_id, total_amount, paid_amount, payment_method, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceNo, supplier_id, totalAmount, totalAmount, payment_method || 'transfer', notes || '', req.user!.id);

      if (record_expense) {
        db.prepare(`
          INSERT INTO expenses (title, category, amount, payment_method, reference_no, expense_date, notes, created_by)
          VALUES (?, ?, ?, ?, ?, date('now'), ?, ?)
        `).run(`مشتريات مخزون (${invoiceNo})`, 'مشتريات ومواد خام', totalAmount, payment_method || 'transfer', invoiceNo, notes || '', req.user!.id);
      }

      logAudit(req.user, 'PURCHASE_RECORDED', 'purchase_invoices', purRes.lastInsertRowid as number, { invoiceNo, totalAmount });
      return { id: purRes.lastInsertRowid, invoice_no: invoiceNo, total_amount: totalAmount };
    });

    try {
      const result = tx();
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- EXPENSES & ACCOUNTING AUDIT ---
  app.get('/api/expenses', requireAuth, requirePermission('accounting.view'), (req: AuthedRequest, res: Response) => {
    const rows = db.prepare(`
      SELECT e.*, u.full_name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.created_by
      ORDER BY e.expense_date DESC, e.id DESC
    `).all();
    res.json(rows);
  });

  app.post('/api/expenses', requireAuth, requirePermission('accounting.manage_expenses'), (req: AuthedRequest, res: Response) => {
    const { title, category, amount, payment_method, reference_no, expense_date, notes } = req.body as {
      title: string;
      category: string;
      amount: number;
      payment_method: PaymentMethod;
      reference_no?: string;
      expense_date?: string;
      notes?: string;
    };
    if (!title?.trim() || Number(amount) <= 0) {
      res.status(400).json({ error: 'بيانات المصروف والمبلغ مطلوبة' });
      return;
    }
    const r = db.prepare(`
      INSERT INTO expenses (title, category, amount, payment_method, reference_no, expense_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title.trim(), category || 'تشغيلية', roundMoney(Number(amount)), payment_method || 'cash', reference_no || '', expense_date || new Date().toISOString().slice(0, 10), notes || '', req.user!.id);
    logAudit(req.user, 'EXPENSE_CREATED', 'expenses', r.lastInsertRowid as number, { title, amount });
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/expenses/:id', requireAuth, requirePermission('accounting.manage_expenses'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    logAudit(req.user, 'EXPENSE_DELETED', 'expenses', id, {});
    res.json({ ok: true });
  });

  app.get('/api/accounting/audit', requireAuth, requirePermission('accounting.view'), (req: AuthedRequest, res: Response) => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as Array<{
      id: number;
      invoice_no: string;
      created_at: string;
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
      total_cogs: number;
    }>;

    const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const expenses = db.prepare('SELECT * FROM expenses').all() as Array<{ amount: number; payment_method: PaymentMethod }>;

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
    let voidedOrdersCount = 0;
    let voidedOrdersValueCents = 0;

    let sumOfOrderItemsCents = 0;
    let sumOfOrderSubtotalsCents = 0;
    let sumOfOrderCogsCents = 0;

    const orderAudits = orders.map((o) => {
      const items = itemStmt.all(o.id) as Array<{
        qty: number;
        unit_price: number;
        unit_cost: number;
        addons_total: number;
        line_total: number;
        line_cogs: number;
      }>;

      const recomputed = calculateOrderFinancials({
        lines: items.map((it) => ({
          qty: it.qty,
          unitPrice: it.unit_price,
          unitCost: it.unit_cost,
          addonsTotalPerUnit: it.addons_total,
          addonsCostPerUnit: 0,
        })),
        discountType: o.discount_type,
        discountValue: o.discount_value,
        taxRate: o.tax_rate,
        taxInclusive: o.tax_inclusive === 1,
        deliveryFee: o.delivery_fee,
      });

      const recordedGrandCents = toCents(o.grand_total);
      const recomputedGrandCents = toCents(recomputed.grandTotal);
      const variance = fromCents(recordedGrandCents - recomputedGrandCents);
      const passed = Math.abs(recordedGrandCents - recomputedGrandCents) === 0;

      if (o.status === 'voided') {
        voidedOrdersCount += 1;
        voidedOrdersValueCents += recordedGrandCents;
      } else {
        grossSalesWithTaxCents += toCents(o.subtotal);
        totalDiscountsCents += toCents(o.discount_amount);
        netSalesExclTaxCents += toCents(o.net_before_tax);
        totalVatCents += toCents(o.tax_amount);
        totalDeliveryCents += toCents(o.delivery_fee);
        totalGrandRevenueCents += recordedGrandCents;
        totalCogsCents += toCents(o.total_cogs);

        sumOfOrderSubtotalsCents += toCents(o.subtotal);
        for (const it of items) {
          sumOfOrderItemsCents += toCents(it.line_total);
          sumOfOrderCogsCents += toCents(it.line_cogs);
        }

        if (o.payment_method === 'cash') cashSalesCents += recordedGrandCents;
        else if (o.payment_method === 'card') cardSalesCents += recordedGrandCents;
        else transferSalesCents += recordedGrandCents;
      }

      return {
        order_id: o.id,
        invoice_no: o.invoice_no,
        created_at: o.created_at,
        status: o.status,
        recorded_grand_total: o.grand_total,
        recomputed_grand_total: recomputed.grandTotal,
        variance,
        passed,
      };
    });

    let operatingExpensesCents = 0;
    let cashExpensesCents = 0;
    for (const e of expenses) {
      const c = toCents(e.amount);
      operatingExpensesCents += c;
      if (e.payment_method === 'cash') cashExpensesCents += c;
    }

    const grossProfitCents = netSalesExclTaxCents - totalCogsCents;
    const netOperatingProfitCents = grossProfitCents - operatingExpensesCents;
    const netProfitMarginPct = netSalesExclTaxCents > 0 ? roundMoney((netOperatingProfitCents / netSalesExclTaxCents) * 100) : 0;
    const expectedCashInDrawerCents = cashSalesCents - cashExpensesCents;

    const failedInvoiceCount = orderAudits.filter((a) => !a.passed).length;

    const integrityChecks = [
      {
        checkId: 'CHK_ITEMS_VS_SUBTOTAL',
        title: 'تطابق مجموع بنود الفواتير مع المجموع الفرعي',
        passed: sumOfOrderItemsCents === sumOfOrderSubtotalsCents,
        expectedValue: fromCents(sumOfOrderItemsCents),
        actualValue: fromCents(sumOfOrderSubtotalsCents),
        variance: fromCents(sumOfOrderSubtotalsCents - sumOfOrderItemsCents),
        details: 'مقارنة إجمالي السطور (السعر × الكمية + الإضافات) مقابل رأس الفواتير',
      },
      {
        checkId: 'CHK_TAX_EQUATION',
        title: 'تطابق معادلة صافي المبيعات + الضريبة + التوصيل = الإجمالي النهائي',
        passed: netSalesExclTaxCents + totalVatCents + totalDeliveryCents === totalGrandRevenueCents,
        expectedValue: fromCents(netSalesExclTaxCents + totalVatCents + totalDeliveryCents),
        actualValue: fromCents(totalGrandRevenueCents),
        variance: fromCents(totalGrandRevenueCents - (netSalesExclTaxCents + totalVatCents + totalDeliveryCents)),
        details: 'التحقق من عدم وجود كسور عشرية ضائعة في احتساب ضريبة القيمة المضافة',
      },
      {
        checkId: 'CHK_COGS_MATCH',
        title: 'تطابق تكلفة البضاعة المباعة (COGS) مع تكلفة الوصفات',
        passed: sumOfOrderCogsCents === totalCogsCents,
        expectedValue: fromCents(sumOfOrderCogsCents),
        actualValue: fromCents(totalCogsCents),
        variance: fromCents(totalCogsCents - sumOfOrderCogsCents),
        details: 'مطابقة تكلفة المكونات المحسوبة في بنود الطلب مع إجمالي التكلفة المسجلة',
      },
      {
        checkId: 'CHK_PAYMENT_CHANNELS',
        title: 'تطابق قنوات التحصيل (نقدي + شبكة + تحويل) مع إجمالي المقبوضات',
        passed: cashSalesCents + cardSalesCents + transferSalesCents === totalGrandRevenueCents,
        expectedValue: fromCents(totalGrandRevenueCents),
        actualValue: fromCents(cashSalesCents + cardSalesCents + transferSalesCents),
        variance: fromCents((cashSalesCents + cardSalesCents + transferSalesCents) - totalGrandRevenueCents),
        details: 'ضمان إقفال الصندوق اليومي ومطابقة أجهزة الدفع الإلكتروني',
      },
      {
        checkId: 'CHK_PER_INVOICE_RECALC',
        title: 'التدقيق الحسابي الشامل لكل فاتورة على حدة',
        passed: failedInvoiceCount === 0,
        expectedValue: orders.length,
        actualValue: orders.length - failedInvoiceCount,
        variance: failedInvoiceCount,
        details: `تم فحص ${orders.length} فاتورة وإعادة احتساب الضرائب والخصومات بالهللة`,
      },
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        grossSalesWithTax: fromCents(grossSalesWithTaxCents),
        totalDiscounts: fromCents(totalDiscountsCents),
        netSalesExclTax: fromCents(netSalesExclTaxCents),
        totalVatCollected: fromCents(totalVatCents),
        totalDeliveryFees: fromCents(totalDeliveryCents),
        totalGrandRevenue: fromCents(totalGrandRevenueCents),
        totalCogs: fromCents(totalCogsCents),
        grossProfit: fromCents(grossProfitCents),
        operatingExpenses: fromCents(operatingExpensesCents),
        netOperatingProfit: fromCents(netOperatingProfitCents),
        netProfitMarginPct,
        cashSalesTotal: fromCents(cashSalesCents),
        cardSalesTotal: fromCents(cardSalesCents),
        transferSalesTotal: fromCents(transferSalesCents),
        cashExpensesTotal: fromCents(cashExpensesCents),
        expectedCashInDrawer: fromCents(expectedCashInDrawerCents),
        voidedOrdersCount,
        voidedOrdersValue: fromCents(voidedOrdersValueCents),
      },
      integrityChecks,
      orderAudits,
      allPassed: integrityChecks.every((c) => c.passed),
    });
  });

  app.get('/api/audit-logs', requireAuth, requirePermission('accounting.view'), (req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120').all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        ...r,
        details: JSON.parse((r.details_json as string) || '{}'),
      }))
    );
  });

  // --- USERS & ROLES (RBAC) ---
  app.get('/api/roles', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    res.json(rows.map((r) => ({ ...r, permissions: JSON.parse(r.permissions_json as string) })));
  });

  app.post('/api/roles', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const { display_name, description, permissions } = req.body as { display_name: string; description?: string; permissions: PermissionKey[] };
    if (!display_name?.trim()) {
      res.status(400).json({ error: 'اسم الدور الوظيفي مطلوب' });
      return;
    }
    const slug = `role_${Date.now()}`;
    const r = db.prepare('INSERT INTO roles (name, display_name, description, permissions_json, is_system) VALUES (?, ?, ?, ?, 0)').run(
      slug,
      display_name.trim(),
      description || '',
      JSON.stringify(permissions || [])
    );
    logAudit(req.user, 'ROLE_CREATED', 'roles', r.lastInsertRowid as number, { display_name, permissions });
    res.json({ id: r.lastInsertRowid });
  });

  app.put('/api/roles/:id', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { display_name, description, permissions } = req.body as { display_name: string; description?: string; permissions: PermissionKey[] };
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as { name: string } | undefined;
    if (!role) {
      res.status(404).json({ error: 'الدور غير موجود' });
      return;
    }
    if (role.name === 'super_admin') {
      res.status(400).json({ error: 'لا يمكن تقليص صلاحيات المدير العام الأساسي' });
      return;
    }
    db.prepare('UPDATE roles SET display_name = ?, description = ?, permissions_json = ? WHERE id = ?').run(display_name.trim(), description || '', JSON.stringify(permissions || []), id);
    logAudit(req.user, 'ROLE_UPDATED', 'roles', id, { display_name, permissions });
    res.json({ ok: true });
  });

  app.delete('/api/roles/:id', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const role = db.prepare('SELECT is_system FROM roles WHERE id = ?').get(id) as { is_system: number } | undefined;
    if (!role) {
      res.status(404).json({ error: 'الدور غير موجود' });
      return;
    }
    if (role.is_system === 1) {
      res.status(400).json({ error: 'لا يمكن حذف الأدوار الأساسية للنظام' });
      return;
    }
    const used = (db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id = ?').get(id) as { c: number }).c;
    if (used > 0) {
      res.status(400).json({ error: 'يوجد مستخدمون مرتبطون بهذا الدور' });
      return;
    }
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/users', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.active, u.created_at,
             r.name as role_name, r.display_name as role_display_name, r.permissions_json
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.id ASC
    `).all() as Array<Record<string, unknown>>;
    res.json(rows.map((u) => ({ ...u, permissions: JSON.parse(u.permissions_json as string) })));
  });

  app.post('/api/users', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const { username, full_name, password, role_id, active } = req.body as {
      username: string;
      full_name: string;
      password: string;
      role_id: number;
      active?: number;
    };
    if (!username?.trim() || !full_name?.trim() || !password) {
      res.status(400).json({ error: 'جميع حقول المستخدم وكلمة المرور مطلوبة' });
      return;
    }
    try {
      const r = db.prepare('INSERT INTO users (username, full_name, password_hash, role_id, active) VALUES (?, ?, ?, ?, ?)').run(
        username.trim(),
        full_name.trim(),
        bcrypt.hashSync(password, 10),
        role_id,
        active ?? 1
      );
      logAudit(req.user, 'USER_CREATED', 'users', r.lastInsertRowid as number, { username, full_name, role_id });
      res.json({ id: r.lastInsertRowid });
    } catch {
      res.status(400).json({ error: 'اسم المستخدم مسجل مسبقاً' });
    }
  });

  app.put('/api/users/:id', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { full_name, password, role_id, active } = req.body as {
      full_name: string;
      password?: string;
      role_id: number;
      active: number;
    };
    if (id === req.user!.id && active === 0) {
      res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الحالي' });
      return;
    }
    if (password && password.trim()) {
      db.prepare('UPDATE users SET full_name = ?, password_hash = ?, role_id = ?, active = ? WHERE id = ?').run(
        full_name.trim(),
        bcrypt.hashSync(password, 10),
        role_id,
        active,
        id
      );
    } else {
      db.prepare('UPDATE users SET full_name = ?, role_id = ?, active = ? WHERE id = ?').run(full_name.trim(), role_id, active, id);
    }
    logAudit(req.user, 'USER_UPDATED', 'users', id, { full_name, role_id, active });
    res.json({ ok: true });
  });

  app.delete('/api/users/:id', requireAuth, requirePermission('users.manage'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (id === req.user!.id || id === 1) {
      res.status(400).json({ error: 'لا يمكن حذف المدير الأساسي للنظام' });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logAudit(req.user, 'USER_DELETED', 'users', id, {});
    res.json({ ok: true });
  });

  // --- SETTINGS & PHP/MYSQL CODE EXPORT ---
  app.get('/api/settings', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json(getSettings());
  });

  app.put('/api/settings', requireAuth, requirePermission('settings.manage'), (req: AuthedRequest, res: Response) => {
    const { restaurant_name, tax_number, phone, address, currency_symbol, vat_rate, tax_inclusive, receipt_footer } = req.body as Partial<RestaurantSettings>;
    db.prepare(`
      UPDATE settings
      SET restaurant_name = ?, tax_number = ?, phone = ?, address = ?, currency_symbol = ?, vat_rate = ?, tax_inclusive = ?, receipt_footer = ?
      WHERE id = 1
    `).run(
      restaurant_name || 'سُفرة ERP',
      tax_number || '',
      phone || '',
      address || '',
      currency_symbol || 'ر.س',
      Math.max(0, Number(vat_rate) || 0),
      tax_inclusive ? 1 : 0,
      receipt_footer || ''
    );
    logAudit(req.user, 'SETTINGS_UPDATED', 'settings', 1, { restaurant_name, vat_rate, tax_inclusive });
    res.json(getSettings());
  });

  app.get('/api/php-mysql-bundle', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ files: getPhpMysqlBundle() });
  });

  app.get('/api/desktop-windows-bundle', requireAuth, (req: AuthedRequest, res: Response) => {
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const files = getWindowsDesktopBundle(origin).map((f) => ({
      filename: f.filename,
      description: f.description,
      isBinary: Boolean(f.isBinary),
      sizeBytes: f.sizeBytes,
      content: f.isBinary ? f.content.toString('base64') : f.content.toString('utf8'),
    }));
    res.json({ files });
  });

  app.get('/api/desktop-windows-package.zip', requireAuth, (req: AuthedRequest, res: Response) => {
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const files = getWindowsDesktopBundle(origin).map((f) => ({
      filename: `SufraPOS-Desktop/${f.filename}`,
      content: f.content,
    }));
    const zipBuffer = buildZipArchive(files);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="SufraPOS-Windows-Desktop.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  // Vite / Static Frontend Serving
  const distDir = path.resolve(process.cwd(), 'dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Sufra Restaurant ERP running on http://0.0.0.0:3000');
  });
}

startServer();
