import React, { useEffect, useState } from 'react';
import {
  MonitorDown,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  X,
  Copy,
  Download,
  Monitor,
  ExternalLink,
  FolderArchive,
} from 'lucide-react';
import { getStoredToken } from '../lib/api.ts';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';
import {
  getElectronWrapperFiles,
  getOfflineOrderQueue,
  syncOfflineOrderQueue,
} from '../lib/offlinePosQueue.ts';

interface DesktopInstallButtonProps {
  onSynced?: (count: number) => void;
}

export async function downloadWindowsDesktopZip(): Promise<void> {
  const token = getStoredToken();
  const res = await fetch('/api/desktop-windows-package.zip', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('تعذر تحميل حزمة سطح المكتب');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SufraPOS-Windows-Desktop.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export const DesktopInstallButton: React.FC<DesktopInstallButtonProps> = () => {
  const { canInstallNative, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState('');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const electronFiles = getElectronWrapperFiles(currentOrigin);

  async function handleClick() {
    if (canInstallNative) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') return;
    }
    setModalOpen(true);
  }

  async function handleDownloadZip() {
    setZipError('');
    setDownloadingZip(true);
    try {
      await downloadWindowsDesktopZip();
    } catch (err) {
      setZipError((err as Error).message);
    } finally {
      setDownloadingZip(false);
    }
  }

  function copyAppUrl() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${currentOrigin}/?mode=pos`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isInstalled) {
    return (
      <div className="hidden items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 sm:inline-flex">
        <Monitor className="h-3.5 w-3.5 text-teal-600" />
        <span>تطبيق سطح المكتب مفعّل</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-600/30 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800 transition-colors hover:border-teal-600 hover:bg-teal-600 hover:text-white"
      >
        <MonitorDown className="h-3.5 w-3.5 shrink-0" />
        <span>تثبيت / تنزيل تطبيق سطح المكتب</span>
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071324]/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B1D36] px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <MonitorDown className="h-5 w-5 text-teal-400" />
                <div>
                  <h3 className="text-sm font-extrabold">تنزيل وتثبيت سُفرة POS كتطبيق سطح مكتب</h3>
                  <p className="text-[11px] text-teal-200/80">
                    حزمة Windows كاملة (Install.cmd + Launcher.cs + Build.bat + icon.ico + SufraPOS.html) أو التثبيت الفوري
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5 text-xs text-[#0B1D36]">
              {/* Primary Option: Full Windows Desktop Package ZIP */}
              <div className="rounded-xl border border-orange-200 bg-gradient-to-l from-orange-50/70 to-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#0B1D36]">
                      حزمة تطبيق سطح مكتب Windows الكاملة (ZIP)
                    </div>
                    <p className="mt-1 text-slate-600">
                      تحتوي على جميع ملفات التشغيل والتثبيت وبناء ملف الـ EXE:
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingZip}
                    onClick={() => void handleDownloadZip()}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-600/20 hover:from-orange-700 hover:to-orange-600 disabled:opacity-60"
                  >
                    <FolderArchive className="h-4 w-4" />
                    <span>{downloadingZip ? 'جاري التجهيز...' : 'تحميل الحزمة الكاملة (.ZIP)'}</span>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[11px] text-[#0B1D36] sm:grid-cols-3" dir="ltr">
                  {[
                    'Build.bat',
                    'icon.ico',
                    'Install.cmd',
                    'Launcher.cs',
                    'SufraPOS.html',
                    'SufraPOS.sed.tpl',
                    'README-AR.txt',
                    'Start-SufraPOS.bat',
                    'Uninstall.cmd',
                  ].map((f) => (
                    <div key={f} className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                      {f}
                    </div>
                  ))}
                </div>
                {zipError && <div className="mt-2 text-xs font-semibold text-rose-700">{zipError}</div>}
              </div>

              {/* Option 2: Direct Desktop PWA Install */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
                <div className="font-extrabold text-teal-900">
                  التثبيت المباشر من متصفح Chrome أو Edge (بدون تنزيل ملفات)
                </div>
                {isIOS ? (
                  <ol className="mt-2 list-inside list-decimal space-y-1.5 text-slate-700">
                    <li>افتح رابط التطبيق في متصفح Safari.</li>
                    <li>اضغط على زر المشاركة (Share) أسفل أو أعلى الشاشة.</li>
                    <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
                  </ol>
                ) : (
                  <ol className="mt-2 list-inside list-decimal space-y-1.5 text-slate-700">
                    <li>افتح رابط التطبيق في تبويب متصفح مستقل.</li>
                    <li>
                      اضغط على أيقونة التثبيت في شريط العنوان:{' '}
                      <span className="font-bold text-[#0B1D36]">تثبيت سُفرة POS (Install)</span>.
                    </li>
                  </ol>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyAppUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copied ? 'تم نسخ رابط الكاشير' : 'نسخ رابط التطبيق المباشر'}</span>
                  </button>
                  <a
                    href={`${currentOrigin}/?mode=pos`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>فتح في نافذة متصفح مستقلة</span>
                  </a>
                </div>
              </div>

              {/* Option 3: Electron Executable Wrapper */}
              <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4">
                <div className="font-extrabold text-[#0B1D36]">
                  حزمة Electron (.exe / .dmg) الاختيارية
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {electronFiles.map((ef) => (
                    <button
                      key={ef.filename}
                      type="button"
                      onClick={() => downloadTextFile(ef.filename, ef.content)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0B1D36] hover:border-[#0B1D36]"
                    >
                      <Download className="h-3.5 w-3.5 text-orange-600" />
                      <span>تنزيل {ef.filename}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg bg-[#0B1D36] px-4 py-2 text-xs font-bold text-white hover:bg-[#132A4A]"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC<DesktopInstallButtonProps> = ({ onSynced }) => {
  const isOnline = useOnlineStatus();
  const [queueCount, setQueueCount] = useState<number>(() => getOfflineOrderQueue().length);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    const refreshCount = () => setQueueCount(getOfflineOrderQueue().length);
    window.addEventListener('sufra-offline-queue-changed', refreshCount);
    return () => window.removeEventListener('sufra-offline-queue-changed', refreshCount);
  }, []);

  async function runSync() {
    if (!navigator.onLine || getOfflineOrderQueue().length === 0) return;
    setSyncing(true);
    try {
      const res = await syncOfflineOrderQueue();
      setQueueCount(res.remaining);
      if (res.synced.length > 0) {
        setSyncMsg(`تمت مزامنة ${res.synced.length} فواتير بنجاح`);
        onSynced?.(res.synced.length);
        setTimeout(() => setSyncMsg(''), 4000);
      }
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (isOnline && queueCount > 0) {
      void runSync();
    }
  }, [isOnline]);

  if (isOnline && queueCount === 0 && !syncMsg) return null;

  return (
    <div
      className={`no-print flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2 text-xs font-semibold ${
        !isOnline
          ? 'border-orange-200 bg-orange-50 text-orange-900'
          : syncMsg
          ? 'border-teal-200 bg-teal-50 text-teal-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0 text-orange-600" />
            <span>
              وضع العمل دون إنترنت — يستمر نظام الكاشير في حفظ الفواتير محلياً وتتم مزامنتها فور عودة الاتصال.
            </span>
          </>
        ) : syncMsg ? (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
            <span>{syncMsg}</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 shrink-0 text-amber-600" />
            <span>توجد {queueCount} فواتير محفوظة محلياً بانتظار المزامنة مع السيرفر.</span>
          </>
        )}
      </div>

      {isOnline && queueCount > 0 && (
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runSync()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1D36] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#132A4A] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</span>
        </button>
      )}
    </div>
  );
};
