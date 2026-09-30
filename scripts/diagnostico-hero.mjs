/**
 * Diagnostico del hero de la landing usando el protocolo DevTools de Chrome.
 * Mide geometria, paddings y colores computados de cada elemento del hero.
 *
 * Uso: node scripts/diagnostico-hero.mjs [url] [ancho]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_OBJETIVO = process.argv[2] ?? 'http://localhost:3000/';
const ANCHO = Number(process.argv[3] ?? 1440);
const ALTO = Number(process.argv[4] ?? 900);
const PUERTO = 9333;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('No se encontro Chrome ni Edge.');
  process.exit(1);
}

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=${perfil}`,
  `--window-size=${ANCHO},${ALTO}`,
  URL_OBJETIVO,
], { stdio: 'ignore' });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function obtenerObjetivo() {
  for (let intento = 0; intento < 40; intento += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const lista = await res.json();
      const pagina = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina;
    } catch { /* todavia no levanto */ }
    await esperar(250);
  }
  throw new Error('Chrome no expuso ninguna pestana');
}

const EXPRESION = `(() => {
  const medir = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, falta: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      x: Math.round(r.x), y: Math.round(r.y),
      ancho: Math.round(r.width), alto: Math.round(r.height),
      izquierda: Math.round(r.left), derecha: Math.round(r.right),
      padding: cs.padding,
      margin: cs.margin,
      color: cs.color,
      fondo: cs.backgroundColor,
      tamanoFuente: cs.fontSize,
      alineacion: cs.textAlign,
      maxAncho: cs.maxWidth,
      display: cs.display,
      zIndex: cs.zIndex,
    };
  };
  const contenedor = document.querySelector('.hero__contenido');
  const csContenedor = contenedor ? getComputedStyle(contenedor) : null;
  return JSON.stringify({
    viewport: { ancho: innerWidth, alto: innerHeight },
    bodyScroll: document.documentElement.scrollWidth,
    contenedorHero: csContenedor ? {
      ancho: Math.round(contenedor.getBoundingClientRect().width),
      izquierda: Math.round(contenedor.getBoundingClientRect().left),
      paddingIzq: csContenedor.paddingLeft,
      paddingDer: csContenedor.paddingRight,
      maxWidth: csContenedor.maxWidth,
      marginIzq: csContenedor.marginLeft,
    } : null,
    elementos: [
      '.hero', '.hero__media', '.hero__fondo', '.hero__etiqueta', '.hero h1',
      '.hero__bajada', '.hero__acciones', '.hero__acciones .boton', '.hero__beneficios',
      '.hero__beneficios li',
    ].map(medir),
  }, null, 2);
})()`;

const objetivo = await obtenerObjetivo();
const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
let idMensaje = 0;
const pendientes = new Map();

ws.addEventListener('message', (evento) => {
  const mensaje = JSON.parse(evento.data);
  if (mensaje.id && pendientes.has(mensaje.id)) {
    pendientes.get(mensaje.id)(mensaje);
    pendientes.delete(mensaje.id);
  }
});

const enviar = (method, params = {}) => new Promise((resolver) => {
  idMensaje += 1;
  pendientes.set(idMensaje, resolver);
  ws.send(JSON.stringify({ id: idMensaje, method, params }));
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));

await enviar('Emulation.setDeviceMetricsOverride', {
  width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: ANCHO < 600,
});
await enviar('Page.enable');
await enviar('Page.navigate', { url: URL_OBJETIVO });
await esperar(2500);

const resultado = await enviar('Runtime.evaluate', { expression: EXPRESION, returnByValue: true });
const metricas = resultado.result?.result?.value;
console.log(metricas);

// Captura recortada al hero para analizar contraste
const captura = await enviar('Page.captureScreenshot', { format: 'png' });
const destino = path.join(os.tmpdir(), 'mdp_shots', `hero-${ANCHO}.png`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, Buffer.from(captura.result.data, 'base64'));
console.log(`\nCaptura del hero: ${destino}`);

// Metricas en JSON para que el analisis de contraste sepa donde esta cada texto
const destinoJson = path.join(os.tmpdir(), 'mdp_shots', `hero-metricas-${ANCHO}.json`);
fs.writeFileSync(destinoJson, metricas);
console.log(`Metricas: ${destinoJson}`);

ws.close();
chrome.kill();
fs.rmSync(perfil, { recursive: true, force: true });
