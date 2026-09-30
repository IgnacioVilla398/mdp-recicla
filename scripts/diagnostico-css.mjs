/**
 * Muestra, para varios selectores, que reglas CSS aplica realmente el navegador
 * (con archivo y linea) y que propiedades quedan ganando. Sirve para detectar
 * conflictos entre hojas de estilo.
 *
 * Uso: node scripts/diagnostico-css.mjs [url]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_OBJETIVO = process.argv[2] ?? 'http://localhost:3000/';
const PUERTO = 9334;
const SELECTORES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['.hero', '.hero h1', '.hero__bajada', '.hero__etiqueta', '.hero__contenido'];

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-css-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  '--window-size=1440,900', URL_OBJETIVO,
], { stdio: 'ignore' });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function objetivo() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const pagina = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina;
    } catch { /* esperando */ }
    await esperar(250);
  }
  throw new Error('sin pestanas');
}

const pagina = await objetivo();
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
let id = 0;
const pendientes = new Map();
const hojas = new Map();          // styleSheetId -> { archivo, linea }
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'CSS.styleSheetAdded') {
    const { styleSheetId, sourceURL, startLine } = m.params.header;
    hojas.set(styleSheetId, {
      archivo: sourceURL ? path.basename(sourceURL.split('?')[0]) : 'inline',
      linea: (startLine ?? 0) + 1,
    });
  }
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
});
const enviar = (method, params = {}) => new Promise((res) => {
  id += 1; pendientes.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

await enviar('Page.enable');
await enviar('DOM.enable');
await enviar('CSS.enable');
await enviar('Page.navigate', { url: URL_OBJETIVO });
await esperar(2500);

const { result: doc } = await enviar('DOM.getDocument', { depth: -1, pierce: true });

for (const selector of SELECTORES) {
  const { result } = await enviar('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  if (!result?.nodeId) { console.log(`\n### ${selector} -> no encontrado`); continue; }

  const { result: estilos } = await enviar('CSS.getMatchedStylesForNode', { nodeId: result.nodeId });
  console.log(`\n### ${selector}`);

  const reglas = (estilos.matchedCSSRules ?? []).map(({ rule }) => rule);
  for (const regla of reglas) {
    const props = (regla.style.cssProperties ?? [])
      .filter((p) => p.name && p.value && !p.disabled)
      .map((p) => `${p.name}: ${p.value}`);
    if (!props.length) continue;
    const hoja = hojas.get(regla.styleSheetId);
    const origen = hoja ? `${hoja.archivo}:${hoja.linea}` : regla.origin;
    console.log(`  ${regla.selectorList.text}   [${origen}]`);
    props.forEach((p) => console.log(`      ${p}`));
  }

  const heredadas = (estilos.inherited ?? []).flatMap((bloque) => bloque.matchedCSSRules ?? []).map(({ rule }) => rule);
  if (heredadas.length) {
    console.log('  --- heredadas ---');
    heredadas.slice(0, 6).forEach((r) => console.log(`      ${r.selectorList.text}`));
  }
}

ws.close();
chrome.kill();
