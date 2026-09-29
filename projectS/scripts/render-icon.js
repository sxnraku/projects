/**
 * Renderiza assets/src/icon.svg para os PNGs da app com o Chromium do Playwright.
 * Correr: node scripts/render-icon.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(root, 'src', 'icon.svg'), 'utf8');

async function shot(page, html, file, w, h, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#05080d'}">${html}</body></html>`);
  await page.screenshot({ path: file, omitBackground: !!transparent });
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const page = await browser.newPage();
  const sized = (s, size) => s.replace('width="1024" height="1024"', `width="${size}" height="${size}"`);

  await shot(page, sized(svg, 1024), path.join(root, 'icon.png'), 1024, 1024);
  await shot(page, sized(svg, 512), path.join(root, 'store', 'icon-512.png'), 512, 512);

  // Adaptive: só o escudo, transparente, dentro da zona segura (66%).
  const fg = svg
    .replace(/<rect width="1024" height="1024" fill="url\(#bg\)"\/>/, '')
    .replace(/<circle cx="512" cy="520" r="470" fill="url\(#glow\)"\/>/, '')
    .replace(/<g opacity="0.10"[\s\S]*?<\/g>/, '')
    .replace(/<g fill="#fff6c8" opacity="0.9">[\s\S]*?<\/g>/, '')
    .replace('<svg ', '<svg overflow="visible" ')
    .replace('viewBox="0 0 1024 1024"', 'viewBox="112 56 800 900"');
  const adaptive = fg.replace('width="1024" height="1024"', 'width="640" height="720"');
  await shot(page,
    `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">${adaptive}</div>`,
    path.join(root, 'adaptive-icon.png'), 1024, 1024, true);

  // Splash: fundo escuro + ícone ao centro.
  await shot(page,
    `<div style="width:1284px;height:2778px;background:radial-gradient(circle at 50% 45%,#1c2a3a,#05080d 70%);display:flex;align-items:center;justify-content:center">${sized(svg, 720).replace(/<rect width="1024"[^>]*\/>/, '')}</div>`,
    path.join(root, 'splash.png'), 1284, 2778);
  await browser.close();
  console.log('✓ icon, adaptive-icon, splash, store/icon-512 gerados');
})();
