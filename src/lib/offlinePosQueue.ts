import { apiRequest } from './api.ts';
import type {
  Addon,
  Category,
  MenuItem,
  Order,
  OrderType,
  PaymentMethod,
  RestaurantTable,
} from '../shared/types.ts';

const QUEUE_KEY = 'sufra_offline_pos_queue_v1';
const CACHE_KEY = 'sufra_pos_cache_v1';

export interface OfflineOrderPayload {
  local_id: string;
  created_at: string;
  grand_total_preview: number;
  payload: {
    order_type: OrderType;
    table_id: number | null;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    payment_method: PaymentMethod;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    delivery_fee: number;
    paid_amount: number;
    items: Array<{
      item_size_id: number;
      qty: number;
      addon_ids: number[];
      notes: string;
    }>;
  };
}

export interface PosCacheSnapshot {
  categories: Category[];
  items: MenuItem[];
  addons: Addon[];
  tables: RestaurantTable[];
  updated_at: string;
}

export function savePosCache(snapshot: Omit<PosCacheSnapshot, 'updated_at'>): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        updated_at: new Date().toISOString(),
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function loadPosCache(): PosCacheSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosCacheSnapshot;
  } catch {
    return null;
  }
}

export function getOfflineOrderQueue(): OfflineOrderPayload[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineOrderPayload[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOrder(entry: OfflineOrderPayload): OfflineOrderPayload[] {
  const current = getOfflineOrderQueue();
  const next = [...current, entry];
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('sufra-offline-queue-changed', { detail: next.length }));
  return next;
}

export async function syncOfflineOrderQueue(): Promise<{ synced: Order[]; remaining: number }> {
  const queue = getOfflineOrderQueue();
  if (queue.length === 0) return { synced: [], remaining: 0 };

  const synced: Order[] = [];
  const remaining: OfflineOrderPayload[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const order = await apiRequest<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(item.payload),
      });
      synced.push(order);
    } catch {
      remaining.push(...queue.slice(i));
      break;
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('sufra-offline-queue-changed', { detail: remaining.length }));
  return { synced, remaining: remaining.length };
}

export function getElectronWrapperFiles(appUrl: string) {
  const mainCjs = `const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_URL = process.env.SUFRA_APP_URL || '${appUrl}';

function createPosWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'سُفرة POS — نظام نقاط البيع والمطاعم',
    backgroundColor: '#071324',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(APP_URL + '/?mode=pos');

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createPosWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPosWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;

  const packageJson = JSON.stringify(
    {
      name: 'sufra-pos-desktop',
      version: '1.0.0',
      description: 'تطبيق سطح مكتب سُفرة لنقاط البيع وإدارة المطاعم',
      main: 'main.cjs',
      scripts: {
        start: 'electron .',
        'build:win': 'electron-builder --win nsis',
        'build:mac': 'electron-builder --mac dmg',
      },
      devDependencies: {
        electron: '^34.0.0',
        'electron-builder': '^25.1.8',
      },
      build: {
        appId: 'com.sufra.pos.erp',
        productName: 'Sufra POS',
        win: {
          target: 'nsis',
        },
      },
    },
    null,
    2
  );

  return [
    { filename: 'main.cjs', content: mainCjs },
    { filename: 'package.json', content: packageJson },
  ];
}
