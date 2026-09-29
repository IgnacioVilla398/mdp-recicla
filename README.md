# MdP Recicla

Plataforma web de recolección y monetización de residuos reciclables en Mar del Plata, Argentina.

**Estado: Pasos 1, 2 y 3 completados** — base de datos, API completa (auth, materiales, pesajes, cobros y bolsas) y panel del cliente funcionando, con 53 pruebas automáticas en verde.

---

## Requisitos

- Node.js **>= 22.5** (usa el módulo nativo `node:sqlite`: sin dependencias nativas ni compilación)
- npm

## Puesta en marcha

```bash
npm install            # dependencias (solo express)
copy .env.example .env # opcional: configuración local
npm run db:setup       # crea el esquema y carga datos de prueba
npm start              # http://localhost:3000
```

Verificar la API (con el servidor levantado, en otra terminal):

```bash
npm run test:api
```

Scripts disponibles:

| Script | Descripción |
| --- | --- |
| `npm start` | Levanta la API |
| `npm run dev` | API con recarga automática (`--watch`) |
| `npm run db:migrate` | Aplica `src/db/schema.sql` (idempotente) |
| `npm run db:seed` | Carga datos de prueba si la base está vacía |
| `npm run db:seed -- --force` | Borra los datos del MVP y recarga |
| `npm run db:reset` | Reconstruye la base desde cero |
| `npm run test:api` | Prueba end-to-end de la API (53 verificaciones) |

### Páginas

| Ruta | Descripción |
| --- | --- |
| `/` | Landing con precios por kilo en vivo |
| `/login.html` · `/registro.html` | Ingreso y alta de vecino |
| `/dashboard.html` | **Panel del cliente** (Paso 3) |
| `/admin.html` | Panel de administración (Paso 4 — placeholder por ahora) |

### Usuarios demo

| Rol | Email | Contraseña |
| --- | --- | --- |
| Admin | `admin@mdprecicla.com` | `admin123` |
| Vecino | `vecino1@example.com` … `vecino4@example.com` | `vecino123` |

### Endpoints principales

| Método | Ruta | Rol |
| --- | --- | --- |
| GET | `/api/health` · `/api/db/status` | público |
| POST | `/api/auth/register` · `/api/auth/login` | público |
| GET | `/api/auth/me` | autenticado |
| GET | `/api/materials` · `/api/neighborhoods` | público |
| PATCH | `/api/materials/:id` · `/api/materials/:id/history` | admin |
| POST | `/api/collections` · `/api/collections/batch` | admin (carga de pesajes) |
| GET | `/api/collections/summary/me` | vecino |
| POST | `/api/payouts` · `/api/payouts/:id/cancel` | vecino (solicitud de cobro) |
| PATCH | `/api/payouts/:id` | admin (aprobar / rechazar / pagar) |
| GET | `/api/collections/overview` · `/api/users` · `/api/routes/daily` · `/api/payouts/overview` | admin |
| POST | `/api/bags` | admin (entrega de bolsas) |

Referencia completa con ejemplos `curl` y reglas de negocio: [`docs/02-api.md`](docs/02-api.md).

---

## Estructura del proyecto

```
mdp-recicla/
├── package.json
├── .env.example
├── db/                        # archivo SQLite (generado, en .gitignore)
├── docs/
│   ├── 01-esquema-bd.md       # diseño de datos (Paso 1)
│   ├── 02-api.md              # referencia de la API (Paso 2)
│   ├── 03-frontend-cliente.md # vistas del cliente (Paso 3)
│   └── capturas/              # pantallas renderizadas
├── scripts/
│   └── smoke.mjs              # prueba end-to-end de la API
├── public/                    # frontend (Pasos 3 y 4)
│   ├── index.html             # landing
│   ├── login.html             # ingreso
│   ├── registro.html          # alta de vecino
│   ├── dashboard.html         # panel del cliente
│   ├── admin.html             # panel admin (Paso 4)
│   └── assets/
│       ├── css/styles.css     # sistema de diseño mobile-first
│       └── js/
│           ├── api.js         # cliente HTTP, formato y guardas de sesión
│           └── dashboard.js   # render del panel del cliente
└── src/
    ├── server.js              # arranque del servidor HTTP
    ├── app.js                 # app Express, middlewares y montaje de rutas
    ├── config/
    │   └── env.js             # carga .env y expone configuración
    ├── db/
    │   ├── schema.sql         # DDL: tablas, índices, vistas, triggers
    │   ├── index.js           # conexión node:sqlite + helpers
    │   ├── migrate.js         # migrador versionado
    │   ├── seed.js            # datos de prueba
    │   └── reset.js           # reconstrucción total
    ├── middlewares/
    │   ├── auth.js            # JWT, requireRole, roles admin/client
    │   └── error.js           # manejo central de errores y 404
    ├── routes/
    │   ├── index.js           # router raíz /api
    │   ├── auth.routes.js     # register, login, perfil
    │   ├── materials.routes.js# materiales, precios, historial
    │   ├── collections.routes.js # pesajes, resúmenes, métricas
    │   ├── payouts.routes.js  # solicitudes de cobro
    │   ├── bags.routes.js     # entrega de bolsas
    │   └── users.routes.js    # vecinos, barrios, ruta del día
    ├── services/
    │   ├── auth.service.js
    │   ├── users.service.js
    │   ├── materials.service.js
    │   ├── collections.service.js
    │   ├── payouts.service.js
    │   └── bags.service.js
    └── utils/
        ├── jwt.js             # JWT HS256 con node:crypto
        ├── password.js        # hash/verify con scrypt
        ├── http.js            # ApiError, asyncHandler, respuesta estándar
        ├── validate.js        # validadores y redondeos
        └── cli.js
```

## Flujo del negocio

1. El vecino se registra y elige su barrio/zona.
2. El admin asigna el día de recorrido por zona y entrega bolsas.
3. El admin retira las bolsas, pesa los materiales y carga el pesaje desde el celular.
4. El vecino ve en su panel los kilos acumulados y el equivalente en $ ARS.
5. A fin de mes el vecino solicita el cobro de su saldo o lo conserva.

Decisiones clave ya implementadas:

- **Precio histórico**: cada pesaje guarda el precio vigente a su fecha, así actualizar la lista de precios no altera meses ya liquidados.
- **Aislamiento por rol**: el vecino solo accede a sus propios datos; el rol se revalida contra la base en cada request.
- **Saldo disponible**: descuenta pagos confirmados y solicitudes pendientes, evitando cobrar dos veces el mismo saldo.

## Roadmap

- [x] **Paso 1** — Esquema de base de datos y estructura del backend
- [x] **Paso 2** — API de autenticación (`register`, `login`) y gestión de materiales/pesajes
- [x] **Paso 3** — Vistas frontend del cliente (`/dashboard`): resumen, cronograma, historial y solicitud de cobro
- [ ] **Paso 4** — Vistas frontend del administrador (`/admin`): ruta del día, carga rápida de peso, precios y pagos
