// StoreFlow Receipt Printing Engine

export interface PrintReceiptData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeType?: string;
  receiptNumber: string;
  date: string;
  cashierName?: string;
  customerName?: string;
  items: { productName: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  paymentMethod: string;
  footerMessage?: string;
  receiptWidth?: '58mm' | '80mm' | 'standard';
  receiptCurrency?: string;
  // Partial payments specific
  dueDate?: string;
  previousBalance?: number;
  isDebtPayment?: boolean;
}

// ─── ESC/POS Binary Encoder ──────────────────────────────────────────────────
export class EscPosEncoder {
  private buffer: number[] = [];
  private width: '58mm' | '80mm' = '58mm';

  constructor(width: '58mm' | '80mm' = '58mm') {
    this.width = width;
    this.initialize();
  }

  private initialize() {
    this.buffer.push(0x1B, 0x40); // ESC @ (Initialize printer)
  }

  align(alignment: 'left' | 'center' | 'right') {
    const val = alignment === 'left' ? 0 : alignment === 'center' ? 1 : 2;
    this.buffer.push(0x1B, 0x61, val); // ESC a
    return this;
  }

  bold(enable: boolean) {
    this.buffer.push(0x1B, 0x45, enable ? 1 : 0); // ESC E
    return this;
  }

  size(textSize: 'normal' | 'large') {
    const val = textSize === 'normal' ? 0x00 : 0x11; // GS ! (Double height & width)
    this.buffer.push(0x1D, 0x21, val);
    return this;
  }

  text(str: string) {
    // Basic CP437 character mapping (approximate for standard ASCII)
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode === 8358) { // ₦ currency symbol maps to 'N' or a local currency byte
        this.buffer.push(78); // 'N'
      } else if (charCode < 128) {
        this.buffer.push(charCode);
      } else {
        this.buffer.push(63); // '?' for unencodable characters
      }
    }
    return this;
  }

  line(str: string = '') {
    this.text(str);
    this.buffer.push(0x0A); // LF (Line feed)
    return this;
  }

  divider(char: string = '-') {
    const maxChars = this.width === '58mm' ? 32 : 48;
    this.line(char.repeat(maxChars));
    return this;
  }

  twoColumn(left: string, right: string) {
    const maxChars = this.width === '58mm' ? 32 : 48;
    const spaces = Math.max(1, maxChars - left.length - right.length);
    this.line(left + ' '.repeat(spaces) + right);
    return this;
  }

  feed(lines: number = 3) {
    this.buffer.push(0x1B, 0x64, lines); // ESC d (Feed n lines)
    return this;
  }

  cut() {
    this.buffer.push(0x1D, 0x56, 1); // GS V 1 (Select cut mode and cut paper)
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// ─── Format Receipt text to ESC/POS ──────────────────────────────────────────
export function generateEscPosBytes(data: PrintReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): Uint8Array {
  const encoder = new EscPosEncoder(paperWidth);
  const cur = data.receiptCurrency || 'N';

  // Header
  encoder.align('center').bold(true).size('large');
  encoder.line(data.storeName);
  encoder.size('normal').bold(false);
  
  if (data.storeType) encoder.line(data.storeType);
  if (data.storeAddress) encoder.line(data.storeAddress);
  if (data.storePhone) encoder.line(`Tel: ${data.storePhone}`);
  
  encoder.divider('=');

  // Metadata
  encoder.align('left');
  encoder.line(`Date: ${new Date(data.date).toLocaleString()}`);
  encoder.line(`Receipt #: ${data.receiptNumber.toUpperCase()}`);
  if (data.cashierName) encoder.line(`Cashier: ${data.cashierName}`);
  if (data.customerName) encoder.line(`Customer: ${data.customerName}`);
  
  encoder.divider('-');

  // Items Header
  encoder.bold(true);
  encoder.twoColumn('Item', 'Total');
  encoder.bold(false);
  encoder.divider('-');

  // Items
  data.items.forEach(item => {
    encoder.line(item.productName);
    encoder.twoColumn(
      `  ${item.quantity} x ${cur}${item.unitPrice.toLocaleString()}`,
      `${cur}${item.total.toLocaleString()}`
    );
  });

  encoder.divider('-');

  // Financials
  if (data.isDebtPayment) {
    if (data.previousBalance !== undefined) {
      encoder.twoColumn('Previous Balance', `${cur}${data.previousBalance.toLocaleString()}`);
    }
    encoder.twoColumn('Amount Paid', `${cur}${data.paid.toLocaleString()}`);
    encoder.bold(true);
    encoder.twoColumn('Remaining Balance', `${cur}${data.balance.toLocaleString()}`);
    encoder.bold(false);
  } else {
    encoder.twoColumn('Subtotal', `${cur}${data.subtotal.toLocaleString()}`);
    if (data.discount > 0) {
      encoder.twoColumn('Discount', `-${cur}${data.discount.toLocaleString()}`);
    }
    encoder.bold(true);
    encoder.twoColumn('TOTAL', `${cur}${data.total.toLocaleString()}`);
    encoder.bold(false);
    
    encoder.divider('.');
    
    encoder.twoColumn('Amount Paid', `${cur}${data.paid.toLocaleString()}`);
    if (data.balance > 0) {
      encoder.bold(true);
      encoder.twoColumn('Pending Balance', `${cur}${data.balance.toLocaleString()}`);
      encoder.bold(false);
      if (data.dueDate) {
        encoder.line(`Due Date: ${new Date(data.dueDate).toLocaleDateString()}`);
      }
    }
  }

  encoder.divider('-');
  encoder.line(`Payment: ${data.paymentMethod.toUpperCase()}`);
  encoder.divider('=');

  // Footer
  encoder.align('center');
  if (data.footerMessage) {
    encoder.line(data.footerMessage);
  } else {
    encoder.line('Thank you for your patronage! 🙏');
  }
  
  encoder.feed(4);
  encoder.cut();
  return encoder.encode();
}

// ─── Generate plain text version (for sharing / copy) ────────────────────────
export function generatePlainTextReceipt(data: PrintReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): string {
  const maxChars = paperWidth === '58mm' ? 32 : 48;
  const cur = data.receiptCurrency || '₦';
  let out = '';

  const center = (str: string) => {
    const pad = Math.max(0, Math.floor((maxChars - str.length) / 2));
    return ' '.repeat(pad) + str + '\n';
  };
  const twoCol = (l: string, r: string) => {
    const spaces = Math.max(1, maxChars - l.length - r.length);
    return l + ' '.repeat(spaces) + r + '\n';
  };

  out += '='.repeat(maxChars) + '\n';
  out += center(data.storeName.toUpperCase());
  if (data.storeType) out += center(data.storeType);
  if (data.storeAddress) out += center(data.storeAddress);
  if (data.storePhone) out += center(`Tel: ${data.storePhone}`);
  out += '='.repeat(maxChars) + '\n';

  out += `Date: ${new Date(data.date).toLocaleString()}\n`;
  out += `Receipt #: ${data.receiptNumber.toUpperCase()}\n`;
  if (data.cashierName) out += `Cashier: ${data.cashierName}\n`;
  if (data.customerName) out += `Customer: ${data.customerName}\n`;
  out += '-'.repeat(maxChars) + '\n';

  out += twoCol('Item', 'Total');
  out += '-'.repeat(maxChars) + '\n';

  data.items.forEach(item => {
    out += `${item.productName}\n`;
    out += twoCol(
      `  ${item.quantity} x ${cur}${item.unitPrice.toLocaleString()}`,
      `${cur}${item.total.toLocaleString()}`
    );
  });
  out += '-'.repeat(maxChars) + '\n';

  if (data.isDebtPayment) {
    if (data.previousBalance !== undefined) {
      out += twoCol('Previous Balance', `${cur}${data.previousBalance.toLocaleString()}`);
    }
    out += twoCol('Amount Paid', `${cur}${data.paid.toLocaleString()}`);
    out += twoCol('Remaining Balance', `${cur}${data.balance.toLocaleString()}`);
  } else {
    out += twoCol('Subtotal', `${cur}${data.subtotal.toLocaleString()}`);
    if (data.discount > 0) {
      out += twoCol('Discount', `-${cur}${data.discount.toLocaleString()}`);
    }
    out += twoCol('TOTAL', `${cur}${data.total.toLocaleString()}`);
    out += '.'.repeat(maxChars) + '\n';
    out += twoCol('Amount Paid', `${cur}${data.paid.toLocaleString()}`);
    if (data.balance > 0) {
      out += twoCol('Pending Balance', `${cur}${data.balance.toLocaleString()}`);
      if (data.dueDate) {
        out += `Due Date: ${new Date(data.dueDate).toLocaleDateString()}\n`;
      }
    }
  }

  out += '-'.repeat(maxChars) + '\n';
  out += `Payment: ${data.paymentMethod.toUpperCase()}\n`;
  out += '='.repeat(maxChars) + '\n';
  out += center(data.footerMessage || 'Thank you for your patronage! 🙏');

  return out;
}

// ─── BLE Bluetooth Printer Service ──────────────────────────────────────────
export async function printBluetooth(data: PrintReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): Promise<string> {
  if (!navigator.bluetooth) {
    throw new Error('Bluetooth is not supported on this browser/device.');
  }

  // Common thermal printer UUIDs
  const serviceUuid = '000018f0'; // Serial port service profile / thermal generic
  const charUuid = '00002af1';

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [serviceUuid, '00001101-0000-1000-8000-00805f9b34fb']
    });

    const server = await device.gatt?.connect();
    if (!server) throw new Error('Failed to connect to printer GATT server');

    // Attempt service discovery
    let service;
    try {
      service = await server.getPrimaryService(serviceUuid);
    } catch {
      // Fallback service
      service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
    }

    const characteristics = await service.getCharacteristics();
    const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
    if (!writeChar) throw new Error('No write characteristic found on printer');

    const bytes = generateEscPosBytes(data, paperWidth);

    // Chunk bytes (BLE standard limit is usually 20 bytes per write)
    const chunkSize = 20;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await writeChar.writeValue(chunk);
      // Wait briefly to allow the printer buffer to digest
      await new Promise(r => setTimeout(r, 45));
    }

    await server.disconnect();
    return device.name || 'Bluetooth Printer';
  } catch (err: any) {
    throw new Error(`Bluetooth print failed: ${err.message}`);
  }
}

// ─── Web USB Printer Service ──────────────────────────────────────────────────
export async function printUSB(data: PrintReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): Promise<string> {
  if (!navigator.usb) {
    throw new Error('USB is not supported on this browser/device.');
  }

  try {
    const device = await navigator.usb.requestDevice({
      filters: [{ classCode: 7 }] // USB Printer Class
    });

    await device.open();
    await device.selectConfiguration(1);
    
    // Find printer interface
    const iface = device.configuration?.interfaces.find(i => 
      i.alternates.some(alt => alt.interfaceClass === 7)
    );
    if (!iface) throw new Error('No printer interface found on USB device.');

    const alternate = iface.alternates[0];
    const endpointOut = alternate.endpoints.find(e => e.direction === 'out');
    if (!endpointOut) throw new Error('No OUT endpoint found on USB printer.');

    await device.claimInterface(iface.interfaceNumber);

    const bytes = generateEscPosBytes(data, paperWidth);
    await device.transferOut(endpointOut.endpointNumber, bytes);
    
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();

    return device.productName || 'USB Printer';
  } catch (err: any) {
    throw new Error(`USB print failed: ${err.message}`);
  }
}

// ─── System Print Driver (Desktop/WiFi/PDF) ──────────────────────────────────
export function printSystem(data: PrintReceiptData, paperWidth: '58mm' | '80mm' | 'standard' = '58mm'): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const cur = data.receiptCurrency || '₦';
      
      // Build HTML template
      const itemsHtml = data.items.map(item => `
        <div style="margin-bottom: 4px;">
          <div>${item.productName}</div>
          <div style="display: flex; justify-content: space-between; color: #555;">
            <span>${item.quantity} x ${cur}${item.unitPrice.toLocaleString()}</span>
            <span>${cur}${item.total.toLocaleString()}</span>
          </div>
        </div>
      `).join('');

      let financialsHtml = '';
      if (data.isDebtPayment) {
        financialsHtml = `
          <div style="display: flex; justify-content: space-between;"><span>Previous Balance</span><span>${cur}${data.previousBalance?.toLocaleString() || 0}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Amount Paid</span><span>${cur}${data.paid.toLocaleString()}</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px;">
            <span>Remaining Balance</span><span>${cur}${data.balance.toLocaleString()}</span>
          </div>
        `;
      } else {
        financialsHtml = `
          <div style="display: flex; justify-content: space-between;"><span>Subtotal</span><span>${cur}${data.subtotal.toLocaleString()}</span></div>
          ${data.discount > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Discount</span><span>-${cur}${data.discount.toLocaleString()}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px;">
            <span>TOTAL</span><span>${cur}${data.total.toLocaleString()}</span>
          </div>
          <div style="border-top: 1px dotted #000; margin: 4px 0;"></div>
          <div style="display: flex; justify-content: space-between;"><span>Amount Paid</span><span>${cur}${data.paid.toLocaleString()}</span></div>
          ${data.balance > 0 ? `
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: red;">
              <span>Pending Balance</span><span>${cur}${data.balance.toLocaleString()}</span>
            </div>
            ${data.dueDate ? `<div style="font-size: 10px; color: #555;">Due Date: ${new Date(data.dueDate).toLocaleDateString()}</div>` : ''}
          ` : ''}
        `;
      }

      const isThermal = paperWidth !== 'standard';
      const widthVal = paperWidth === '58mm' ? '58mm' : paperWidth === '80mm' ? '80mm' : '100%';

      const html = `
        <html>
          <head>
            <style>
              @media print {
                body {
                  margin: 0;
                  padding: 8px;
                  width: ${widthVal};
                  font-family: monospace;
                  font-size: ${isThermal ? '11px' : '14px'};
                  line-height: 1.3;
                  background: #fff;
                  color: #000;
                }
                @page {
                  margin: 0;
                  size: auto;
                }
              }
              body {
                font-family: monospace;
                padding: 16px;
                max-width: ${isThermal ? '400px' : 'none'};
                margin: 0 auto;
              }
            </style>
          </head>
          <body>
            <div style="text-align: center; margin-bottom: 8px;">
              <h2 style="margin: 0; font-size: ${isThermal ? '16px' : '22px'}; font-weight: bold;">${data.storeName}</h2>
              ${data.storeType ? `<div style="font-size: ${isThermal ? '10px' : '13px'};">${data.storeType}</div>` : ''}
              ${data.storeAddress ? `<div style="font-size: ${isThermal ? '10px' : '13px'};">${data.storeAddress}</div>` : ''}
              ${data.storePhone ? `<div style="font-size: ${isThermal ? '10px' : '13px'};">Tel: ${data.storePhone}</div>` : ''}
            </div>
            
            <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
            
            <div style="font-size: ${isThermal ? '10px' : '12px'}; color: #444;">
              <div>Date: ${new Date(data.date).toLocaleString()}</div>
              <div>Receipt #: ${data.receiptNumber.toUpperCase()}</div>
              ${data.cashierName ? `<div>Cashier: ${data.cashierName}</div>` : ''}
              ${data.customerName ? `<div>Customer: ${data.customerName}</div>` : ''}
            </div>
            
            <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
            
            <div style="font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Item</span><span>Total</span>
            </div>
            <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
            
            <div>${itemsHtml}</div>
            
            <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
            
            <div style="line-height: 1.4;">${financialsHtml}</div>
            
            <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
            <div>Payment Method: ${data.paymentMethod.toUpperCase()}</div>
            <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
            
            <div style="text-align: center; margin-top: 8px; font-style: italic;">
              ${data.footerMessage || 'Thank you for your patronage! 🙏'}
            </div>
          </body>
        </html>
      `;

      // Create an iframe to print silently without navigating away
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) throw new Error('Could not open iframe document');

      doc.write(html);
      doc.close();

      iframe.contentWindow?.focus();
      
      // Delay printing to let styles apply
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
          // Give user time to print/cancel, then clean up
          setTimeout(() => {
            document.body.removeChild(iframe);
            resolve('System Printer / PDF');
          }, 1000);
        } catch (err: any) {
          document.body.removeChild(iframe);
          reject(err);
        }
      }, 500);
    } catch (err: any) {
      reject(err);
    }
  });
}
