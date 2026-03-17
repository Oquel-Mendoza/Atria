const STORAGE_KEY = 'atria.tasks.v1';
const state = { tasks: loadTasks(), editingId: null };

const views = ['dashboard', 'tasks', 'create', 'stats'];
const taskModal = document.getElementById('taskModal');

bindNavigation();
renderAll();
registerSW();
setInterval(() => {
  maybeNotifyDueTasks();
  renderDashboard();
  renderStats();
}, 60_000);

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('enableNotifications').addEventListener('click', askNotificationPermission);
}

function switchView(view) {
  views.forEach((v) => document.getElementById(v).classList.toggle('active', v === view));
  document.querySelectorAll(`.nav-btn`).forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'create') renderForm();
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderForm();
  renderStats();
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  renderAll();
}

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function uid() { return crypto.randomUUID(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysTo(dateISO) { return Math.ceil((new Date(dateISO) - new Date(new Date().toDateString())) / 86400000); }
function isOverdue(task) { return task.status !== 'entregada' && daysTo(task.dueDate) < 0; }

function renderDashboard() {
  const el = document.getElementById('dashboard');
  const pending = state.tasks.filter((t) => t.status === 'pendiente').length;
  const progress = state.tasks.filter((t) => t.status === 'en progreso').length;
  const delivered = state.tasks.filter((t) => t.status === 'entregada').length;
  const upcoming = state.tasks.filter((t) => {
    const d = daysTo(t.dueDate);
    return d >= 1 && d <= 3 && t.status !== 'entregada';
  });
  const late = state.tasks.filter(isOverdue);
  el.innerHTML = `
    <div class="card"><h2>${greeting()}</h2><p>Resumen rápido de tu estado académico.</p></div>
    <div class="grid">
      <div class="card"><div class="kpi">${pending}</div><small>Pendientes</small></div>
      <div class="card"><div class="kpi">${progress}</div><small>En progreso</small></div>
      <div class="card"><div class="kpi">${delivered}</div><small>Entregadas</small></div>
    </div>
    <div class="card"><h3>Próximas entregas (1-3 días)</h3>${listSimple(upcoming)}</div>
    <div class="card"><h3>Tareas atrasadas</h3>${listSimple(late)}</div>
    <div class="card"><h3>Sugerencias inteligentes</h3><ul>${smartTips().map((s)=>`<li>${s}</li>`).join('')}</ul></div>
    <div class="card"><button onclick="window.appGo('create')">Crear nueva tarea</button> <button class="secondary" onclick="window.appGo('tasks')">Ver tareas</button></div>
  `;
}

window.appGo = switchView;

function listSimple(tasks) {
  if (!tasks.length) return '<p>Sin elementos.</p>';
  return `<ul>${tasks.map((t) => `<li>${t.title} · ${t.subject} · vence ${t.dueDate}</li>`).join('')}</ul>`;
}

function smartTips() {
  const tips = [];
  if (state.tasks.some((t) => daysTo(t.dueDate) === 0 && t.status !== 'entregada')) tips.push('Hay tareas que vencen hoy. Priorízalas para evitar atrasos.');
  const late = state.tasks.filter(isOverdue).length;
  if (late) tips.push(`Tienes ${late} tarea(s) atrasada(s). Reagenda bloques de estudio para recuperarte.`);
  const inactive = state.tasks.filter((t) => t.log?.length === 0 && t.status !== 'entregada').length;
  if (inactive) tips.push(`Detectamos ${inactive} tarea(s) sin bitácora. Registra avances para mantener foco.`);
  return tips.length ? tips : ['Buen ritmo: continúa registrando avances para mantener consistencia.'];
}

function renderTasks() {
  const el = document.getElementById('tasks');
  const priorities = ['todas', 'alta', 'media', 'baja'];
  el.innerHTML = `
    <div class="card toolbar">
      <input id="searchTask" placeholder="Buscar por texto" />
      <select id="filterStatus"><option value="todas">Todos los estados</option><option>pendiente</option><option>en progreso</option><option>terminada</option><option>entregada</option></select>
      <select id="filterPriority">${priorities.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
    </div>
    <div class="task-list" id="tasksContainer"></div>
  `;
  ['searchTask', 'filterStatus', 'filterPriority'].forEach((id) => document.getElementById(id).addEventListener('input', renderTaskCards));
  renderTaskCards();
}

function renderTaskCards() {
  const search = (document.getElementById('searchTask')?.value || '').toLowerCase();
  const status = document.getElementById('filterStatus')?.value || 'todas';
  const prio = document.getElementById('filterPriority')?.value || 'todas';
  const tasks = state.tasks.filter((t) => {
    const text = `${t.title} ${t.subject} ${t.description || ''}`.toLowerCase();
    return text.includes(search) && (status === 'todas' || t.status === status) && (prio === 'todas' || t.priority === prio);
  });
  const container = document.getElementById('tasksContainer');
  if (!container) return;
  container.innerHTML = tasks.map((t) => `
    <article class="card task-card ${isOverdue(t) ? 'atrasada' : ''}">
      <div class="row"><h3>${t.title}</h3><div class="tags"><span class="tag">${t.subject}</span><span class="tag">${t.priority}</span><span class="tag">${t.status}</span></div></div>
      <p>Entrega: ${t.dueDate} ${isOverdue(t) ? '· ATRASADA' : ''}</p>
      <div class="progress"><span style="width:${t.progress || 0}%"></span></div>
      <div class="row">
        <button onclick="window.viewTask('${t.id}')">Abrir</button>
        <button class="secondary" onclick="window.editTask('${t.id}')">Editar</button>
        <button class="secondary" onclick="window.quickState('${t.id}')">Estado rápido</button>
        <button class="secondary" onclick="window.deleteTask('${t.id}')">Eliminar</button>
      </div>
    </article>
  `).join('') || '<p class="card">No hay tareas.</p>';
}

window.deleteTask = (id) => {
  if (!confirm('¿Eliminar tarea?')) return;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveTasks();
};
window.editTask = (id) => { state.editingId = id; switchView('create'); renderForm(); };
window.quickState = (id) => {
  const order = ['pendiente', 'en progreso', 'terminada', 'entregada'];
  const task = state.tasks.find((t) => t.id === id);
  task.status = order[(order.indexOf(task.status) + 1) % order.length];
  if (task.status === 'entregada') task.deliveredAt = new Date().toISOString();
  saveTasks();
};
window.viewTask = openTaskModal;

function openTaskModal(id) {
  const t = state.tasks.find((x) => x.id === id);
  taskModal.innerHTML = `
    <form method="dialog" class="card"><button class="secondary" style="float:right">Cerrar</button><h2>${t.title}</h2>
      <p><strong>Materia:</strong> ${t.subject}</p><p>${t.description || 'Sin descripción'}</p>
      <p><strong>Entrega:</strong> ${t.dueDate} · <strong>Tipo:</strong> ${t.deliveryType}</p>
      <p><strong>Estado:</strong> ${t.status} · <strong>Prioridad:</strong> ${t.priority}</p>
      <hr /><h3>Bitácora</h3>
      <div>${(t.log || []).map((l, i) => `<div class='card'><small>${l.date}</small><p>${l.text}</p><button type='button' class='secondary' onclick='window.editLog("${t.id}",${i})'>Editar</button> <button type='button' class='secondary' onclick='window.deleteLog("${t.id}",${i})'>Eliminar</button></div>`).join('') || '<p>Sin registros.</p>'}</div>
      <textarea id='newLogText' placeholder='Nuevo registro'></textarea>
      <button type='button' onclick='window.addLog("${t.id}")'>Agregar registro</button>
      <button type='button' class='secondary' onclick='window.summarizeLog("${t.id}")'>Resumir bitácora</button>
      <p id='logSummary'></p>
      <hr /><h3>Evidencias</h3>
      <ul>${(t.files||[]).map((f,i)=>`<li>${f.name} (${f.type}) <a href='${f.content}' target='_blank'>Abrir</a> <button type='button' class='secondary' onclick='window.removeFile("${t.id}",${i})'>Eliminar</button></li>`).join('') || '<li>Sin evidencias.</li>'}</ul>
      <input type='url' id='evidenceLink' placeholder='https://drive.google.com/...'> <button type='button' onclick='window.addEvidenceLink("${t.id}")'>Agregar enlace</button>
      <p><strong>Entrega real:</strong> ${t.deliveredAt ? new Date(t.deliveredAt).toLocaleString() : 'No registrada'}</p>
      <p><strong>Enlace de entrega:</strong> ${t.deliveryLink || 'N/A'}</p>
    </form>
  `;
  taskModal.showModal();
}

window.addLog = (taskId) => {
  const task = state.tasks.find((t) => t.id === taskId);
  const text = document.getElementById('newLogText').value.trim();
  if (!text) return;
  task.log.push({ date: new Date().toLocaleString(), text });
  task.progress = Math.min(100, (task.progress || 0) + 10);
  saveTasks();
  openTaskModal(taskId);
};
window.editLog = (taskId, i) => {
  const task = state.tasks.find((t) => t.id === taskId);
  const next = prompt('Editar registro', task.log[i].text);
  if (next) { task.log[i].text = next; saveTasks(); openTaskModal(taskId); }
};
window.deleteLog = (taskId, i) => {
  const task = state.tasks.find((t) => t.id === taskId);
  task.log.splice(i, 1); saveTasks(); openTaskModal(taskId);
};
window.summarizeLog = (taskId) => {
  const task = state.tasks.find((t) => t.id === taskId);
  const txt = task.log.map((l) => l.text).join(' ');
  const summary = txt ? txt.split(/[.!?]/).slice(0, 2).join('. ').slice(0, 180) + '...' : 'No hay registros para resumir.';
  document.getElementById('logSummary').textContent = `Resumen: ${summary}`;
};
window.removeFile = (taskId, i) => {
  const task = state.tasks.find((t) => t.id === taskId);
  task.files.splice(i, 1); saveTasks(); openTaskModal(taskId);
};
window.addEvidenceLink = (taskId) => {
  const url = document.getElementById('evidenceLink').value;
  if (!isValidUrl(url)) return alert('Enlace inválido');
  const task = state.tasks.find((t) => t.id === taskId);
  task.files.push({ name: url, type: 'enlace', content: url });
  saveTasks();
  openTaskModal(taskId);
};

function renderForm() {
  const root = document.getElementById('create');
  root.innerHTML = '';
  root.append(document.getElementById('taskFormTemplate').content.cloneNode(true));
  const form = document.getElementById('taskForm');
  const task = state.tasks.find((t) => t.id === state.editingId);
  if (task) fillForm(form, task);
  document.getElementById('formTitle').textContent = task ? 'Editar tarea' : 'Crear tarea';
  document.getElementById('generateDescription').onclick = () => {
    const title = form.title.value.trim();
    const subject = form.subject.value.trim();
    form.description.value = generateDescription(title, subject);
  };
  form.deliveryType.addEventListener('change', () => {
    document.getElementById('deliveryLinkWrap').style.display = form.deliveryType.value === 'virtual' ? 'grid' : 'none';
  });
  form.deliveryType.dispatchEvent(new Event('change'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = validateForm(form);
    document.getElementById('formError').textContent = error || '';
    if (error) return;
    const data = await collectTaskForm(form, task?.id);
    if (task) {
      Object.assign(task, data);
    } else {
      state.tasks.unshift(data);
    }
    state.editingId = null;
    saveTasks();
    switchView('tasks');
  });
}

function fillForm(form, t) {
  form.title.value = t.title;
  form.subject.value = t.subject;
  form.description.value = t.description;
  form.dueDate.value = t.dueDate;
  form.priority.value = t.priority;
  form.status.value = t.status;
  form.deliveryType.value = t.deliveryType;
  form.deliveryLink.value = t.deliveryLink || '';
}

function validateForm(form) {
  if (form.title.value.trim().length < 3) return 'El título debe tener mínimo 3 caracteres';
  if (!form.subject.value.trim()) return 'La materia no puede estar vacía';
  if (!form.dueDate.value || form.dueDate.value < todayISO()) return 'La fecha debe ser válida y no anterior al día actual';
  if (form.deliveryType.value === 'virtual' && form.deliveryLink.value && !isValidUrl(form.deliveryLink.value)) return 'El enlace no tiene formato válido';
  for (const file of form.files.files) {
    if (!/(pdf|msword|officedocument|powerpoint|text|image)/i.test(file.type)) return `Tipo de archivo no permitido: ${file.name}`;
  }
  return '';
}

async function collectTaskForm(form, existingId) {
  const files = await Promise.all([...form.files.files].map((file) => toDataUrl(file).then((content) => ({ name: file.name, type: file.type || 'archivo', content }))));
  return {
    id: existingId || uid(),
    title: form.title.value.trim(),
    subject: form.subject.value.trim(),
    description: form.description.value.trim(),
    createdAt: existingId ? state.tasks.find((t) => t.id === existingId).createdAt : new Date().toISOString(),
    dueDate: form.dueDate.value,
    deliveredAt: form.status.value === 'entregada' ? new Date().toISOString() : null,
    status: form.status.value,
    priority: form.priority.value,
    deliveryType: form.deliveryType.value,
    deliveryLink: form.deliveryLink.value.trim(),
    files: [...(existingId ? state.tasks.find((t) => t.id === existingId).files : []), ...files],
    log: existingId ? state.tasks.find((t) => t.id === existingId).log : [],
    progress: existingId ? state.tasks.find((t) => t.id === existingId).progress : 0,
  };
}

function toDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function generateDescription(title, subject) {
  if (!title || !subject) return 'Completa título y materia para generar la descripción automáticamente.';
  return `Actividad de ${subject} centrada en "${title}". Plan sugerido: revisar recursos, dividir en subtareas, registrar avances en bitácora y preparar evidencia final antes de la fecha de entrega.`;
}

function renderStats() {
  const el = document.getElementById('stats');
  const total = state.tasks.length;
  const completed = state.tasks.filter((t) => t.status === 'entregada').length;
  const pending = state.tasks.filter((t) => t.status !== 'entregada').length;
  const late = state.tasks.filter(isOverdue).length;
  const compliance = total ? Math.round((completed / total) * 100) : 0;
  el.innerHTML = `
    <div class='grid'>
      <div class='card'><div class='kpi'>${total}</div><small>Total</small></div>
      <div class='card'><div class='kpi'>${completed}</div><small>Completadas</small></div>
      <div class='card'><div class='kpi'>${pending}</div><small>Pendientes</small></div>
      <div class='card'><div class='kpi'>${late}</div><small>Atrasadas</small></div>
    </div>
    <div class='card'><h3>Porcentaje de cumplimiento</h3><div class='progress'><span style='width:${compliance}%'></span></div><p>${compliance}%</p></div>
  `;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function isValidUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

async function registerSW() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js');
  }
}

async function askNotificationPermission() {
  if (!('Notification' in window)) return alert('Este navegador no soporta notificaciones.');
  const permission = await Notification.requestPermission();
  alert(permission === 'granted' ? 'Notificaciones activadas.' : 'Permiso denegado.');
  maybeNotifyDueTasks();
}

async function maybeNotifyDueTasks() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker.controller) return;
  const dueToday = state.tasks.filter((t) => daysTo(t.dueDate) === 0 && t.status !== 'entregada');
  const dueTomorrow = state.tasks.filter((t) => daysTo(t.dueDate) === 1 && t.status !== 'entregada');
  const late = state.tasks.filter(isOverdue);
  const notices = [
    ...dueToday.map((t) => ({ title: t.title, body: 'La tarea vence hoy.' })),
    ...dueTomorrow.map((t) => ({ title: t.title, body: 'La tarea vence mañana.' })),
    ...late.map((t) => ({ title: t.title, body: 'La tarea está atrasada.' })),
  ];
  for (const n of notices.slice(0, 3)) {
    navigator.serviceWorker.controller.postMessage({ type: 'notify', ...n });
  }
}
