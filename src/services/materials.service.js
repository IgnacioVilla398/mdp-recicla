/** Materiales, precios por kilo e historial de precios. */
import { all, get, transaction } from '../db/index.js';
import { ApiError } from '../utils/http.js';
import { clean, round2 } from '../utils/validate.js';

export function listMaterials({ includeInactive = false } = {}) {
  return all(
    `SELECT id, name, category, unit, price_per_kg, description, is_active, updated_at
       FROM materials
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY category, name COLLATE NOCASE`
  );
}

export function getMaterial(id) {
  const material = get('SELECT * FROM materials WHERE id = ?', [Number(id)]);
  if (!material) throw ApiError.notFound('Material inexistente');
  return material;
}

/**
 * Precio vigente de un material para una fecha dada.
 * Busca el ultimo cambio de precio registrado hasta esa fecha;
 * si no hay historial, usa el precio actual del material.
 */
export function priceAt(materialId, dateOnly) {
  const reference = `${dateOnly}T23:59:59Z`;
  const row = get(
    `SELECT price_per_kg
       FROM material_price_history
      WHERE material_id = ? AND valid_from <= ?
      ORDER BY valid_from DESC, id DESC
      LIMIT 1`,
    [Number(materialId), reference]
  );
  if (row) return row.price_per_kg;
  return getMaterial(materialId).price_per_kg;
}

export function createMaterial({ name, category, unit = 'kg', pricePerKg, description }, adminId) {
  const cleanName = clean(name);
  if (!cleanName) throw ApiError.badRequest('El nombre es obligatorio', { name: 'Requerido' });
  if (get('SELECT id FROM materials WHERE name = ? COLLATE NOCASE', [cleanName])) {
    throw ApiError.conflict('Ya existe un material con ese nombre', { name: 'Duplicado' });
  }
  const price = Number(pricePerKg);
  if (!Number.isFinite(price) || price < 0) {
    throw ApiError.badRequest('Precio invalido', { price_per_kg: 'Debe ser un numero mayor o igual a 0' });
  }
  if (!['kg', 'unidad'].includes(unit)) {
    throw ApiError.badRequest('Unidad invalida', { unit: 'Use kg o unidad' });
  }

  return transaction((db) => {
    const result = db
      .prepare('INSERT INTO materials (name, category, unit, price_per_kg, description) VALUES (?, ?, ?, ?, ?)')
      .run(cleanName, clean(category), unit, round2(price), clean(description));

    db.prepare(
      'INSERT INTO material_price_history (material_id, price_per_kg, changed_by, note) VALUES (?, ?, ?, ?)'
    ).run(result.lastInsertRowid, round2(price), adminId ?? null, 'Precio inicial del material');

    return getMaterial(result.lastInsertRowid);
  });
}

/** Actualiza datos del material; si cambia el precio, deja registro en el historial. */
export function updateMaterial(id, { name, category, unit, pricePerKg, description, isActive }, adminId) {
  const material = getMaterial(id);
  const newPrice = pricePerKg === undefined ? material.price_per_kg : Number(pricePerKg);
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw ApiError.badRequest('Precio invalido', { price_per_kg: 'Debe ser un numero mayor o igual a 0' });
  }
  if (unit !== undefined && !['kg', 'unidad'].includes(unit)) {
    throw ApiError.badRequest('Unidad invalida', { unit: 'Use kg o unidad' });
  }
  const cleanName = clean(name) ?? material.name;
  const duplicate = get('SELECT id FROM materials WHERE name = ? COLLATE NOCASE AND id <> ?', [cleanName, material.id]);
  if (duplicate) throw ApiError.conflict('Ya existe otro material con ese nombre', { name: 'Duplicado' });

  const priceChanged = round2(newPrice) !== round2(material.price_per_kg);

  return transaction((db) => {
    db.prepare(
      `UPDATE materials
          SET name = ?, category = ?, unit = ?, price_per_kg = ?, description = ?, is_active = ?
        WHERE id = ?`
    ).run(
      cleanName,
      category !== undefined ? clean(category) : material.category,
      unit ?? material.unit,
      round2(newPrice),
      description !== undefined ? clean(description) : material.description,
      isActive === undefined ? material.is_active : (isActive ? 1 : 0),
      material.id
    );

    if (priceChanged) {
      db.prepare(
        'INSERT INTO material_price_history (material_id, price_per_kg, changed_by, note) VALUES (?, ?, ?, ?)'
      ).run(material.id, round2(newPrice), adminId ?? null, `Precio actualizado de $${material.price_per_kg} a $${round2(newPrice)}`);
    }

    return getMaterial(material.id);
  });
}

export function priceHistory(materialId) {
  getMaterial(materialId);
  return all(
    `SELECT h.id, h.price_per_kg, h.valid_from, h.note, u.name AS changed_by_name
       FROM material_price_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.material_id = ?
      ORDER BY h.valid_from DESC, h.id DESC`,
    [Number(materialId)]
  );
}

export default { listMaterials, getMaterial, priceAt, createMaterial, updateMaterial, priceHistory };
