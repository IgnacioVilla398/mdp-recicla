/**
 * Panel de administracion (/admin).
 * Pestañas: ruta del dia, carga rapida de pesajes, precios y cobros.
 */
import {
  api, money, kg, fecha, fechaHora, etiquetaEstado, DIAS,
  mostrarAviso, ocultarAviso, escapar, qs, qsa, pintarErrores, ponerCargando,
  requerirSesion, activarBotonSalir, ApiError,
} from './api.js';

const aviso = qs('#aviso');

const estado = {
  usuario: null,
  materiales: [],
  barrios: [],
  vecino: null,
  dia: null,
  recorrido: null,
  cargadosEnSesion: [],
  panelActivo: 'recorrido',
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const diaISOHoy = () => { const d = new Date().getUTCDay(); return d === 0 ? 7 : d; };

/* ============================================================
   Pestañas
   ============================================================ */
function activarPanel(nombre, { recargar = true } = {}) {
  estado.panelActivo = nombre;
  qsa('.pestana').forEach((b) => b.classList.toggle('pestana--activa', b.dataset.panel === nombre));
  qsa('.panel').forEach((p) => p.classList.toggle('panel--activo', p.id === `panel-${nombre}`));
  if (location.hash.slice(1) !== nombre) history.replaceState(null, '', `#${nombre}`);

  if (!recargar) return;
  if (nombre === 'recorrido') cargarRecorrido();
  if (nombre === 'cobros') cargarCobros();
  if (nombre === 'precios') cargarPrecios();
}

qsa('.pestana').forEach((boton) => boton.addEventListener('click', () => {
  ocultarAviso(aviso);
  activarPanel(boton.dataset.panel);
}));

/* ============================================================
   Resumen general
   ============================================================ */
async function cargarMetricas() {
  try {
    const [resumen, cobros] = await Promise.all([
      api.get('/collections/overview'),
      api.get('/payouts/overview'),
    ]);

    qs('#metricas').innerHTML = `
      <div class="tarjeta">
        <div class="metrica__rotulo">Vecinos activos</div>
        <div class="metrica__valor">${resumen.active_clients}</div>
        <div class="metrica__pie">en recolección</div>
      </div>
      <div class="tarjeta">
        <div class="metrica__rotulo">Kilos del mes</div>
        <div class="metrica__valor">${kg(resumen.month.kg)}</div>
        <div class="metrica__pie">${resumen.month.deliveries} pesajes cargados</div>
      </div>
      <div class="tarjeta">
        <div class="metrica__rotulo">Acreditado del mes</div>
        <div class="metrica__valor">${money(resumen.month.amount)}</div>
        <div class="metrica__pie">a cuenta de los vecinos</div>
      </div>
      <div class="tarjeta tarjeta--destacada">
        <div class="metrica__rotulo">Cobros pendientes</div>
        <div class="metrica__valor">${money(cobros.totals.pending_amount)}</div>
        <div class="metrica__pie">${cobros.totals.pending_count} ${cobros.totals.pending_count === 1 ? 'solicitud' : 'solicitudes'} por pagar</div>
      </div>`;

    const badge = qs('#badge-cobros');
    const pendientes = cobros.totals.pending_count;
    badge.textContent = pendientes;
    badge.classList.toggle('oculto', pendientes === 0);
  } catch (error) {
    mostrarAviso(aviso, `No se pudo cargar el resumen: ${error.message}`, 'error');
  }
}

/* ============================================================
   Ruta del día
   ============================================================ */
function poblarSelectDia() {
  const select = qs('#dia-semana');
  select.innerHTML = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => `<option value="${d}">${DIAS[d]}</option>`)
    .join('');
  select.value = String(diaISOHoy());
  estado.dia = Number(select.value);
  select.addEventListener('change', () => {
    estado.dia = Number(select.value);
    cargarRecorrido();
  });
  qs('#filtro-barrio').addEventListener('change', renderRecorrido);
  qs('#solo-pendientes').addEventListener('change', renderRecorrido);
}

async function cargarRecorrido() {
  const contenedor = qs('#lista-recorrido');
  contenedor.className = 'cargando';
  contenedor.textContent = 'Cargando recorrido…';
  try {
    estado.recorrido = await api.get(`/routes/daily?weekday=${estado.dia}&date=${hoyISO()}`);
  } catch (error) {
    contenedor.className = 'vacio';
    contenedor.textContent = `No se pudo cargar el recorrido: ${error.message}`;
    return;
  }

  const { neighborhoods, clients, totals } = estado.recorrido;

  qs('#chips-recorrido').innerHTML = `
    <span class="chip"><strong>${totals.neighborhoods}</strong> barrios</span>
    <span class="chip"><strong>${totals.clients}</strong> vecinos</span>
    <span class="chip"><strong>${totals.pending_pickup}</strong> por visitar</span>`;

  const selectBarrio = qs('#filtro-barrio');
  const valorPrevio = selectBarrio.value;
  selectBarrio.innerHTML = '<option value="">Todos los barrios del día</option>' +
    neighborhoods.map((n) => `<option value="${n.id}">${escapar(n.name)} (${n.clients})</option>`).join('');
  selectBarrio.value = valorPrevio;

  renderRecorrido();
}

function renderRecorrido() {
  const contenedor = qs('#lista-recorrido');
  if (!estado.recorrido) return;

  const barrioFiltro = qs('#filtro-barrio').value;
  const soloPendientes = qs('#solo-pendientes').checked;

  let clientes = estado.recorrido.clients;
  if (barrioFiltro) clientes = clientes.filter((c) => String(c.neighborhood_id) === barrioFiltro);
  if (soloPendientes) clientes = clientes.filter((c) => !c.last_collection_on || c.last_collection_on < hoyISO());

  if (!clientes.length) {
    contenedor.className = 'vacio';
    contenedor.textContent = estado.recorrido.clients.length
      ? 'Ningún vecino coincide con los filtros elegidos.'
      : `No hay vecinos asignados al ${DIAS[estado.dia].toLowerCase()}.`;
    return;
  }

  // Agrupamos por barrio respetando el orden de la ruta
  const grupos = new Map();
  for (const c of clientes) {
    const clave = c.neighborhood ?? 'Sin barrio';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }

  contenedor.className = '';
  contenedor.innerHTML = Array.from(grupos.entries()).map(([barrio, lista]) => `
    <h3 style="margin-top:1rem">${escapar(barrio)} <span class="texto-chico">· ${lista.length}</span></h3>
    ${lista.map((c) => {
      const visitadoHoy = c.last_collection_on === hoyISO();
      return `
      <div class="ficha">
        <div class="ficha__datos">
          <strong>${escapar(c.name)} ${visitadoHoy ? '<span class="etiqueta etiqueta--ok">visitado hoy</span>' : '<span class="etiqueta etiqueta--pendiente">pendiente</span>'}</strong>
          <span class="lista__secundario">
            ${escapar(c.address ?? 'sin dirección')} · ${escapar(c.phone ?? 'sin teléfono')}<br />
            Última recolección: ${c.last_collection_on ? fecha(c.last_collection_on) : 'sin registro'} ·
            Bolsas (30 d): ${c.bags_last_30d} ·
            Saldo: ${money(c.available_balance)}
          </span>
        </div>
        <div class="acciones">
          <button class="boton boton--chico" data-pesar="${c.id}">Pesar</button>
          <button class="boton boton--secundario boton--chico" data-bolsas="${c.id}" data-nombre="${escapar(c.name)}">Bolsas</button>
        </div>
      </div>`;
    }).join('')}
  `).join('');

  contenedor.querySelectorAll('[data-pesar]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const cliente = estado.recorrido.clients.find((c) => String(c.id) === boton.dataset.pesar);
      elegirVecino(cliente);
      activarPanel('carga', { recargar: false });
      qs('#weight_kg').focus();
    });
  });

  contenedor.querySelectorAll('[data-bolsas]').forEach((boton) => {
    boton.addEventListener('click', () => entregarBolsas(boton.dataset.bolsas, boton.dataset.nombre, boton));
  });
}

async function entregarBolsas(userId, nombre, boton) {
  const respuesta = window.prompt(`¿Cuántas bolsas entregaste a ${nombre}?`, '5');
  if (respuesta === null) return;
  const cantidad = Number(respuesta);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    mostrarAviso(aviso, 'Ingresá una cantidad de bolsas válida.', 'error');
    return;
  }
  ponerCargando(boton, true, '…');
  try {
    await api.post('/bags', { user_id: Number(userId), quantity: cantidad, delivered_on: hoyISO() });
    mostrarAviso(aviso, `Registradas ${cantidad} bolsas para ${nombre}.`, 'ok', 4000);
    cargarRecorrido();
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
  } finally {
    ponerCargando(boton, false);
  }
}

/* ============================================================
   Carga rápida de pesajes
   ============================================================ */
let temporizadorBusqueda = null;

function configurarBusqueda() {
  const input = qs('#buscar-vecino');
  input.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    const texto = input.value.trim();
    if (texto.length < 2) {
      qs('#resultados-vecino').innerHTML = '';
      return;
    }
    temporizadorBusqueda = setTimeout(() => buscarVecinos(texto), 250);
  });
}

async function buscarVecinos(texto) {
  try {
    const { items } = await api.get(`/users?search=${encodeURIComponent(texto)}&limit=15`);
    const contenedor = qs('#resultados-vecino');
    if (!items.length) {
      contenedor.innerHTML = '<p class="vacio">No se encontraron vecinos.</p>';
      return;
    }
    contenedor.innerHTML = `<div class="resultados">${items.map((u) => `
      <button type="button" class="resultados__item" data-elegir="${u.id}">
        <strong>${escapar(u.name)}</strong>
        <span class="lista__secundario">${escapar(u.address ?? 'sin dirección')} · ${escapar(u.neighborhood ?? 'sin barrio')} · saldo ${money(u.available_balance)}</span>
      </button>`).join('')}</div>`;

    contenedor.querySelectorAll('[data-elegir]').forEach((boton) => {
      boton.addEventListener('click', () => {
        elegirVecino(items.find((u) => String(u.id) === boton.dataset.elegir));
        contenedor.innerHTML = '';
        qs('#buscar-vecino').value = '';
        qs('#weight_kg').focus();
      });
    });
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
  }
}

function elegirVecino(vecino) {
  estado.vecino = vecino;
  qs('#vecino-elegido').innerHTML = `
    <div class="ficha ficha--elegida" style="margin-top:.75rem">
      <div class="ficha__datos">
        <strong>${escapar(vecino.name)}</strong>
        <span class="lista__secundario">
          ${escapar(vecino.address ?? 'sin dirección')} · ${escapar(vecino.neighborhood ?? 'sin barrio')}<br />
          Saldo disponible: ${money(vecino.available_balance)} · ${kg(vecino.total_kg)} acumulados
        </span>
      </div>
      <button type="button" class="boton boton--secundario boton--chico" id="quitar-vecino">Cambiar</button>
    </div>`;
  qs('#quitar-vecino').addEventListener('click', () => {
    estado.vecino = null;
    qs('#vecino-elegido').innerHTML = '';
    actualizarFormularioPesaje();
  });
  actualizarFormularioPesaje();
}

function materialElegido() {
  const id = qs('#material_id').value;
  return estado.materiales.find((m) => String(m.id) === id) ?? null;
}

function actualizarFormularioPesaje() {
  const material = materialElegido();
  const etiqueta = qs('#etiqueta-precio');
  if (material) {
    etiqueta.textContent = `${money(material.price_per_kg)} / ${material.unit}`;
    etiqueta.className = 'etiqueta etiqueta--ok';
  } else {
    etiqueta.textContent = '—';
    etiqueta.className = 'etiqueta';
  }
  previsualizar();
  qs('#btn-pesaje').disabled = !estado.vecino || !material;
}

function previsualizar() {
  const material = materialElegido();
  const peso = Number(qs('#weight_kg').value);
  const contenedor = qs('#previsualizacion');
  if (!material || !Number.isFinite(peso) || peso <= 0) {
    contenedor.innerHTML = '';
    return;
  }
  contenedor.innerHTML = `
    <div class="aviso aviso--info aviso--visible" style="margin:0">
      Vas a acreditar <strong>${kg(peso)}</strong> de ${escapar(material.name)} =
      <strong>${money(peso * material.price_per_kg)}</strong>
    </div>`;
}

function configurarFormularioPesaje() {
  qs('#material_id').addEventListener('change', actualizarFormularioPesaje);
  qs('#weight_kg').addEventListener('input', previsualizar);
  qs('#collected_on').value = hoyISO();

  qs('#form-pesaje').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultarAviso(aviso);
    const boton = qs('#btn-pesaje');

    if (!estado.vecino) {
      mostrarAviso(aviso, 'Primero elegí el vecino.', 'error');
      return;
    }
    const peso = Number(qs('#weight_kg').value);
    if (!Number.isFinite(peso) || peso <= 0) {
      mostrarAviso(aviso, 'Ingresá un peso mayor a 0.', 'error');
      return;
    }

    ponerCargando(boton, true, 'Registrando…');
    try {
      const { collection } = await api.post('/collections', {
        user_id: estado.vecino.id,
        material_id: Number(qs('#material_id').value),
        weight_kg: peso,
        collected_on: qs('#collected_on').value || hoyISO(),
        notes: qs('#notes').value || undefined,
      });

      estado.cargadosEnSesion.unshift(collection);
      renderSesion();
      mostrarAviso(aviso,
        `Listo: ${kg(collection.weight_kg)} de ${collection.material_name} acreditados a ${collection.user_name} por ${money(collection.total_price)}.`,
        'ok', 6000);

      // Actualizamos el saldo mostrado del vecino elegido
      const resumen = await api.get(`/users?search=${encodeURIComponent(estado.vecino.email)}`);
      const actualizado = resumen.items.find((u) => u.id === estado.vecino.id);
      if (actualizado) elegirVecino(actualizado);

      qs('#weight_kg').value = '';
      qs('#notes').value = '';
      previsualizar();
      cargarMetricas();
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
      if (error instanceof ApiError && Object.keys(error.details).length) {
        mostrarAviso(aviso, `${error.message}: ${error.primerDetalle ?? ''}`, 'error');
      }
    } finally {
      ponerCargando(boton, false);
    }
  });
}

function renderSesion() {
  const lista = qs('#lista-sesion');
  const cargados = estado.cargadosEnSesion;
  if (!cargados.length) {
    lista.innerHTML = '<li><span class="texto-chico">Todavía no cargaste pesajes en esta sesión.</span></li>';
    qs('#resumen-sesion').textContent = '';
    return;
  }
  const totalKg = cargados.reduce((acc, c) => acc + Number(c.weight_kg), 0);
  const totalMonto = cargados.reduce((acc, c) => acc + Number(c.total_price), 0);
  qs('#resumen-sesion').textContent = `${cargados.length} pesajes · ${kg(totalKg)} · ${money(totalMonto)}`;
  lista.innerHTML = cargados.map((c) => `
    <li>
      <span>
        <span class="lista__principal">${escapar(c.user_name)}</span>
        <span class="lista__secundario">${escapar(c.material_name)} · ${fecha(c.collected_on)} · ${money(c.price_per_kg_applied)}/kg</span>
      </span>
      <span><strong>${money(c.total_price)}</strong> <span class="texto-chico">· ${kg(c.weight_kg)}</span></span>
    </li>`).join('');
}

/* ============================================================
   Precios
   ============================================================ */
async function cargarPrecios() {
  try {
    const { items } = await api.get('/materials?include_inactive=1');
    estado.materiales = items;
    const tbody = qs('#tabla-precios');
    tbody.innerHTML = items.map((m) => `
      <tr data-fila="${m.id}">
        <td>
          <strong>${escapar(m.name)}</strong>
          ${m.is_active ? '' : '<span class="etiqueta">inactivo</span>'}
          <div class="historial oculto" id="historial-${m.id}"></div>
        </td>
        <td>${escapar(m.category ?? '—')}</td>
        <td class="num">${money(m.price_per_kg)}</td>
        <td>
          <div class="precio-editor">
            <input type="number" step="0.01" min="0" inputmode="decimal" value="${m.price_per_kg}" data-precio="${m.id}" aria-label="Nuevo precio de ${escapar(m.name)}" />
          </div>
        </td>
        <td>
          <div class="acciones">
            <button class="boton boton--chico" data-guardar="${m.id}">Guardar</button>
            <button class="boton boton--secundario boton--chico" data-historial="${m.id}">Historial</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-guardar]').forEach((boton) => {
      boton.addEventListener('click', () => guardarPrecio(boton.dataset.guardar, boton));
    });
    tbody.querySelectorAll('[data-historial]').forEach((boton) => {
      boton.addEventListener('click', () => verHistorial(boton.dataset.historial));
    });
  } catch (error) {
    qs('#tabla-precios').innerHTML = `<tr><td colspan="5" class="vacio">No se pudieron cargar los materiales: ${escapar(error.message)}</td></tr>`;
  }
}

async function guardarPrecio(id, boton) {
  const input = qs(`[data-precio="${id}"]`);
  const precio = Number(input.value);
  const material = estado.materiales.find((m) => String(m.id) === id);
  if (!Number.isFinite(precio) || precio < 0) {
    mostrarAviso(aviso, 'Ingresá un precio válido (0 o más).', 'error');
    return;
  }
  if (material && precio === Number(material.price_per_kg)) {
    mostrarAviso(aviso, 'El precio no cambió.', 'info', 3000);
    return;
  }
  ponerCargando(boton, true, '…');
  try {
    const { material: actualizado } = await api.patch(`/materials/${id}`, { price_per_kg: precio });
    mostrarAviso(aviso, `Precio de ${actualizado.name} actualizado a ${money(actualizado.price_per_kg)} por kilo.`, 'ok', 5000);
    await cargarPrecios();
    cargarMetricas();
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
  } finally {
    ponerCargando(boton, false);
  }
}

async function verHistorial(id) {
  const contenedor = qs(`#historial-${id}`);
  if (!contenedor.classList.contains('oculto')) {
    contenedor.classList.add('oculto');
    return;
  }
  try {
    const { items } = await api.get(`/materials/${id}/history`);
    contenedor.innerHTML = `<strong>Últimos cambios:</strong><ul class="lista">${items.slice(0, 5).map((h) => `
      <li style="padding:.15rem 0;border:none">
        <span>${money(h.price_per_kg)} <span class="texto-chico">desde ${fecha(h.valid_from)}</span></span>
        <span class="texto-chico">${escapar(h.changed_by_name ?? 'sistema')}</span>
      </li>`).join('')}</ul>`;
    contenedor.classList.remove('oculto');
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
  }
}

function configurarFormularioMaterial() {
  qs('#form-material').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultarAviso(aviso);
    const boton = qs('#btn-material');
    const datos = Object.fromEntries(new FormData(evento.target));
    ponerCargando(boton, true, 'Agregando…');
    try {
      const { material } = await api.post('/materials', datos);
      mostrarAviso(aviso, `Material ${material.name} agregado a ${money(material.price_per_kg)} por ${material.unit}.`, 'ok', 5000);
      evento.target.reset();
      await cargarPrecios();
      await cargarMaterialesEnSelect();
    } catch (error) {
      if (error instanceof ApiError) pintarErrores(evento.target, error.details);
      mostrarAviso(aviso, error.message, 'error');
    } finally {
      ponerCargando(boton, false);
    }
  });
}

/* ============================================================
   Cobros
   ============================================================ */
async function cargarCobros() {
  try {
    const { pending, recent, totals } = await api.get('/payouts/overview');

    qs('#etiqueta-pendientes').textContent = `${pending.length} · ${money(totals.pending_amount)}`;

    const contenedor = qs('#lista-pendientes');
    if (!pending.length) {
      contenedor.className = 'vacio';
      contenedor.textContent = 'No hay solicitudes pendientes. 🎉';
    } else {
      contenedor.className = '';
      contenedor.innerHTML = pending.map((p) => `
        <div class="ficha">
          <div class="ficha__datos">
            <strong>${escapar(p.user_name)} ${etiquetaEstado(p.status)}</strong>
            <span class="lista__secundario">
              ${money(p.amount)} · ${escapar(p.neighborhood ?? 'sin barrio')}<br />
              ${escapar(p.payout_method.toUpperCase())}: ${escapar(p.payout_value)} · titular ${escapar(p.payout_holder)}<br />
              Solicitado el ${fechaHora(p.requested_at)} · período ${escapar(p.period_month ?? '—')}
            </span>
          </div>
          <div class="acciones">
            ${p.status === 'pending' ? `<button class="boton boton--secundario boton--chico" data-cobro="${p.id}" data-accion="approve">Aprobar</button>` : ''}
            <button class="boton boton--chico" data-cobro="${p.id}" data-accion="pay">Marcar pagado</button>
            <button class="boton boton--peligro boton--chico" data-cobro="${p.id}" data-accion="reject">Rechazar</button>
          </div>
        </div>`).join('');

      contenedor.querySelectorAll('[data-cobro]').forEach((boton) => {
        boton.addEventListener('click', () => accionCobro(boton.dataset.cobro, boton.dataset.accion, boton));
      });
    }

    const tbody = qs('#tabla-cobros');
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="vacio">Todavía no hay cobros cerrados.</td></tr>';
    } else {
      tbody.innerHTML = recent.map((p) => `
        <tr>
          <td>${fecha(p.requested_at)}</td>
          <td>${escapar(p.user_name)}</td>
          <td class="num">${money(p.amount)}</td>
          <td>${etiquetaEstado(p.status)}</td>
          <td>${escapar(p.payout_method.toUpperCase())}</td>
        </tr>`).join('');
    }

    cargarMetricas();
  } catch (error) {
    qs('#lista-pendientes').className = 'vacio';
    qs('#lista-pendientes').textContent = `No se pudieron cargar los cobros: ${error.message}`;
  }
}

async function accionCobro(id, accion, boton) {
  let notas = null;
  if (accion === 'reject') {
    notas = window.prompt('Motivo del rechazo (opcional):', '');
    if (notas === null) return;
  }
  if (accion === 'pay' && !window.confirm('¿Confirmás que la transferencia ya fue realizada?')) return;

  ponerCargando(boton, true, '…');
  try {
    const { payout } = await api.patch(`/payouts/${id}`, { action: accion, admin_notes: notas || undefined });
    const mensajes = {
      approve: `Solicitud de ${payout.user_name} aprobada.`,
      pay: `Cobro de ${money(payout.amount)} a ${payout.user_name} marcado como pagado.`,
      reject: `Solicitud de ${payout.user_name} rechazada.`,
    };
    mostrarAviso(aviso, mensajes[accion], 'ok', 6000);
    await cargarCobros();
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
  } finally {
    ponerCargando(boton, false);
  }
}

/* ============================================================
   Catálogos e inicio
   ============================================================ */
async function cargarMaterialesEnSelect() {
  const { items } = await api.get('/materials?include_inactive=1');
  estado.materiales = items.filter((m) => m.is_active);
  qs('#material_id').innerHTML = estado.materiales
    .map((m) => `<option value="${m.id}">${escapar(m.name)} — ${money(m.price_per_kg)}/${m.unit}</option>`)
    .join('');
  actualizarFormularioPesaje();
}

async function cargarBarrios() {
  try {
    const { items } = await api.get('/neighborhoods');
    estado.barrios = items;
  } catch { estado.barrios = []; }
}

const usuario = await requerirSesion('admin');
if (usuario) {
  estado.usuario = usuario;
  qs('#nombre-usuario').textContent = usuario.name;
  activarBotonSalir();

  poblarSelectDia();
  configurarBusqueda();
  configurarFormularioPesaje();
  configurarFormularioMaterial();

  await Promise.all([cargarMaterialesEnSelect(), cargarBarrios(), cargarMetricas()]);
  renderSesion();

  const inicial = location.hash.slice(1);
  activarPanel(['recorrido', 'carga', 'precios', 'cobros'].includes(inicial) ? inicial : 'recorrido');
}
