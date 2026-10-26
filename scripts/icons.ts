import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const mark = (size: number, pad: number, bg: string): string => {
  const inner = size - pad * 2;
  return `<div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
  <svg width="${inner}" height="${inner}" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="11" stroke="#f5f5f7" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="51.8 17.3" transform="rotate(-90 16 16)"/>
    <circle cx="8.2" cy="8.2" r="2.4" fill="#ff5a52"/>
  </svg></div>`;
};

const icons: Array<[string, number, number]> = [
  ['icon-192', 192, 36],
  ['icon-512', 512, 96],
  ['maskable-512', 512, 140],
  ['apple-touch-icon', 180, 34],
];
const splashes: Array<[number, number]> = [
  [1290, 2796],
  [1179, 2556],
  [1170, 2532],
  [1125, 2436],
];

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('web/public/icons', { recursive: true });
mkdirSync('web/public/splash', { recursive: true });
for (const [name, size, pad] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${mark(size, pad, '#0b0b0c')}</body>`);
  await page.screenshot({ path: `web/public/icons/${name}.png` });
}
for (const [w, h] of splashes) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;background:#0b0b0c;display:grid;place-items:center">${mark(Math.round(w * 0.26), 0, 'transparent')}</body>`);
  await page.screenshot({ path: `web/public/splash/${w}x${h}.png` });
}
await browser.close();
console.log('icons written');
