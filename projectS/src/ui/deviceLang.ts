import { Lang } from '../core/i18n';

/**
 * Deteta o idioma do SISTEMA e mapeia para um dos suportados (pt-PT, pt-BR, en).
 * Usa o Intl (disponível no Hermes) e, em web, o navigator — sem dependências
 * nativas. Só é usado no PRIMEIRO arranque; depois vale a escolha guardada.
 */
export function detectDeviceLang(): Lang {
  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    // Intl indisponível — tenta o navigator (web) ou fica no fallback.
  }
  if (!locale && typeof navigator !== 'undefined') {
    locale = (navigator.language || (navigator.languages && navigator.languages[0]) || '');
  }
  const l = locale.toLowerCase();
  if (l.startsWith('pt')) return l.includes('br') ? 'pt-BR' : 'pt-PT';
  return 'en';
}
