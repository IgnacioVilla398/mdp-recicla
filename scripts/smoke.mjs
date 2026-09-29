/**
 * Prueba end-to-end de la API del Paso 2.
 * Requiere el servidor levantado:  npm start  (en otra terminal)
 * Ejecutar:  npm run test:api
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const results = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* respuesta sin JSON */ }
  return { status: res.status, payload };
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    results.push(`  OK   ${name}`);
  } else {
    failed += 1;
    results.push(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

const stamp = Date.now();
const vecinoEmail = `smoke.${stamp}@example.com`;

// 1. Salud
const health = await call('GET', '/api/health');
check('GET /api/health responde 200', health.status === 200, `status ${health.status}`);

// 2. Registro de vecino
const neighborhoods = await call('GET', '/api/neighborhoods');
const barrio = neighborhoods.payload?.data?.items?.[0];
check('GET /api/neighborhoods devuelve barrios', (neighborhoods.payload?.data?.items?.length ?? 0) > 0);

const register = await call('POST', '/api/auth/register', {
  body: {
    name: 'Vecino Smoke',
    email: vecinoEmail,
    password: 'prueba123',
    phone: '+54 223 555-9999',
    address: 'Test 123',
    neighborhood_id: barrio?.id,
  },
});
check('POST /api/auth/register crea la cuenta', register.status === 201, JSON.stringify(register.payload));
const clientToken = register.payload?.data?.token;
check('register devuelve token', Boolean(clientToken));
check('register asigna rol client', register.payload?.data?.user?.role === 'client');

// 3. Registro duplicado
const duplicate = await call('POST', '/api/auth/register', {
  body: { name: 'Otro', email: vecinoEmail, password: 'prueba123' },
});
check('register rechaza email duplicado (409)', duplicate.status === 409, `status ${duplicate.status}`);

// 4. Login admin
const adminLogin = await call('POST', '/api/auth/login', { body: { email: 'admin@mdprecicla.com', password: 'admin123' } });
check('POST /api/auth/login admin', adminLogin.status === 200, JSON.stringify(adminLogin.payload));
const adminToken = adminLogin.payload?.data?.token;

// 5. Login con clave incorrecta
const badLogin = await call('POST', '/api/auth/login', { body: { email: 'admin@mdprecicla.com', password: 'incorrecta' } });
check('login con clave incorrecta devuelve 401', badLogin.status === 401, `status ${badLogin.status}`);

// 6. Endpoint protegido sin token
const noToken = await call('GET', '/api/auth/me');
check('GET /api/auth/me sin token devuelve 401', noToken.status === 401, `status ${noToken.status}`);

// 7. Rol: un vecino no puede listar usuarios
const forbidden = await call('GET', '/api/users', { token: clientToken });
check('GET /api/users como vecino devuelve 403', forbidden.status === 403, `status ${forbidden.status}`);

// 8. Materiales
const materials = await call('GET', '/api/materials');
const materialList = materials.payload?.data?.items ?? [];
check('GET /api/materials devuelve lista', materialList.length > 0);
const cobre = materialList.find((m) => /cobre/i.test(m.name)) ?? materialList[0];
const precioAntes = cobre.price_per_kg;

// 9. Actualizar precio (admin)
const newPrice = Number(precioAntes) + 100;
const updatePrice = await call('PATCH', `/api/materials/${cobre.id}`, {
  token: adminToken,
  body: { price_per_kg: newPrice },
});
check('PATCH /api/materials/:id actualiza el precio', updatePrice.payload?.data?.material?.price_per_kg === newPrice,
  JSON.stringify(updatePrice.payload));

// 10. Historial de precios
const history = await call('GET', `/api/materials/${cobre.id}/history`, { token: adminToken });
const historyItems = history.payload?.data?.items ?? [];
check('GET /api/materials/:id/history registra el cambio',
  historyItems.length > 0 && Number(historyItems[0].price_per_kg) === newPrice,
  JSON.stringify(historyItems[0]));

// 11. Precio publico no expone inactivos
const inactive = await call('GET', '/api/materials?include_inactive=1');
check('include_inactive ignorado para no-admin', inactive.payload?.data?.items?.length === materialList.length);

// 12. Buscar al vecino recien creado
const search = await call('GET', `/api/users?search=${encodeURIComponent(vecinoEmail)}`, { token: adminToken });
const foundUser = search.payload?.data?.items?.[0];
check('GET /api/users encuentra al vecino', foundUser?.email === vecinoEmail, JSON.stringify(search.payload));

// 13. Carga de pesaje (flujo del celular)
const weight = 7.5;
const collection = await call('POST', '/api/collections', {
  token: adminToken,
  body: { user_id: foundUser?.id, material_id: cobre.id, weight_kg: weight, notes: 'Prueba automatica' },
});
const created = collection.payload?.data?.collection;
check('POST /api/collections registra el pesaje', collection.status === 201, JSON.stringify(collection.payload));
check('el monto aplicado usa el precio vigente',
  Number(created?.price_per_kg_applied) === newPrice && Number(created?.total_price) === Math.round(weight * newPrice * 100) / 100,
  JSON.stringify({ aplicado: created?.price_per_kg_applied, total: created?.total_price, esperado: weight * newPrice }));

// 14. Peso invalido
const badWeight = await call('POST', '/api/collections', {
  token: adminToken,
  body: { user_id: foundUser?.id, material_id: cobre.id, weight_kg: -3 },
});
check('peso invalido devuelve 400', badWeight.status === 400, `status ${badWeight.status}`);

// 15. El vecino ve su resumen con el saldo actualizado
const summary = await call('GET', '/api/collections/summary/me', { token: clientToken });
const totals = summary.payload?.data?.totals;
check('GET /api/collections/summary/me devuelve el saldo',
  summary.status === 200 && Number(totals?.available_balance) === Math.round(weight * newPrice * 100) / 100,
  JSON.stringify(totals));
check('el resumen incluye el dia de recoleccion',
  typeof summary.payload?.data?.user?.collection_weekday === 'number',
  JSON.stringify(summary.payload?.data?.user));
check('el historial incluye el pesaje cargado', (summary.payload?.data?.history?.length ?? 0) === 1);

// 16. El vecino no puede borrar pesajes
const deleteAsClient = await call('DELETE', `/api/collections/${created?.id}`, { token: clientToken });
check('DELETE /api/collections/:id como vecino devuelve 403', deleteAsClient.status === 403, `status ${deleteAsClient.status}`);

// 17. Ruta del dia
const dailyRoute = await call('GET', '/api/routes/daily?weekday=2', { token: adminToken });
check('GET /api/routes/daily devuelve barrios y vecinos',
  dailyRoute.status === 200 && Array.isArray(dailyRoute.payload?.data?.clients),
  JSON.stringify(dailyRoute.payload));

// 18. Overview admin
const overview = await call('GET', '/api/collections/overview', { token: adminToken });
check('GET /api/collections/overview responde 200', overview.status === 200 && typeof overview.payload?.data?.month?.kg === 'number');

// 19. Carga por lote
const batch = await call('POST', '/api/collections/batch', {
  token: adminToken,
  body: {
    user_id: foundUser?.id,
    items: [
      { material_id: materialList[0].id, weight_kg: 1 },
      { material_id: materialList[1].id, weight_kg: 2.5 },
    ],
  },
});
check('POST /api/collections/batch carga varios materiales',
  batch.status === 201 && batch.payload?.data?.items?.length === 2,
  JSON.stringify(batch.payload));

// 20. El vecino puede solicitar perfil propio por /auth/me
const me = await call('GET', '/api/auth/me', { token: clientToken });
check('GET /api/auth/me devuelve el usuario', me.payload?.data?.user?.email === vecinoEmail);

// ------------------------------------------------------------------
// Solicitudes de cobro (Pasos 3-4)
// ------------------------------------------------------------------
const payoutConfig = await call('GET', '/api/payouts/config', { token: clientToken });
check('GET /api/payouts/config expone el minimo', typeof payoutConfig.payload?.data?.min_payout_amount === 'number');

const beforePayout = await call('GET', '/api/collections/summary/me', { token: clientToken });
const saldoDisponible = Number(beforePayout.payload?.data?.totals?.available_balance ?? 0);
check('el vecino acumula saldo cobrable', saldoDisponible > 0, `saldo ${saldoDisponible}`);

// Se valida el CBU antes de crear una solicitud pendiente (una sola a la vez)
const cbuInvalido = await call('POST', '/api/payouts', {
  token: clientToken, body: { amount: 100, payout_method: 'cbu', payout_value: '123' },
});
check('valida el CBU de 22 digitos (400)', cbuInvalido.status === 400, `status ${cbuInvalido.status}`);

const payoutRequest = await call('POST', '/api/payouts', {
  token: clientToken,
  body: { amount: saldoDisponible, payout_method: 'alias', payout_value: 'vecino.smoke.mp', payout_holder: 'Vecino Smoke' },
});
check('POST /api/payouts crea la solicitud', payoutRequest.status === 201, JSON.stringify(payoutRequest.payload));
const payoutId = payoutRequest.payload?.data?.payout?.id;
check('la solicitud queda pendiente por el saldo completo',
  payoutRequest.payload?.data?.payout?.status === 'pending' &&
  Number(payoutRequest.payload?.data?.payout?.amount) === saldoDisponible);

const afterPayout = await call('GET', '/api/collections/summary/me', { token: clientToken });
check('el saldo disponible pasa a 0 y el pendiente refleja la solicitud',
  Number(afterPayout.payload?.data?.totals?.available_balance) === 0 &&
  Number(afterPayout.payload?.data?.totals?.pending_balance) === saldoDisponible,
  JSON.stringify(afterPayout.payload?.data?.totals));

const duplicado = await call('POST', '/api/payouts', { token: clientToken, body: { amount: 1000 } });
check('no permite dos solicitudes pendientes (409)', duplicado.status === 409, `status ${duplicado.status}`);

const datosCobro = await call('PATCH', '/api/auth/me', { token: clientToken, body: { payout: { method: 'cbu', value: '1'.repeat(22), holder: 'Vecino Smoke' } } });
check('PATCH /api/auth/me guarda datos de cobro', datosCobro.status === 200, JSON.stringify(datosCobro.payload));

const payoutsCliente = await call('GET', '/api/payouts', { token: clientToken });
check('GET /api/payouts lista la solicitud propia', payoutsCliente.payload?.data?.items?.length === 1);

const reviewAsClient = await call('PATCH', `/api/payouts/${payoutId}`, { token: clientToken, body: { action: 'pay' } });
check('un vecino no puede revisar solicitudes (403)', reviewAsClient.status === 403, `status ${reviewAsClient.status}`);

const paid = await call('PATCH', `/api/payouts/${payoutId}`, { token: adminToken, body: { action: 'pay', receipt_url: 'https://ejemplo.com/comprobante.pdf' } });
check('el admin marca la solicitud como pagada',
  paid.payload?.data?.payout?.status === 'paid' && Boolean(paid.payload?.data?.payout?.paid_at),
  JSON.stringify(paid.payload?.data?.payout));

const sinSaldo = await call('POST', '/api/payouts', { token: clientToken, body: {} });
check('sin saldo disponible rechaza la solicitud (400)', sinSaldo.status === 400, `status ${sinSaldo.status}`);

const payoutsOverview = await call('GET', '/api/payouts/overview', { token: adminToken });
check('GET /api/payouts/overview responde 200', payoutsOverview.status === 200 && typeof payoutsOverview.payload?.data?.totals?.paid_amount === 'number');

// ------------------------------------------------------------------
// Entrega de bolsas
// ------------------------------------------------------------------
const bagsAsClient = await call('POST', '/api/bags', { token: clientToken, body: { user_id: foundUser?.id, quantity: 2 } });
check('un vecino no puede registrar entregas de bolsas (403)', bagsAsClient.status === 403, `status ${bagsAsClient.status}`);

const bagsAsAdmin = await call('POST', '/api/bags', {
  token: adminToken,
  body: { user_id: foundUser?.id, quantity: 3, notes: 'Entrega de prueba' },
});
check('POST /api/bags registra la entrega', bagsAsAdmin.status === 201, JSON.stringify(bagsAsAdmin.payload));

const bagsSummary = await call('GET', '/api/bags/summary/me', { token: clientToken });
check('el vecino ve sus bolsas entregadas', Number(bagsSummary.payload?.data?.last_30d) === 3, JSON.stringify(bagsSummary.payload?.data));

// ------------------------------------------------------------------
// Cancelacion de una solicitud pendiente (segundo vecino demo)
// ------------------------------------------------------------------
const vecino2 = await call('POST', '/api/auth/login', { body: { email: 'vecino2@example.com', password: 'vecino123' } });
const vecino2Token = vecino2.payload?.data?.token;
const resumenV2 = await call('GET', '/api/collections/summary/me', { token: vecino2Token });
const saldoV2 = Number(resumenV2.payload?.data?.totals?.available_balance ?? 0);
if (saldoV2 > 0) {
  const pedido = await call('POST', '/api/payouts', { token: vecino2Token, body: { amount: saldoV2 } });
  const idPedido = pedido.payload?.data?.payout?.id;
  check('el segundo vecino puede solicitar su cobro', pedido.status === 201, JSON.stringify(pedido.payload));
  const cancelado = await call('POST', `/api/payouts/${idPedido}/cancel`, { token: vecino2Token });
  check('el vecino cancela su solicitud pendiente', cancelado.payload?.data?.payout?.status === 'cancelled');
  const resumenPost = await call('GET', '/api/collections/summary/me', { token: vecino2Token });
  check('al cancelar, el saldo vuelve a estar disponible',
    Number(resumenPost.payload?.data?.totals?.available_balance) === saldoV2,
    JSON.stringify(resumenPost.payload?.data?.totals));
} else {
  check('el segundo vecino tiene saldo para solicitar', false, 'saldo 0');
}

// ------------------------------------------------------------------
// Panel de administracion (Paso 4)
// ------------------------------------------------------------------
const usersByWeekday = await call('GET', '/api/users?weekday=1', { token: adminToken });
check('GET /api/users?weekday filtra por dia de recorrido',
  usersByWeekday.status === 200 && usersByWeekday.payload?.data?.items?.every((u) => u.collection_weekday === 1),
  JSON.stringify(usersByWeekday.payload?.data?.items?.map((u) => u.collection_weekday)));

const usersByNeighborhood = await call('GET', `/api/users?neighborhood_id=${barrio?.id}`, { token: adminToken });
check('GET /api/users?neighborhood_id filtra por barrio',
  usersByNeighborhood.status === 200 &&
  usersByNeighborhood.payload?.data?.items?.every((u) => u.neighborhood_id === barrio?.id),
  JSON.stringify(usersByNeighborhood.payload?.data?.items?.map((u) => u.neighborhood_id)));

const allMaterials = await call('GET', '/api/materials?include_inactive=1', { token: adminToken });
check('el admin ve materiales inactivos', allMaterials.payload?.data?.items?.length >= materialList.length);

const weeklyRoute = await call('GET', '/api/routes/week', { token: adminToken });
check('GET /api/routes/week devuelve el cronograma semanal',
  weeklyRoute.payload?.data?.week?.length === 7, JSON.stringify(weeklyRoute.payload?.data));

const bagsHistory = await call('GET', '/api/bags', { token: adminToken });
check('GET /api/bags lista las entregas', bagsHistory.status === 200 && bagsHistory.payload?.data?.total_bags >= 3);

const materialHistory = await call('GET', `/api/materials/${materialList[0].id}/history`, { token: adminToken });
check('GET /api/materials/:id/history es solo para admin',
  (await call('GET', `/api/materials/${materialList[0].id}/history`, { token: clientToken })).status === 403);

// ------------------------------------------------------------------
// Frontend estatico (Paneles y landing)
// ------------------------------------------------------------------
const rutasEstaticas = [
  '/', '/login.html', '/registro.html', '/dashboard.html', '/admin.html',
  '/assets/css/styles.css', '/assets/css/landing.css',
  '/assets/js/api.js', '/assets/js/dashboard.js', '/assets/js/admin.js', '/assets/js/landing.js',
  '/img/hero-1600.webp', '/img/hero-900.jpg', '/img/nosotros.webp',
  '/img/material-aluminio.webp', '/img/material-plastico.jpg', '/img/material-cobre.webp',
];
for (const ruta of rutasEstaticas) {
  const res = await fetch(`${BASE}${ruta}`);
  check(`GET ${ruta} se sirve correctamente`, res.status === 200, `status ${res.status}`);
}

// La landing servida debe traer todas las secciones pedidas
const landing = await (await fetch(`${BASE}/`)).text();
for (const [nombre, marca] of [
  ['hero', 'id="inicio"'],
  ['nosotros', 'id="nosotros"'],
  ['como funciona', 'id="como-funciona"'],
  ['precios', 'id="precios"'],
  ['zonas', 'id="zonas"'],
  ['faq', 'id="faq"'],
  ['whatsapp flotante', 'class="whatsapp"'],
  ['modal de acceso', 'id="modal"'],
]) {
  check(`la landing incluye la seccion ${nombre}`, landing.includes(marca));
}

console.log('\n===== Prueba end-to-end de la API (Pasos 2-4 + landing) =====');
console.log(results.join('\n'));
console.log(`\n  ${passed} pruebas OK, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
