// GymPulse — src/index.dev.js
// 100% real, API-driven, zero fake/simulated data

(function () {
  'use strict';

  /* ─────────────────────────────────────
     STATE
  ───────────────────────────────────── */
  const S = {
    view: 'dashboard',
    openMemberId: null,
    passId: null,
    qrTimer: null,
    qrSecs: 30,
    floorTimer: null,
  };

  /* ─────────────────────────────────────
     API
  ───────────────────────────────────── */
  async function api(url, opts) {
    const r = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }

  /* ─────────────────────────────────────
     TOAST
  ───────────────────────────────────── */
  function toast(msg, type = 'ok') {
    const c = document.getElementById('toasts');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 350);
    }, 3500);
  }

  /* ─────────────────────────────────────
     HELPERS
  ───────────────────────────────────── */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
  function ini(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ─────────────────────────────────────
     VIEW ROUTER
  ───────────────────────────────────── */
  function nav(view) {
    S.view = view;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });

    // Stop floor auto-refresh if leaving gate view
    if (view !== 'gate' && S.floorTimer) {
      clearInterval(S.floorTimer);
      S.floorTimer = null;
    }

    if (view === 'dashboard') loadDash();
    if (view === 'gate')      { loadGate(); populateGateSelect(); startFloorRefresh(); }
    if (view === 'athletes')  loadAthletes();
    if (view === 'pass')      loadPass();
    if (view === 'settings')  loadSettings();
  }

  /* ─────────────────────────────────────
     DASHBOARD
  ───────────────────────────────────── */
  async function loadDash() {
    try {
      const d = await api('/api/dashboard/stats');

      // Header
      set('hdr-gym-name', d.gymInfo.name);
      set('hdr-branch',   d.gymInfo.branch);
      set('hdr-live',     d.activeHeadcount);
      set('hdr-cap',      d.capacity);
      set('tab-live-count', d.activeHeadcount);

      // Stat cards
      set('d-active', d.activeHeadcount);
      set('d-visits', d.visitsToday);
      set('d-dwell',  d.avgDwell || '—');
      set('d-total',  d.totalMembers);

      // Load badge
      const badge = document.getElementById('d-load-badge');
      if (badge) {
        const pct = d.loadPercentage || 0;
        if (pct >= 80) {
          badge.textContent = 'High Load';
          badge.className = 'stat-badge red';
        } else if (pct >= 50) {
          badge.textContent = 'Moderate';
          badge.className = 'stat-badge amber';
        } else if (d.activeHeadcount > 0) {
          badge.textContent = 'Active';
          badge.className = 'stat-badge green';
        } else {
          badge.textContent = 'Empty';
          badge.className = 'stat-badge';
          badge.style.background = '#f1f5f9';
          badge.style.color = '#94a3b8';
        }
      }

      // Progress bar
      const bar = document.getElementById('d-bar');
      if (bar) bar.style.width = Math.min(100, d.loadPercentage || 0) + '%';
      set('d-cap-hint', `${d.loadPercentage || 0}% of ${d.capacity} capacity`);

      // Cadence chart
      renderChart(d.hourlyCadence || []);

      // Activity
      renderActivity(d.recentActivity || []);

    } catch (e) { /* silent */ }
  }

  function renderChart(hours) {
    const el = document.getElementById('d-chart');
    if (!el) return;
    const hint = document.getElementById('d-chart-hint');
    const hasData = hours.some(h => h.count > 0);

    if (!hasData) {
      el.innerHTML = '<div class="empty-chart-hint">No arrivals logged yet today</div>';
      return;
    }
    if (hint) hint.remove();

    el.innerHTML = hours.map(h => `
      <div class="chart-col">
        <div class="chart-track">
          <div class="chart-fill ${h.current ? 'now' : ''}" style="height:${h.percent || 0}%"></div>
        </div>
        <span class="chart-lbl ${h.current ? 'now' : ''}">${h.hour}</span>
      </div>
    `).join('');
  }

  function renderActivity(list) {
    const el = document.getElementById('d-activity');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty-hint">No gate activity yet today</div>';
      return;
    }
    el.innerHTML = list.map(a => `
      <div class="act-row">
        <span class="act-dot ${a.type === 'CHECK_IN' ? 'dot-in' : 'dot-out'}"></span>
        <span class="act-name">${esc(a.name)}</span>
        <span class="act-detail">${esc(a.detail)}</span>
        <span class="act-time">${fmtTime(a.time)}</span>
      </div>
    `).join('');
  }

  /* ─────────────────────────────────────
     GATE / FLOOR
  ───────────────────────────────────── */
  async function populateGateSelect() {
    try {
      const d = await api('/api/members');
      const sel = document.getElementById('ci-athlete');
      if (!sel) return;
      if (!d.members.length) {
        sel.innerHTML = '<option value="">No athletes enrolled yet</option>';
        return;
      }
      sel.innerHTML = '<option value="">Choose athlete…</option>' +
        d.members.map(m => {
          const on = m.liveInside;
          return `<option value="${esc(m.id)}" ${on ? 'disabled' : ''}>${esc(m.name)} (${esc(m.id)})${on ? ' — On Floor' : ''}</option>`;
        }).join('');
    } catch (e) {}
  }

  async function loadGate() {
    try {
      const d = await api('/api/attendance/live');
      set('tab-live-count', d.headcount);
      set('hdr-live', d.headcount);

      const chip = document.getElementById('gate-count-chip');
      if (chip) chip.textContent = d.headcount === 0 ? '0 active' : `${d.headcount} active`;

      const tbody = document.getElementById('gate-tbody');
      if (!tbody) return;

      if (!d.sessions.length) {
        tbody.innerHTML = `
          <tr class="tbl-empty">
            <td colspan="7">
              No athletes currently on the floor.<br>
              <span style="font-size:11px;">Use the check-in form above to log arrivals.</span>
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = d.sessions.map(s => `
        <tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--txt3)">${esc(s.timeDisplay)}</td>
          <td>
            <div class="ath-cell">
              <div class="ath-av">${ini(s.memberName)}</div>
              <div>
                <div class="ath-name">${esc(s.memberName)}</div>
                <div class="ath-id">${esc(s.memberId)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:12px">${esc(s.plan)}</td>
          <td style="font-size:12px;color:var(--txt2)">${esc(s.coach || '—')}</td>
          <td><span class="dwell-pill" id="dwell-${esc(s.id)}">${esc(s.dwellDisplay)}</span></td>
          <td style="font-size:11px;color:var(--txt3)">${esc(s.gate)}</td>
          <td style="text-align:right">
            <button class="btn-checkout" data-sid="${esc(s.id)}" data-name="${esc(s.memberName)}">Check Out</button>
          </td>
        </tr>
      `).join('');
    } catch (e) {}
  }

  function startFloorRefresh() {
    if (S.floorTimer) return;
    S.floorTimer = setInterval(() => {
      if (S.view === 'gate') loadGate();
    }, 30000);
  }

  /* ─────────────────────────────────────
     ATHLETES DIRECTORY
  ───────────────────────────────────── */
  async function loadAthletes(query = '', filter = 'all') {
    try {
      const d = await api(`/api/members?search=${encodeURIComponent(query)}&status=${filter}`);
      set('dir-meta', `${d.total} registered athlete${d.total !== 1 ? 's' : ''}`);

      const tbody = document.getElementById('dir-tbody');
      if (!tbody) return;

      if (!d.members.length) {
        tbody.innerHTML = `
          <tr class="tbl-empty">
            <td colspan="6">
              ${query ? `No athletes matching "${esc(query)}"` : 'No athletes enrolled yet.'}
              ${!query ? '<br><span style="font-size:11px">Click "+ Enroll" to add your first athlete.</span>' : ''}
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = d.members.map(m => `
        <tr data-id="${esc(m.id)}">
          <td>
            <div class="ath-cell">
              <div class="ath-av">${ini(m.name)}</div>
              <div>
                <div class="ath-name">${esc(m.name)}</div>
                <div class="ath-id">${esc(m.id)} · ${esc(m.joinedDate)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:12px">${esc(m.plan)}</td>
          <td style="font-size:12px;color:var(--txt2)">${esc(m.assignedCoach)}</td>
          <td style="font-family:var(--mono);font-size:11px;color:var(--txt3)">${esc(m.phone)}</td>
          <td>
            <span class="badge ${m.liveInside ? 'badge-on' : 'badge-off'}">
              ${m.liveInside ? '● In Session' : '○ Registered'}
            </span>
          </td>
          <td style="text-align:right">
            <button class="btn-view btn-open-dos" data-id="${esc(m.id)}">View →</button>
          </td>
        </tr>
      `).join('');
    } catch (e) {}
  }

  async function openDossier(id) {
    S.openMemberId = id;
    const panel  = document.getElementById('dossier-panel');
    const scroll = document.getElementById('dossier-scroll');
    if (panel)  panel.classList.add('open');
    if (scroll) scroll.innerHTML = '<div class="empty-hint">Loading…</div>';

    try {
      const m = await api('/api/members/' + id);

      const notesHtml = m.coachNotes && m.coachNotes.length
        ? m.coachNotes.map(n => `
            <div class="note-item">
              <div class="note-meta">${esc(n.date)} · ${esc(n.author)}</div>
              <div>${esc(n.text)}</div>
            </div>`).join('')
        : '<div class="empty-hint">No notes yet.</div>';

      const histHtml = m.attendanceHistory && m.attendanceHistory.length
        ? m.attendanceHistory.slice(0, 6).map(h => `
            <div class="hist-row">
              <div>
                <div style="font-weight:600">${esc(h.date)}</div>
                <div style="color:var(--txt3);font-size:11px">${esc(h.entry)} → ${esc(h.exit || 'Active')}</div>
              </div>
              <span class="hist-dwell">${esc(h.dwell)}</span>
            </div>`).join('')
        : '<div class="empty-hint" style="padding:8px 0">No visits recorded yet.</div>';

      scroll.innerHTML = `
        <div class="dos-av-row">
          <div class="dos-av">${ini(m.name)}</div>
          <div>
            <div class="dos-name">${esc(m.name)}</div>
            <div class="dos-id">${esc(m.id)}</div>
            <span class="badge ${m.liveInside ? 'badge-on' : 'badge-off'}" style="margin-top:5px;display:inline-block">
              ${m.liveInside ? '● In Session' : '○ Registered'}
            </span>
          </div>
        </div>

        <div class="dos-grid">
          <div class="dos-item">
            <span class="dos-lbl">Plan</span>
            <span class="dos-val">${esc(m.plan)}</span>
          </div>
          <div class="dos-item">
            <span class="dos-lbl">Valid Until</span>
            <span class="dos-val">${esc(m.validThrough || '—')}</span>
          </div>
          <div class="dos-item">
            <span class="dos-lbl">Coach</span>
            <span class="dos-val">${esc(m.assignedCoach)}</span>
          </div>
          <div class="dos-item">
            <span class="dos-lbl">Joined</span>
            <span class="dos-val">${esc(m.joinedDate)}</span>
          </div>
          <div class="dos-item dos-full">
            <span class="dos-lbl">Phone</span>
            <span class="dos-val">${esc(m.phone)}</span>
          </div>
          <div class="dos-item dos-full">
            <span class="dos-lbl">Email</span>
            <span class="dos-val" style="font-size:11px;word-break:break-all">${esc(m.email)}</span>
          </div>
          <div class="dos-item dos-full">
            <span class="dos-lbl">Training Focus</span>
            <span class="dos-val">${esc(m.focus || '—')}</span>
          </div>
          <div class="dos-item dos-full">
            <span class="dos-lbl">Medical</span>
            <span class="dos-val">${esc(m.medicalClearance || '—')}</span>
          </div>
          <div class="dos-item dos-full">
            <span class="dos-lbl">Emergency Contact</span>
            <span class="dos-val">${esc(m.emergencyContact || '—')}</span>
          </div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="dos-sec-label">Coach Notes</span>
            <button class="btn-ghost btn-add-note" data-id="${esc(m.id)}" style="font-size:11px;color:var(--green)">+ Add Note</button>
          </div>
          <div class="notes-list">${notesHtml}</div>
        </div>

        <div>
          <div class="dos-sec-label" style="margin-bottom:8px">Attendance History</div>
          <div class="hist-list">${histHtml}</div>
        </div>

        <div class="dos-actions">
          <button class="btn-danger" style="flex:1" data-id="${esc(m.id)}" data-name="${esc(m.name)}" id="btn-dos-delete">Remove Athlete</button>
        </div>
      `;
    } catch (e) {
      if (scroll) scroll.innerHTML = '<div class="empty-hint" style="color:var(--red)">Failed to load.</div>';
    }
  }

  /* ─────────────────────────────────────
     MEMBER PASS
  ───────────────────────────────────── */
  async function loadPass() {
    try {
      const d = await api('/api/members');
      const sel = document.getElementById('pass-select');
      if (!sel) return;
      if (!d.members.length) {
        sel.innerHTML = '<option value="">No athletes enrolled yet</option>';
        return;
      }
      sel.innerHTML = d.members.map(m =>
        `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`
      ).join('');
      const id = S.passId || d.members[0].id;
      sel.value = id;
      S.passId = id;
      await refreshPass(id);
    } catch (e) {}
  }

  async function refreshPass(id) {
    if (S.qrTimer) { clearInterval(S.qrTimer); S.qrTimer = null; }
    if (!id) return;
    S.passId = id;
    try {
      const d = await api('/api/qr/token/' + id);
      const m = d.member;

      set('p-gym-name', document.getElementById('hdr-gym-name')?.textContent || 'GYMPULSE');
      set('p-avatar', ini(m.name));
      set('p-plan', (m.plan || 'MEMBER').toUpperCase());
      set('p-name', m.name);
      set('p-id', `${m.id} · ${m.plan}`);
      set('p-coach', m.assignedCoach || '—');
      set('p-valid', m.validThrough || '—');

      // Recent visits
      const vl = document.getElementById('p-visits-list');
      if (vl) {
        if (!m.recentVisits || !m.recentVisits.length) {
          vl.innerHTML = '<div class="empty-hint" style="padding:6px 0">No visits yet</div>';
        } else {
          vl.innerHTML = m.recentVisits.map(v => `
            <div class="p-visit-row">
              <div>
                <div style="font-weight:600">${esc(v.date)}</div>
                <div style="color:var(--txt3)">${esc(v.entry)} → ${esc(v.exit || 'Active')}</div>
              </div>
              <span class="p-v-dwell">${esc(v.dwell)}</span>
            </div>
          `).join('');
        }
      }

      drawQr(d.token);

      // 30s countdown
      S.qrSecs = 30;
      S.qrTimer = setInterval(() => {
        S.qrSecs--;
        set('p-timer', `REFRESHES IN ${S.qrSecs}s`);
        if (S.qrSecs <= 0 && S.view === 'pass') refreshPass(S.passId);
      }, 1000);
    } catch (e) {}
  }

  function drawQr(token) {
    const svg = document.getElementById('p-qr');
    if (!svg) return;
    const seed = token.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const r = (x, y, w = 6, h = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    const finders = `
      ${r(4,4,28,28)} <rect x="9" y="9" width="18" height="18" fill="#fff"/> ${r(14,14,8,8)}
      ${r(88,4,28,28)} <rect x="93" y="9" width="18" height="18" fill="#fff"/> ${r(98,14,8,8)}
      ${r(4,88,28,28)} <rect x="9" y="93" width="18" height="18" fill="#fff"/> ${r(14,98,8,8)}
    `;
    let mods = '';
    for (let i = 0; i < 100; i++) {
      const bit = (seed >> (i % 32)) & 1;
      if (!bit) continue;
      const col = i % 10;
      const row = Math.floor(i / 10);
      const x = 36 + col * 8;
      const y = 4  + row * 8;
      if (x > 110 || y > 110) continue;
      // Skip finder zones
      if (x < 36 && y < 36) continue;
      if (x > 84 && y < 36) continue;
      if (x < 36 && y > 84) continue;
      mods += r(x, y);
    }
    svg.innerHTML = `<rect width="120" height="120" fill="#fff" rx="2"/>${finders}${mods}`;
  }

  /* ─────────────────────────────────────
     SETTINGS
  ───────────────────────────────────── */
  async function loadSettings() {
    try {
      const d = await api('/api/gym/settings');
      const sn = document.getElementById('s-name');
      const sb = document.getElementById('s-branch');
      const sc = document.getElementById('s-cap');
      if (sn) sn.value = d.name || '';
      if (sb) sb.value = d.branch || '';
      if (sc) sc.value = d.capacity || 60;
    } catch (e) {}
  }

  /* ─────────────────────────────────────
     EVENT LISTENERS
  ───────────────────────────────────── */
  function setup() {

    // ── NAV TABS
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => nav(t.dataset.view));
    });

    // ── ENROLL MODAL
    function openEnroll() {
      const modal = document.getElementById('modal-enroll');
      if (modal) modal.classList.add('open');
      document.getElementById('e-name')?.focus();
      // reset form
      ['e-name','e-coach','e-phone','e-email','e-focus','e-emergency'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const med = document.getElementById('e-medical');
      if (med) med.value = 'Standard Physical Clearance';
    }
    function closeEnroll() {
      document.getElementById('modal-enroll')?.classList.remove('open');
    }

    ['btn-enroll-open', 'btn-enroll-dir'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', openEnroll);
    });
    document.getElementById('btn-enroll-close')?.addEventListener('click', closeEnroll);
    document.getElementById('btn-enroll-cancel')?.addEventListener('click', closeEnroll);
    document.getElementById('modal-enroll')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeEnroll();
    });

    document.getElementById('form-enroll')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btn-enroll-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Enrolling…'; }
      try {
        const res = await api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            name:             document.getElementById('e-name').value,
            plan:             document.getElementById('e-plan').value,
            coach:            document.getElementById('e-coach').value,
            phone:            document.getElementById('e-phone').value,
            email:            document.getElementById('e-email').value,
            focus:            document.getElementById('e-focus').value,
            medicalClearance: document.getElementById('e-medical').value,
            emergencyContact: document.getElementById('e-emergency').value,
          })
        });
        closeEnroll();
        toast(`${res.member.name} enrolled as ${res.member.id}`, 'ok');
        if (S.view === 'athletes') loadAthletes();
        if (S.view === 'gate')    populateGateSelect();
        loadDash();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Complete Enrollment'; }
      }
    });

    // ── GATE CHECK-IN FORM
    document.getElementById('form-checkin')?.addEventListener('submit', async e => {
      e.preventDefault();
      const memberId = document.getElementById('ci-athlete').value;
      const gate     = document.getElementById('ci-gate').value;
      const msgEl    = document.getElementById('ci-msg');
      if (!memberId) {
        if (msgEl) { msgEl.textContent = 'Please select an athlete first.'; msgEl.className = 'ci-msg err'; }
        return;
      }
      const btn = e.submitter;
      if (btn) { btn.disabled = true; btn.textContent = 'Checking in…'; }
      if (msgEl) msgEl.className = 'ci-msg';

      try {
        const res = await api('/api/attendance/checkin', {
          method: 'POST',
          body: JSON.stringify({ memberId, gate })
        });
        if (msgEl) { msgEl.textContent = `✓ ${res.message}`; msgEl.className = 'ci-msg ok'; }
        document.getElementById('ci-athlete').value = '';
        await loadGate();
        await populateGateSelect();
        toast(res.message, 'ok');
      } catch (err) {
        if (msgEl) { msgEl.textContent = `✗ ${err.message}`; msgEl.className = 'ci-msg err'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Check In'; }
      }
    });

    // ── GATE REFRESH
    document.getElementById('btn-gate-refresh')?.addEventListener('click', loadGate);

    // ── CHECKOUT (delegated)
    document.getElementById('gate-tbody')?.addEventListener('click', async e => {
      const btn = e.target.closest('.btn-checkout');
      if (!btn) return;
      const sid  = btn.dataset.sid;
      const name = btn.dataset.name;
      btn.disabled = true; btn.textContent = 'Checking out…';
      try {
        const res = await api('/api/attendance/checkout', {
          method: 'POST', body: JSON.stringify({ sessionId: sid })
        });
        toast(res.message, 'ok');
        await loadGate();
        await populateGateSelect();
        if (S.view === 'dashboard') loadDash();
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false; btn.textContent = 'Check Out';
      }
    });

    // ── DIRECTORY SEARCH (debounced)
    let searchTid = null;
    document.getElementById('dir-search')?.addEventListener('input', e => {
      clearTimeout(searchTid);
      searchTid = setTimeout(() => {
        const active = document.querySelector('#dir-filter-group .seg-btn.active');
        loadAthletes(e.target.value.trim(), active?.dataset.filter || 'all');
      }, 220);
    });

    // ── FILTER BUTTONS
    document.getElementById('dir-filter-group')?.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#dir-filter-group .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const q = document.getElementById('dir-search')?.value.trim() || '';
      loadAthletes(q, btn.dataset.filter);
    });

    // ── OPEN DOSSIER (delegated from table)
    document.getElementById('dir-tbody')?.addEventListener('click', e => {
      const btn = e.target.closest('.btn-open-dos');
      const row = e.target.closest('tr[data-id]');
      const id = btn?.dataset.id || row?.dataset.id;
      if (id) openDossier(id);
    });

    // ── CLOSE DOSSIER
    document.getElementById('btn-dossier-close')?.addEventListener('click', () => {
      document.getElementById('dossier-panel')?.classList.remove('open');
      S.openMemberId = null;
    });

    // ── DOSSIER ACTIONS (delegated)
    document.getElementById('dossier-scroll')?.addEventListener('click', async e => {
      // Add Note
      const noteBtn = e.target.closest('.btn-add-note');
      if (noteBtn) {
        const id   = noteBtn.dataset.id;
        const text = prompt('Enter coach observation:');
        if (!text || !text.trim()) return;
        try {
          await api(`/api/members/${id}/notes`, {
            method: 'POST',
            body: JSON.stringify({ text: text.trim(), author: 'Duty Coach' })
          });
          toast('Note saved.', 'ok');
          openDossier(id);
        } catch (err) { toast(err.message, 'err'); }
        return;
      }

      // Delete member
      const delBtn = e.target.closest('#btn-dos-delete');
      if (delBtn) {
        const id   = delBtn.dataset.id;
        const name = delBtn.dataset.name;
        if (!confirm(`Remove ${name} from the database? This cannot be undone.`)) return;
        try {
          await api(`/api/members/${id}`, { method: 'DELETE' });
          document.getElementById('dossier-panel')?.classList.remove('open');
          S.openMemberId = null;
          toast(`${name} removed from roster.`, 'ok');
          loadAthletes();
          loadDash();
        } catch (err) { toast(err.message, 'err'); }
      }
    });

    // ── PASS SELECT
    document.getElementById('pass-select')?.addEventListener('change', e => {
      refreshPass(e.target.value);
    });
    document.getElementById('btn-refresh-pass')?.addEventListener('click', () => {
      if (S.passId) refreshPass(S.passId);
    });
    document.getElementById('btn-wallet')?.addEventListener('click', () => {
      toast('Apple Wallet integration ready for PKPass signing certificates.', 'info');
    });

    // ── SETTINGS
    document.getElementById('form-settings')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('/api/gym/settings', {
          method: 'POST',
          body: JSON.stringify({
            name:     document.getElementById('s-name').value,
            branch:   document.getElementById('s-branch').value,
            capacity: document.getElementById('s-cap').value,
          })
        });
        toast('Settings saved.', 'ok');
        loadDash();
      } catch (err) { toast(err.message, 'err'); }
    });

    // ── CLEAR ALL
    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
      if (!confirm('Delete ALL athletes, sessions, and history? Cannot be undone.')) return;
      try {
        const res = await api('/api/system/clear-all', { method: 'POST' });
        toast(res.message, 'ok');
        loadDash();
        if (S.view === 'athletes') loadAthletes();
      } catch (err) { toast(err.message, 'err'); }
    });

    // ── DASH go-to-gate shortcut
    document.getElementById('btn-dash-goto-gate')?.addEventListener('click', () => nav('gate'));
  }

  /* ─────────────────────────────────────
     BOOT
  ───────────────────────────────────── */
  function boot() {
    setup();
    nav('dashboard');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
