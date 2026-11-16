import React, { useEffect, useState } from 'react';
import { Save, Download, Code2, CheckCircle2, Monitor, FolderArchive, FileCode2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { getElectronWrapperFiles } from '../lib/offlinePosQueue.ts';
import { downloadWindowsDesktopZip } from './DesktopInstallControls.tsx';
import type { RestaurantSettings } from '../shared/types.ts';

interface SettingsViewProps {
  settings: RestaurantSettings;
  onSettingsUpdated: (updated: RestaurantSettings) => void;
}

interface PhpBundleFile {
  filename: string;
  language: string;
  description: string;
  content: string;
}

interface DesktopBundleFileDto {
  filename: string;
  description: string;
  isBinary: boolean;
  sizeBytes: number;
  content: string;
}

const STARTUP_MODE_KEY = 'sufra_desktop_startup_mode';

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSettingsUpdated }) => {
  const [subTab, setSubTab] = useState<'general' | 'desktop' | 'php'>('general');
  const [form, setForm] = useState<RestaurantSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [bundleFiles, setBundleFiles] = useState<PhpBundleFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('database.sql');

  const [desktopFiles, setDesktopFiles] = useState<DesktopBundleFileDto[]>([]);
  const [selectedDesktopFile, setSelectedDesktopFile] = useState<string>('Install.cmd');
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [desktopError, setDesktopError] = useState('');

  const [startupMode, setStartupMode] = useState<'auto' | 'pos' | 'dashboard'>(() => {
    const val = localStorage.getItem(STARTUP_MODE_KEY);
    return val === 'pos' || val === 'dashboard' ? val : 'auto';
  });
  const [desktopSavedMsg, setDesktopSavedMsg] = useState('');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const electronFiles = getElectronWrapperFiles(currentOrigin);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (subTab === 'php' && bundleFiles.length === 0) {
      void apiRequest<{ files: PhpBundleFile[] }>('/api/php-mysql-bundle').then((res) => {
        setBundleFiles(res.files);
      });
    }
    if (subTab === 'desktop' && desktopFiles.length === 0) {
      void apiRequest<{ files: DesktopBundleFileDto[] }>('/api/desktop-windows-bundle')
        .then((res) => {
          setDesktopFiles(res.files);
        })
        .catch(() => {
          setDesktopError('ملاحظة: تحميل حزمة الملفات الكاملة يتطلب الاتصال بالسيرفر.');
        });
    }
  }, [subTab, bundleFiles.length, desktopFiles.length]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      const updated = await apiRequest<RestaurantSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onSettingsUpdated(updated);
      setSavedMsg('تم حفظ إعدادات المطعم والضريبة بنجاح');
    } finally {
      setSaving(false);
    }
  }

  function handleSaveDesktopPref(mode: 'auto' | 'pos' | 'dashboard') {
    setStartupMode(mode);
    localStorage.setItem(STARTUP_MODE_KEY, mode);
    setDesktopSavedMsg('تم حفظ تفضيل شاشة البداية لهذا الجهاز بنجاح');
    setTimeout(() => setDesktopSavedMsg(''), 3000);
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.split('/').pop() || filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadDesktopSingleFile(file: DesktopBundleFileDto) {
    if (file.isBinary) {
      const byteString = atob(file.content);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/x-icon' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      downloadTextFile(file.filename, file.content);
    }
  }

  async function handleDownloadFullZip() {
    setDesktopError('');
    setDownloadingZip(true);
    try {
      await downloadWindowsDesktopZip();
    } catch (err) {
      setDesktopError((err as Error).message);
    } finally {
      setDownloadingZip(false);
    }
  }

  const activeBundleFile = bundleFiles.find((f) => f.filename === selectedFile) || bundleFiles[0];
  const activeDesktopFile =
    desktopFiles.find((f) => f.filename === selectedDesktopFile) || desktopFiles[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        <button
          onClick={() => setSubTab('general')}
          className={`whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
            subTab === 'general' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          إعدادات المطعم والضريبة
        </button>
        <button
          onClick={() => setSubTab('desktop')}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
            subTab === 'desktop' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Monitor className="h-3.5 w-3.5" />
          <span>حزمة تطبيق سطح المكتب (Windows)</span>
        </button>
        <button
          onClick={() => setSubTab('php')}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-semibold ${
            subTab === 'php' ? 'bg-[#0B1D36] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>تصدير حزمة PHP / MySQL / Bootstrap</span>
        </button>
      </div>

      {subTab === 'general' && (
        <form onSubmit={saveSettings} className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="border-b border-slate-200 pb-3 text-base font-bold text-[#0B1D36]">
            البيانات الأساسية والضريبية للمطعم
          </h3>

          {savedMsg && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800">
              <CheckCircle2 className="h-4 w-4" />
              <span>{savedMsg}</span>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">اسم المطعم</label>
              <input
                type="text"
                value={form.restaurant_name}
                onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">الرقم الضريبي</label>
              <input
                type="text"
                value={form.tax_number}
                onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">رقم الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">العملة</label>
              <input
                type="text"
                value={form.currency_symbol}
                onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-700">العنوان</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">نسبة ضريبة القيمة المضافة %</label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={50}
                value={form.vat_rate}
                onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">آلية احتساب الضريبة</label>
              <select
                value={form.tax_inclusive}
                onChange={(e) => setForm({ ...form, tax_inclusive: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value={1}>الأسعار شاملة للضريبة (استخراج الضريبة من السعر)</option>
                <option value={0}>الأسعار غير شاملة (تضاف الضريبة فوق السعر)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-700">تذييل الفاتورة المطبوعة</label>
              <input
                type="text"
                value={form.receipt_footer}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>
          </div>
        </form>
      )}

      {subTab === 'desktop' && (
        <div className="space-y-6">
          {/* Full Windows Desktop Installer Bundle (9 Files matching user's structure) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-[#0B1D36]">
                  ملفات مشروع سطح المكتب الكاملة لنظام Windows (جاهزة للتشغيل وبناء EXE)
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  حزمة متكاملة تحتوي على <span className="font-mono font-semibold">Build.bat</span>،{' '}
                  <span className="font-mono font-semibold">icon.ico</span>،{' '}
                  <span className="font-mono font-semibold">Install.cmd</span>،{' '}
                  <span className="font-mono font-semibold">Launcher.cs</span>،{' '}
                  <span className="font-mono font-semibold">SufraPOS.html</span>،{' '}
                  <span className="font-mono font-semibold">SufraPOS.sed.tpl</span>،{' '}
                  <span className="font-mono font-semibold">README-AR.txt</span>،{' '}
                  <span className="font-mono font-semibold">Start-SufraPOS.bat</span>، و{' '}
                  <span className="font-mono font-semibold">Uninstall.cmd</span>.
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingZip}
                onClick={() => void handleDownloadFullZip()}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600 disabled:opacity-60"
              >
                <FolderArchive className="h-4 w-4" />
                <span>{downloadingZip ? 'جاري ضغط الملفات...' : 'تحميل الحزمة الكاملة (.ZIP)'}</span>
              </button>
            </div>

            {desktopError && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
                {desktopError}
              </div>
            )}

            {desktopFiles.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-2 lg:col-span-5">
                  {desktopFiles.map((f) => (
                    <div
                      key={f.filename}
                      onClick={() => setSelectedDesktopFile(f.filename)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedDesktopFile(f.filename);
                      }}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-right transition-colors ${
                        activeDesktopFile?.filename === f.filename
                          ? 'border-teal-600 bg-teal-50/70'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileCode2 className="h-4 w-4 shrink-0 text-[#0B1D36]" />
                          <span dir="ltr" className="font-mono text-xs font-bold text-[#0B1D36]">
                            {f.filename}
                          </span>
                          <span className="font-mono-num text-[10px] text-slate-500">
                            ({(f.sizeBytes / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">{f.description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadDesktopSingleFile(f);
                        }}
                        className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0B1D36] hover:border-teal-600 hover:text-teal-700"
                      >
                        تنزيل
                      </button>
                    </div>
                  ))}
                </div>

                {activeDesktopFile && (
                  <div className="flex flex-col rounded-xl border border-slate-200 bg-[#071324] lg:col-span-7">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-200">
                      <span dir="ltr" className="font-mono font-bold">
                        {activeDesktopFile.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadDesktopSingleFile(activeDesktopFile)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>تنزيل {activeDesktopFile.filename}</span>
                      </button>
                    </div>

                    {activeDesktopFile.isBinary ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
                        <img src="/pwa-192x192.png" alt="Sufra POS Icon" className="h-24 w-24 rounded-2xl shadow-lg" />
                        <div className="text-xs font-semibold text-teal-200">
                          أيقونة Windows متعددة الدقة (16×16 / 32×32 / 48×48 / 256×256)
                        </div>
                      </div>
                    ) : activeDesktopFile.filename === 'SufraPOS.html' ? (
                      <div className="flex flex-1 flex-col justify-center gap-3 p-6 text-xs text-teal-100">
                        <div className="font-bold text-teal-300">
                          ملف التطبيق المستقل المجمّع بالكامل ({(activeDesktopFile.sizeBytes / 1024).toFixed(1)} KB)
                        </div>
                        <p className="leading-relaxed text-slate-300">
                          يحتوي هذا الملف على واجهة React + Tailwind CSS + Recharts + تصدير Excel + قاعدة بيانات محلية مدمجة، ويعمل مباشرة عند النقر عليه مرتين أو عبر Start-SufraPOS.bat / SufraPOS.exe بدون الحاجة لإنترنت أو تثبيت Node.js.
                        </p>
                      </div>
                    ) : (
                      <pre
                        dir={activeDesktopFile.filename === 'README-AR.txt' ? 'rtl' : 'ltr'}
                        className={`max-h-[420px] overflow-auto p-4 font-mono text-xs leading-relaxed text-teal-100 ${
                          activeDesktopFile.filename === 'README-AR.txt' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {activeDesktopFile.content}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="border-b border-slate-200 pb-3 text-base font-bold text-[#0B1D36]">
              تفضيل شاشة البداية لجهاز الكاشير / سطح المكتب
            </h3>
            <p className="mt-2 text-xs text-slate-500">
              اختر الشاشة التي يفتح عليها هذا الجهاز مباشرة بعد تسجيل الدخول (مفيد لأجهزة نقاط البيع والكاشير المخصصة).
            </p>

            {desktopSavedMsg && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800">
                <CheckCircle2 className="h-4 w-4" />
                <span>{desktopSavedMsg}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  k: 'auto',
                  title: 'تلقائي حسب وضع التشغيل',
                  desc: 'يفتح الكاشير في تطبيق سطح المكتب، ولوحة التحكم في المتصفح',
                },
                {
                  k: 'pos',
                  title: 'شاشة نقطة البيع دائماً (POS)',
                  desc: 'يفتح مباشرة على شاشة البيع وإصدار الفواتير بعد الدخول',
                },
                {
                  k: 'dashboard',
                  title: 'لوحة التحكم والتقارير دائماً',
                  desc: 'مناسب لجهاز الإدارة والمحاسبة',
                },
              ].map((opt) => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => handleSaveDesktopPref(opt.k as 'auto' | 'pos' | 'dashboard')}
                  className={`rounded-xl border p-4 text-right transition-colors ${
                    startupMode === opt.k
                      ? 'border-teal-600 bg-teal-50 text-[#0B1D36]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-extrabold">{opt.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="border-b border-slate-200 pb-3 text-base font-bold text-[#0B1D36]">
              خيار بديل: حزمة Electron (.exe / .dmg)
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {electronFiles.map((ef) => (
                <div key={ef.filename} className="overflow-hidden rounded-xl border border-slate-200 bg-[#071324]">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-200">
                    <span className="font-mono font-bold">{ef.filename}</span>
                    <button
                      type="button"
                      onClick={() => downloadTextFile(ef.filename, ef.content)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>تنزيل</span>
                    </button>
                  </div>
                  <pre dir="ltr" className="max-h-56 overflow-auto p-3.5 text-left font-mono text-[11px] text-teal-100">
                    {ef.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'php' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-[#0B1D36]">
              ملفات المصدر المكافئة لبيئة PHP 8 + MySQL 8 + Bootstrap 5 RTL + FontAwesome
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              يعمل النظام حالياً بشكل كامل ومباشر عبر خادم Node.js وقاعدة SQLite المدمجة داخل المتصفح؛ ويمكنك تنزيل ملفات MySQL Schema و PHP PDO لنشرها على استضافة Apache/cPanel.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-4">
              {bundleFiles.map((f) => (
                <button
                  key={f.filename}
                  onClick={() => setSelectedFile(f.filename)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-right transition-colors ${
                    activeBundleFile?.filename === f.filename
                      ? 'border-teal-700 bg-teal-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-mono-num text-xs font-bold text-[#0B1D36]">{f.filename}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{f.description}</div>
                  </div>
                </button>
              ))}
            </div>

            {activeBundleFile && (
              <div className="flex flex-col rounded-xl border border-slate-200 bg-[#071324] lg:col-span-8">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-300">
                  <span className="font-mono-num font-semibold">{activeBundleFile.filename}</span>
                  <button
                    onClick={() => downloadTextFile(activeBundleFile.filename, activeBundleFile.content)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>تنزيل الملف</span>
                  </button>
                </div>
                <pre
                  dir="ltr"
                  className="max-h-[460px] overflow-auto p-4 text-left font-mono text-xs leading-relaxed text-teal-100"
                >
                  {activeBundleFile.content}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
