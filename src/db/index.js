/**
 * Conexion unica a SQLite usando el modulo nativo node:sqlite (Node >= 22.5).
 * No requiere dependencias nativas ni compilacion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import config from '../config/env.js';

let db = null;

/** Abre (o reutiliza) la conexion a la base de datos. */
export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

/** Ejecuta el archivo schema.sql completo (idempotente). */
export function applySchema() {
  const sql = fs.readFileSync(config.schemaFile, 'utf8');
  getDb().exec(sql);
}

/** SELECT multiple. */
export function all(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

/** SELECT de una fila. */
export function get(sql, params = []) {
  return getDb().prepare(sql).get(...params) ?? null;
}

/** INSERT / UPDATE / DELETE. Devuelve { changes, lastInsertRowid }. */
export function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

/** Ejecuta una funcion dentro de una transaccion. */
export function transaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { getDb, applySchema, all, get, run, transaction, closeDb };
