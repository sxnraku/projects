/**
 * Save na nuvem via Google Drive (pasta `appDataFolder` — o "Saved Games").
 * Só usa `fetch` + um access token com o scope `drive.appdata`. Sem SDK nativo.
 */
import { CLOUD_SAVE_NAME } from './cloudConfig';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** Procura o ficheiro do save na pasta escondida da app. Devolve o id ou null. */
async function findSaveFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${CLOUD_SAVE_NAME}'`);
  const url = `${DRIVE}/files?spaces=appDataFolder&fields=${encodeURIComponent('files(id,name)')}&q=${q}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`drive-list-${res.status}`);
  const json = await res.json();
  const f = (json.files ?? []).find((x: { name: string }) => x.name === CLOUD_SAVE_NAME);
  return f?.id ?? null;
}

/** Guarda (cria ou atualiza) o save na nuvem. `content` = JSON do estado do jogo. */
export async function uploadSave(token: string, content: string): Promise<void> {
  const existing = await findSaveFileId(token);
  if (existing) {
    const res = await fetch(`${UPLOAD}/files/${existing}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content,
    });
    if (!res.ok) throw new Error(`drive-update-${res.status}`);
    return;
  }
  // Ficheiro novo: multipart (metadata + conteúdo) na pasta appDataFolder.
  const boundary = 'flb' + Date.now();
  const metadata = { name: CLOUD_SAVE_NAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`drive-create-${res.status}`);
}

/** Carrega o save da nuvem (JSON), ou null se não existir. */
export async function downloadSave(token: string): Promise<string | null> {
  const id = await findSaveFileId(token);
  if (!id) return null;
  const res = await fetch(`${DRIVE}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`drive-get-${res.status}`);
  return res.text();
}
