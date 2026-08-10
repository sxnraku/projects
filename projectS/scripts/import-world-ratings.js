/** Executa o importador com o Python disponível na máquina. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const candidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []], ['py', ['-3']]];

let selected = null;
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, '--version'], { stdio: 'ignore' });
  if (probe.status === 0) { selected = { command, prefix }; break; }
}

if (!selected) {
  console.error('Python 3 não encontrado. Instala Python 3 ou define-o no PATH.');
  process.exit(1);
}

const projectDir = path.resolve(__dirname, '..');
const script = path.join(__dirname, 'import-world-ratings.py');
const workbook = path.join(projectDir, 'docs', 'excel_todos_os_clubes_overalls_ajustados.xlsx');
const result = spawnSync(
  selected.command,
  [...selected.prefix, script, workbook, ...process.argv.slice(2)],
  { cwd: projectDir, stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
