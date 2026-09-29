# Paso 3 — Vistas del cliente (frontend)

Frontend **estático servido por la propia API** (carpeta `public/`), sin paso de build:

- **HTML5 + CSS3 modular** en un único archivo con variables (`public/assets/css/styles.css`), *mobile-first* (estilos base para celular, mejoras por `min-width`).
- **JavaScript ES modules nativos** (`public/assets/js/`), sin bundler ni framework.

> Se eligió JS nativo en lugar de React porque el MVP no necesita estado complejo y así se evita un toolchain de build. La API ya está desacoplada, por lo que migrar las vistas a React más adelante no requiere tocar el backend.

## Páginas

| Ruta | Archivo | Descripción |
| --- | --- | --- |
| `/` | [`public/index.html`](../public/index.html) | Landing con el flujo del servicio y la lista de precios por kilo en vivo |
| `/login.html` | [`public/login.html`](../public/login.html) | Ingreso; redirige a `/admin.html` o `/dashboard.html` según el rol |
| `/registro.html` | [`public/registro.html`](../public/registro.html) | Alta de vecino con selector de barrio y día de recolección |
| `/dashboard.html` | [`public/dashboard.html`](../public/dashboard.html) | **Panel del cliente** |
| `/admin.html` | [`public/admin.html`](../public/admin.html) | Placeholder del panel de administración (Paso 4) |

Capturas: [`docs/capturas/`](capturas) (landing, login y dashboard renderizados con datos reales).

## Panel del cliente (`/dashboard`)

1. **Resumen** — cuatro tarjetas: kilos del mes, valor del mes en $ ARS, **saldo disponible** (destacado) y acumulado histórico con total ya cobrado. Selector de mes (`<input type="month">`) que recalcula todo el panel.
2. **Día de recolección + calendario** — el día de la semana del barrio del vecino, un calendario del mes que resalta los días de recorrido y el día de hoy, y el estado de las bolsas entregadas (últimos 30 días y última entrega).
3. **Solicitud de cobro** — formulario con monto (precargado con el saldo disponible), medio (alias/CBU/CVU), dato y titular. Reglas aplicadas en la UI:
   - monto mínimo: viene de `GET /api/payouts/config`;
   - el botón se deshabilita si el saldo no alcanza o si ya hay una solicitud pendiente;
   - debajo, la lista de solicitudes con estado y botón **Cancelar** para las pendientes.
4. **Historial de entregas** — tabla con fecha, material, kilos, $/kg aplicado y monto acreditado (precio histórico congelado al momento del pesaje).
5. **Mis kilos por material** — totales acumulados por tipo de material.

## Arquitectura del frontend

```
public/
├── index.html          # landing
├── login.html          # ingreso
├── registro.html       # alta de vecino
├── dashboard.html      # panel del cliente
├── admin.html          # placeholder del Paso 4
└── assets/
    ├── css/styles.css  # sistema de diseño mobile-first (variables, tarjetas, tablas, calendario)
    └── js/
        ├── api.js      # cliente HTTP + formato ARS/kg/fechas + guardas de sesión + helpers de UI
        └── dashboard.js# render del panel del cliente
```

### Sesión

El login devuelve un **JWT** que se guarda en `localStorage` y, además, el servidor setea la cookie `HttpOnly` `mdp_token`. Cada request envía el header `Authorization: Bearer` (si hay token guardado) **y** la cookie, por lo que la sesión sobrevive aunque el `localStorage` esté vacío. `requerirSesion(rol)` protege cada página: sin sesión redirige a `/login.html?volver=<ruta>` y con rol equivocado al panel que le corresponde.

### Manejo de errores de la API

`api.js` envuelve `fetch` y convierte cualquier respuesta no-2xx en un `ApiError` con `status` y `details`. Las páginas pintan el mensaje en un aviso y, si hay `details`, marcan campo por campo (`pintarErrores`). Un `401` limpia la sesión automáticamente.

## Verificación realizada

Además de las pruebas de API (`npm run test:api`), se renderizaron las páginas en un Chrome headless y se inspeccionó el DOM resultante:

| Verificación | Resultado |
| --- | --- |
| Landing con materiales y precios desde la API | 10 ítems listados |
| Registro con barrios cargados | 10 opciones + día de recolección |
| Dashboard con datos reales | saludo, 4 métricas, calendario con día de recorrido, historial y totales por material |
| Estado del formulario de cobro | con solicitud pendiente: botón deshabilitado y aviso "Tenés una solicitud pendiente" |
| Formato de moneda y kilos | `$ 50.356,00` / `18,05 kg` (formato es-AR) |

## Pendiente para el Paso 4

- `public/admin.html` completo: ruta del día, carga rápida de pesajes desde el celular, gestión de precios y de solicitudes de cobro.
- Los endpoints ya están disponibles (`/api/routes/daily`, `/api/collections`, `/api/materials`, `/api/payouts`).
