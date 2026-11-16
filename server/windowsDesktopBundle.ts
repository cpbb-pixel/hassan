import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface DesktopBundleFile {
  filename: string;
  description: string;
  isBinary?: boolean;
  sizeBytes: number;
  content: Buffer;
}

// --- Pure Node PNG & Windows ICO Icon Generator ---
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, makePngChunk('IHDR', ihdr), makePngChunk('IDAT', idat), makePngChunk('IEND', Buffer.alloc(0))]);
}

function blendRgba(rgba: Buffer, idx: number, r: number, g: number, b: number, a: number): void {
  const alpha = Math.max(0, Math.min(1, a));
  const inv = 1 - alpha;
  rgba[idx] = Math.round(rgba[idx] * inv + r * alpha);
  rgba[idx + 1] = Math.round(rgba[idx + 1] * inv + g * alpha);
  rgba[idx + 2] = Math.round(rgba[idx + 2] * inv + b * alpha);
  rgba[idx + 3] = 255;
}

function sdRoundBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number, rad: number): number {
  const dx = Math.abs(px - cx) - hw + rad;
  const dy = Math.abs(py - cy) - hh + rad;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rad;
}

function renderSufraIconRgba(size: number): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 0.92;
  const toNorm = (v: number) => (v / size - 0.5) / scale;
  const aa = 2.0 / (size * scale);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = toNorm(x + 0.5);
      const ny = toNorm(y + 0.5);

      // Rounded icon silhouette with transparent corners
      const outerD = sdRoundBox(nx, ny, 0, 0, 0.5, 0.5, 0.14);
      if (outerD > aa) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      const t = (x + y) / (2 * size);
      rgba[idx] = Math.round(7 + t * 12);
      rgba[idx + 1] = Math.round(19 + t * 23);
      rgba[idx + 2] = Math.round(36 + t * 38);
      rgba[idx + 3] = outerD < -aa ? 255 : Math.round(Math.max(0, Math.min(1, (aa - outerD) / (2 * aa))) * 255);

      const frameD = Math.abs(sdRoundBox(nx, ny, 0, 0, 0.44, 0.44, 0.12)) - 0.014;
      if (frameD < aa) blendRgba(rgba, idx, 20, 184, 166, ((aa - frameD) / (2 * aa)) * 0.55);

      const domeDist = Math.hypot(nx, ny - 0.08) - 0.25;
      if (ny <= 0.095) {
        const ringD = Math.abs(domeDist) - 0.026;
        if (ringD < aa) blendRgba(rgba, idx, 20, 184, 166, Math.min(1, (aa - ringD) / (2 * aa)));
      }

      const knobD = Math.hypot(nx, ny + 0.225) - 0.044;
      if (knobD < aa) blendRgba(rgba, idx, 249, 115, 22, Math.min(1, (aa - knobD) / (2 * aa)));

      const trayD = sdRoundBox(nx, ny, 0, 0.115, 0.3, 0.032, 0.025);
      if (trayD < aa) blendRgba(rgba, idx, 45, 212, 191, Math.min(1, (aa - trayD) / (2 * aa)));

      const posD = sdRoundBox(nx, ny, 0, 0.235, 0.23, 0.05, 0.024);
      if (posD < aa) blendRgba(rgba, idx, 234, 88, 12, Math.min(1, (aa - posD) / (2 * aa)));

      const slotD = sdRoundBox(nx, ny, -0.055, 0.235, 0.095, 0.013, 0.008);
      if (slotD < aa) blendRgba(rgba, idx, 7, 19, 36, Math.min(1, (aa - slotD) / (2 * aa)));

      const dotD = Math.hypot(nx - 0.145, ny - 0.235) - 0.019;
      if (dotD < aa) blendRgba(rgba, idx, 255, 255, 255, Math.min(1, (aa - dotD) / (2 * aa)));
    }
  }
  return rgba;
}

function encodeBmpDibForIco(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (color + AND mask)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount (BGRA)
  header.writeUInt32LE(0, 16); // BI_RGB
  const pixelBytes = size * size * 4;
  const maskRowStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowStride * size;
  header.writeUInt32LE(pixelBytes + maskBytes, 20);

  const pixels = Buffer.alloc(pixelBytes);
  const mask = Buffer.alloc(maskBytes);

  // ICO DIB rows are bottom-up
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const sIdx = (srcY * size + x) * 4;
      const dIdx = (y * size + x) * 4;
      pixels[dIdx] = rgba[sIdx + 2]; // B
      pixels[dIdx + 1] = rgba[sIdx + 1]; // G
      pixels[dIdx + 2] = rgba[sIdx]; // R
      pixels[dIdx + 3] = rgba[sIdx + 3]; // A
      if (rgba[sIdx + 3] < 128) {
        const byteIdx = y * maskRowStride + (x >> 3);
        mask[byteIdx] |= 1 << (7 - (x & 7));
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

let cachedIco: Buffer | null = null;
export function buildWindowsIco(): Buffer {
  if (cachedIco) return cachedIco;

  const sizes = [16, 32, 48, 256];
  const entries = sizes.map((sz) => {
    const rgba = renderSufraIconRgba(sz);
    const data = sz === 256 ? encodePng(sz, sz, rgba) : encodeBmpDibForIco(sz, rgba);
    return { sz, data };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(entries.length * 16);
  let offset = 6 + dir.length;

  entries.forEach((e, idx) => {
    const base = idx * 16;
    dir[base] = e.sz >= 256 ? 0 : e.sz;
    dir[base + 1] = e.sz >= 256 ? 0 : e.sz;
    dir[base + 2] = 0;
    dir[base + 3] = 0;
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(e.data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += e.data.length;
  });

  cachedIco = Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
  return cachedIco;
}

function crlf(text: string): Buffer {
  return Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf8');
}

function getStandaloneHtmlBuffer(): Buffer {
  const builtPath = path.resolve(process.cwd(), 'server', 'desktop-dist', 'SufraPOS.html');
  if (fs.existsSync(builtPath)) {
    return fs.readFileSync(builtPath);
  }
  return Buffer.from(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>سُفرة POS</title></head><body style="font-family:sans-serif;padding:40px;background:#0B1D36;color:#fff"><h2>يرجى تشغيل npm run build لبناء نسخة سطح المكتب الكاملة</h2></body></html>`,
    'utf8'
  );
}

export function getWindowsDesktopBundle(serverOrigin = ''): DesktopBundleFile[] {
  const icoBuf = buildWindowsIco();
  const htmlBuf = getStandaloneHtmlBuffer();

  const launcherCs = `using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace SufraPOSLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string htmlPath = Path.Combine(baseDir, "SufraPOS.html");
            string serverUrlFile = Path.Combine(baseDir, "server.url");
            string targetUrl = "";

            if (File.Exists(serverUrlFile))
            {
                string customUrl = File.ReadAllText(serverUrlFile).Trim();
                if (!string.IsNullOrEmpty(customUrl))
                {
                    targetUrl = customUrl;
                }
            }

            if (string.IsNullOrEmpty(targetUrl))
            {
                if (!File.Exists(htmlPath))
                {
                    string localHtml = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "SufraPOS",
                        "SufraPOS.html"
                    );
                    if (File.Exists(localHtml))
                    {
                        htmlPath = localHtml;
                    }
                    else
                    {
                        MessageBox.Show(
                            "لم يتم العثور على ملف SufraPOS.html في مجلد التطبيق.",
                            "سُفرة POS",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                        return;
                    }
                }
                targetUrl = new Uri(htmlPath).AbsoluteUri + "?mode=pos";
            }

            string profileDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SufraPOS",
                "BrowserProfile"
            );
            Directory.CreateDirectory(profileDir);

            string browserExe = FindChromiumBrowser();
            if (!string.IsNullOrEmpty(browserExe))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = browserExe;
                psi.Arguments = string.Format(
                    "--app=\\"{0}\\" --user-data-dir=\\"{1}\\" --window-size=1366,840 --no-first-run --no-default-browser-check",
                    targetUrl,
                    profileDir
                );
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
            }
        }

        static string FindChromiumBrowser()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pfx86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new string[]
            {
                Path.Combine(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string path in candidates)
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }
    }
}
`;

  const startBat = `@echo off
chcp 65001 >nul
setlocal
set "APP_DIR=%~dp0"
set "PROFILE_DIR=%LocalAppData%\\SufraPOS\\BrowserProfile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

if exist "%APP_DIR%SufraPOS.exe" (
    start "" "%APP_DIR%SufraPOS.exe"
    exit /b 0
)

set "TARGET_URL=file:///%APP_DIR:\=/%SufraPOS.html?mode=pos"
if exist "%APP_DIR%server.url" (
    set /p CUSTOM_URL=<"%APP_DIR%server.url"
    if not "%CUSTOM_URL%"=="" set "TARGET_URL=%CUSTOM_URL%"
)

set "BROWSER="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if not "%BROWSER%"=="" (
    start "" "%BROWSER%" --app="%TARGET_URL%" --user-data-dir="%PROFILE_DIR%" --window-size=1366,840 --no-first-run
) else (
    start "" "%APP_DIR%SufraPOS.html"
)
exit /b 0
`;

  const installCmd = `@echo off
chcp 65001 >nul
setlocal
set "SRC=%~dp0"
set "DEST=%LocalAppData%\\SufraPOS"

echo ============================================
echo   Installing Sufra POS Desktop System...
echo ============================================

if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%SufraPOS.html" "%DEST%\\SufraPOS.html" >nul
copy /Y "%SRC%icon.ico" "%DEST%\\icon.ico" >nul
copy /Y "%SRC%Start-SufraPOS.bat" "%DEST%\\Start-SufraPOS.bat" >nul
copy /Y "%SRC%Uninstall.cmd" "%DEST%\\Uninstall.cmd" >nul
copy /Y "%SRC%README-AR.txt" "%DEST%\\README-AR.txt" >nul
if exist "%SRC%server.url" copy /Y "%SRC%server.url" "%DEST%\\server.url" >nul

if exist "%SRC%SufraPOS.exe" (
    copy /Y "%SRC%SufraPOS.exe" "%DEST%\\SufraPOS.exe" >nul
) else (
    set "CSC="
    if exist "%WinDir%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe" set "CSC=%WinDir%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
    if "%CSC%"=="" if exist "%WinDir%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe" set "CSC=%WinDir%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
    if not "%CSC%"=="" if exist "%SRC%Launcher.cs" (
        "%CSC%" /nologo /target:winexe /optimize+ /win32icon:"%DEST%\\icon.ico" /r:System.Windows.Forms.dll /out:"%DEST%\\SufraPOS.exe" "%SRC%Launcher.cs" >nul 2>&1
    )
)

set "LAUNCH_TARGET=%DEST%\\Start-SufraPOS.bat"
set "WIN_STYLE=7"
if exist "%DEST%\\SufraPOS.exe" (
    set "LAUNCH_TARGET=%DEST%\\SufraPOS.exe"
    set "WIN_STYLE=1"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desk = [Environment]::GetFolderPath('Desktop'); " ^
  "$s1 = $ws.CreateShortcut((Join-Path $desk 'Sufra POS.lnk')); " ^
  "$s1.TargetPath = '%LAUNCH_TARGET%'; " ^
  "$s1.WorkingDirectory = '%DEST%'; " ^
  "$s1.IconLocation = '%DEST%\\icon.ico,0'; " ^
  "$s1.WindowStyle = %WIN_STYLE%; " ^
  "$s1.Description = 'Sufra POS Desktop Sales System'; " ^
  "$s1.Save(); " ^
  "$startMenu = [Environment]::GetFolderPath('Programs'); " ^
  "$s2 = $ws.CreateShortcut((Join-Path $startMenu 'Sufra POS.lnk')); " ^
  "$s2.TargetPath = '%LAUNCH_TARGET%'; " ^
  "$s2.WorkingDirectory = '%DEST%'; " ^
  "$s2.IconLocation = '%DEST%\\icon.ico,0'; " ^
  "$s2.WindowStyle = %WIN_STYLE%; " ^
  "$s2.Save();"

reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SufraPOS" /v "DisplayName" /t REG_SZ /d "Sufra POS Desktop" /f >nul
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SufraPOS" /v "DisplayIcon" /t REG_SZ /d "%DEST%\\icon.ico" /f >nul
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SufraPOS" /v "UninstallString" /t REG_SZ /d "\"%DEST%\\Uninstall.cmd\"" /f >nul
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SufraPOS" /v "Publisher" /t REG_SZ /d "Sufra ERP" /f >nul

echo Installation complete! Launching Sufra POS...
start "" "%LAUNCH_TARGET%"
timeout /t 2 >nul
exit /b 0
`;

  const uninstallCmd = `@echo off
chcp 65001 >nul
setlocal
set "DEST=%LocalAppData%\\SufraPOS"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk = [Environment]::GetFolderPath('Desktop'); " ^
  "$sm = [Environment]::GetFolderPath('Programs'); " ^
  "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $desk 'Sufra POS.lnk'); " ^
  "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $sm 'Sufra POS.lnk');"

reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SufraPOS" /f >nul 2>&1

if exist "%DEST%" (
    start "" /B cmd /c "ping 127.0.0.1 -n 3 >nul & rmdir /S /Q \"%DEST%\""
)
echo Sufra POS has been uninstalled cleanly.
exit /b 0
`;

  const sedTpl = `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=__WORKDIR__\\SufraPOS-Setup.exe
FriendlyName=Sufra POS Desktop Installer
AppLaunched=cmd /c Install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0="Install.cmd"
FILE1="Uninstall.cmd"
FILE2="Start-SufraPOS.bat"
FILE3="SufraPOS.html"
FILE4="SufraPOS.exe"
FILE5="icon.ico"
FILE6="README-AR.txt"
[SourceFiles]
SourceFiles0=__WORKDIR__
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
%FILE4%=
%FILE5%=
%FILE6%=
`;

  const buildBat = `@echo off
chcp 65001 >nul
setlocal
set "WORK=%~dp0"
if "%WORK:~-1%"=="\\" set "WORK=%WORK:~0,-1%"

echo [1/3] Locating .NET C# Compiler...
set "CSC="
if exist "%WinDir%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe" set "CSC=%WinDir%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
if "%CSC%"=="" if exist "%WinDir%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe" set "CSC=%WinDir%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
if "%CSC%"=="" (
    echo ERROR: .NET Framework v4.0 csc.exe not found.
    pause
    exit /b 1
)

echo [2/3] Compiling SufraPOS.exe Launcher...
"%CSC%" /nologo /target:winexe /optimize+ /win32icon:"%WORK%\\icon.ico" /r:System.Windows.Forms.dll /out:"%WORK%\\SufraPOS.exe" "%WORK%\\Launcher.cs"
if errorlevel 1 (
    echo Build failed while compiling Launcher.cs
    pause
    exit /b 1
)

echo [3/3] Building SufraPOS-Setup.exe via IExpress...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(Get-Content '%WORK%\\SufraPOS.sed.tpl' -Raw).Replace('__WORKDIR__', '%WORK%') | Set-Content '%WORK%\\SufraPOS.sed' -Encoding ASCII"

if exist "%SystemRoot%\\System32\\iexpress.exe" (
    "%SystemRoot%\\System32\\iexpress.exe" /N "%WORK%\\SufraPOS.sed"
    echo Done! Created SufraPOS.exe and SufraPOS-Setup.exe
) else (
    echo iexpress.exe not found, SufraPOS.exe is ready.
)
pause
exit /b 0
`;

  const readmeAr = `========================================================================
  سُفرة POS — حزمة تثبيت سطح المكتب لنظام Windows
========================================================================

محتويات المجلد:
  1) Install.cmd       : التثبيت السريع على سطح المكتب وقائمة ابدأ وتشغيل النظام فوراً.
  2) Start-SufraPOS.bat: تشغيل نظام البيع مباشرة بدون تثبيت في نافذة تطبيق مستقلة.
  3) SufraPOS.html     : التطبيق الكامل (نقطة البيع + المنيو + المخزون + المحاسبة + Excel/PDF).
  4) Launcher.cs       : كود C# لبناء ملف التشغيل التنفيذي SufraPOS.exe بأيقونة النظام.
  5) Build.bat         : أداة تجميع SufraPOS.exe وحزمة التثبيت SufraPOS-Setup.exe.
  6) SufraPOS.sed.tpl  : قالب حزمة IExpress لإنشاء ملف Setup تنفيذي.
  7) icon.ico          : أيقونة تطبيق سُفرة POS بدقة متعددة لنظام Windows.
  8) Uninstall.cmd     : إزالة التطبيق واختصاراته من الجهاز.

------------------------------------------------------------------------
طريقة التثبيت والتشغيل:
------------------------------------------------------------------------
- الطريقة الأسرع:
  اضغط مرتين على الملف (Install.cmd) وسيتم تثبيت التطبيق وإنشاء اختصار
  "Sufra POS" على سطح المكتب وفتح شاشة البيع تلقائياً.

- التشغيل المباشر بدون تثبيت:
  اضغط مرتين على (Start-SufraPOS.bat) لفتح التطبيق في نافذة مستقلة.

- ملاحظة حول قاعدة البيانات:
  تعمل هذه النسخة محلياً بالكامل بدون إنترنت وتحفظ الفواتير والأصناف تلقائياً.
  ولربط التطبيق بخادم سحابي أو شبكة محلية${serverOrigin ? ` (مثل ${serverOrigin}/?mode=pos)` : ''}:
  أنشئ ملفاً باسم (server.url) في نفس المجلد واكتب داخله رابط السيرفر.

بيانات الدخول الافتراضية لنسخة سطح المكتب:
  المدير العام : admin    / كلمة المرور: admin123
  الكاشير      : cashier  / كلمة المرور: 123456
========================================================================
`;

  const entries: Array<{ filename: string; description: string; isBinary?: boolean; content: Buffer }> = [
    { filename: 'Build.bat', description: 'تجميع SufraPOS.exe وحزمة التثبيت SufraPOS-Setup.exe', content: crlf(buildBat) },
    { filename: 'icon.ico', description: 'أيقونة Windows متعددة الدقة لتطبيق سُفرة POS', isBinary: true, content: icoBuf },
    { filename: 'Install.cmd', description: 'مثبّت سطح المكتب وإنشاء اختصار Desktop وقائمة ابدأ', content: crlf(installCmd) },
    { filename: 'Launcher.cs', description: 'كود C# لتشغيل نافذة الكاشير المستقلة (WinForms / Edge App)', content: crlf(launcherCs) },
    { filename: 'SufraPOS.html', description: 'التطبيق الكامل لسطح المكتب (يعمل محلياً بدون إنترنت)', content: htmlBuf },
    { filename: 'SufraPOS.sed.tpl', description: 'قالب حزمة IExpress لإنتاج SufraPOS-Setup.exe', content: crlf(sedTpl) },
    { filename: 'README-AR.txt', description: 'دليل الاستخدام والتثبيت باللغة العربية', content: crlf(readmeAr) },
    { filename: 'Start-SufraPOS.bat', description: 'تشغيل مباشر للنظام في نافذة تطبيق مستقلة', content: crlf(startBat) },
    { filename: 'Uninstall.cmd', description: 'إلغاء تثبيت التطبيق وإزالة الاختصارات', content: crlf(uninstallCmd) },
  ];

  return entries.map((e) => ({
    ...e,
    sizeBytes: e.content.length,
  }));
}

// --- Pure Node ZIP Archive Builder (UTF-8 Filenames + Deflate Compression) ---
export function buildZipArchive(files: Array<{ filename: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBuf = Buffer.from(file.filename, 'utf8');
    const uncompressed = file.content;
    const compressed = zlib.deflateRawSync(uncompressed, { level: 6 });
    const crc = crc32(uncompressed);

    // Local file header (30 bytes + name)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0x0800, 6); // UTF-8 flag
    lfh.writeUInt16LE(8, 8); // Deflate
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(uncompressed.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localParts.push(lfh, nameBuf, compressed);

    // Central directory header (46 bytes + name)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8); // UTF-8 flag
    cdh.writeUInt16LE(8, 10); // Deflate
    cdh.writeUInt16LE(dosTime, 12);
    cdh.writeUInt16LE(dosDate, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(uncompressed.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    centralParts.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
