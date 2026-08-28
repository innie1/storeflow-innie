import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/qr/QRHub.tsx');
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("QRAnalyticsPanel")) {
  const importAnchor = "import QRScannerPage from './QRScannerPage';";
  if (!text.includes(importAnchor)) throw new Error('QRHub import anchor not found');
  text = text.replace(importAnchor, `${importAnchor}\nimport QRAnalyticsPanel from './QRAnalyticsPanel';`);
}

const old = `<div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">\n          <Database className="w-10 h-10 mx-auto text-muted-foreground" /><h2 className="font-display font-bold">QR Analytics</h2><p className="text-xs text-muted-foreground">Detailed scan analytics are not exposed until real telemetry is available.</p>\n        </div>`;
const replacement = `<QRAnalyticsPanel store={store} />`;
if (text.includes(old)) text = text.replace(old, replacement);
else if (!text.includes('<QRAnalyticsPanel store={store} />')) throw new Error('QRHub analytics placeholder not found');

fs.writeFileSync(file, text);
