/**
 * Panel del cliente (/dashboard).
 * Resumen de kilos y saldo, cronograma del barrio, historial de entregas
 * y solicitud de cobro del saldo acumulado.
 */
import {
  api, money, kg, fecha, fechaHora, mesLargo, etiquetaEstado, DIAS,
  mostrarAviso, ocultarAviso, escapar, qs, pintarErrores, ponerCargando,
  requerirSesion, activarBotonSalir, ApiError,
} from './api.js';

const aviso = qs('#aviso');
const formCobro = qs('#form-cobro');
const btnCobro = qs('#btn-cobro');
let resumen = null;
let minimoCobro = 0;

/* ---------------- Utilidades de calendario ---------------- */

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Construye la grilla del mes: marca los dias de recorrido del barrio
 * (weekday ISO 1-7) y resalta el dia de hoy.
 */
function renderCalendario(anioMes, weekday) {
  const contenedor = qs('#calendario');
  if (!contenedor) return;

  const [anio, mes] = anioMes.split('-').map(Number);
  const primerDia = new Date(anio, mes - 1, 1);
  const diasEnMes = new Date(anio, mes, 0).getDate();
  // getDay(): 0=domingo ... 6=sabado  ->  convertir a ISO 1=lunes ... 7=domingo
  const offset = (primerDia.getDay() + 6) % 7;
  const hoy = new Date();
  const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() === mes - 1;

  const celdas = DIAS_SEMANA.map((d) => `<div class="calendario__dia-semana">${d}</div>`);
  for (let i = 0; i < offset; i += 1) celdas.push('<div class="calendario__dia calendario__dia--vacio"></div>');

  for (let dia = 1; dia <= diasEnMes; dia += 1) {
    const iso = new Date(anio, mes - 1, dia).getDay() || 7;
    const esRecorrido = iso === Number(weekday);
    const esHoy = esMesActual && hoy.getDate() === dia;
    celdas.push(
      `<div class="calendario__dia ${esRecorrido ? 'calendario__dia--recorrido' : ''} ${esHoy ? 'calendario__dia--hoy' : ''}"
        title="${esRecorrido ? 'Recorrido en tu barrio' : ''}">${dia}</div>`
    );
  }
  contenedor.innerHTML = celdas.join('');
}

/* ---------------- Render de secciones ---------------- */

function renderMetricas(data) {
  const contenedor = qs('#metricas');
  const html = `
    <div class="tarjeta">
      <div class="metrica__rotulo">Kilos del mes</div>
      <div class="metrica__valor">${kg(data.month.kg)}</div>
      <div class="metrica__pie">${data.month.deliveries} ${data.month.deliveries === 1 ? 'entrega' : 'entregas'} en ${mesLargo(data.period_month)}</div>
    </div>
    <div class="tarjeta">
      <div class="metrica__rotulo">Valor del mes</div>
      <div class="metrica__valor">${money(data.month.amount)}</div>
      <div class="metrica__pie">acreditado en ${mesLargo(data.period_month)}</div>
    </div>
    <div class="tarjeta tarjeta--destacada">
      <div class="metrica__rotulo">Saldo disponible</div>
      <div class="metrica__valor">${money(data.totals.available_balance)}</div>
      <div class="metrica__pie">${data.totals.pending_balance > 0 ? `incluye ${money(data.totals.pending_balance)} en solicitudes pendientes` : 'listo para cobrar'}</div>
    </div>
    <div class="tarjeta">
      <div class="metrica__rotulo">Acumulado histórico</div>
      <div class="metrica__valor">${money(data.totals.total_earned)}</div>
      <div class="metrica__pie">${kg(data.totals.total_kg)} entregados · ${money(data.totals.total_paid)} ya cobrados</div>
    </div>`;
  contenedor.innerHTML = html;
}

function renderCronograma(data) {
  const { user } = data;
  const etiqueta = qs('#etiqueta-dia');
  const texto = qs('#texto-cronograma');

  if (user.collection_weekday) {
    etiqueta.textContent = DIAS[user.collection_weekday];
    etiqueta.className = 'etiqueta etiqueta--ok';
    texto.innerHTML = `Pasamos todos los <strong>${DIAS[user.collection_weekday].toLowerCase()}</strong> por <strong>${escapar(user.neighborhood ?? 'tu zona')}</strong>. Dejá las bolsas en la puerta antes de las 9 h.`;
  } else {
    etiqueta.textContent = 'Sin asignar';
    etiqueta.className = 'etiqueta etiqueta--pendiente';
    texto.textContent = 'Todavía no hay un día de recorrido asignado a tu barrio. Te avisamos cuando lo definamos.';
  }

  renderCalendario(data.period_month, user.collection_weekday);
}

function renderHistorial(data) {
  const tbody = qs('#tabla-historial tbody');
  qs('#resumen-historial').textContent = data.history.length
    ? `Últimas ${data.history.length} entregas`
    : '';

  if (!data.history.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Todavía no registramos entregas en tu cuenta.</td></tr>';
    return;
  }

  tbody.innerHTML = data.history.map((c) => `
    <tr>
      <td>${fecha(c.collected_on)}</td>
      <td>${escapar(c.material_name)}</td>
      <td class="num">${kg(c.weight_kg)}</td>
      <td class="num">${money(c.price_per_kg_applied)}</td>
      <td class="num"><strong>${money(c.total_price)}</strong></td>
    </tr>`).join('');
}

function renderPorMaterial(data) {
  const contenedor = qs('#por-material');
  if (!data.by_material.length) {
    contenedor.className = 'vacio';
    contenedor.textContent = 'Sin materiales registrados todavía.';
    return;
  }
  contenedor.className = '';
  contenedor.innerHTML = `<ul class="lista">${data.by_material.map((m) => `
    <li>
      <span class="lista__principal">${escapar(m.material_name)}</span>
      <span><strong>${money(m.total_price)}</strong> <span class="texto-chico">· ${kg(m.total_kg)}</span></span>
    </li>`).join('')}</ul>`;
}

function renderSolicitudes(data) {
  const lista = qs('#lista-cobros');
  if (!data.payouts.length) {
    lista.innerHTML = '<li><span class="texto-chico">Todavía no pediste ningún cobro.</span></li>';
    return;
  }
  lista.innerHTML = data.payouts.map((p) => `
    <li>
      <span>
        <span class="lista__principal">${money(p.amount)}</span>
        <span class="lista__secundario">${fechaHora(p.requested_at)}${p.paid_at ? ` · pagado ${fecha(p.paid_at)}` : ''}</span>
      </span>
      <span style="display:flex;align-items:center;gap:.5rem">
        ${etiquetaEstado(p.status)}
        ${p.status === 'pending' ? `<button class="boton boton--secundario boton--chico" data-cancelar="${p.id}">Cancelar</button>` : ''}
      </span>
    </li>`).join('');

  lista.querySelectorAll('[data-cancelar]').forEach((boton) => {
    boton.addEventListener('click', () => cancelarSolicitud(boton.dataset.cancelar, boton));
  });
}

function renderFormularioCobro(data) {
  const disponible = Number(data.totals.available_balance);
  const pendiente = Number(data.totals.pending_balance);
  const campoMonto = qs('#amount');
  const texto = qs('#texto-cobro');
  const etiqueta = qs('#etiqueta-minimo');

  etiqueta.textContent = `Mínimo ${money(minimoCobro)}`;

  // Si ya hay una solicitud pendiente no se puede pedir otra
  const tienePendiente = data.payouts.some((p) => p.status === 'pending');
  const habilitado = !tienePendiente && disponible >= minimoCobro;

  if (tienePendiente) {
    texto.textContent = 'Tenés una solicitud pendiente. Podés cancelarla si necesitás modificarla.';
    etiqueta.className = 'etiqueta etiqueta--pendiente';
  } else if (disponible < minimoCobro) {
    texto.textContent = `Tu saldo disponible es ${money(disponible)}. Podés solicitar el cobro a partir de ${money(minimoCobro)}.`;
    etiqueta.className = 'etiqueta';
  } else {
    texto.textContent = `Podés cobrar hasta ${money(disponible)}. La transferencia se acredita dentro de las 72 h hábiles.`;
    etiqueta.className = 'etiqueta etiqueta--ok';
  }
  if (pendiente > 0) {
    texto.textContent += ` Tenés ${money(pendiente)} en solicitudes pendientes.`;
  }

  campoMonto.value = disponible > 0 ? disponible.toFixed(2) : '';
  campoMonto.max = disponible.toFixed(2);
  btnCobro.disabled = !habilitado;

  // Datos de cobro ya guardados en el perfil
  const perfil = data.user;
  if (perfil.payout_method) qs('#payout_method').value = perfil.payout_method;
  if (perfil.payout_value) qs('#payout_value').value = perfil.payout_value;
  qs('#payout_holder').value = perfil.payout_holder ?? perfil.name ?? '';
}

function renderBolsas(data) {
  const lista = qs('#bolsas');
  // El resumen de bolsas llega por un endpoint aparte; mostramos un placeholder
  lista.innerHTML = '<li><span class="texto-chico">Consultando bolsas entregadas…</span></li>';
  api.get('/bags/summary/me').then((b) => {
    lista.innerHTML = `
      <li>
        <span class="lista__principal">Bolsas entregadas</span>
        <span>${b.last_30d ?? 0} <span class="texto-chico">últimos 30 días</span> · ${b.total ?? 0} <span class="texto-chico">totales</span></span>
      </li>
      <li>
        <span class="lista__principal">Última entrega</span>
        <span class="texto-chico">${b.last_delivery_on ? fecha(b.last_delivery_on) : 'sin registrar'}</span>
      </li>`;
  }).catch(() => {
    lista.innerHTML = '<li><span class="texto-chico">No se pudo cargar el historial de bolsas.</span></li>';
  });
}

/* ---------------- Carga de datos ---------------- */

async function cargarResumen(mes) {
  const consulta = mes ? `?month=${mes}` : '';
  try {
    resumen = await api.get(`/collections/summary/me${consulta}`);
  } catch (error) {
    mostrarAviso(aviso, error.message, 'error');
    return;
  }

  const data = resumen;
  qs('#nombre-usuario').textContent = data.user.name;
  qs('#saludo').textContent = `Hola, ${data.user.name.split(' ')[0]} 👋`;
  qs('#datos-vecino').textContent = [
    data.user.address,
    data.user.neighborhood,
    data.user.neighborhood ? `Recolección: ${data.user.collection_day_name ?? 'a definir'}` : null,
  ].filter(Boolean).join(' · ');

  if (!qs('#mes').value) qs('#mes').value = data.period_month;

  renderMetricas(data);
  renderCronograma(data);
  renderHistorial(data);
  renderPorMaterial(data);
  renderSolicitudes(data);
  renderFormularioCobro(data);
  if (!qs('#bolsas').dataset.cargado) {
    qs('#bolsas').dataset.cargado = '1';
    renderBolsas(data);
  }
}

async function cancelarSolicitud(id, boton) {
  if (!window.confirm('¿Cancelar esta solicitud de cobro?')) return;
  ponerCargando(boton, true, '…');
  try {
    await api.post(`/payouts/${id}/cancel`);
    mostrarAviso(aviso, 'Solicitud cancelada. Tu saldo volvió a estar disponible.', 'ok', 4000);
    await cargarResumen(qs('#mes').value);
  } catch (error) {
    ponerCargando(boton, false);
    mostrarAviso(aviso, error.message, 'error');
  }
}

/* ---------------- Arranque ---------------- */

const usuario = await requerirSesion('client');
if (usuario) {
  activarBotonSalir();

  try {
    const { min_payout_amount: minimo } = await api.get('/payouts/config');
    minimoCobro = Number(minimo ?? 0);
  } catch { minimoCobro = 0; }

  await cargarResumen();

  qs('#mes').addEventListener('change', (e) => {
    ocultarAviso(aviso);
    cargarResumen(e.target.value);
  });

  formCobro.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultarAviso(aviso);
    const datos = Object.fromEntries(new FormData(formCobro));
    ponerCargando(btnCobro, true, 'Enviando…');
    try {
      await api.post('/payouts', datos);
      mostrarAviso(aviso, '¡Solicitud enviada! Te transferimos dentro de las 72 h hábiles.', 'ok', 6000);
      await cargarResumen(qs('#mes').value);
    } catch (error) {
      mostrarAviso(aviso, error.message, 'error');
      if (error instanceof ApiError) pintarErrores(formCobro, error.details);
    } finally {
      ponerCargando(btnCobro, false);
      // El estado del boton se recalcula con los datos frescos
      if (resumen) renderFormularioCobro(resumen);
    }
  });
}
