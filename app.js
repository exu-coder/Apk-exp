import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://yhvfguhgbxinphcvbjax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodmZndWhnYnhpbnBoY3ZiamF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwODQyMTEsImV4cCI6MjA3NDY2MDIxMX0.CVZQMcMcyl4o5saYcOgFheIhT51IHlTnAyerO3BR3sc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const SESSION_KEY = 'farabi_admin_session';
const REFRESH_MS = 60000;
let applications = [];
let adminEmail = '';
let sessionToken = '';
let refreshTimer = null;
let busy = false;

function saveSession(token) { sessionToken = token; sessionStorage.setItem(SESSION_KEY, token); }
function restoreSession() { const token = sessionStorage.getItem(SESSION_KEY); if (!token) return false; sessionToken = token; return true; }
function clearSession() { sessionToken = ''; adminEmail = ''; sessionStorage.removeItem(SESSION_KEY); }

async function forceLogout(message = '') {
  const token = sessionToken;
  clearSession();
  applications = [];
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (token) { try { await supabase.rpc('demo_admin_logout_session', { p_token: token }); } catch {} }
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('email').value = '';
  $('password').value = '';
  updateStats();
  $('rows').innerHTML = '';
  $('empty').hidden = false;
  if (message) $('loginError').textContent = message;
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  const button = e.submitter || $('loginForm').querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  $('loginError').textContent = 'Signing in…';
  const email = $('email').value.trim();
  const password = $('password').value;
  try {
    const { data, error } = await supabase.rpc('demo_admin_create_session', { p_email: email, p_password: password });
    if (error || !data) { $('loginError').textContent = error?.message || 'Invalid admin credentials'; return; }
    saveSession(data);
    adminEmail = email;
    $('password').value = '';
    $('loginError').textContent = '';
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('userEmail').textContent = adminEmail;
    await loadApplications();
    startAutoRefresh();
  } catch (err) {
    $('loginError').textContent = err?.message || 'Unable to sign in.';
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
});

$('logout').addEventListener('click', () => forceLogout());
$('refresh').addEventListener('click', () => loadApplications(true));
$('search').addEventListener('input', render);
$('statusFilter').addEventListener('change', render);
$('closeDialog').addEventListener('click', () => $('detailDialog').close());

async function loadApplications(manual = false) {
  if (!sessionToken) { await forceLogout('Please sign in again.'); return; }
  $('loading').style.display = 'block';
  if (manual) $('refresh').disabled = true;
  try {
    const { data, error } = await supabase.rpc('demo_admin_get_applications_session', { p_token: sessionToken });
    if (error) {
      const msg = error.message || '';
      if (/session|expired|invalid/i.test(msg)) { await forceLogout('Your session expired. Please sign in again.'); return; }
      toast(msg || 'Could not load applications.');
      return;
    }
    applications = data || [];
    updateStats();
    render();
    $('updated').textContent = 'Live · ' + new Date().toLocaleTimeString();
  } catch (err) {
    toast(err?.message || 'Network error.');
  } finally {
    $('loading').style.display = 'none';
    if (manual) $('refresh').disabled = false;
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') loadApplications(); }, REFRESH_MS);
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sessionToken) loadApplications(); });

function normalizeStatus(status) { return status === 'new' || !status ? 'pending' : status; }
function updateStats() {
  $('total').textContent = applications.length;
  $('pending').textContent = applications.filter(x => normalizeStatus(x.status) === 'pending').length;
  $('approved').textContent = applications.filter(x => normalizeStatus(x.status) === 'approved').length;
  $('rejected').textContent = applications.filter(x => normalizeStatus(x.status) === 'rejected').length;
}

function filtered() {
  const q = $('search').value.toLowerCase().trim();
  const s = $('statusFilter').value;
  return applications.filter(a => {
    const hay = [a.full_name, a.name, a.phone, a.email, a.course, a.message].filter(Boolean).join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (s === 'all' || normalizeStatus(a.status) === s);
  });
}

function render() {
  const rows = $('rows');
  rows.innerHTML = '';
  const list = filtered();
  $('empty').hidden = list.length !== 0;
  for (const a of list) {
    const tr = document.createElement('tr');
    const status = normalizeStatus(a.status);
    tr.innerHTML = `<td><div class="name">${esc(a.full_name || a.name || 'Unknown')}</div><div class="sub">ID ${esc(String(a.id || '').slice(0,8))}</div></td><td>${esc(a.phone || '—')}<div class="sub">${esc(a.email || '')}</div></td><td>${esc(a.course || '—')}</td><td><span class="badge ${esc(status)}">${esc(status)}</span></td><td>${formatDate(a.created_at)}</td><td><div class="actions"><button class="ghost small view">View</button><button class="ghost small approve" title="Approve">✓</button><button class="ghost small reject" title="Reject">×</button></div></td>`;
    tr.querySelector('.view').onclick = () => showDetail(a);
    tr.querySelector('.approve').onclick = () => setStatus(a, 'approved');
    tr.querySelector('.reject').onclick = () => setStatus(a, 'rejected');
    rows.appendChild(tr);
  }
}

async function setStatus(a, status) {
  if (!sessionToken) { await forceLogout('Your session expired. Please sign in again.'); return; }
  const buttons = document.querySelectorAll('.actions button, .status-actions button');
  buttons.forEach(b => b.disabled = true);
  try {
    const { data, error } = await supabase.rpc('demo_admin_update_status_session', { p_token: sessionToken, p_id: a.id, p_status: status });
    if (error) {
      if (/session|expired|invalid/i.test(error.message || '')) { await forceLogout('Your session expired. Please sign in again.'); return; }
      toast(error.message || 'Could not update status.');
      return;
    }
    if (data !== true) { toast('Application was not updated.'); return; }
    a.status = status;
    updateStats();
    render();
    toast(`Marked ${status}`);
  } finally { buttons.forEach(b => b.disabled = false); }
}

function showDetail(a) {
  $('detailName').textContent = a.full_name || a.name || 'Application';
  $('detailBody').innerHTML = `<div class="detail-grid"><div class="detail-item"><b>PHONE</b><span>${esc(a.phone||'—')}</span></div><div class="detail-item"><b>EMAIL</b><span>${esc(a.email||'—')}</span></div><div class="detail-item"><b>COURSE</b><span>${esc(a.course||'—')}</span></div><div class="detail-item"><b>STATUS</b><span>${esc(normalizeStatus(a.status))}</span></div><div class="detail-item"><b>SUBMITTED</b><span>${formatDate(a.created_at)}</span></div><div class="detail-item message"><b>MESSAGE</b><span>${esc(a.message||'No message')}</span></div></div><div class="status-actions"><button class="primary" id="dApprove">Approve</button><button class="ghost" id="dReject">Reject</button></div>`;
  $('dApprove').onclick = async () => { await setStatus(a, 'approved'); if ($('detailDialog').open) $('detailDialog').close(); };
  $('dReject').onclick = async () => { await setStatus(a, 'rejected'); if ($('detailDialog').open) $('detailDialog').close(); };
  $('detailDialog').showModal();
}

function formatDate(v) { if (!v) return '—'; const d = new Date(v); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function esc(v) { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
let toastTimer;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000); }

boot();
async function boot() {
  if (!restoreSession()) return;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('userEmail').textContent = 'Checking session…';
  await loadApplications();
  if (sessionToken) { $('userEmail').textContent = adminEmail || 'Admin'; startAutoRefresh(); }
}
