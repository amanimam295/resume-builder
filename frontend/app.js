const API = window.API_BASE;
let token = localStorage.getItem('rb_token'), user = null, R = null, timer = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };

async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// ---------- schema ----------
const PERS = [['name', 'Full name'], ['title', 'Target role (e.g. Software Intern)'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'City, State'], ['linkedin', 'LinkedIn URL'], ['github', 'GitHub URL'], ['portfolio', 'Portfolio / Website']];
const SEC = {
  education: { title: 'Education', f: [['school', 'College / School'], ['degree', 'Degree (e.g. B.Tech)'], ['field', 'Branch / Stream'], ['grade', 'CGPA / Percentage'], ['start', 'Start year'], ['end', 'End year (or Expected)']] },
  projects: { title: 'Projects', f: [['name', 'Project name'], ['tech', 'Tech stack'], ['link', 'Link (GitHub / demo)'], ['desc', 'What you built & impact (one point per line)', 'ta']] },
  experience: { title: 'Internships & Experience', f: [['role', 'Role'], ['company', 'Company / Organisation'], ['start', 'Start'], ['end', 'End'], ['desc', 'Responsibilities & results (one point per line)', 'ta']] },
  certifications: { title: 'Certifications', f: [['name', 'Certification'], ['issuer', 'Issued by'], ['year', 'Year']] },
};
const blank = () => ({ personal: Object.fromEntries(PERS.map(([k]) => [k, ''])), summary: '', education: [{}], projects: [{}], experience: [], certifications: [], skills: '', achievements: '' });
const sample = () => ({
  personal: { name: 'Ananya Sharma', title: 'Final-year CSE Student · Software Intern', email: 'ananya.sharma@example.com', phone: '+91 98765 43210', location: 'Bengaluru, Karnataka', linkedin: 'linkedin.com/in/ananyasharma', github: 'github.com/ananyasharma', portfolio: 'ananyasharma.dev' },
  summary: 'Final-year Computer Science student who loves building useful products. Looking for a software engineering internship where I can ship real features while growing as a developer.',
  education: [{ school: 'National Institute of Technology', degree: 'B.Tech', field: 'Computer Science & Engineering', grade: '8.7 CGPA', start: '2022', end: '2026' }],
  skills: 'Python, Java, JavaScript, React, Node.js, SQL, Git, Docker, Problem Solving, Communication',
  projects: [
    { name: 'CampusConnect', tech: 'React, Node.js, MongoDB', link: 'github.com/ananyasharma/campusconnect', desc: 'Built a club-events platform used by 500+ students to discover and RSVP to events\nImplemented JWT auth and REST APIs, cutting page load time by 40%' },
    { name: 'Smart Attendance System', tech: 'Python, OpenCV, Flask', link: 'github.com/ananyasharma/attendance', desc: 'Developed face-recognition attendance marking for 120 students with 98% accuracy' },
  ],
  experience: [{ role: 'Web Development Intern', company: 'Nexlify Solutions', start: 'Jun 2025', end: 'Aug 2025', desc: 'Shipped 3 customer-facing features in React used by 2k+ daily users\nWrote unit tests, raising coverage from 45% to 72%' }],
  certifications: [{ name: 'Meta Front-End Developer', issuer: 'Coursera', year: '2025' }, { name: 'Python for Data Science', issuer: 'IBM', year: '2024' }],
  achievements: 'Runner-up, Inter-college Hackathon 2025 (team of 4)\nSecretary, Coding Club\nQualified for Smart India Hackathon internal round',
});
// 0–100 score of how complete the resume is
function strength() {
  const d = R.data, p = d.personal;
  const c = [p.name, p.title, p.email, p.phone, p.location, p.linkedin || p.github || p.portfolio,
    (d.summary || '').trim().length > 30, d.education.some((x) => x.school && x.degree),
    (d.skills || '').trim().length > 10, d.projects.some((x) => x.name),
    d.experience.some((x) => x.role || x.company), d.certifications.some((x) => x.name),
    (d.achievements || '').trim().length > 10];
  return Math.round((c.filter(Boolean).length / c.length) * 100);
}
function updateMeter() {
  if (!$('#pct')) return;
  const s = strength();
  $('#pct').textContent = s + '%';
  $('#bar').style.width = s + '%';
}
function loadSample() {
  const d = R.data;
  const has = d.summary || d.skills || d.achievements || d.projects.some((x) => x.name) || d.experience.some((x) => x.role) || d.education.some((x) => x.school);
  if (has && !confirm('Replace the current content with sample data?')) return;
  R.data = sample();
  renderForm(); renderPreview(); queueSave();
  toast('Sample data loaded — edit it to make it yours');
}

// ---------- views ----------
function authView(mode = 'login') {
  const reg = mode === 'register';
  $('#app').innerHTML = `<div class="auth"><div class="logo">📄 FreshCV</div><h2>${reg ? 'Create your account' : 'Welcome back'}</h2>
    <p class="muted">Build a recruiter-ready resume in minutes.</p>
    ${reg ? '<label>Name<input id="n"></label><label>Mobile number<input id="m" type="tel" placeholder="+91 98765 43210"></label>' : ''}<label>Email<input id="e" type="email"></label><label>Password<input id="p" type="password"></label>
    <span class="link pw" id="eye">Show password</span>
    <button class="btn" id="go">${reg ? 'Sign up' : 'Log in'}</button>
    <p class="muted" style="text-align:center">${reg ? 'Have an account?' : 'New here?'} <span class="link" id="sw">${reg ? 'Log in' : 'Sign up'}</span></p></div>`;
  $('#sw').onclick = () => authView(reg ? 'login' : 'register');
  const submit = async () => {
    try {
      if (reg && !$('#m').value.trim()) return toast('Mobile number is required');
      const res = await api(`/auth/${reg ? 'register' : 'login'}`, 'POST', { name: reg ? $('#n').value : undefined, mobile: reg ? $('#m').value.trim() : undefined, email: $('#e').value, password: $('#p').value });
      token = res.token; user = res.user; localStorage.setItem('rb_token', token); dashboard();
    } catch (e) { toast(e.message); }
  };
  $('#go').onclick = submit;
  for (const s of ['#e', '#n', '#m', '#p']) { const el = $(s); if (el) el.onkeydown = (e) => e.key === 'Enter' && submit(); }
  $('#eye').onclick = () => { const i = $('#p'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#eye').textContent = show ? 'Hide password' : 'Show password'; };
}

const topbar = (extra = '') => `<div class="top"><div class="logo" style="cursor:pointer" id="home">📄 FreshCV</div><div class="row">${extra}<span class="muted">${esc(user?.name)}</span><button class="btn light" id="theme" title="Toggle dark mode">${document.body.dataset.theme === 'dark' ? '☀️' : '🌙'}</button><button class="btn light" id="out">Log out</button></div></div>`;
function bindTop() {
  $('#out').onclick = () => { localStorage.removeItem('rb_token'); token = null; user = null; authView(); };
  $('#home').onclick = () => dashboard();
  $('#theme').onclick = toggleTheme;
}
function toggleTheme() {
  const dark = document.body.dataset.theme === 'dark';
  if (dark) delete document.body.dataset.theme; else document.body.dataset.theme = 'dark';
  localStorage.setItem('rb_theme', dark ? '' : 'dark');
  $('#theme').textContent = dark ? '🌙' : '☀️';
}

async function dashboard() {
  R = null;
  const list = await api('/resumes');
  $('#app').innerHTML = topbar() + `<div class="wrap"><div class="row" style="justify-content:space-between"><h2>My resumes</h2><div class="row">${list.length ? '<input id="q" placeholder="Search resumes…" style="width:190px">' : ''}<button class="btn" id="new">+ New resume</button></div></div>
  ${list.length ? list.map((r) => `<div class="rcard" data-t="${esc((r.title || '').toLowerCase())}"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.template)} template · updated ${new Date(r.updatedAt).toLocaleString()}</div></div>
    <div class="row"><button class="btn" data-edit="${r.id}">Edit</button><button class="btn light" data-dup="${r.id}">Duplicate</button><button class="btn danger" data-rm="${r.id}">Delete</button></div></div>`).join('') : '<p class="muted">No resumes yet. Create your first one!</p>'}</div>`;
  bindTop();
  const q = $('#q');
  if (q) q.oninput = () => { const v = q.value.toLowerCase(); document.querySelectorAll('.rcard').forEach((c) => { c.style.display = c.dataset.t.includes(v) ? '' : 'none'; }); };
  $('#new').onclick = async () => { const d = blank(); d.personal.name = user.name; d.personal.email = user.email; const r = await api('/resumes', 'POST', { title: 'Untitled resume', data: d }); editor(r.id); };
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(b.dataset.edit)));
  document.querySelectorAll('[data-dup]').forEach((b) => (b.onclick = async () => { try { await api('/resumes/' + b.dataset.dup + '/duplicate', 'POST'); toast('Resume duplicated'); dashboard(); } catch (e) { toast(e.message); } }));
  document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this resume?')) { await api('/resumes/' + b.dataset.rm, 'DELETE'); dashboard(); } }));
}

async function editor(id) {
  R = await api('/resumes/' + id);
  R.data = { ...blank(), ...R.data };
  $('#app').innerHTML = topbar(`<input id="ttl" style="width:180px" value="${esc(R.title)}">
    <select id="tpl" style="width:110px"><option value="modern">Modern</option><option value="classic">Classic</option><option value="minimal">Minimal</option></select>
    <input id="clr" type="color" style="width:44px;padding:2px" value="${R.color || '#2563eb'}">
    <span class="muted" id="st">Saved</span><button class="btn" id="pdf">⬇ Download PDF</button>`) +
    `<div class="editor"><div class="form" id="form"></div><div id="preview-box"><div id="preview"></div></div></div>`;
  bindTop();
  $('#tpl').value = R.template || 'modern';
  $('#ttl').oninput = (e) => { R.title = e.target.value; queueSave(); };
  $('#tpl').onchange = (e) => { R.template = e.target.value; renderPreview(); queueSave(); };
  $('#clr').oninput = (e) => { R.color = e.target.value; renderPreview(); queueSave(); };
  $('#pdf').onclick = () => { document.title = (R.data.personal.name || 'Resume') + ' - Resume'; window.print(); };
  renderForm(); renderPreview();
}

// ---------- form ----------
function renderForm() {
  const d = R.data; const s = strength();
  let h = `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Resume strength</h3><b id="pct">${s}%</b></div><div class="meter"><i id="bar" style="width:${s}%"></i></div><p class="hint"><span class="link" id="fill">Load sample data</span> to see a filled-in example · Ctrl/Cmd+S saves instantly</p></div>` +
  `<div class="card"><h3>Personal details</h3><div class="grid">${PERS.map(([k, l]) => `<label>${l}<input data-p="personal.${k}" value="${esc(d.personal[k])}"></label>`).join('')}</div></div>
  <div class="card"><h3>Career objective</h3><textarea rows="3" data-p="summary" placeholder="Final-year CSE student seeking a software internship where I can apply my skills in...">${esc(d.summary)}</textarea><p class="hint">Keep it to 2–3 lines. Mention your role goal and top skills.</p></div>`;
  for (const [s, c] of Object.entries(SEC)) {
    h += `<div class="card"><h3>${c.title}</h3>` + d[s].map((it, i) => `<div class="item"><button class="x" data-del="${s}:${i}" title="Remove">✕</button><div class="grid">` +
      c.f.map(([k, l, t]) => t ? `<label class="full">${l}<textarea rows="3" data-s="${s}:${i}:${k}">${esc(it[k])}</textarea></label>` : `<label>${l}<input data-s="${s}:${i}:${k}" value="${esc(it[k])}"></label>`).join('') + `</div></div>`).join('') +
      `<button class="btn light" data-add="${s}">+ Add ${c.title.split(' ')[0].toLowerCase()}</button></div>`;
  }
  h += `<div class="card"><h3>Skills</h3><textarea rows="3" data-p="skills" placeholder="Python, Java, React, SQL, Git, Communication">${esc(d.skills)}</textarea><p class="hint">Separate skills with commas.</p></div>
  <div class="card"><h3>Achievements & Activities</h3><textarea rows="4" data-p="achievements" placeholder="Won 2nd place in college hackathon&#10;Core member of coding club">${esc(d.achievements)}</textarea><p class="hint">One point per line.</p></div>`;
  $('#form').innerHTML = h;
  $('#fill').onclick = loadSample;
}

document.addEventListener('input', (e) => {
  const t = e.target; if (!R || !t.closest('#form')) return;
  if (t.dataset.p) { const [a, b] = t.dataset.p.split('.'); b ? (R.data[a][b] = t.value) : (R.data[a] = t.value); }
  else if (t.dataset.s) { const [s, i, k] = t.dataset.s.split(':'); R.data[s][i][k] = t.value; }
  renderPreview(); updateMeter(); queueSave();
});
document.addEventListener('click', (e) => {
  if (!R) return; const b = e.target.closest('[data-add],[data-del]'); if (!b) return;
  if (b.dataset.add) R.data[b.dataset.add].push({});
  else { const [s, i] = b.dataset.del.split(':'); R.data[s].splice(+i, 1); }
  renderForm(); renderPreview(); queueSave();
});

// ---------- preview ----------
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const ul = (t) => (lines(t).length ? `<ul>${lines(t).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const range = (a, b) => [a, b].filter(Boolean).join(' – ');
const link = (u) => (u ? `<a href="${esc(/^https?:/.test(u) ? u : 'https://' + u)}" style="color:inherit">${esc(u.replace(/^https?:\/\//, ''))}</a>` : '');
const sec = (title, body) => (body ? `<h2>${title}</h2>${body}` : '');

function renderPreview() {
  const d = R.data, p = d.personal;
  const contact = [p.email, p.phone, p.location].filter(Boolean).map(esc).concat([p.linkedin, p.github, p.portfolio].filter(Boolean).map(link)).join(' &nbsp;|&nbsp; ');
  const edu = d.education.filter((x) => x.school || x.degree).map((x) => `<div style="margin-bottom:6px"><div class="hd"><b>${esc(x.school)}</b><span>${esc(range(x.start, x.end))}</span></div><div class="sub">${esc([x.degree, x.field].filter(Boolean).join(', '))}${x.grade ? ' — ' + esc(x.grade) : ''}</div></div>`).join('');
  const prj = d.projects.filter((x) => x.name).map((x) => `<div style="margin-bottom:6px"><div class="hd"><b>${esc(x.name)}</b><span>${link(x.link)}</span></div>${x.tech ? `<div class="sub"><i>${esc(x.tech)}</i></div>` : ''}${ul(x.desc)}</div>`).join('');
  const exp = d.experience.filter((x) => x.role || x.company).map((x) => `<div style="margin-bottom:6px"><div class="hd"><b>${esc(x.role)}</b><span>${esc(range(x.start, x.end))}</span></div><div class="sub">${esc(x.company)}</div>${ul(x.desc)}</div>`).join('');
  const cert = d.certifications.filter((x) => x.name).map((x) => `<li>${esc(x.name)}${x.issuer ? ' — ' + esc(x.issuer) : ''}${x.year ? ' (' + esc(x.year) + ')' : ''}</li>`).join('');
  const skills = lines(d.skills.replace(/,/g, '\n')).map((s) => `<span>${esc(s)}</span>`).join('');
  $('#preview').innerHTML = `<div class="paper ${R.template || 'modern'}" style="--c:${R.color || '#2563eb'}">
    <h1>${esc(p.name) || 'Your Name'}</h1>${p.title ? `<div class="sub" style="font-size:14px">${esc(p.title)}</div>` : ''}<div class="contact">${contact}</div>
    ${sec('Objective', d.summary ? `<div>${esc(d.summary)}</div>` : '')}${sec('Education', edu)}${sec('Skills', skills ? `<div class="chips">${skills}</div>` : '')}
    ${sec('Projects', prj)}${sec('Experience', exp)}${sec('Certifications', cert ? `<ul>${cert}</ul>` : '')}${sec('Achievements', ul(d.achievements))}</div>`;
}

// ---------- autosave ----------
async function saveNow() {
  clearTimeout(timer);
  try { await api('/resumes/' + R.id, 'PUT', { title: R.title, template: R.template, color: R.color, data: R.data }); $('#st').textContent = 'Saved'; }
  catch (e) { $('#st').textContent = 'Save failed'; toast(e.message); }
}
function queueSave() {
  $('#st').textContent = 'Saving…'; clearTimeout(timer);
  timer = setTimeout(saveNow, 700);
}
// Ctrl/Cmd+S → save right now instead of waiting for the debounce

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && R && $('#st')) { e.preventDefault(); $('#st').textContent = 'Saving…'; saveNow(); }
});

// ---------- boot ----------
if (localStorage.getItem('rb_theme') === 'dark') document.body.dataset.theme = 'dark';
(async () => {
  if (!token) return authView();
  try { user = (await api('/auth/me')).user; dashboard(); } catch { authView(); }
})();
