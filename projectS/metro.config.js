// Metro config — Expo SDK 54.
// O expo-sqlite tem suporte web via wa-sqlite (WASM); é preciso registar a
// extensão .wasm como asset para o Metro a empacotar. Inofensivo para nativo.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
