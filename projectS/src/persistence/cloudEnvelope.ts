/**
 * Formato do ficheiro de save que vai para a nuvem.
 *
 * Vive na camada de persistência (TS puro, coberto pelo typecheck do core) e não
 * em src/native: o transporte é que é nativo, o FORMATO é regra de save.
 *
 * O estado vai dentro de `state`, acompanhado do código da versão que o
 * escreveu. Serve para recusar um save gravado por uma app MAIS RECENTE (com
 * campos que esta versão não sabe migrar) em vez de o carregar meio a meio.
 */
export interface CloudEnvelope {
  appVersionCode: number;
  savedAt: string;
  state: unknown;
}

/** Empacota o estado com a versão que o escreveu. */
export function wrapSave(state: unknown, appVersionCode: number): string {
  const env: CloudEnvelope = { appVersionCode, savedAt: new Date().toISOString(), state };
  return JSON.stringify(env);
}

/**
 * Desempacota o que veio da nuvem. Aceita o formato ANTIGO (o estado cru, sem
 * envelope) para não invalidar as cópias já gravadas pelas versões anteriores.
 */
export function unwrapSave(json: string): { state: unknown; appVersionCode: number | null } {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed === 'object' && parsed !== null &&
    'state' in parsed && 'appVersionCode' in parsed
  ) {
    const env = parsed as CloudEnvelope;
    return { state: env.state, appVersionCode: Number(env.appVersionCode) || null };
  }
  return { state: parsed, appVersionCode: null }; // cópia anterior ao envelope
}
