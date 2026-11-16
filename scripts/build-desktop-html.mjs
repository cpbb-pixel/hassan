import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';

const rootDir = process.cwd();
const distAssetsDir = path.resolve(rootDir, 'dist', 'assets');
const outDir = path.resolve(rootDir, 'server', 'desktop-dist');
fs.mkdirSync(outDir, { recursive: true });

let cssContent = '';
if (fs.existsSync(distAssetsDir)) {
  const cssFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.css'));
  for (const file of cssFiles) {
    cssContent += fs.readFileSync(path.join(distAssetsDir, file), 'utf8') + '\n';
  }
}

const bundleResult = await esbuild.build({
  entryPoints: [path.resolve(rootDir, 'src', 'standaloneEntry.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'edge100'],
  minify: true,
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

const rawJs = bundleResult.outputFiles[0].text;
// Prevent accidental closing </script> inside bundled strings from breaking HTML parsing
const safeJs = rawJs.replace(/<\/script/gi, '<\\/script');
const safeCss = cssContent.replace(/<\/style/gi, '<\\/style');

const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>سُفرة POS — تطبيق سطح المكتب ونظام البيع</title>
    <style>
${safeCss}
    </style>
  </head>
  <body class="bg-[#F5F7FA] text-[#0B1D36] antialiased selection:bg-teal-600 selection:text-white">
    <div id="root"></div>
    <script>
${safeJs}
    </script>
  </body>
</html>
`;

const outPath = path.join(outDir, 'SufraPOS.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Built standalone desktop HTML: ${outPath} (${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB)`);
