import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, UtensilsCrossed } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { formatMoney } from '../shared/money.ts';
import type {
  Addon,
  Category,
  Ingredient,
  MenuItem,
  RestaurantSettings,
  Size,
} from '../shared/types.ts';

interface MenuManagerViewProps {
  settings: RestaurantSettings;
  canManage: boolean;
}

const PRESET_IMAGES = [
  { label: 'مشويات', url: '/src/assets/images/dish_mixed_grill_1794818558133.jpg' },
  { label: 'برجر', url: '/src/assets/images/dish_artisan_burger_1794818558397.jpg' },
  { label: 'بيتزا', url: '/src/assets/images/dish_woodfired_pizza_1794818559696.jpg' },
  { label: 'مقبلات', url: '/src/assets/images/dish_fresh_appetizer_1794818559243.jpg' },
  { label: 'حلويات', url: '/src/assets/images/dish_kunafa_dessert_1794818560098.jpg' },
];

interface DraftSizeRow {
  size_id: number;
  price: number;
  cost_override: string;
  sku: string;
  recipes: Array<{ ingredient_id: number; qty_required: number }>;
}

export const MenuManagerView: React.FC<MenuManagerViewProps> = ({ settings, canManage }) => {
  const [subTab, setSubTab] = useState<'items' | 'categories' | 'sizes' | 'addons'>('items');
  const [categories, setCategories] = useState<Category[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState('');

  // Meal Modal State
  const [showMealModal, setShowMealModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [mealName, setMealName] = useState('');
  const [mealCatId, setMealCatId] = useState<number>(0);
  const [mealDesc, setMealDesc] = useState('');
  const [mealImage, setMealImage] = useState(PRESET_IMAGES[0].url);
  const [mealPrep, setMealPrep] = useState(12);
  const [mealActive, setMealActive] = useState(1);
  const [mealSizes, setMealSizes] = useState<DraftSizeRow[]>([]);

  // Category / Size / Addon Inline Forms
  const [newCatName, setNewCatName] = useState('');
  const [newSizeName, setNewSizeName] = useState('');
  const [newSizeCode, setNewSizeCode] = useState('');
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState('');
  const [newAddonCost, setNewAddonCost] = useState('');

  const cur = settings.currency_symbol;

  async function loadAll() {
    setError('');
    try {
      const [menuRes, invRes] = await Promise.all([
        apiRequest<{ categories: Category[]; sizes: Size[]; items: MenuItem[]; addons: Addon[] }>('/api/menu'),
        apiRequest<{ ingredients: Ingredient[] }>('/api/inventory').catch(() => ({ ingredients: [] })),
      ]);
      setCategories(menuRes.categories);
      setSizes(menuRes.sizes);
      setItems(menuRes.items);
      setAddons(menuRes.addons);
      setIngredients(invRes.ingredients);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function openNewMealModal() {
    setEditingItemId(null);
    setMealName('');
    setMealCatId(categories[0]?.id || 0);
    setMealDesc('');
    setMealImage(PRESET_IMAGES[0].url);
    setMealPrep(12);
    setMealActive(1);
    setMealSizes([
      {
        size_id: sizes[0]?.id || 1,
        price: 35,
        cost_override: '',
        sku: '',
        recipes: [],
      },
    ]);
    setShowMealModal(true);
  }

  function openEditMealModal(item: MenuItem) {
    setEditingItemId(item.id);
    setMealName(item.name);
    setMealCatId(item.category_id);
    setMealDesc(item.description);
    setMealImage(item.image_url);
    setMealPrep(item.prep_minutes);
    setMealActive(item.active);
    setMealSizes(
      item.sizes.map((s) => ({
        size_id: s.size_id,
        price: s.price,
        cost_override: s.cost_override !== null ? String(s.cost_override) : '',
        sku: s.sku,
        recipes: (s.recipes || []).map((r) => ({
          ingredient_id: r.ingredient_id,
          qty_required: r.qty_required,
        })),
      }))
    );
    setShowMealModal(true);
  }

  async function saveMeal(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        category_id: Number(mealCatId),
        name: mealName,
        description: mealDesc,
        image_url: mealImage,
        prep_minutes: Number(mealPrep) || 12,
        active: mealActive,
        sizes: mealSizes.map((s) => ({
          size_id: Number(s.size_id),
          price: Number(s.price),
          cost_override: s.cost_override.trim() !== '' ? Number(s.cost_override) : null,
          sku: s.sku,
          recipes: s.recipes,
        })),
      };
      if (editingItemId) {
        await apiRequest(`/api/menu-items/${editingItemId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/menu-items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowMealModal(false);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteMeal(id: number) {
    try {
      await apiRequest(`/api/menu-items/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCatName.trim(), sort_order: categories.length + 1 }),
    });
    setNewCatName('');
    await loadAll();
  }

  async function toggleCategoryActive(cat: Category) {
    await apiRequest(`/api/categories/${cat.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...cat, active: cat.active === 1 ? 0 : 1 }),
    });
    await loadAll();
  }

  async function deleteCategory(id: number) {
    try {
      await apiRequest(`/api/categories/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addSize(e: React.FormEvent) {
    e.preventDefault();
    if (!newSizeName.trim()) return;
    await apiRequest('/api/sizes', {
      method: 'POST',
      body: JSON.stringify({ name: newSizeName.trim(), code: newSizeCode.trim() || newSizeName.trim(), sort_order: sizes.length + 1 }),
    });
    setNewSizeName('');
    setNewSizeCode('');
    await loadAll();
  }

  async function deleteSize(id: number) {
    try {
      await apiRequest(`/api/sizes/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addAddon(e: React.FormEvent) {
    e.preventDefault();
    if (!newAddonName.trim()) return;
    await apiRequest('/api/addons', {
      method: 'POST',
      body: JSON.stringify({ name: newAddonName.trim(), price: Number(newAddonPrice) || 0, cost: Number(newAddonCost) || 0 }),
    });
    setNewAddonName('');
    setNewAddonPrice('');
    setNewAddonCost('');
    await loadAll();
  }

  async function deleteAddon(id: number) {
    await apiRequest(`/api/addons/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {[
            { k: 'items', label: `الوجبات والأصناف (${items.length})` },
            { k: 'categories', label: `الأقسام (${categories.length})` },
            { k: 'sizes', label: `الأحجام (${sizes.length})` },
            { k: 'addons', label: `الإضافات (${addons.length})` },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setSubTab(t.k as typeof subTab)}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                subTab === t.k ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {canManage && subTab === 'items' && (
          <button
            onClick={openNewMealModal}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة وجبة جديدة</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}

      {/* ITEMS TAB */}
      {subTab === 'items' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">الوجبة</th>
                  <th className="px-4 py-3 font-semibold">القسم</th>
                  <th className="px-4 py-3 font-semibold">الأحجام والأسعار والتكلفة</th>
                  <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <UtensilsCrossed className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-[#0B1D36]">{item.name}</div>
                          <div className="max-w-xs truncate text-xs text-slate-500">{item.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{item.category_name}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {item.sizes.map((sz) => {
                          const margin = sz.price > 0 ? Math.round(((sz.price - sz.computed_cost) / sz.price) * 100) : 0;
                          return (
                            <div key={sz.id} className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-800">{sz.size_name}:</span>
                              <span className="font-mono-num font-bold text-teal-700">
                                {formatMoney(sz.price, cur)}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono-num text-slate-500">
                                تكلفة {formatMoney(sz.computed_cost, cur)}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono-num text-slate-600">هامش {margin}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold">
                      <span className={item.active === 1 ? 'text-teal-700' : 'text-slate-400'}>
                        {item.active === 1 ? 'متاح' : 'موقوف'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-left">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEditMealModal(item)}
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-[#0B1D36]"
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void deleteMeal(item.id)}
                            className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORIES TAB */}
      {subTab === 'categories' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {canManage && (
            <form onSubmit={addCategory} className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
              <h3 className="text-sm font-bold text-[#0B1D36]">إضافة قسم جديد</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="اسم القسم (مثال: الباستا، البحريات)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  required
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  حفظ القسم
                </button>
              </div>
            </form>
          )}
          <div className={`rounded-xl border border-slate-200 bg-white ${canManage ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">الترتيب</th>
                  <th className="px-4 py-3 font-semibold">اسم القسم</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold">إجراء</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{c.sort_order}</td>
                    <td className="px-4 py-3 font-semibold text-[#0B1D36]">{c.name}</td>
                    <td className="px-4 py-3 text-xs">
                      <button
                        disabled={!canManage}
                        onClick={() => void toggleCategoryActive(c)}
                        className={`font-semibold ${c.active === 1 ? 'text-teal-700' : 'text-slate-400'}`}
                      >
                        {c.active === 1 ? 'مفعل' : 'معطل'}
                      </button>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => void deleteCategory(c.id)}
                          className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
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

      {/* SIZES TAB */}
      {subTab === 'sizes' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {canManage && (
            <form onSubmit={addSize} className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
              <h3 className="text-sm font-bold text-[#0B1D36]">إضافة حجم قياسي جديد</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  placeholder="اسم الحجم (مثال: دبل، جامبو)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  required
                />
                <input
                  type="text"
                  value={newSizeCode}
                  onChange={(e) => setNewSizeCode(e.target.value)}
                  placeholder="الرمز المختصر (مثال: XL)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  حفظ الحجم
                </button>
              </div>
            </form>
          )}
          <div className={`rounded-xl border border-slate-200 bg-white ${canManage ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">اسم الحجم</th>
                  <th className="px-4 py-3 font-semibold">الرمز</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold">حذف</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sizes.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-semibold text-[#0B1D36]">{s.name}</td>
                    <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{s.code}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => void deleteSize(s.id)}
                          className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
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

      {/* ADDONS TAB */}
      {subTab === 'addons' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {canManage && (
            <form onSubmit={addAddon} className="h-fit rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
              <h3 className="text-sm font-bold text-[#0B1D36]">إضافة معدل / صوص جديد</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={newAddonName}
                  onChange={(e) => setNewAddonName(e.target.value)}
                  placeholder="اسم الإضافة"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={newAddonPrice}
                    onChange={(e) => setNewAddonPrice(e.target.value)}
                    placeholder="سعر البيع"
                    className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                    required
                  />
                  <input
                    type="number"
                    step="0.25"
                    value={newAddonCost}
                    onChange={(e) => setNewAddonCost(e.target.value)}
                    placeholder="التكلفة"
                    className="rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  حفظ الإضافة
                </button>
              </div>
            </form>
          )}
          <div className={`rounded-xl border border-slate-200 bg-white ${canManage ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">الإضافة</th>
                  <th className="px-4 py-3 text-left font-semibold">سعر البيع</th>
                  <th className="px-4 py-3 text-left font-semibold">التكلفة</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold">حذف</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {addons.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-semibold text-[#0B1D36]">{a.name}</td>
                    <td className="px-4 py-3 text-left font-mono-num font-bold text-teal-700">
                      {formatMoney(a.price, cur)}
                    </td>
                    <td className="px-4 py-3 text-left font-mono-num text-slate-500">
                      {formatMoney(a.cost, cur)}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => void deleteAddon(a.id)}
                          className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
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

      {/* MEAL ADD/EDIT MODAL WITH SIZES & BOM RECIPES */}
      {showMealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-bold text-[#0B1D36]">
                {editingItemId ? 'تعديل الوجبة والأحجام والوصفة' : 'إضافة وجبة جديدة مع الأحجام والوصفة'}
              </h3>
              <button onClick={() => setShowMealModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveMeal} className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">اسم الوجبة</label>
                  <input
                    type="text"
                    value={mealName}
                    onChange={(e) => setMealName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">القسم</label>
                  <select
                    value={mealCatId}
                    onChange={(e) => setMealCatId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700">الوصف</label>
                  <input
                    type="text"
                    value={mealDesc}
                    onChange={(e) => setMealDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">صورة الطبق</label>
                  <select
                    value={mealImage}
                    onChange={(e) => setMealImage(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
                  >
                    <option value="">بدون صورة (أيقونة قياسية)</option>
                    {PRESET_IMAGES.map((img) => (
                      <option key={img.url} value={img.url}>
                        صورة {img.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">مدة التحضير (دقيقة)</label>
                    <input
                      type="number"
                      min={1}
                      value={mealPrep}
                      onChange={(e) => setMealPrep(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">الحالة</label>
                    <select
                      value={mealActive}
                      onChange={(e) => setMealActive(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value={1}>متاح للبيع</option>
                      <option value={0}>موقوف</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sizes & BOM Recipes */}
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#0B1D36]">الأحجام والأسعار ومكونات الوصفة (BOM)</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setMealSizes((p) => [
                        ...p,
                        { size_id: sizes[0]?.id || 1, price: 45, cost_override: '', sku: '', recipes: [] },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>إضافة حجم</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {mealSizes.map((szRow, sIdx) => (
                    <div key={sIdx} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">الحجم</label>
                          <select
                            value={szRow.size_id}
                            onChange={(e) => {
                              const next = [...mealSizes];
                              next[sIdx].size_id = Number(e.target.value);
                              setMealSizes(next);
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                          >
                            {sizes.map((sz) => (
                              <option key={sz.id} value={sz.id}>
                                {sz.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">سعر البيع ({cur})</label>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            value={szRow.price}
                            onChange={(e) => {
                              const next = [...mealSizes];
                              next[sIdx].price = Number(e.target.value);
                              setMealSizes(next);
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-num text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">تكلفة يدوية (اختياري)</label>
                          <input
                            type="number"
                            step="0.25"
                            value={szRow.cost_override}
                            onChange={(e) => {
                              const next = [...mealSizes];
                              next[sIdx].cost_override = e.target.value;
                              setMealSizes(next);
                            }}
                            placeholder="تحسب من الوصفة"
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-num text-xs"
                          />
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="flex-1">
                            <label className="mb-1 block text-[11px] font-semibold text-slate-600">SKU</label>
                            <input
                              type="text"
                              value={szRow.sku}
                              onChange={(e) => {
                                const next = [...mealSizes];
                                next[sIdx].sku = e.target.value;
                                setMealSizes(next);
                              }}
                              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-num text-xs"
                            />
                          </div>
                          {mealSizes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setMealSizes((p) => p.filter((_, i) => i !== sIdx))}
                              className="rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ingredients Recipe */}
                      {ingredients.length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-2.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-600">
                              مكونات الوصفة (تُخصم تلقائياً من المستودع عند البيع)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...mealSizes];
                                next[sIdx].recipes.push({
                                  ingredient_id: ingredients[0].id,
                                  qty_required: 0.2,
                                });
                                setMealSizes(next);
                              }}
                              className="text-[11px] font-bold text-teal-700 hover:underline"
                            >
                              + مكون
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {szRow.recipes.map((rec, rIdx) => (
                              <div key={rIdx} className="flex items-center gap-2">
                                <select
                                  value={rec.ingredient_id}
                                  onChange={(e) => {
                                    const next = [...mealSizes];
                                    next[sIdx].recipes[rIdx].ingredient_id = Number(e.target.value);
                                    setMealSizes(next);
                                  }}
                                  className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                >
                                  {ingredients.map((ing) => (
                                    <option key={ing.id} value={ing.id}>
                                      {ing.name} ({ing.unit})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0.01}
                                  value={rec.qty_required}
                                  onChange={(e) => {
                                    const next = [...mealSizes];
                                    next[sIdx].recipes[rIdx].qty_required = Number(e.target.value);
                                    setMealSizes(next);
                                  }}
                                  className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono-num text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...mealSizes];
                                    next[sIdx].recipes = next[sIdx].recipes.filter((_, i) => i !== rIdx);
                                    setMealSizes(next);
                                  }}
                                  className="text-rose-600 hover:text-rose-800"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMealModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
                >
                  {editingItemId ? 'حفظ التعديلات' : 'إضافة الوجبة للقائمة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
