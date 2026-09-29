-- ============================================================
--  MdP Recicla - Esquema inicial de base de datos (SQLite)
--  Paso 1: estructura de datos del MVP
-- ============================================================
--  Convenciones:
--   * Fechas/horas en texto ISO-8601 UTC  (ej: '2025-04-18T14:32:00Z')
--   * Fechas de calendario en 'YYYY-MM-DD'
--   * Pesos con 3 decimales (gramos), dinero con 2 decimales (ARS)
--   * Todo el dinero se guarda en pesos argentinos (ARS)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. BARRIOS / ZONAS DE RECOLECCION
--    El admin asigna un dia de recorrido por zona.
--    weekday: 1=Lunes ... 7=Domingo (ISO-8601)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neighborhoods (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,           -- 'Los Troncos', 'Centro', ...
  slug            TEXT    NOT NULL UNIQUE,           -- 'los-troncos'
  weekday         INTEGER,                           -- dia de recoleccion (1..7) o NULL si sin asignar
  zone            TEXT,                              -- 'Norte', 'Sur', 'Centro'
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7)
);

-- ------------------------------------------------------------
-- 2. USUARIOS (vecinos y administradores)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT    NOT NULL,
  phone           TEXT,
  address         TEXT,                              -- calle y numero
  neighborhood_id INTEGER REFERENCES neighborhoods (id) ON DELETE SET NULL,
  role            TEXT    NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  -- Datos de cobro por defecto (se pueden sobreescribir en cada solicitud)
  payout_method   TEXT    CHECK (payout_method IS NULL OR payout_method IN ('cbu', 'cvu', 'alias')),
  payout_value    TEXT,                              -- CBU/CVU (22 digitos) o alias
  payout_holder   TEXT,                              -- titular de la cuenta
  notes           TEXT,                              -- notas internas del admin
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_neighborhood ON users (neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);

-- ------------------------------------------------------------
-- 3. MATERIALES (precio vigente por kilo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,           -- 'Lata de Aluminio', 'Cobre', 'Plastico PET'
  category        TEXT,                              -- 'Metal', 'Plastico', 'Vidrio', 'Papel/Carton'
  unit            TEXT    NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'unidad')),
  price_per_kg    REAL    NOT NULL DEFAULT 0 CHECK (price_per_kg >= 0),
  description     TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ------------------------------------------------------------
-- 4. HISTORIAL DE PRECIOS
--    Permite valorizar cada pesaje con el precio vigente
--    en la fecha de la recoleccion, sin distorsionar el pasado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS material_price_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id     INTEGER NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  price_per_kg    REAL    NOT NULL CHECK (price_per_kg >= 0),
  valid_from      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  changed_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_history_material
  ON material_price_history (material_id, valid_from DESC);

-- ------------------------------------------------------------
-- 5. PESAJES / ENTREGAS (historial de recoleccion)
--    total_price = weight_kg * price_per_kg_applied
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  material_id          INTEGER NOT NULL REFERENCES materials (id) ON DELETE RESTRICT,
  weight_kg            REAL    NOT NULL CHECK (weight_kg > 0),
  price_per_kg_applied REAL    NOT NULL CHECK (price_per_kg_applied >= 0),
  total_price          REAL    NOT NULL CHECK (total_price >= 0),
  collected_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  collected_on         TEXT    NOT NULL,             -- 'YYYY-MM-DD' (para agrupar por mes/dia)
  route_date           TEXT,                          -- 'YYYY-MM-DD' del recorrido al que pertenece
  recorded_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,  -- admin que cargo el pesaje
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_collections_user_date ON collections (user_id, collected_on DESC);
CREATE INDEX IF NOT EXISTS idx_collections_material  ON collections (material_id);
CREATE INDEX IF NOT EXISTS idx_collections_month     ON collections (substr(collected_on, 1, 7));

-- ------------------------------------------------------------
-- 6. ENTREGA DE BOLSAS
--    El admin entrega bolsas por zona; se registra para trazabilidad.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bag_deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  delivered_on    TEXT    NOT NULL DEFAULT (date('now')),
  delivered_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_bags_user ON bag_deliveries (user_id, delivered_on DESC);

-- ------------------------------------------------------------
-- 7. SOLICITUDES DE COBRO (payouts)
--    El vecino pide la liquidacion de su saldo a fin de mes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payouts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount            REAL    NOT NULL CHECK (amount > 0),
  status            TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  period_month      TEXT,                            -- 'YYYY-MM' del saldo liquidado
  payout_method     TEXT    NOT NULL CHECK (payout_method IN ('cbu', 'cvu', 'alias')),
  payout_value      TEXT    NOT NULL,                -- CBU/CVU o alias declarado al solicitar
  payout_holder     TEXT    NOT NULL,                -- titular
  requested_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed_at       TEXT,
  reviewed_by       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  paid_at           TEXT,
  paid_by           INTEGER REFERENCES users (id) ON DELETE SET NULL,
  receipt_url       TEXT,                            -- comprobante de transferencia
  admin_notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_payouts_user   ON payouts (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts (status, requested_at DESC);

-- ------------------------------------------------------------
-- 8. VISTAS DE APOYO
-- ------------------------------------------------------------

-- Saldo total historico y kilos totales por usuario
DROP VIEW IF EXISTS v_user_totals;
CREATE VIEW v_user_totals AS
SELECT
  u.id                                            AS user_id,
  u.name,
  u.email,
  n.name                                          AS neighborhood,
  COALESCE(SUM(c.weight_kg), 0)                   AS total_kg,
  COALESCE(SUM(c.total_price), 0)                 AS total_earned,
  COALESCE((SELECT SUM(p.amount) FROM payouts p
             WHERE p.user_id = u.id AND p.status IN ('approved', 'paid')), 0) AS total_paid,
  COALESCE(SUM(c.total_price), 0)
    - COALESCE((SELECT SUM(p.amount) FROM payouts p
                 WHERE p.user_id = u.id AND p.status IN ('approved', 'paid')), 0)
    - COALESCE((SELECT SUM(p.amount) FROM payouts p
                 WHERE p.user_id = u.id AND p.status = 'pending'), 0)      AS available_balance,
  COALESCE((SELECT SUM(p.amount) FROM payouts p
             WHERE p.user_id = u.id AND p.status = 'pending'), 0)          AS pending_balance
FROM users u
LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
LEFT JOIN collections   c ON c.user_id = u.id
WHERE u.role = 'client'
GROUP BY u.id;

-- Resumen del mes en curso por usuario (para /dashboard)
DROP VIEW IF EXISTS v_user_current_month;
CREATE VIEW v_user_current_month AS
SELECT
  c.user_id,
  substr(c.collected_on, 1, 7)        AS period_month,
  SUM(c.weight_kg)                    AS month_kg,
  SUM(c.total_price)                  AS month_earned,
  COUNT(*)                            AS deliveries
FROM collections c
GROUP BY c.user_id, substr(c.collected_on, 1, 7);

-- Kilos y monto por material y usuario (para el detalle del dashboard)
DROP VIEW IF EXISTS v_user_by_material;
CREATE VIEW v_user_by_material AS
SELECT
  c.user_id,
  c.material_id,
  m.name                              AS material_name,
  SUM(c.weight_kg)                    AS total_kg,
  SUM(c.total_price)                  AS total_price
FROM collections c
JOIN materials m ON m.id = c.material_id
GROUP BY c.user_id, c.material_id;

-- ------------------------------------------------------------
-- 9. TRIGGERS
-- ------------------------------------------------------------

-- NOTA: el historial de precios (material_price_history) lo escribe la capa de
-- servicios (src/services/materials.service.js) para poder registrar quien
-- hizo el cambio (changed_by) y una nota. Ver docs/02-api.md.

-- Mantener updated_at al dia
DROP TRIGGER IF EXISTS trg_users_updated_at;
CREATE TRIGGER trg_users_updated_at
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_materials_updated_at;
CREATE TRIGGER trg_materials_updated_at
AFTER UPDATE OF price_per_kg, name, is_active ON materials FOR EACH ROW
BEGIN
  UPDATE materials SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_neighborhoods_updated_at;
CREATE TRIGGER trg_neighborhoods_updated_at
AFTER UPDATE ON neighborhoods FOR EACH ROW
BEGIN
  UPDATE neighborhoods SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id;
END;
