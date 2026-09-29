# MdP Recicla

Plataforma web de recolección y monetización de residuos reciclables en Mar del Plata, Argentina.

**Estado: Paso 1 completado** — estructura del proyecto backend + esquema de base de datos funcionando.

---

## Requisitos

- Node.js **>= 22.5** (usa el módulo nativo `node:sqlite`, sin dependencias nativas ni compilación)
- npm

## Puesta en marcha

```bash
npm install            # dependencias (solo express)
copy .env.example .env # opcional: configuración local
npm run db:setup       # crea el esquema y carga datos de prueba
npm start              # http://localhost:3000
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

### Usuarios demo

| Rol | Email | Contraseña |
| --- | --- | --- |
| Admin | `admin@mdprecicla.com` | `admin123` |
| Vecino | `vecino1@example.com` … `vecino4@example.com` | `vecino123` |

### Endpoints del Paso 1

- `GET /api/health` — estado del servicio
- `GET /api/db/status` — conteo de registros por tabla

---

## Estructura del proyecto

```
mdp-recicla/
├── package.json
├── .env.example
├── db/                        # archivo SQLite (generado, en .gitignore)
├── docs/
│   └── 01-esquema-bd.md       # diseño de datos y decisiones del Paso 1
├── public/                    # frontend estático (Pasos 3 y 4)
│   └── index.html
└── src/
    ├── server.js              # arranque del servidor HTTP
    ├── app.js                 # app Express, middlewares y rutas
    ├── config/
    │   └── env.js             # carga .env y expone configuración
    ├── db/
    │   ├── schema.sql         # DDL completo (tablas, índices, vistas, triggers)
    │   ├── index.js           # conexión node:sqlite + helpers (all/get/run/transaction)
    │   ├── migrate.js         # migrador versionado
    │   ├── seed.js            # datos de prueba
    │   └── reset.js           # reconstrucción total
    ├── routes/                # (Paso 2) auth, materials, collections, payouts
    ├── services/              # (Paso 2) lógica de negocio: saldos, precios, recorridos
    ├── middlewares/           # (Paso 2) auth JWT, roles, validación, errores
    └── utils/
        ├── cli.js
        └── password.js        # hash/verify con scrypt
```

## Flujo del negocio

1. El vecino se registra y elige su barrio/zona.
2. El admin asigna el día de recorrido por zona y entrega bolsas.
3. El admin retira las bolsas, pesa los materiales y carga el pesaje desde el celular.
4. El vecino ve en su panel los kilos acumulados y el equivalente en $ ARS.
5. A fin de mes el vecino solicita el cobro de su saldo o lo conserva.

## Roadmap

- [x] **Paso 1** — Esquema de base de datos y estructura del backend
- [ ] **Paso 2** — API de autenticación (`register`, `login`) y gestión de materiales/pesajes
- [ ] **Paso 3** — Vistas frontend del cliente (`/dashboard`)
- [ ] **Paso 4** — Vistas frontend del administrador (`/admin`)
