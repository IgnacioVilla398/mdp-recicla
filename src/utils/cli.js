/** Utilidades de linea de comandos. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** true cuando el modulo actual fue ejecutado directamente (node archivo.js). */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(importMetaUrl);
}
