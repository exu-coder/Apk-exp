import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://yhvfguhgbxinphcvbjax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodmZndWhnYnhpbnBoY3ZiamF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwODQyMTEsImV4cCI6MjA3NDY2MDIxMX0.CVZQMcMcyl4o5saYcOgFheIhT51IHlTnAyerO3BR3sc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
let applications = [];

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginError').textContent = 'Signing in…';
  const { error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) $('loginError').textContent = error.message; else $('loginError').textContent = '';
});
$('logout').addEventListener('click', () => supabase.auth.signOut());
$('refresh').addEventListener('click', loadApplications);
$('search').addEventListener('input', render);
$('statusFilter').addEventListener('change', render);
$('closeDialog').addEventListener('click', () => $('detailDialog').close());

supabase.auth.onAuthStateChange((_event, session) => updateSession(session));
const { data: { session } } = await supabase.auth.getSession();
updateSession(session);

async function updateSession(session) {
  $('loginView').hidden = !!session; $('appView').hidden = !session;
  if (session) { $('userEmail').textContent = session.user.email || 'Admin'; await loadApplications(); }
}

async function loadApplications() {
  $('loading').style.display = 'block';
  const { data, error } = await supabase.from('applications').select('*').order('created_at', { ascending: false });
  $('loading').style.display = 'none';
  if (error) { toast(error.message); return; }
  applications = data || []; updateStats(); render(); $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function updateStats() {
  $('total').textContent = applications.length;
  $('pending').textContent = applications.filter(x => (x.status || 'pending') === 'pending').length;
  $('approved').textContent = applications.filter(x => x.status === 'approved').length;
  $('rejected').textContent = applications.filter(x => x.status === 'rejected').length;
}
function filtered() {
  const q = $('search').value.toLowerCase().trim(), s = $('statusFilter').value;
  return applications.filter(a => {
    const hay = [a.full_name,a.name,a.phone,a.email,a.course,a.message].filter(Boolean).join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (s === 'all' || (a.status || 'pending') === s);
  });
}
function render() {
  const rows = $('rows'); rows.innerHTML = '';
  const list = filtered(); $('empty').hidden = list.length !== 0;
  for (const a of list) {
    const tr = document.createElement('tr');
    const status = a.status || 'pending';
    tr.innerHTML = `<td><div class="name">${esc(a.full_name || a.name || 'Unknown')}</div><div class="sub">ID ${esc(String(a.id || '').slice(0,8))}</div></td><td>${esc(a.phone || '—')}<div class="sub">${esc(a.email || '')}</div></td><td>${esc(a.course || '—')}</td><td><span class="badge ${esc(status)}">${esc(status)}</span></td><td>${formatDate(a.created_at)}</td><td><div class="actions"><button class="ghost small view">View</button><button class="ghost small approve">✓</button><button class="ghost small reject">×</button></div></td>`;
    tr.querySelector('.view').onclick = () => showDetail(a);
    tr.querySelector('.approve').onclick = () => setStatus(a, 'approved');
    tr.querySelector('.reject').onclick = () => setStatus(a, 'rejected');
    rows.appendChild(tr);
  }
}
async function setStatus(a, status) {
  const { error } = await supabase.from('applications').update({ status }).eq('id', a.id);
  if (error) toast(error.message); else { a.status = status; updateStats(); render(); toast(`Marked ${status}`); }
}
function showDetail(a) {
  $('detailName').textContent = a.full_name || a.name || 'Application';
  $('detailBody').innerHTML = `<div class="detail-grid"><div class="detail-item"><b>PHONE</b><span>${esc(a.phone||'—')}</span></div><div class="detail-item"><b>EMAIL</b><span>${esc(a.email||'—')}</span></div><div class="detail-item"><b>COURSE</b><span>${esc(a.course||'—')}</span></div><div class="detail-item"><b>STATUS</b><span>${esc(a.status||'pending')}</span></div><div class="detail-item"><b>SUBMITTED</b><span>${formatDate(a.created_at)}</span></div><div class="detail-item message"><b>MESSAGE</b><span>${esc(a.message||'No message')}</span></div></div><div class="status-actions"><button class="primary" id="dApprove">Approve</button><button class="ghost" id="dReject">Reject</button></div>`;
  $('dApprove').onclick = async () => { await setStatus(a,'approved'); $('detailDialog').close(); };
  $('dReject').onclick = async () => { await setStatus(a,'rejected'); $('detailDialog').close(); };
  $('detailDialog').showModal();
}
function formatDate(v){ if(!v)return '—'; const d=new Date(v); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
let toastTimer; function toast(msg){ $('toast').textContent=msg; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000); }
