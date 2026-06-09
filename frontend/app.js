/* ── CONFIG ─────────────────────────────────────────────────────────────── */
const API_BASE = '/api/documents';
const SOCKET_URL = '/';

/* ── EXAMPLES ───────────────────────────────────────────────────────────── */
const EXAMPLES = {
  invoice: {
    invoice_number: 'INV-2026-001', date: '2026-08-06', due_date: '2026-09-06',
    sender: { name: 'DocEngine Corp', address: 'Zona 10, Guatemala City', email: 'billing@docengine.io' },
    client: { name: 'Acme S.A.', address: '4a Calle 15-30, Zona 1', email: 'cuentas@acme.gt' },
    items: [
      { description: 'Licencia Anual DocEngine-X', quantity: 1, unit_price: '$1,200.00', total: '$1,200.00' },
      { description: 'Soporte Premium (12 meses)',  quantity: 1, unit_price: '$350.00',  total: '$350.00'   },
      { description: 'Horas de Consultoría',        quantity: 5, unit_price: '$80.00',   total: '$400.00'   }
    ],
    subtotal: '$1,950.00', tax_rate: 12, tax_amount: '$234.00', total_amount: '$2,184.00',
    notes: 'Pago a 30 días. Transferencia bancaria preferida.'
  },
  report: {
    title: 'Reporte de Ventas Q2 2026', subtitle: 'Análisis de rendimiento por región',
    period: 'Abril – Junio 2026', generated_at: '2026-08-06', author: 'Equipo de Analítica',
    summary: [
      { value: 'Q 2.4M', label: 'Ingresos totales' },
      { value: '1,847', label: 'Transacciones' },
      { value: '94.2%', label: 'Satisfacción cliente' }
    ],
    description: 'Este reporte consolida las métricas de ventas del segundo trimestre fiscal 2026.',
    sections: [
      { title: 'Región Central', content: 'Incremento del 18% respecto al trimestre anterior.' },
      { title: 'Región Norte',   content: 'Crecimiento moderado del 7%. Se recomienda refuerzo comercial.' }
    ],
    data: {
      headers: ['Mes', 'Ingresos', 'Unidades', 'Crecimiento'],
      rows: [['Abril','Q 780,000','610','+12%'],['Mayo','Q 820,000','640','+5%'],['Junio','Q 800,000','597','-3%']]
    },
    conclusions: 'El Q2 superó las metas en ingresos. Se recomienda mantener la estrategia de expansión regional.'
  },
  certificate: {
    organization: 'Universidad Galileo', certificate_type: 'Aprobación',
    recipient_name: 'María Fernanda López', course_or_achievement: 'Arquitectura de Microservicios con Docker y Kubernetes',
    description: 'Con una calificación final de 95/100 y asistencia completa.',
    hours: 40, issue_date: '2026-08-06', certificate_id: 'CERT-2026-0042',
    signatories: [
      { name: 'Ing. Alejandro Córdova', role: 'Director Académico' },
      { name: 'Dra. Patricia Méndez',   role: 'Coordinadora del Programa' }
    ]
  }
};

/* ── DOM REFS ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const templateSelect  = $('templateSelect');
const jsonEditor      = $('jsonEditor');
const jsonError       = $('jsonError');
const editorWrapper   = $('editorWrapper');
const btnGenerate     = $('btnGenerate');
const btnGenerateText = $('btnGenerateText');
const genToast        = $('genToast');
const statusFilter    = $('statusFilter');
const btnRefresh      = $('btnRefresh');
const refreshIcon     = $('refreshIcon');
const docsBody        = $('docsBody');
const wsIndicator     = $('wsIndicator');
const wsLabel         = $('wsLabel');
const errorDetail     = $('errorDetail');
const errorDetailText = $('errorDetailText');
const btnCloseError   = $('btnCloseError');
const statTotal       = $('statTotal').querySelector('.stat-value');
const statCompleted   = $('statCompleted').querySelector('.stat-value');
const statProcessing  = $('statProcessing').querySelector('.stat-value');
const statFailed      = $('statFailed').querySelector('.stat-value');

/* ── STATE ──────────────────────────────────────────────────────────────── */
let docs = [];          // full list cached from last fetch
let activeFilter = '';  // current status filter value
/* ── SOCKET.IO ──────────────────────────────────────────────────────────── */
function initSocket() {
  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    wsIndicator.className = 'ws-indicator connected';
    wsLabel.textContent = 'En vivo';
  });
  socket.on('disconnect', () => {
    wsIndicator.className = 'ws-indicator disconnected';
    wsLabel.textContent = 'Desconectado';
  });
  socket.on('connect_error', () => {
    wsIndicator.className = 'ws-indicator disconnected';
    wsLabel.textContent = 'Sin conexión';
  });

  // Real-time status update from the worker
  socket.on('doc:status', (event) => {
    const idx = docs.findIndex(d => d.id === event.id);
    if (idx !== -1) {
      docs[idx] = { ...docs[idx], ...event };
    } else {
      docs.unshift({ id: event.id, status: event.status, template_type: event.template_type, created_at: new Date().toISOString() });
    }
    renderTable();
    updateStats();
  });
}

/* ── API HELPERS ─────────────────────────────────────────────────────────── */
async function fetchDocs(status) {
  const url = status ? `${API_BASE}?status=${status}` : API_BASE;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postDoc(template_type, payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_type, payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── RENDER ─────────────────────────────────────────────────────────────── */
const TEMPLATE_LABELS = { invoice: '📄 Factura', report: '📊 Reporte', certificate: '🎓 Certificado' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' });
}

function badgeHtml(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

function actionHtml(doc) {
  if (doc.status === 'completed' && doc.file_url) {
    return `<a class="download-link" href="${doc.file_url}" target="_blank" rel="noopener">⬇ Descargar</a>`;
  }
  if (doc.status === 'failed' && doc.error_reason) {
    return `<button class="error-btn" data-id="${doc.id}">⚠ Ver error</button>`;
  }
  if (doc.status === 'processing') return `<span class="spin" style="color:var(--warning)">⟳</span>`;
  return '—';
}

function renderTable() {
  const filtered = activeFilter ? docs.filter(d => d.status === activeFilter) : docs;

  if (filtered.length === 0) {
    docsBody.innerHTML = `<tr class="table-empty"><td colspan="5">
      <div class="empty-state">
        <span class="empty-icon">${activeFilter === 'failed' ? '🔴' : '📭'}</span>
        <p>${activeFilter ? `No hay documentos con estado <strong>${activeFilter}</strong>.` : 'No hay documentos aún.<br/>Genera uno desde el panel izquierdo.'}</p>
      </div></td></tr>`;
    return;
  }

  docsBody.innerHTML = filtered.map(doc => `
    <tr data-id="${doc.id}">
      <td><span class="doc-id">${doc.id.slice(0, 8)}…</span></td>
      <td><span class="template-chip">${TEMPLATE_LABELS[doc.template_type] || doc.template_type}</span></td>
      <td>${badgeHtml(doc.status)}</td>
      <td>${formatDate(doc.created_at)}</td>
      <td>${actionHtml(doc)}</td>
    </tr>`).join('');

  // attach error button listeners
  docsBody.querySelectorAll('.error-btn').forEach(btn => {
    btn.addEventListener('click', () => showError(btn.dataset.id));
  });
}

function updateStats() {
  const all = docs;
  statTotal.textContent      = all.length;
  statCompleted.textContent  = all.filter(d => d.status === 'completed').length;
  statProcessing.textContent = all.filter(d => d.status === 'processing' || d.status === 'queued').length;
  statFailed.textContent     = all.filter(d => d.status === 'failed').length;
}

function showError(docId) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return;
  errorDetailText.textContent = doc.error_reason || 'Sin detalle disponible.';
  errorDetail.style.display = 'block';
}
/* ── GENERATOR ───────────────────────────────────────────────────────────── */
function showToast(el, msg, type, durationMs = 4000) {
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, durationMs);
}

function validateJson(str) {
  try { JSON.parse(str); return null; }
  catch (e) { return e.message; }
}

jsonEditor.addEventListener('input', () => {
  const err = validateJson(jsonEditor.value);
  if (err) {
    jsonError.textContent = `JSON inválido: ${err}`;
    editorWrapper.classList.add('has-error');
  } else {
    jsonError.textContent = '';
    editorWrapper.classList.remove('has-error');
  }
});

document.getElementById('btnLoadExample').addEventListener('click', () => {
  const tmpl = templateSelect.value;
  jsonEditor.value = JSON.stringify(EXAMPLES[tmpl], null, 2);
  jsonError.textContent = '';
  editorWrapper.classList.remove('has-error');
});

btnGenerate.addEventListener('click', async () => {
  const tmpl = templateSelect.value;
  const raw  = jsonEditor.value.trim();

  if (!raw) { showToast(genToast, 'El payload no puede estar vacío.', 'error'); return; }
  const jsonErr = validateJson(raw);
  if (jsonErr) { showToast(genToast, `JSON inválido: ${jsonErr}`, 'error'); return; }

  btnGenerate.disabled = true;
  btnGenerate.classList.add('loading');
  btnGenerateText.textContent = 'Enviando…';

  try {
    const payload = JSON.parse(raw);
    const doc = await postDoc(tmpl, payload);
    // Optimistically add to list
    docs.unshift(doc);
    renderTable();
    updateStats();
    showToast(genToast, `✓ Documento encolado — ID: ${doc.id.slice(0,8)}`, 'success');
  } catch (err) {
    showToast(genToast, `Error: ${err.message}`, 'error');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.classList.remove('loading');
    btnGenerateText.textContent = 'Generar PDF';
  }
});

/* ── FILTER & REFRESH ───────────────────────────────────────────────────── */
statusFilter.addEventListener('change', () => {
  activeFilter = statusFilter.value;
  renderTable();
});

async function loadDocs() {
  refreshIcon.classList.add('spin');
  btnRefresh.disabled = true;
  try {
    // Always fetch all docs; filter client-side to keep stats accurate
    docs = await fetchDocs('');
    activeFilter = statusFilter.value;
    renderTable();
    updateStats();
  } catch (err) {
    console.error('[App] Failed to load docs:', err);
  } finally {
    refreshIcon.classList.remove('spin');
    btnRefresh.disabled = false;
  }
}

btnRefresh.addEventListener('click', loadDocs);
btnCloseError.addEventListener('click', () => { errorDetail.style.display = 'none'; });

/* ── INIT ────────────────────────────────────────────────────────────────── */
(function init() {
  initSocket();
  loadDocs();
})();
