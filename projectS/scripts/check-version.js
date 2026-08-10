/**
 * Guarda de release: os três sítios que declaram a versão TÊM de bater certo.
 *
 *   app.json            -> expo.android.versionCode + expo.version
 *   android/app/build.gradle -> versionCode + versionName
 *   src/native/appUpdate.ts  -> FALLBACK_VERSION_CODE
 *
 * Porquê: a porta de atualização obrigatória compara o versionCode da app com o
 * `minVersionCode` remoto. Se o número da app ficar atrasado em relação ao que
 * foi publicado, uma app JÁ atualizada é bloqueada para sempre (a Play só lhe
 * oferece "Abrir"). Aconteceu: literal em 20, build a sair com 22.
 *
 * Corre dentro de `npm run smoke:all`. Sai com código 1 se algo divergir.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const problems = [];

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const jsonCode = appJson.expo?.android?.versionCode;
const jsonName = appJson.expo?.version;

for (const rel of ['src/native/appUpdate.ts', 'src/native/appUpdate.web.ts']) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const match = src.match(/FALLBACK_VERSION_CODE\s*=\s*(\d+)/);
  if (!match) {
    problems.push(`${rel}: FALLBACK_VERSION_CODE não encontrado`);
  } else if (Number(match[1]) !== jsonCode) {
    problems.push(`${rel}: FALLBACK_VERSION_CODE=${match[1]} != app.json versionCode=${jsonCode}`);
  }
}

// build.gradle só existe depois do prebuild; se não houver, não é erro.
const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const gCode = Number((gradle.match(/^\s*versionCode\s+(\d+)/m) || [])[1]);
  const gName = (gradle.match(/^\s*versionName\s+"([^"]+)"/m) || [])[1];
  if (gCode !== jsonCode) problems.push(`build.gradle versionCode=${gCode} != app.json=${jsonCode}`);
  if (gName !== jsonName) problems.push(`build.gradle versionName="${gName}" != app.json="${jsonName}"`);
}

if (problems.length > 0) {
  console.error('❌ VERSÕES DESSINCRONIZADAS:');
  for (const p of problems) console.error('   - ' + p);
  console.error('\n   Bumpa os três sítios juntos antes de construir o .aab.');
  process.exit(1);
}

console.log(`✅ versão coerente: ${jsonName} (código ${jsonCode})`);
