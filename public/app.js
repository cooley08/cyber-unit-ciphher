(function () {
  'use strict';
  const S = window.Subnet;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('en-US');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // localStorage can throw (private mode, blocked storage)
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('subnetlab:' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem('subnetlab:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }
  };

  // ---------- tabs ----------
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function showTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      $('panel-' + t.dataset.tab).hidden = !on;
    });
    store.set('tab', name);
    if (name === 'practice') {
      if (!current) nextQuestion();
      else if (!answered) $('q-input').focus();
    }
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- calculator ----------
  const calcInput = $('calc-input');

  function renderCalc() {
    const parsed = S.parseInput(calcInput.value);
    if (parsed.error) {
      $('calc-error').textContent = calcInput.value.trim() ? parsed.error : '';
      $('calc-out').hidden = true;
      return;
    }
    $('calc-error').textContent = '';
    $('calc-out').hidden = false;
    const r = S.calculate(parsed.ip, parsed.cidr);
    const ip = S.intToIp;

    const rows = [
      ['Network', `${ip(r.network)}/${r.cidr}`],
      ['Broadcast', r.cidr >= 31 ? `${ip(r.broadcast)} (not used)` : ip(r.broadcast)],
      ['First host', ip(r.first)],
      ['Last host', ip(r.last)],
      ['Usable hosts', fmt(r.usable)],
      ['Total addresses', fmt(r.total)],
      ['Subnet mask', ip(r.mask)],
      ['Wildcard mask', ip(r.wildcard)],
      ['Class', S.ipClass(r.ip)],
      ['Type', S.addressType(r.ip)]
    ];
    $('calc-results').replaceChildren(...rows.map(([k, v]) => {
      const tr = el('tr');
      const td = el('td', 'copy', v);
      td.dataset.copy = v.split(' ')[0];
      td.title = 'Click to copy';
      tr.append(el('th', null, k), td);
      return tr;
    }));

    $('calc-steps').replaceChildren(...S.explainRange(r.ip, r.cidr).map((s) => el('li', null, s)));

    $('calc-binary').replaceChildren(...[
      ['IP', r.ip], ['Mask', r.mask], ['Network', r.network], ['Broadcast', r.broadcast]
    ].map(([label, val]) => {
      const tr = el('tr');
      const bitsCell = el('td');
      const bits = S.toBinary(val);
      bitsCell.append(
        el('span', 'net', bits.slice(0, r.cidr).replace(/(.{8})(?=.)/g, '$1.')),
        r.cidr > 0 && r.cidr < 32 && r.cidr % 8 === 0 ? '.' : '',
        el('span', 'host', insertDots(bits, r.cidr))
      );
      tr.append(el('td', null, label), bitsCell, el('td', null, ip(val)));
      return tr;
    }));
  }

  // host part of the bit string, with dots placed at the right octet boundaries
  function insertDots(bits, start) {
    let out = '';
    for (let i = start; i < 32; i++) {
      if (i > start && i % 8 === 0) out += '.';
      out += bits[i];
    }
    return out;
  }

  calcInput.addEventListener('input', renderCalc);

  // click a result to copy it
  $('calc-results').addEventListener('click', (e) => {
    const td = e.target.closest('td.copy');
    if (!td) return;
    const done = () => {
      td.classList.add('copied');
      setTimeout(() => td.classList.remove('copied'), 900);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(td.dataset.copy).then(done, () => {});
  });
  document.querySelectorAll('[data-example]').forEach((b) => {
    b.addEventListener('click', () => { calcInput.value = b.dataset.example; renderCalc(); calcInput.focus(); });
  });

  // ---------- practice ----------
  const focusSel = $('focus');
  const diffSel = $('difficulty');
  Object.entries(S.TYPES).forEach(([key, label]) => {
    const o = el('option', null, label);
    o.value = key;
    focusSel.appendChild(o);
  });
  diffSel.value = store.get('difficulty', 'easy');
  if (!S.DIFFICULTY[diffSel.value]) diffSel.value = 'easy';
  focusSel.value = store.get('focus', 'all');
  if (!focusSel.value) focusSel.value = 'all';

  const emptyStats = () => ({ correct: 0, total: 0, streak: 0, best: 0, byType: {} });
  let stats = store.get('stats', null);
  if (!stats || typeof stats !== 'object' || !stats.byType) stats = emptyStats();

  let current = null;
  let answered = false;

  function nextQuestion() {
    current = S.makeQuestion(diffSel.value, focusSel.value);
    answered = false;
    $('q-type').textContent = current.label;
    $('q-prompt').textContent = current.prompt;
    $('q-feedback').hidden = true;
    const yesno = current.kind === 'yesno';
    $('q-form').hidden = yesno;
    $('q-yesno').hidden = !yesno;
    const input = $('q-input');
    input.value = '';
    input.disabled = false;
    document.querySelectorAll('#q-form button, #q-yesno button').forEach((b) => { b.disabled = false; });
    if (!yesno && !$('panel-practice').hidden) input.focus();
  }

  function submitAnswer(value) {
    if (answered || !current) return;
    if (current.kind !== 'yesno' && !String(value).trim()) return;
    answered = true;
    const ok = current.check(value);

    if (ok) {
      // burst from whatever was clicked (or the Check button when Enter was pressed)
      const a = document.activeElement;
      const origin = a && a.closest && a.closest('#panel-practice button') ? a : (current.kind === 'yesno' ? $('q-yesno') : $('q-submit'));
      const box = origin.getBoundingClientRect();
      const next = stats.streak + 1;
      const milestone = next === 5 || next % 10 === 0;
      confetti(box.left + box.width / 2, box.top + box.height / 2, milestone ? 160 : 60);
    }

    stats.total++;
    if (ok) { stats.correct++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
    else stats.streak = 0;
    const t = stats.byType[current.type] || (stats.byType[current.type] = { c: 0, t: 0 });
    t.t++; if (ok) t.c++;
    store.set('stats', stats);
    renderStats();

    $('q-input').disabled = true;
    document.querySelectorAll('#q-form button, #q-yesno button').forEach((b) => { b.disabled = true; });

    const verdict = $('q-verdict');
    verdict.className = ok ? 'good' : 'bad';
    verdict.textContent = ok ? 'Correct.' : `Incorrect. The answer is ${current.answer}.`;
    $('q-steps').replaceChildren(...current.explain.map((s) => el('li', null, s)));
    const fb = $('q-feedback');
    fb.className = '';
    void fb.offsetWidth; // restart the animation
    fb.className = ok ? 'right' : 'wrong';
    fb.hidden = false;
    $('q-next').focus();
  }

  function renderStats() {
    const heat = stats.streak >= 10 ? 'heat-3' : stats.streak >= 5 ? 'heat-2' : stats.streak >= 3 ? 'heat-1' : '';
    $('stats').replaceChildren(
      'Score: ', el('b', null, `${stats.correct}/${stats.total}`),
      '  |  Streak: ', el('b', 'streak ' + heat, String(stats.streak)),
      '  |  Best: ', el('b', null, String(stats.best))
    );

    const entries = Object.entries(stats.byType)
      .filter(([k, v]) => S.TYPES[k] && v.t > 0)
      .sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t) || b[1].t - a[1].t);
    $('weak-empty').hidden = entries.length > 0;
    $('weak-table').hidden = entries.length === 0;
    $('weak-list').replaceChildren(...entries.map(([k, v]) => {
      const tr = el('tr');
      tr.append(
        el('td', null, S.TYPES[k]),
        el('td', null, `${v.c}/${v.t}`),
        el('td', null, Math.round((v.c / v.t) * 100) + '%')
      );
      return tr;
    }));
  }

  $('q-form').addEventListener('submit', (e) => { e.preventDefault(); submitAnswer($('q-input').value); });
  $('q-yesno').querySelectorAll('[data-answer]').forEach((b) => {
    b.addEventListener('click', () => submitAnswer(b.dataset.answer));
  });
  document.querySelectorAll('.q-skip').forEach((b) => b.addEventListener('click', nextQuestion));
  $('q-next').addEventListener('click', nextQuestion);
  diffSel.addEventListener('change', () => { store.set('difficulty', diffSel.value); nextQuestion(); });
  focusSel.addEventListener('change', () => { store.set('focus', focusSel.value); nextQuestion(); });
  $('reset-stats').addEventListener('click', () => {
    if (!confirm('Reset practice stats?')) return;
    stats = emptyStats();
    store.set('stats', stats);
    renderStats();
  });

  // ---------- confetti ----------
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CONFETTI_COLORS = ['#157a3a', '#4ade80', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7'];
  let canvas = null;
  let ctx = null;
  let parts = [];
  let running = false;

  function confetti(x, y, count) {
    if (reduceMotion) return;
    if (!canvas) {
      canvas = el('canvas', 'confetti');
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(innerWidth * dpr) || canvas.height !== Math.round(innerHeight * dpr)) {
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    }
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // mostly upward
      const speed = 6 + Math.random() * 8;
      parts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        life: 0,
        max: 90 + Math.random() * 50
      });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life < p.max && p.y < innerHeight + 30);
    for (const p of parts) {
      p.life++;
      p.vy += 0.25;            // gravity
      p.vx *= 0.99; p.vy *= 0.99; // air drag
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.life * 0.15)); // flutter
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(tick);
    else running = false;
  }

  // ---------- reference ----------
  [128, 192, 224, 240, 248, 252, 254, 255].forEach((v, i) => {
    const tr = el('tr');
    tr.append(el('td', null, String(i + 1)), el('td', null, String(v)), el('td', null, String(256 - v)));
    $('octet-table').appendChild(tr);
  });
  for (let c = 8; c <= 32; c++) {
    const r = S.calculate(0, c);
    const tr = el('tr');
    tr.append(
      el('td', null, '/' + c),
      el('td', null, S.intToIp(r.mask)),
      el('td', null, S.intToIp(r.wildcard)),
      el('td', null, fmt(r.total)),
      el('td', null, fmt(r.usable))
    );
    $('cidr-table').appendChild(tr);
  }

  // ---------- init ----------
  renderCalc();
  renderStats();
  const savedTab = store.get('tab', 'calc');
  showTab(['calc', 'practice', 'cheat'].includes(savedTab) ? savedTab : 'calc');
})();
