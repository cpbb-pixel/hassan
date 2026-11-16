import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Shield, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { ALL_PERMISSIONS, type PermissionKey, type Role, type User } from '../shared/types.ts';

export const UsersRolesView: React.FC = () => {
  const [subTab, setSubTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');

  // User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uFullName, setUFullName] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRoleId, setURoleId] = useState<number>(1);
  const [uActive, setUActive] = useState<number>(1);

  // Role Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [rName, setRName] = useState('');
  const [rDesc, setRDesc] = useState('');
  const [rPerms, setRPerms] = useState<PermissionKey[]>([]);

  async function loadAll() {
    setError('');
    try {
      const [uRes, rRes] = await Promise.all([
        apiRequest<User[]>('/api/users'),
        apiRequest<Role[]>('/api/roles'),
      ]);
      setUsers(uRes);
      setRoles(rRes);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function openNewUser() {
    setEditUserId(null);
    setUUsername('');
    setUFullName('');
    setUPassword('');
    setURoleId(roles[0]?.id || 1);
    setUActive(1);
    setShowUserModal(true);
  }

  function openEditUser(u: User) {
    setEditUserId(u.id);
    setUUsername(u.username);
    setUFullName(u.full_name);
    setUPassword('');
    setURoleId(u.role_id);
    setUActive(u.active);
    setShowUserModal(true);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editUserId) {
        await apiRequest(`/api/users/${editUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ full_name: uFullName, password: uPassword, role_id: uRoleId, active: uActive }),
        });
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify({ username: uUsername, full_name: uFullName, password: uPassword, role_id: uRoleId, active: uActive }),
        });
      }
      setShowUserModal(false);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteUser(id: number) {
    try {
      await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openNewRole() {
    setEditRoleId(null);
    setRName('');
    setRDesc('');
    setRPerms(['dashboard.view', 'pos.create_order']);
    setShowRoleModal(true);
  }

  function openEditRole(r: Role) {
    setEditRoleId(r.id);
    setRName(r.display_name);
    setRDesc(r.description);
    setRPerms([...r.permissions]);
    setShowRoleModal(true);
  }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editRoleId) {
        await apiRequest(`/api/roles/${editRoleId}`, {
          method: 'PUT',
          body: JSON.stringify({ display_name: rName, description: rDesc, permissions: rPerms }),
        });
      } else {
        await apiRequest('/api/roles', {
          method: 'POST',
          body: JSON.stringify({ display_name: rName, description: rDesc, permissions: rPerms }),
        });
      }
      setShowRoleModal(false);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteRole(id: number) {
    try {
      await apiRequest(`/api/roles/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const groupedPermissions = ALL_PERMISSIONS.reduce<Record<string, typeof ALL_PERMISSIONS>>((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setSubTab('users')}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
              subTab === 'users' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            المستخدمون والموظفون ({users.length})
          </button>
          <button
            onClick={() => setSubTab('roles')}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
              subTab === 'roles' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            الأدوار ومصفوفة الصلاحيات ({roles.length})
          </button>
        </div>

        <button
          onClick={subTab === 'users' ? openNewUser : openNewRole}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
        >
          <Plus className="h-4 w-4" />
          <span>{subTab === 'users' ? 'إضافة مستخدم جديد' : 'إنشاء دور وظيفي جديد'}</span>
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</div>}

      {subTab === 'users' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">الاسم الكامل</th>
                <th className="px-4 py-3 font-semibold">اسم المستخدم</th>
                <th className="px-4 py-3 font-semibold">الدور الوظيفي</th>
                <th className="px-4 py-3 text-center font-semibold">الصلاحيات</th>
                <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                <th className="px-4 py-3 text-left font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-semibold text-[#0B1D36]">{u.full_name}</td>
                  <td className="px-4 py-3 font-mono-num text-xs text-slate-600">{u.username}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-800">{u.role_display_name}</td>
                  <td className="px-4 py-3 text-center font-mono-num text-xs text-slate-600">
                    {u.permissions.length} / {ALL_PERMISSIONS.length}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-semibold">
                    <span className={u.active === 1 ? 'text-teal-700' : 'text-rose-600'}>
                      {u.active === 1 ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => openEditUser(u)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {u.id !== 1 && (
                        <button
                          onClick={() => void deleteUser(u.id)}
                          className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'roles' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-teal-700" />
                    <h3 className="text-sm font-bold text-[#0B1D36]">{r.display_name}</h3>
                  </div>
                  <span className="font-mono-num text-xs text-slate-500">
                    {r.permissions.length} صلاحية
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{r.description}</p>
                <div className="mt-3 text-xs leading-relaxed text-slate-700">
                  {ALL_PERMISSIONS.filter((p) => r.permissions.includes(p.key))
                    .map((p) => p.label)
                    .join(' · ')}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                {r.name !== 'super_admin' && (
                  <button
                    onClick={() => openEditRole(r)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>تعديل الصلاحيات</span>
                  </button>
                )}
                {r.is_system === 0 && (
                  <button
                    onClick={() => void deleteRole(r.id)}
                    className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    حذف
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={saveUser} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#0B1D36]">
                {editUserId ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
              </h3>
              <button type="button" onClick={() => setShowUserModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {!editUserId && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">اسم المستخدم للدخول</label>
                  <input
                    type="text"
                    value={uUsername}
                    onChange={(e) => setUUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">الاسم الكامل</label>
                <input
                  type="text"
                  value={uFullName}
                  onChange={(e) => setUFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {editUserId ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'}
                </label>
                <input
                  type="password"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required={!editUserId}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">الدور الوظيفي</label>
                  <select
                    value={uRoleId}
                    onChange={(e) => setURoleId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">حالة الحساب</label>
                  <select
                    value={uActive}
                    onChange={(e) => setUActive(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value={1}>نشط</option>
                    <option value={0}>موقوف</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowUserModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                إلغاء
              </button>
              <button type="submit" className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600">
                حفظ المستخدم
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Role Permissions Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/65 p-4 backdrop-blur-xs">
          <form onSubmit={saveRole} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#0B1D36]">
                {editRoleId ? 'تعديل صلاحيات الدور الوظيفي' : 'إنشاء دور وظيفي جديد'}
              </h3>
              <button type="button" onClick={() => setShowRoleModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="اسم الدور (مثال: مشرف وردية)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                type="text"
                value={rDesc}
                onChange={(e) => setRDesc(e.target.value)}
                placeholder="وصف مختصر للمهام"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-5 space-y-4">
              {Object.entries(groupedPermissions).map(([groupName, perms]) => (
                <div key={groupName} className="rounded-lg border border-slate-200 p-3.5">
                  <div className="mb-2 text-xs font-bold text-[#0B1D36]">{groupName}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {perms.map((p) => {
                      const checked = rPerms.includes(p.key);
                      return (
                        <label key={p.key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setRPerms((prev) => [...prev, p.key]);
                              else setRPerms((prev) => prev.filter((k) => k !== p.key));
                            }}
                            className="accent-teal-700"
                          />
                          <span>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setShowRoleModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                إلغاء
              </button>
              <button type="submit" className="rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600">
                حفظ الصلاحيات
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
