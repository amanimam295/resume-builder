const API = window.API_BASE;
let token = localStorage.getItem('rb_admin_token'), adminName = localStorage.getItem('rb_admin_name') || '', adminId = localStorage.getItem('rb_admin_id') || '';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2400); };

async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

const shell = (extra = '') => `<div class="top"><div class="logo">🛡️ FreshCV Admin</div><div class="row">${extra}</div></div>`;
const setSession = (res) => {
  token = res.token; adminName = res.user.name; adminId = res.user.id || '';
  localStorage.setItem('rb_admin_token', token);
  localStorage.setItem('rb_admin_name', adminName);
  localStorage.setItem('rb_admin_id', adminId);
};

// ---------- first-run: take my details and create the admin account ----------
function setupView() {
  $('#app').innerHTML = shell(`<a class="link" href="./">← Back to app</a>`) + `<div class="auth">
    <h2>Claim admin access</h2>
    <p class="muted">First-time setup — enter <b>your</b> details below. This creates the admin account that unlocks the panel.</p>
    <label>Your name<input id="n" placeholder="Your full name"></label>
    <label>Email<input id="e" type="email" placeholder="you@example.com"></label>
    <label>Mobile number (optional)<input id="m" type="tel" placeholder="+91 98765 43210"></label>
    <label>Password<input id="p" type="password" placeholder="At least 6 characters"></label>
    <button class="btn" id="go">Save my details &amp; enable access</button>
    <p class="muted" style="text-align:center">Already set up? <span class="link" id="sw">Log in</span></p></div>`;
  $('#sw').onclick = loginView;
  const submit = async () => {
    try {
      const res = await api('/admin/setup', 'POST', { name: $('#n').value.trim(), email: $('#e').value.trim(), password: $('#p').value, mobile: $('#m').value.trim() });
      setSession(res); toast('Admin access enabled'); panel();
    } catch (e) { toast(e.message); if (/log in instead/i.test(e.message)) loginView(); }
  };
  $('#go').onclick = submit;
  for (const s of ['#n', '#e', '#m', '#p']) $(s).onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
}

// ---------- admin login ----------
function loginView() {
  $('#app').innerHTML = shell(`<a class="link" href="./">← Back to app</a>`) + `<div class="auth">
    <h2>Admin login</h2>
    <p class="muted">Sign in with the admin account to see who registered.</p>
    <label>Email<input id="e" type="email"></label>
    <label>Password<input id="p" type="password"></label>
    <button class="btn" id="go">Log in</button>
    <p class="muted" style="text-align:center">First time here? <span class="link" id="sw">Set up admin access</span></p></div>`;
  $('#sw').onclick = async () => {
    try { (await api('/admin/setup')).needsSetup ? setupView() : toast('Admin already set up — just log in'); }
    catch (e) { toast(e.message); }
  };
  const submit = async () => {
    try {
      const res = await api('/admin/login', 'POST', { email: $('#e').value.trim(), password: $('#p').value });
      setSession(res); panel();
    } catch (e) { toast(e.message); }
  };
  $('#go').onclick = submit;
  for (const s of ['#e', '#p']) $(s).onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
}

// ---------- panel: registered users + their sign-up details ----------
async function panel() {
  let data;
  try {
    data = await api('/admin/users');
  } catch (e) {
    token = null; localStorage.removeItem('rb_admin_token');
    toast(e.message);
    // token invalid: if nobody has claimed admin yet, offer setup instead of a login dead-end
    try { return (await api('/admin/setup')).needsSetup ? setupView() : loginView(); } catch { return loginView(); }
  }
  const { users, stats } = data;
  $('#app').innerHTML = shell(`<span class="muted">${esc(adminName)} · admin</span><a class="link" href="./">← App</a><button class="btn light" id="out">Log out</button>`) + `<div class="wrap">
    <div class="stats">
      <div class="stat"><b>${stats.users}</b><span>Registered users</span></div>
      <div class="stat"><b>${stats.admins}</b><span>Admin accounts</span></div>
      <div class="stat"><b>${stats.resumes}</b><span>Resumes created</span></div>
    </div>
    <div class="card"><h3>People who registered</h3>
    ${users.length ? `<div class="tblwrap"><table>
      <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Mobile</th><th>Registered</th><th>Resumes</th><th>Role</th><th></th></tr></thead>
      <tbody>${users.map((u, i) => `<tr>
        <td>${i + 1}</td><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.mobile) || '—'}</td>
        <td>${u.registeredAt ? new Date(u.registeredAt).toLocaleString() : '—'}</td>
        <td>${u.resumes}</td>
        <td>${u.role === 'admin' ? '<span class="badge">admin</span>' : 'user'}</td>
        <td class="acts"><button class="btn light" data-edit="${u.id}">Edit</button>${u.id === adminId ? '' : `<button class="btn danger" data-del="${u.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">No registrations yet — sign up a user in the main app and they will appear here.</p>'}
    </div></div>`;
  $('#out').onclick = () => { token = null; adminName = ''; adminId = ''; ['rb_admin_token', 'rb_admin_name', 'rb_admin_id'].forEach((k) => localStorage.removeItem(k)); loginView(); };
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editModal(users.find((u) => u.id === b.dataset.edit))));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const u = users.find((x) => x.id === b.dataset.del);
    if (!u) return;
    const sure = await confirmModal(`Delete ${u.name}'s registration? Their ${u.resumes} resume(s) will be removed too.`);
    if (!sure) return;
    try { await api('/admin/users/' + u.id, 'DELETE'); toast('Registration deleted'); panel(); }
    catch (e) { toast(e.message); }
  }));
}

// in-page confirmation (native confirm() blocks the page and can't be styled)
function confirmModal(message) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal-bg';
    el.innerHTML = `<div class="modal"><h3>Are you sure?</h3><p class="muted" style="margin:0">${esc(message)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn light" id="cy-no">Cancel</button><button class="btn danger" id="cy-yes">Delete</button>
      </div></div>`;
    document.body.appendChild(el);
    const done = (v) => { el.remove(); resolve(v); };
    el.querySelector('#cy-no').onclick = () => done(false);
    el.querySelector('#cy-yes').onclick = () => done(true);
    el.onclick = (e) => { if (e.target === el) done(false); };
    document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc2); done(false); } });
    el.querySelector('#cy-yes').focus();
  });
}

// ---------- edit a registration's details ----------
function editModal(u) {
  if (!u) return;
  const el = document.createElement('div');
  el.className = 'modal-bg';
  el.innerHTML = `<div class="modal"><h3>Edit registration</h3>
    <label>Name<input id="mn" value="${esc(u.name)}"></label>
    <label>Email<input id="me" type="email" value="${esc(u.email)}"></label>
    <label>Mobile number<input id="mm" value="${esc(u.mobile)}"></label>
    <div class="row" style="justify-content:flex-end;margin-top:16px">
      <button class="btn light" id="mc">Cancel</button><button class="btn" id="ms">Save changes</button>
    </div></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.onclick = (e) => { if (e.target === el) close(); };
  el.querySelector('#mc').onclick = close;
  const save = async () => {
    try {
      await api('/admin/users/' + u.id, 'PUT', { name: el.querySelector('#mn').value, email: el.querySelector('#me').value, mobile: el.querySelector('#mm').value });
      close(); toast('Details updated'); panel();
    } catch (e) { toast(e.message); }
  };
  el.querySelector('#ms').onclick = save;
  for (const s of ['#mn', '#me', '#mm']) el.querySelector(s).onkeydown = (e) => { if (e.key === 'Enter') save(); };
  el.querySelector('#mn').focus();
}

// ---------- boot ----------
(async () => {
  if (token) return panel(); // invalid/expired token falls back to login inside panel()
  try { (await api('/admin/setup')).needsSetup ? setupView() : loginView(); }
  catch { loginView(); }
})();

// self-heal a stale open tab: whenever the window regains focus, if setup is still
// pending but the claim form isn't on screen (e.g. an old cached "login" view), switch to it
window.addEventListener('focus', async () => {
  const go = document.querySelector('#go');
  if (!go) return; // panel view — nothing to heal
  try {
    const s = await api('/admin/setup');
    const onClaim = go.textContent.includes('Save my details');
    if (s.needsSetup && !onClaim) setupView();
  } catch {}
});
