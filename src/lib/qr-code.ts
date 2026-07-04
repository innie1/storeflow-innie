import QRCode from 'qrcode';

export interface QRData {
  version: number;
  uuid: string;
  token: string;
  storeId: string;
  timestamp: number;
  type: string; // 'store' | 'product' | 'shelf' | 'customer' | 'staff' | 'payment' | 'receipt' | 'inventory' | 'promotion'
  payload: any;
}

// Obfuscates and encodes the QR JSON payload
export function encodeQRData(data: Omit<QRData, 'token' | 'uuid'>): string {
  const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  // Generate secure token by hashing some values together
  const rawToken = `${data.storeId}-${uuid}-${data.timestamp}-${data.type}`;
  let hash = 0;
  for (let i = 0; i < rawToken.length; i++) {
    hash = (hash << 5) - hash + rawToken.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const token = Math.abs(hash).toString(16);

  const fullData: QRData = {
    ...data,
    uuid,
    token
  };

  const jsonStr = JSON.stringify(fullData);
  let obfuscated = '';
  const key = 0x5F; // Simple XOR key for obfuscation
  for (let i = 0; i < jsonStr.length; i++) {
    obfuscated += String.fromCharCode(jsonStr.charCodeAt(i) ^ key);
  }
  return btoa(unescape(encodeURIComponent(obfuscated)));
}

// Decodes and validates the QR payload
export function decodeQRData(encoded: string): QRData | null {
  try {
    const obfuscated = decodeURIComponent(escape(atob(encoded)));
    const key = 0x5F;
    let jsonStr = '';
    for (let i = 0; i < obfuscated.length; i++) {
      jsonStr += String.fromCharCode(obfuscated.charCodeAt(i) ^ key);
    }
    return JSON.parse(jsonStr) as QRData;
  } catch (e) {
    return null;
  }
}

// Draws a premium rounded-corner rectangle on canvas
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill = false,
  stroke = true
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Draws the official StoreFlow cube logo on canvas
export function drawStoreFlowCube(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#FFC72C') {
  ctx.save();
  ctx.lineWidth = Math.max(2, size / 16);
  ctx.strokeStyle = color;
  ctx.fillStyle = '#141414';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const half = size / 2;
  const hOffset = size * 0.12;

  // 1. Draw top rhombus face
  ctx.beginPath();
  ctx.moveTo(cx, cy - half); // top
  ctx.lineTo(cx + half, cy - hOffset); // right
  ctx.lineTo(cx, cy + hOffset); // bottom
  ctx.lineTo(cx - half, cy - hOffset); // left
  ctx.closePath();
  ctx.stroke();

  // 2. Draw left bottom face
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - hOffset);
  ctx.lineTo(cx, cy + hOffset);
  ctx.lineTo(cx, cy + half);
  ctx.lineTo(cx - half, cy + half - hOffset);
  ctx.closePath();
  ctx.stroke();

  // 3. Draw right bottom face
  ctx.beginPath();
  ctx.moveTo(cx, cy + hOffset);
  ctx.lineTo(cx + half, cy - hOffset);
  ctx.lineTo(cx + half, cy + half - hOffset);
  ctx.lineTo(cx, cy + half);
  ctx.closePath();
  ctx.stroke();

  // 4. Draw tape lines to make it look like a delivery box
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size / 20);

  // Left tape
  ctx.beginPath();
  ctx.moveTo(cx - half / 2, cy - half / 2 - hOffset / 2);
  ctx.lineTo(cx - half / 2, cy + half / 2 - hOffset / 2);
  ctx.stroke();

  // Right tape
  ctx.beginPath();
  ctx.moveTo(cx + half / 2, cy - half / 2 - hOffset / 2);
  ctx.lineTo(cx + half / 2, cy + half / 2 - hOffset / 2);
  ctx.stroke();

  ctx.restore();
}

// Generates the customized branded QR code onto a canvas
export async function drawQRCode({
  text,
  canvas,
  logoSizePercent = 0.22,
  transparent = false,
  logoType = 'cube'
}: {
  text: string;
  canvas: HTMLCanvasElement;
  logoSizePercent?: number;
  transparent?: boolean;
  logoType?: 'cube' | 'cart';
}): Promise<void> {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // Scale settings
  const canvasSize = 400; // Fixed high-resolution output size
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const margin = 4; // Margin in module count
  const totalModules = size + margin * 2;
  const moduleSize = canvasSize / totalModules;
  const marginPx = margin * moduleSize;

  // Clear background
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  if (!transparent) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
  }

  // Draw QR Modules (Skip Finders & Clear Center)
  ctx.fillStyle = '#000000';

  // Center clearance bounds
  const clearSize = Math.floor(size * 0.28); // Clears center 28% for border safety
  const minClear = Math.floor((size - clearSize) / 2);
  const maxClear = Math.ceil((size + clearSize) / 2);

  const isFinder = (row: number, col: number): boolean => {
    if (row < 7 && col < 7) return true; // Top-left
    if (row < 7 && col >= size - 7) return true; // Top-right
    if (row >= size - 7 && col < 7) return true; // Bottom-left
    return false;
  };

  const isCenter = (row: number, col: number): boolean => {
    return row >= minClear && row < maxClear && col >= minClear && col < maxClear;
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFinder(r, c) || isCenter(r, c)) continue;

      if (qr.modules.get(r, c)) {
        const x = marginPx + c * moduleSize;
        const y = marginPx + r * moduleSize;

        // Draw modern rounded modules (smooth circles)
        ctx.beginPath();
        ctx.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize / 2 * 0.85, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  // Draw 3 Custom Finder Eyes
  const drawFinderEye = (startX: number, startY: number) => {
    // 1. Outer Ring (Black, Rounded Rect, width=1 moduleSize)
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = moduleSize;
    ctx.fillStyle = 'transparent';
    drawRoundedRect(
      ctx,
      startX + moduleSize / 2,
      startY + moduleSize / 2,
      6 * moduleSize,
      6 * moduleSize,
      1.5 * moduleSize,
      false,
      true
    );
    ctx.restore();

    // 2. Middle Ring (StoreFlow Yellow, Rounded Rect, width=1 moduleSize)
    ctx.save();
    ctx.strokeStyle = '#FFC72C';
    ctx.lineWidth = moduleSize;
    drawRoundedRect(
      ctx,
      startX + 1.5 * moduleSize,
      startY + 1.5 * moduleSize,
      4 * moduleSize,
      4 * moduleSize,
      1.0 * moduleSize,
      false,
      true
    );
    ctx.restore();

    // 3. Center Dot (Black, Solid Filled Rounded Rect)
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = 'transparent';
    drawRoundedRect(
      ctx,
      startX + 2.5 * moduleSize,
      startY + 2.5 * moduleSize,
      2 * moduleSize,
      2 * moduleSize,
      0.6 * moduleSize,
      true,
      false
    );
    ctx.restore();
  };

  // Top-left
  drawFinderEye(marginPx, marginPx);
  // Top-right
  drawFinderEye(marginPx + (size - 7) * moduleSize, marginPx);
  // Bottom-left
  drawFinderEye(marginPx, marginPx + (size - 7) * moduleSize);

  // Draw Center Logo Container with Shadow & Glow
  const logoWidth = canvasSize * logoSizePercent;
  const logoX = (canvasSize - logoWidth) / 2;
  const logoY = (canvasSize - logoWidth) / 2;

  if (logoType === 'cart') {
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const r = logoWidth / 2;

    ctx.save();
    ctx.shadowColor = '#FFC72C';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#111111';
    ctx.strokeStyle = '#FFC72C';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw Golden Shopping Cart Icon in center
    ctx.save();
    ctx.strokeStyle = '#FFC72C';
    ctx.fillStyle = '#FFC72C';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const scale = logoWidth / 24;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Draw wheels
    ctx.beginPath();
    ctx.arc(-3, 8, 1.8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, 8, 1.8, 0, 2 * Math.PI);
    ctx.fill();

    // Draw cart body
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.lineTo(-6, -9);
    ctx.lineTo(-3.5, 2);
    ctx.lineTo(6.5, 2);
    ctx.lineTo(9.5, -6);
    ctx.lineTo(-4.5, -6);
    ctx.stroke();

    ctx.restore();
  } else {
    const logoRadius = logoWidth * 0.25;

    ctx.save();
    // Set glow
    ctx.shadowColor = '#FFC72C';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#141414';
    ctx.strokeStyle = '#FFC72C';
    ctx.lineWidth = 2.5;

    drawRoundedRect(ctx, logoX, logoY, logoWidth, logoWidth, logoRadius, true, true);
    ctx.restore();

    // Draw StoreFlow Isometric Cube Inside Container
    const cubeSize = logoWidth * 0.45;
    const cubeY = logoY + logoWidth / 2 - cubeSize * 0.12; // Center offset adjustment
    drawStoreFlowCube(ctx, canvasSize / 2, cubeY, cubeSize, '#FFC72C');

    // Draw optional text "StoreFlow" below cube inside the center badge
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${logoWidth * 0.11}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('StoreFlow', canvasSize / 2, logoY + logoWidth * 0.84);
  }
}

// Exports the QR Code as a SVG string
export function exportToSVG(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const margin = 4;
  const total = size + margin * 2;
  const viewSize = 400;
  const moduleSize = viewSize / total;
  const marginPx = margin * moduleSize;

  const clearSize = Math.floor(size * 0.28);
  const minClear = Math.floor((size - clearSize) / 2);
  const maxClear = Math.ceil((size + clearSize) / 2);

  const isFinder = (row: number, col: number) => {
    if (row < 7 && col < 7) return true;
    if (row < 7 && col >= size - 7) return true;
    if (row >= size - 7 && col < 7) return true;
    return false;
  };

  const isCenter = (row: number, col: number) => {
    return row >= minClear && row < maxClear && col >= minClear && col < maxClear;
  };

  let paths = '';
  // Draw modules
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFinder(r, c) || isCenter(r, c)) continue;
      if (qr.modules.get(r, c)) {
        const x = marginPx + c * moduleSize + moduleSize / 2;
        const y = marginPx + r * moduleSize + moduleSize / 2;
        paths += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(moduleSize / 2 * 0.85).toFixed(2)}" fill="#000000" />\n`;
      }
    }
  }

  // Draw standard SVG rounded finder patterns
  const drawSVGFinder = (sx: number, sy: number) => {
    const ox = sx + moduleSize / 2;
    const oy = sy + moduleSize / 2;
    const r1 = 1.5 * moduleSize;
    const r2 = 1.0 * moduleSize;
    // Outer
    paths += `<rect x="${ox.toFixed(2)}" y="${oy.toFixed(2)}" width="${(6 * moduleSize).toFixed(2)}" height="${(6 * moduleSize).toFixed(2)}" rx="${r1.toFixed(2)}" fill="none" stroke="#000000" stroke-width="${moduleSize.toFixed(2)}" />\n`;
    // Middle
    paths += `<rect x="${(ox + moduleSize).toFixed(2)}" y="${(oy + moduleSize).toFixed(2)}" width="${(4 * moduleSize).toFixed(2)}" height="${(4 * moduleSize).toFixed(2)}" rx="${r2.toFixed(2)}" fill="none" stroke="#FFC72C" stroke-width="${moduleSize.toFixed(2)}" />\n`;
    // Center
    paths += `<rect x="${(ox + 2 * moduleSize).toFixed(2)}" y="${(oy + 2 * moduleSize).toFixed(2)}" width="${(2 * moduleSize).toFixed(2)}" height="${(2 * moduleSize).toFixed(2)}" rx="${(0.6 * moduleSize).toFixed(2)}" fill="#000000" />\n`;
  };

  drawSVGFinder(marginPx, marginPx);
  drawSVGFinder(marginPx + (size - 7) * moduleSize, marginPx);
  drawSVGFinder(marginPx, marginPx + (size - 7) * moduleSize);

  // Logo container
  const logoWidth = viewSize * 0.22;
  const logoX = (viewSize - logoWidth) / 2;
  const logoY = (viewSize - logoWidth) / 2;
  const logoRadius = logoWidth * 0.25;

  paths += `<rect x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoWidth.toFixed(2)}" height="${logoWidth.toFixed(2)}" rx="${logoRadius.toFixed(2)}" fill="#141414" stroke="#FFC72C" stroke-width="2.5" />\n`;

  // Draw cube wireframe inside SVG
  const cubeSize = logoWidth * 0.45;
  const cx = viewSize / 2;
  const cy = logoY + logoWidth / 2 - cubeSize * 0.12;
  const half = cubeSize / 2;
  const hOffset = cubeSize * 0.12;

  // Add paths for the 3D isometric cube
  paths += `<polygon points="${cx},${(cy - half).toFixed(2)} ${(cx + half).toFixed(2)},${(cy - hOffset).toFixed(2)} ${cx},${(cy + hOffset).toFixed(2)} ${(cx - half).toFixed(2)},${(cy - hOffset).toFixed(2)}" fill="none" stroke="#FFC72C" stroke-width="${(cubeSize / 16).toFixed(2)}" />\n`;
  paths += `<polygon points="${(cx - half).toFixed(2)},${(cy - hOffset).toFixed(2)} ${cx},${(cy + hOffset).toFixed(2)} ${cx},${(cy + half).toFixed(2)} ${(cx - half).toFixed(2)},${(cy + half - hOffset).toFixed(2)}" fill="none" stroke="#FFC72C" stroke-width="${(cubeSize / 16).toFixed(2)}" />\n`;
  paths += `<polygon points="${cx},${(cy + hOffset).toFixed(2)} ${(cx + half).toFixed(2)},${(cy - hOffset).toFixed(2)} ${(cx + half).toFixed(2)},${(cy + half - hOffset).toFixed(2)} ${cx},${(cy + half).toFixed(2)}" fill="none" stroke="#FFC72C" stroke-width="${(cubeSize / 16).toFixed(2)}" />\n`;
  paths += `<line x1="${(cx - half / 2).toFixed(2)}" y1="${(cy - half / 2 - hOffset / 2).toFixed(2)}" x2="${(cx - half / 2).toFixed(2)}" y2="${(cy + half / 2 - hOffset / 2).toFixed(2)}" stroke="#FFC72C" stroke-width="${(cubeSize / 20).toFixed(2)}" />\n`;
  paths += `<line x1="${(cx + half / 2).toFixed(2)}" y1="${(cy - half / 2 - hOffset / 2).toFixed(2)}" x2="${(cx + half / 2).toFixed(2)}" y2="${(cy + half / 2 - hOffset / 2).toFixed(2)}" stroke="#FFC72C" stroke-width="${(cubeSize / 20).toFixed(2)}" />\n`;

  // SVG Text
  paths += `<text x="${cx}" y="${(logoY + logoWidth * 0.84).toFixed(2)}" fill="#FFFFFF" font-family="sans-serif" font-weight="bold" font-size="${(logoWidth * 0.11).toFixed(2)}" text-anchor="middle">StoreFlow</text>\n`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  ${paths}
</svg>`;
}
