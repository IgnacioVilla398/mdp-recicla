# Paso 4 — Panel de administración (frontend)

Archivo: [`public/admin.html`](../public/admin.html) + [`public/assets/js/admin.js`](../public/assets/js/admin.js).
Acceso: `http://localhost:3000/admin.html` con `admin@mdprecicla.com` / `admin123`.

Es una **single page con pestañas** (`#recorrido`, `#carga`, `#precios`, `#cobros`) pensada *mobile-first*: barra de pestañas pegajosa con áreas táctiles de 44 px, formularios de una columna en celular y dos columnas desde 720 px. Cada panel carga sus datos al abrirse y el hash de la URL permite entrar directo a una pestaña.

Capturas: [`docs/capturas/`](capturas) (`04-admin-recorrido`, `05-admin-carga-pesaje`, `06-admin-precios`, `07-admin-cobros`).

## Resumen permanente

Cuatro tarjetas siempre visibles en el encabezado (de `GET /api/collections/overview` + `GET /api/payouts/overview`): vecinos activos, kilos del mes, monto acreditado del mes y **cobros pendientes** en pesos. La pestaña *Cobros* muestra un badge con la cantidad de solicitudes por pagar.

## 1. Ruta del día (`#recorrido`)

- Selector de día de la semana (por defecto, el día de hoy) y filtro por barrio.
- Chips de resumen: barrios, vecinos y **cuántos faltan visitar**.
- Lista agrupada por barrio. Cada vecino muestra dirección, teléfono, última recolección, bolsas entregadas en los últimos 30 días y saldo disponible, con etiqueta *visitado hoy* / *pendiente*.
- Interruptor **"Mostrar solo los que faltan visitar"** para armar el recorrido real.
- Acciones por vecino:
  - **Pesar** → salta a la pestaña de carga con el vecino ya elegido y el cursor en el campo de peso.
  - **Bolsas** → pregunta la cantidad y registra la entrega (`POST /api/bags`).

Endpoint: `GET /api/routes/daily?weekday=N&date=YYYY-MM-DD`.

## 2. Carga rápida de pesaje (`#carga`)

Flujo optimizado para usar con una mano en la calle:

1. **Elegir el vecino**: buscador con resultados en vivo (a partir de 2 caracteres, con *debounce* de 250 ms) sobre `GET /api/users?search=`. Al elegirlo se muestra una ficha con su dirección, barrio, saldo y kilos acumulados.
2. **Cargar el pesaje**: material (con su precio por kg visible), peso con teclado numérico decimal, fecha (por defecto hoy) y nota opcional.
3. **Previsualización**: antes de guardar se ve exactamente cuánto se va a acreditar (`3,2 kg × $9.500 = $30.400`).
4. Al registrar, `POST /api/collections` calcula el monto con el **precio vigente a la fecha**, el saldo del vecino se actualiza, se refresca la ficha del vecino y el resumen general.
5. **Cargado en esta sesión**: lista con todos los pesajes de la jornada y el total en kg y pesos, para controlar lo cargado sin salir de la pantalla.

El botón queda deshabilitado hasta que haya vecino y material seleccionados; los errores de validación de la API (peso, fecha futura, material inactivo) se muestran como aviso.

## 3. Precios (`#precios`)

- Tabla con todos los materiales (incluidos los inactivos), su categoría y el precio actual.
- **Editor por fila**: se escribe el nuevo valor y se guarda con `PATCH /api/materials/:id`. Si el precio no cambió, avisa y no hace el cambio.
- **Historial** desplegable por material (`GET /api/materials/:id/history`): últimos 5 precios con fecha y quién los cambió.
- **Agregar material**: nombre, categoría, precio por kg y unidad (`POST /api/materials`). El precio inicial queda registrado en el historial.

Los precios ya cargados nunca alteran los pesajes anteriores: cada pesaje guarda el precio aplicado en su momento.

## 4. Cobros (`#cobros`)

- **Solicitudes pendientes** (pendientes y aprobadas) con vecino, barrio, monto, medio, dato de transferencia (alias/CBU/CVU), titular, fecha de solicitud y período.
- Acciones: **Aprobar**, **Marcar pagado** (pide confirmación, ya que implica que la transferencia se hizo) y **Rechazar** (pide el motivo, que queda en `admin_notes`).
- **Historial** de cobros cerrados (pagados, rechazados y cancelados) en tabla.
- Total pendiente visible en la etiqueta del panel, en el badge de la pestaña y en la tarjeta del resumen.

Endpoints: `GET /api/payouts/overview` y `PATCH /api/payouts/:id` con `action: approve | reject | pay`.

## Verificación realizada

Renderizado de las cuatro pestañas en Chrome headless, inspeccionando el DOM ya ejecutado por el navegador:

| Pestaña | Verificación en el DOM |
| --- | --- |
| Ruta del día | chips con 2 barrios / 1 vecino / 1 por visitar y ficha de vecino con etiqueta *pendiente* |
| Cargar pesaje | 9 materiales en el select con su precio (`Cobre — $ 9.700,00/kg`), buscador y botón de registro presentes |
| Precios | 9 filas con editor de precio y botón de historial por material |
| Cobros | solicitud pendiente de Sofia Martinez por $ 50.356,00 (alias + titular), badge y etiqueta con el total, 4 filas de historial |

Además, `npm run test:api` cubre los endpoints que alimentan el panel (filtros por día y barrio, materiales inactivos, cronograma semanal, entregas de bolsas, historial de precios restringido a admin): **60 pruebas, 0 fallidas**.

## Notas de implementación

- Las acciones destructivas o ambiguas usan `window.prompt`/`confirm`. Para producción convendría reemplazarlos por modales propios del sistema de diseño.
- La sesión y el manejo de errores son los mismos que en el panel del cliente ([`public/assets/js/api.js`](../public/assets/js/api.js)): `requerirSesion('admin')` redirige a `/login.html` si no hay sesión de administrador.
