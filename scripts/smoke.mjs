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

console.log('\n===== Prueba end-to-end de la API (Paso 2) =====');
console.log(results.join('\n'));
console.log(`\n  ${passed} pruebas OK, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
