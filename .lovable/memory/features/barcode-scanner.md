---
name: Barcode Scanner
description: Web barcode scanner using html5-qrcode, single button toggles save/sell based on whether barcode exists
type: feature
---

- Library: `html5-qrcode` (works offline once PWA installed)
- Component: `src/components/BarcodeScanner.tsx` — green border flash + beep + vibrate on detect
- Header 🔳 Scan button in `Index.tsx` opens scanner; existing barcodes auto-add to scan cart, unknown ones open save form
- Per-product 📷 button in Inventory assigns barcode to that product; product card gets green ring + "Scanned" badge once linked
- Barcode stored on `Product.barcode` field; uniqueness enforced (warn if already linked)
