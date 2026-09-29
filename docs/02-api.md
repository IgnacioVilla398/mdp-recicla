# Paso 2 — API de autenticación, materiales y pesajes

Base URL: `http://localhost:3000/api`
Autenticación: **JWT HS256** en `Authorization: Bearer <token>` (también se acepta la cookie `mdp_token`, que se setea al hacer login).

Formato de respuesta:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "Mensaje", "details": { "campo": "Motivo" } }
```

Errores: `400` datos inválidos · `401` sin token o token vencido · `403` rol insuficiente · `404` no existe · `409` duplicado.

## Endpoints

### Autenticación (`/api/auth`)

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| POST | `/auth/register` | público | Alta de vecino. Body: `name`, `email`, `password` (min 6), `phone`, `address`, `neighborhood_id` |
| POST | `/auth/login` | público | Body: `email`, `password` → `{ user, token }` |
| POST | `/auth/logout` | público | Borra la cookie de sesión |
| GET | `/auth/me` | autenticado | Usuario actual (incluye barrio y día de recolección) |
| PATCH | `/auth/me` | autenticado | Actualiza `name`, `phone`, `address`, `neighborhood_id` y `payout` (`{ method, value, holder }`) |
| POST | `/auth/change-password` | autenticado | Body: `current_password`, `new_password` |

### Materiales y precios (`/api/materials`)

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| GET | `/materials` | público | Lista activos con `price_per_kg`. `?include_inactive=1` solo para admin |
| GET | `/materials/:id` | público | Detalle |
| GET | `/materials/:id/history` | admin | Historial de precios con quién y cuándo lo cambió |
| POST | `/materials` | admin | Crea material y registra el precio inicial en el historial |
| PATCH | `/materials/:id` | admin | Actualiza `name`, `category`, `unit`, `price_per_kg`, `description`, `is_active`. Si el precio cambia, queda registrado en el historial |

### Pesajes (`/api/collections`)

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| GET | `/collections` | autenticado | El vecino ve solo lo suyo; el admin filtra por `user_id`, `material_id`, `neighborhood_id`, `from`, `to`, `month`, `limit`, `offset`, `order` |
| GET | `/collections/summary/me` | client | Panel del vecino: saldo, kilos del mes, por material, historial y cobros. `?month=YYYY-MM` |
| GET | `/collections/overview` | admin | Métricas del mes, saldo pendiente de pago, totales por material y serie diaria |
| POST | `/collections` | admin | **Carga rápida**: `user_id`, `material_id`, `weight_kg`, `collected_on?`, `route_date?`, `notes?` |
| POST | `/collections/batch` | admin | Varios materiales en una visita: `{ user_id, items: [{ material_id, weight_kg }] }` |
| GET | `/collections/:id` | autenticado | Detalle (el vecino solo los propios) |
| PATCH | `/collections/:id` | admin | Corrige kilos/material/fecha y recalcula el monto |
| DELETE | `/collections/:id` | admin | Elimina un pesaje mal cargado |

### Vecinos, barrios y recorridos

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| GET | `/neighborhoods` | público | Barrios con día de recolección y cantidad de vecinos |
| GET | `/users` | admin | Busca/filtra vecinos: `search`, `neighborhood_id`, `weekday`, `status`, `page`, `limit`. Incluye kilos, saldo y última recolección |
| POST | `/users` | admin | Alta de vecino sin autorregistro |
| GET | `/users/:id` | admin | Detalle |
| PATCH | `/users/:id` | admin | Edita datos, barrio, notas y `status` (`active`, `paused`, `inactive`) |
| GET | `/routes/daily?weekday=2&date=YYYY-MM-DD` | admin | **Ruta del día**: barrios y vecinos a visitar, con bolsas entregadas y última recolección |
| GET | `/routes/week` | admin | Cronograma semanal con cantidad de vecinos por día |

## Reglas de negocio implementadas

1. **Precio histórico congelado**: al cargar un pesaje se busca el último precio registrado en `material_price_history` con `valid_from <= fecha del pesaje`. Si no hay historial, se usa el precio actual. El pesaje guarda `price_per_kg_applied` y `total_price = weight_kg × precio`, de modo que actualizar precios no altera meses ya liquidados.
2. **Historial de precios con autoría**: cada cambio de precio se registra con `changed_by` y una nota descriptiva (`Precio actualizado de $X a $Y`).
3. **Validaciones de pesaje**: peso numérico > 0 y ≤ 5000 kg, material activo, vecino existente con rol `client`, fecha en formato `YYYY-MM-DD` y nunca futura.
4. **Aislamiento por rol**: un vecino nunca ve datos de otro; las rutas de administración exigen rol `admin` (verificado contra la base en cada request, no solo contra el token).
5. **Saldos**: `available_balance` descuenta pagos confirmados y solicitudes pendientes (`v_user_totals`), para evitar solicitar dos veces el mismo saldo.

## Ejemplos

```bash
# Login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mdprecicla.com","password":"admin123"}'

# Carga rápida de un pesaje desde el celular
curl -s -X POST http://localhost:3000/api/collections \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"user_id":2,"material_id":2,"weight_kg":3.2,"notes":"Recorrido martes"}'

# Actualizar el precio del cobre
curl -s -X PATCH http://localhost:3000/api/materials/2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"price_per_kg":10500}'

# Ruta del martes
curl -s "http://localhost:3000/api/routes/daily?weekday=2" -H "Authorization: Bearer $TOKEN"
```

## Verificación automática

Con el servidor levantado (`npm start`), en otra terminal:

```bash
npm run test:api
```

[`scripts/smoke.mjs`](../scripts/smoke.mjs) recorre el flujo completo: registro, login, control de roles, actualización de precios, carga de pesajes, cálculo del saldo, ruta del día y validaciones de error. **26 pruebas, 0 fallidas.**

## Pendiente para los Pasos 3 y 4

- Endpoints de solicitud de cobro (`POST /api/payouts`, `GET /api/payouts`, `PATCH /api/payouts/:id` → marcar como pagado). El modelo `payouts` y `v_user_totals` ya lo soportan.
- Registro de entrega de bolsas (`bag_deliveries`) desde el panel admin.
- Rate limiting en `login`/`register` y rotación de `JWT_SECRET`.
