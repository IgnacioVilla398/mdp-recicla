# Paso 1 — Esquema de base de datos

Motor: **SQLite** (archivo `db/mdp-recicla.sqlite`) mediante el módulo nativo `node:sqlite`.
Fuente de verdad: [`src/db/schema.sql`](../src/db/schema.sql).

## Diagrama de entidades

```
neighborhoods 1───n users
                    │
                    ├───n collections n───1 materials
                    │                          │
                    │                          └───n material_price_history
                    ├───n bag_deliveries
                    └───n payouts
```

## Tablas

### `neighborhoods` — barrios / zonas de recolección
| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `name`, `slug` | TEXT UNIQUE | `Centro`, `los-troncos`, … |
| `weekday` | INTEGER 1–7 | Día de recolección (ISO-8601). `NULL` = sin asignar |
| `zone` | TEXT | Agrupación amplia: Norte / Centro / Sur |
| `is_active` | 0/1 | Permite dar de baja una zona sin borrar historial |

> El "Calendario / Cronograma" del dashboard del cliente se resuelve con `weekday` del barrio del usuario.

### `users` — vecinos y administradores
| Campo | Tipo | Notas |
| --- | --- | --- |
| `email` | TEXT UNIQUE (NOCASE) | Login |
| `password_hash` | TEXT | Formato `scrypt$salt$hash` |
| `neighborhood_id` | FK | Barrio del vecino |
| `role` | `'admin' \| 'client'` | Control de acceso |
| `status` | `'active' \| 'paused' \| 'inactive'` | Pausar recolección sin borrar la cuenta |
| `payout_method` / `payout_value` / `payout_holder` | | CBU/CVU/Alias por defecto para el cobro |

### `materials` — materiales y precio vigente
| Campo | Tipo | Notas |
| --- | --- | --- |
| `name` | TEXT UNIQUE | `Lata de aluminio`, `Cobre`, `Plástico PET`, … |
| `category` | TEXT | Metal / Plástico / Papel / Vidrio |
| `unit` | `'kg' \| 'unidad'` | Preparado para ítems que no se pesan |
| `price_per_kg` | REAL ≥ 0 | Valor vigente en ARS |
| `is_active` | 0/1 | Ocultar del formulario de carga sin perder historial |

### `material_price_history` — historial de precios
Registra cada cambio de precio con `valid_from`, `changed_by` y `note`. Se escribe automáticamente mediante el trigger `trg_materials_price_history`.

**Por qué existe:** el requisito pide que `total_price` se calcule con el precio del material *en la fecha de la recolección*. Al guardar además `price_per_kg_applied` en cada pesaje, la valorización del pasado nunca se distorsiona cuando el admin actualiza precios.

### `collections` — pesajes / entregas
| Campo | Tipo | Notas |
| --- | --- | --- |
| `user_id`, `material_id` | FK | `ON DELETE CASCADE` / `RESTRICT` |
| `weight_kg` | REAL > 0 | Con 3 decimales (gramos) |
| `price_per_kg_applied` | REAL | Precio congelado al momento de la carga |
| `total_price` | REAL | `weight_kg × price_per_kg_applied` |
| `collected_on` | TEXT `YYYY-MM-DD` | Indexado para agrupar por día/mes |
| `route_date` | TEXT | Recorrido al que pertenece el pesaje |
| `recorded_by` | FK users | Admin que cargó el pesaje desde el celular |

### `bag_deliveries` — entrega de bolsas
`user_id`, `quantity`, `delivered_on`, `delivered_by`. Da trazabilidad al paso 2 del flujo (entrega de bolsas por zona).

### `payouts` — solicitudes de cobro
| Campo | Tipo | Notas |
| --- | --- | --- |
| `amount` | REAL > 0 | Saldo solicitado |
| `status` | `pending \| approved \| paid \| rejected \| cancelled` | |
| `period_month` | `YYYY-MM` | Mes liquidado |
| `payout_method` / `payout_value` / `payout_holder` | | Datos declarados al solicitar (foto del momento) |
| `requested_at`, `reviewed_at`, `paid_at` | TEXT | Trazabilidad completa |
| `reviewed_by`, `paid_by`, `receipt_url` | | Auditoría del admin |

## Vistas de apoyo

| Vista | Uso |
| --- | --- |
| `v_user_totals` | Kilos, ganado, pagado, saldo pendiente y **saldo disponible** por vecino |
| `v_user_current_month` | Resumen mensual (kilos, monto, cantidad de entregas) |
| `v_user_by_material` | Totales por material (gráfico de detalle del dashboard) |

`saldo_disponible = total_earned − pagos (approved/paid) − solicitudes pendientes`, para que un vecino no pueda solicitar dos veces el mismo saldo.

## Otras decisiones

- **Fechas en texto ISO-8601 UTC** y fechas de calendario en `YYYY-MM-DD`: legibles y comparables en SQLite; `substr(collected_on,1,7)` permite agrupar por mes con índice.
- **REAL para dinero**: suficiente para el MVP en ARS. Si en el futuro se requiere precisión contable exacta, migrar a enteros en centavos.
- **`PRAGMA foreign_keys = ON`** y **`journal_mode = WAL`** activados en cada conexión ([`src/db/index.js`](../src/db/index.js)).
- **Migraciones versionadas** en la tabla `schema_migrations`; `schema.sql` es idempotente (`IF NOT EXISTS`).

## Verificación

```bash
npm run db:reset
npm start
# GET /api/db/status
# {"neighborhoods":10,"users":5,"materials":9,"material_price_history":9,
#  "collections":36,"bag_deliveries":4,"payouts":1}
```

## Pendiente para el Paso 2

- `src/middlewares/auth.js` (JWT) y `requireRole('admin')`
- Servicio de saldos que consuma `v_user_totals`
- Registro de `material_price_history` también al **crear** un material
- Validación de CBU/CVU/alias antes de aceptar una solicitud de cobro
