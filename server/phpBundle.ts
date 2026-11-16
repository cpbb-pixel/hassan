export interface PhpBundleFile {
  filename: string;
  language: 'sql' | 'php' | 'html';
  description: string;
  content: string;
}

export function getPhpMysqlBundle(): PhpBundleFile[] {
  return [
    {
      filename: 'database.sql',
      language: 'sql',
      description: 'مخطط قاعدة بيانات MySQL 8 الكامل (الجداول والعلاقات والمفاتيح الخارجية والتدقيق)',
      content: `-- ========================================================
-- سُفرة ERP — قاعدة بيانات نظام إدارة المطاعم المتكامل (MySQL 8)
-- ========================================================
CREATE DATABASE IF NOT EXISTS sufra_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sufra_erp;

CREATE TABLE settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  restaurant_name VARCHAR(150) NOT NULL,
  tax_number VARCHAR(50) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  address VARCHAR(255) NOT NULL,
  currency_symbol VARCHAR(16) NOT NULL DEFAULT 'ر.س',
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  tax_inclusive TINYINT(1) NOT NULL DEFAULT 1,
  receipt_footer TEXT
) ENGINE=InnoDB;

CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT '',
  permissions_json JSON NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(60) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE sizes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  code VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE ingredients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(50) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  min_threshold DECIMAL(12,3) NOT NULL DEFAULT 5.000,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  supplier_name VARCHAR(120) DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL,
  name VARCHAR(140) NOT NULL,
  description TEXT,
  image_url VARCHAR(255) DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  prep_minutes INT NOT NULL DEFAULT 12,
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE item_sizes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  menu_item_id INT NOT NULL,
  size_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  cost_override DECIMAL(12,2) NULL,
  sku VARCHAR(60) DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_is_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_is_size FOREIGN KEY (size_id) REFERENCES sizes(id)
) ENGINE=InnoDB;

CREATE TABLE recipes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  item_size_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  qty_required DECIMAL(12,4) NOT NULL,
  CONSTRAINT fk_rec_item_size FOREIGN KEY (item_size_id) REFERENCES item_sizes(id) ON DELETE CASCADE,
  CONSTRAINT fk_rec_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB;

CREATE TABLE addons (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE dining_tables (
  id INT PRIMARY KEY AUTO_INCREMENT,
  table_number VARCHAR(30) NOT NULL UNIQUE,
  zone VARCHAR(80) NOT NULL,
  capacity INT NOT NULL DEFAULT 4,
  status ENUM('available','occupied','reserved') NOT NULL DEFAULT 'available',
  current_order_id INT NULL
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_no VARCHAR(40) NOT NULL UNIQUE,
  order_type ENUM('dine_in','takeaway','delivery') NOT NULL,
  table_id INT NULL,
  customer_name VARCHAR(120) DEFAULT '',
  customer_phone VARCHAR(40) DEFAULT '',
  customer_address VARCHAR(255) DEFAULT '',
  status ENUM('preparing','ready','completed','voided') NOT NULL DEFAULT 'preparing',
  payment_method ENUM('cash','card','transfer') NOT NULL DEFAULT 'cash',
  subtotal DECIMAL(12,2) NOT NULL,
  discount_type ENUM('none','percent','fixed') NOT NULL DEFAULT 'none',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_before_tax DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL,
  tax_inclusive TINYINT(1) NOT NULL DEFAULT 1,
  tax_amount DECIMAL(12,2) NOT NULL,
  delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  grand_total DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  change_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_cogs DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_by INT NULL,
  voided_reason VARCHAR(255) NULL,
  voided_at DATETIME NULL,
  CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES dining_tables(id),
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  menu_item_id INT NOT NULL,
  item_name VARCHAR(140) NOT NULL,
  item_size_id INT NOT NULL,
  size_name VARCHAR(60) NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  addons_json JSON NOT NULL,
  addons_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12,2) NOT NULL,
  line_cogs DECIMAL(12,2) NOT NULL,
  notes VARCHAR(255) DEFAULT '',
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE expenses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash','card','transfer') NOT NULL DEFAULT 'cash',
  reference_no VARCHAR(60) DEFAULT '',
  expense_date DATE NOT NULL,
  notes TEXT,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  username VARCHAR(60) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NOT NULL,
  details_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
`,
    },
    {
      filename: 'config/database.php',
      language: 'php',
      description: 'ملف الاتصال الآمن بـ MySQL عبر PDO + دوال التحقق من الصلاحيات والتدقيق الحسابي',
      content: `<?php
// config/database.php — PDO MySQL Connection & RBAC Helper
declare(strict_types=1);
session_start();

$host = '127.0.0.1';
$db   = 'sufra_erp';
$user = 'root';
$pass = '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

$pdo = new PDO($dsn, $user, $pass, $options);

function hasPermission(string $perm): bool {
    $perms = $_SESSION['user']['permissions'] ?? [];
    return in_array($perm, $perms, true);
}

function requirePermission(string $perm): void {
    if (!isset($_SESSION['user']) || !hasPermission($perm)) {
        http_response_code(403);
        exit(json_encode(['error' => 'صلاحيات غير كافية لتنفيذ هذا الإجراء'], JSON_UNESCAPED_UNICODE));
    }
}

function logAudit(PDO $pdo, string $action, string $entityType, string $entityId, array $details): void {
    $stmt = $pdo->prepare('INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $_SESSION['user']['id'] ?? null,
        $_SESSION['user']['username'] ?? 'system',
        $action,
        $entityType,
        $entityId,
        json_encode($details, JSON_UNESCAPED_UNICODE)
    ]);
}
`,
    },
    {
      filename: 'api/create_order.php',
      language: 'php',
      description: 'نقطة نهاية PHP مع المعاملات (Transactions) لإعادة حساب الضريبة والتكلفة وخصم المخزون تلقائياً',
      content: `<?php
// api/create_order.php — Authoritative Server-Side POS Order & Inventory Deduction
require_once __DIR__ . '/../config/database.php';
header('Content-Type: application/json; charset=utf-8');

requirePermission('pos.create_order');
$payload = json_decode(file_get_contents('php://input'), true);

$pdo->beginTransaction();
try {
    $settings = $pdo->query('SELECT * FROM settings LIMIT 1')->fetch();
    $vatRate = (float)$settings['vat_rate'];
    $taxInclusive = (int)$settings['tax_inclusive'] === 1;

    $subtotalCents = 0;
    $cogsCents = 0;
    $verifiedItems = [];

    $sizeStmt = $pdo->prepare('
        SELECT isz.*, mi.name AS item_name, sz.name AS size_name
        FROM item_sizes isz
        JOIN menu_items mi ON mi.id = isz.menu_item_id
        JOIN sizes sz ON sz.id = isz.size_id
        WHERE isz.id = ?
    ');

    foreach ($payload['items'] as $line) {
        $sizeStmt->execute([(int)$line['item_size_id']]);
        $sz = $sizeStmt->fetch();
        if (!$sz) throw new RuntimeException('الصنف غير موجود');

        $qty = max(1, (int)$line['qty']);
        $unitCents = (int)round(((float)$sz['price']) * 100);
        $lineTotalCents = $unitCents * $qty;
        $subtotalCents += $lineTotalCents;

        // Deduct ingredients via BOM recipe
        $recStmt = $pdo->prepare('SELECT r.*, i.unit_cost FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.item_size_id = ?');
        $recStmt->execute([$sz['id']]);
        $unitCostCents = 0;
        foreach ($recStmt->fetchAll() as $rec) {
            $deductQty = (float)$rec['qty_required'] * $qty;
            $pdo->prepare('UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?')->execute([$deductQty, $rec['ingredient_id']]);
            $unitCostCents += (int)round((float)$rec['qty_required'] * (float)$rec['unit_cost'] * 100);
        }
        $cogsCents += ($unitCostCents * $qty);
        $verifiedItems[] = ['sz' => $sz, 'qty' => $qty, 'lineTotal' => $lineTotalCents / 100, 'lineCogs' => ($unitCostCents * $qty) / 100];
    }

    $discountCents = 0;
    if (($payload['discount_type'] ?? 'none') === 'percent') {
        $discountCents = (int)round($subtotalCents * min(100, max(0, (float)$payload['discount_value'])) / 100);
    } elseif (($payload['discount_type'] ?? 'none') === 'fixed') {
        $discountCents = min($subtotalCents, (int)round(max(0, (float)$payload['discount_value']) * 100));
    }

    $afterDiscount = max(0, $subtotalCents - $discountCents);
    if ($taxInclusive) {
        $netBeforeTax = (int)round($afterDiscount * 100 / (100 + $vatRate));
        $taxCents = $afterDiscount - $netBeforeTax;
        $grandCents = $afterDiscount;
    } else {
        $netBeforeTax = $afterDiscount;
        $taxCents = (int)round($netBeforeTax * $vatRate / 100);
        $grandCents = $netBeforeTax + $taxCents;
    }

    $invoiceNo = 'INV-' . date('Ymd') . '-' . random_int(1000, 9999);
    $insOrder = $pdo->prepare('INSERT INTO orders (invoice_no, order_type, subtotal, discount_amount, net_before_tax, tax_rate, tax_inclusive, tax_amount, grand_total, total_cogs, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $insOrder->execute([
        $invoiceNo,
        $payload['order_type'] ?? 'takeaway',
        $subtotalCents / 100,
        $discountCents / 100,
        $netBeforeTax / 100,
        $vatRate,
        $taxInclusive ? 1 : 0,
        $taxCents / 100,
        $grandCents / 100,
        $cogsCents / 100,
        $_SESSION['user']['id']
    ]);

    $orderId = $pdo->lastInsertId();
    logAudit($pdo, 'ORDER_CREATED', 'orders', (string)$orderId, ['invoice_no' => $invoiceNo, 'grand_total' => $grandCents / 100]);

    $pdo->commit();
    echo json_encode(['ok' => true, 'invoice_no' => $invoiceNo, 'grand_total' => $grandCents / 100], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
`,
    },
    {
      filename: 'index.php',
      language: 'html',
      description: 'قالب الواجهة الأساسي بـ Bootstrap 5 RTL و FontAwesome 6 وتصدير Excel/PDF',
      content: `<?php require_once __DIR__ . '/config/database.php'; ?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>سُفرة ERP — نظام إدارة المطاعم</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
</head>
<body class="bg-light">
  <div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="fw-bold"><i class="fa-solid fa-utensils text-success me-2"></i>سُفرة ERP</h3>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-success" onclick="exportExcel()"><i class="fa-solid fa-file-excel me-1"></i> تصدير Excel</button>
        <button class="btn btn-outline-danger" onclick="window.print()"><i class="fa-solid fa-file-pdf me-1"></i> تصدير PDF</button>
      </div>
    </div>
    <!-- Dashboard KPI Cards, POS Terminal & Reports -->
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
`,
    },
  ];
}
