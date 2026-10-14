import { encode } from 'uqr';

/** Build an SVG string for a QR code (black on white, 4-module quiet zone). */
export function qrSvg(text: string, scale = 8): { svg: string; size: number } {
  const qr = encode(text, { ecc: 'M', border: 4 });
  const n = qr.size;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (qr.data[y][x]) path += `M${x} ${y}h1v1h-1z`;
  }
  const px = n * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return { svg, size: n };
}

/** Render a QR to a PNG data URL via canvas (browser only). */
export function qrPng(text: string, scale = 10): string {
  const qr = encode(text, { ecc: 'M', border: 4 });
  const n = qr.size;
  const c = document.createElement('canvas');
  c.width = c.height = n * scale;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.data[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale);
  return c.toDataURL('image/png');
}
