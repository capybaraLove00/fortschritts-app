(() => {
  'use strict';

  const KEY = 'fortschritt.v1';
  const $ = id => document.getElementById(id);

  // ---------- Daten ----------
  // sets: { id, date: 'JJJJ-MM-TT', exercise, weight, reps, ts }
  // body: { id, date, kg }
  // durations: { id, date, seconds }  (Dauer eines Trainingstags)
  // timer: { start: Millisekunden } oder null, solange ein Training läuft
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return {
          sets: Array.isArray(d.sets) ? d.sets : [],
          body: Array.isArray(d.body) ? d.body : [],
          durations: Array.isArray(d.durations) ? d.durations : [],
          timer: d.timer && Number.isFinite(d.timer.start) ? { start: d.timer.start } : null
        };
      }
    } catch (e) { /* nicht lesbar: leer starten */ }
    return { sets: [], body: [], durations: [], timer: null };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('Speichern im Browser ist fehlgeschlagen. Exportiere ein Backup und prüfe die Browser-Einstellungen.');
    }
  }

  // ---------- Hilfsfunktionen ----------
  const pad = n => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${d}.${m}.${y.slice(2)}`;
  }

  // 82.5 -> "82,5"
  const fmtNum = n => String(Math.round(n * 100) / 100).replace('.', ',');
  // "82,5" -> 82.5
  const parseNum = str => parseFloat(String(str).replace(',', '.'));

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const byDateThenTs = (a, b) => (a.date === b.date ? a.ts - b.ts : (a.date < b.date ? -1 : 1));

  // Übungsnamen: Groß-/Kleinschreibung egal, der zuerst eingetragene Name gilt
  function exerciseNames() {
    const seen = new Map();
    data.sets.slice().sort((a, b) => a.ts - b.ts).forEach(s => {
      const k = s.exercise.toLowerCase();
      if (!seen.has(k)) seen.set(k, s.exercise);
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
  }

  function canonicalExercise(input) {
    const name = input.trim().replace(/\s+/g, ' ');
    const found = exerciseNames().find(n => n.toLowerCase() === name.toLowerCase());
    return found || name;
  }

  // ---------- Seiten ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + name; });
    $('topbar').hidden = name === 'home';

    if (name === 'home') renderHome();
    if (name === 'training') { renderTraining(); renderTimer(); }
    if (name === 'verlauf') renderVerlauf();
    if (name === 'koerper') renderBody();

    const page = $('tab-' + name);
    page.classList.remove('enter');
    void page.offsetWidth; // Animation neu starten
    page.classList.add('enter');
    window.scrollTo(0, 0);
  }

  // Seite öffnen und im Verlauf merken, damit "Zurück" auch per Wischgeste/Browser funktioniert
  function go(name) {
    try { history.pushState({ tab: name }, ''); } catch (e) { /* ohne Verlauf weiter */ }
    showTab(name);
  }

  // Training immer mit einem bestimmten Tag öffnen (Liste: heute, Karte: letzter Trainingstag)
  function openTraining(date) {
    $('set-date').value = date;
    go('training');
    updateHint();
  }

  document.querySelectorAll('[data-go]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.go === 'training') openTraining(todayStr());
      else go(b.dataset.go);
    });
  });

  $('last-card').addEventListener('click', () => openTraining(lastTrainingDate() || todayStr()));

  $('back').addEventListener('click', () => {
    if (history.state && history.state.tab) history.back();
    else showTab('home');
  });

  window.addEventListener('popstate', e => showTab((e.state && e.state.tab) || 'home'));

  // ---------- Startseite ----------
  function renderHome() {
    $('home-date').textContent = new Date().toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    $('home-training').textContent = homeTrainingText();

    const ex = exerciseNames().length;
    $('home-verlauf').textContent = ex ? `${ex} ${ex === 1 ? 'Übung' : 'Übungen'}` : '';

    const latest = data.body.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
    $('home-body').textContent = latest ? `${fmtNum(latest.kg)} kg` : '';

    renderLast();
  }

  // ---------- Karte: letztes Training ----------
  function lastTrainingDate() {
    if (!data.sets.length) return null;
    return data.sets.reduce((m, s) => (s.date > m ? s.date : m), data.sets[0].date);
  }

  function renderLast() {
    const stats = $('last-stats');
    const rows = $('last-ex');
    stats.replaceChildren();
    rows.replaceChildren();

    const date = lastTrainingDate();
    if (!date) {
      $('last-title').textContent = 'Noch kein Training';
      $('last-sub').textContent = 'Tippe hier, um den ersten Satz einzutragen.';
      return;
    }

    const [y, m, d] = date.split('-').map(Number);
    $('last-title').textContent = new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    const ago = dayNumber(todayStr()) - dayNumber(date);
    $('last-sub').textContent = ago === 0 ? 'heute' : ago === 1 ? 'gestern' : ago > 1 ? `vor ${ago} Tagen` : '';

    const sets = data.sets.filter(s => s.date === date).sort((a, b) => a.ts - b.ts);
    const groups = new Map(); // Übung (klein geschrieben) -> Sätze, in Reihenfolge des Trainings
    sets.forEach(s => {
      const k = s.exercise.toLowerCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    });

    const seconds = durationOf(date);
    const dur = seconds > 0 ? cardDuration(seconds) : { value: '–', label: 'Dauer' };
    [
      ['dur', dur.value, dur.label],
      ['ex', groups.size, 'Übungen'],
      ['sets', sets.length, 'Sätze']
    ].forEach(([cls, value, label]) => {
      const stat = el('span', 'stat');
      stat.append(el('span', 'stat-value ' + cls, String(value)), el('span', 'stat-label', label));
      stats.append(stat);
    });

    groups.forEach((list, key) => {
      const top = Math.max(...list.map(s => s.weight));
      const right = el('span', 'dash-right');
      right.append(el('span', null,
        (top > 0 ? `${fmtNum(top)} kg · ` : '') + `${list.length} ${list.length === 1 ? 'Satz' : 'Sätze'}`));

      // Entwicklung: Top-Gewicht gegenüber dem Training davor mit dieser Übung
      if (top > 0) {
        const trend = el('span', 'trend', 'neu');
        const earlier = data.sets.filter(s => s.exercise.toLowerCase() === key && s.date < date);
        if (earlier.length) {
          const prevDate = earlier.reduce((mx, s) => (s.date > mx ? s.date : mx), earlier[0].date);
          const prevTop = Math.max(...earlier.filter(s => s.date === prevDate).map(s => s.weight));
          const diff = top - prevTop;
          if (diff > 0) { trend.textContent = `+${fmtNum(diff)} kg`; trend.classList.add('up'); }
          else if (diff < 0) trend.textContent = `−${fmtNum(-diff)} kg`;
          else trend.textContent = 'gleich';
        }
        right.append(trend);
      }

      const row = el('span', 'dash-row');
      row.append(el('span', 'dash-name', list[0].exercise), right);
      rows.append(row);
    });
  }

  // ---------- Timer und Trainingsdauer ----------
  let tickId = null;

  function dateOf(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // 3125000 ms -> "52:05", ab einer Stunde "1:02:05"
  function clock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const sec = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  function durationOf(date) {
    return data.durations.filter(x => x.date === date).reduce((sum, x) => sum + x.seconds, 0);
  }

  // Text für die Liste im Training: "52 Min." oder "1 Std. 05 Min."
  function durText(seconds) {
    const m = Math.max(1, Math.round(seconds / 60));
    return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${pad(m % 60)} Min.`;
  }

  // Wert und Beschriftung für die Karte
  function cardDuration(seconds) {
    const m = Math.max(1, Math.round(seconds / 60));
    return m < 60 ? { value: String(m), label: 'Minuten' } : { value: `${Math.floor(m / 60)}:${pad(m % 60)}`, label: 'Stunden' };
  }

  function homeTrainingText() {
    if (data.timer) return `läuft · ${clock(Date.now() - data.timer.start)}`;
    const n = data.sets.filter(s => s.date === todayStr()).length;
    return n ? `${n} ${n === 1 ? 'Satz' : 'Sätze'} heute` : '';
  }

  function tickTimer() {
    if (!data.timer) return;
    $('timer-value').textContent = clock(Date.now() - data.timer.start);
    $('home-training').textContent = homeTrainingText();
  }

  // Zeigt Start- oder Laufansicht und startet/stoppt den Sekundentakt
  function renderTimer() {
    const running = !!data.timer;
    $('timer-idle').hidden = running;
    $('timer-run').hidden = !running;
    if (running) {
      const t = new Date(data.timer.start);
      $('timer-since').textContent = `Gestartet um ${pad(t.getHours())}:${pad(t.getMinutes())} Uhr`;
      tickTimer();
      if (tickId === null) tickId = setInterval(tickTimer, 1000);
    } else if (tickId !== null) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  $('timer-start').addEventListener('click', () => {
    data.timer = { start: Date.now() };
    save();
    renderTimer();
  });

  $('timer-stop').addEventListener('click', () => {
    if (!data.timer) return;
    if (!confirm('Training beenden und Dauer speichern?')) return;
    const seconds = Math.round((Date.now() - data.timer.start) / 1000);
    data.durations.push({ id: uid(), date: dateOf(data.timer.start), seconds });
    data.timer = null;
    save();
    renderTimer();
    renderTraining();
    $('home-training').textContent = homeTrainingText();
  });

  $('timer-cancel').addEventListener('click', () => {
    if (!confirm('Timer verwerfen? Es wird keine Dauer gespeichert.')) return;
    data.timer = null;
    save();
    renderTimer();
    $('home-training').textContent = homeTrainingText();
  });

  // Zeile "Dauer" im Training: zeigt die Dauer des gewählten Tages mit Ändern-Knopf
  function renderDayDuration(date, hasSets) {
    const box = $('day-dur');
    box.replaceChildren();
    const seconds = durationOf(date);
    if (!hasSets && seconds === 0) return;

    const row = el('div', 'item');
    row.append(el('span', null, 'Dauer'));
    const right = el('span', 'dur-right');
    right.append(el('span', null, seconds > 0 ? durText(seconds) : '–'));
    const edit = el('button', 'linkbtn', seconds > 0 ? 'Ändern' : 'Eintragen');
    edit.type = 'button';
    edit.addEventListener('click', () => editDuration(date));
    right.append(edit);
    row.append(right);
    box.append(row);
  }

  function editDuration(date) {
    const seconds = durationOf(date);
    const input = prompt('Dauer in Minuten (leer lassen, um sie zu entfernen):',
      seconds > 0 ? String(Math.round(seconds / 60)) : '');
    if (input === null) return; // abgebrochen

    const text = input.trim();
    let minutes = null;
    if (text !== '') {
      minutes = parseNum(text);
      if (!(minutes > 0 && minutes <= 1440)) {
        alert('Bitte eine Dauer zwischen 1 und 1440 Minuten angeben.');
        return;
      }
    }
    data.durations = data.durations.filter(x => x.date !== date);
    if (minutes !== null) data.durations.push({ id: uid(), date, seconds: Math.round(minutes * 60) });
    save();
    renderTraining();
  }

  // ---------- Training ----------
  function renderTraining() {
    const date = $('set-date').value;

    $('exercise-list').replaceChildren(...exerciseNames().map(n => {
      const o = document.createElement('option');
      o.value = n;
      return o;
    }));

    $('day-title').textContent = date === todayStr() ? 'Heute' : 'Sätze am ' + fmtDate(date);

    const box = $('day-sets');
    box.replaceChildren();

    const daySets = data.sets.filter(s => s.date === date).sort((a, b) => a.ts - b.ts);
    renderDayDuration(date, daySets.length > 0);
    if (!daySets.length) {
      box.append(el('p', 'hint', 'Noch keine Sätze an diesem Tag.'));
      return;
    }

    // nach Übung gruppieren, Reihenfolge = erster Satz
    const groups = new Map();
    daySets.forEach(s => {
      const k = s.exercise.toLowerCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    });

    groups.forEach(list => {
      const g = el('div', 'group');
      g.append(el('div', 'group-title', list[0].exercise));
      list.forEach((s, i) => {
        const item = el('div', 'item');
        item.append(el('span', null, `Satz ${i + 1}: ${fmtNum(s.weight)} kg × ${s.reps}`));
        const del = el('button', 'del', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', 'Satz löschen');
        del.addEventListener('click', () => {
          if (confirm('Diesen Satz löschen?')) {
            data.sets = data.sets.filter(x => x.id !== s.id);
            save();
            renderTraining();
            updateHint();
          }
        });
        item.append(del);
        g.append(item);
      });
      box.append(g);
    });
  }

  // zeigt die Sätze des letzten Trainings dieser Übung (vor dem gewählten Datum)
  function updateHint() {
    const hint = $('last-hint');
    const name = $('set-exercise').value.trim();
    const date = $('set-date').value;
    hint.hidden = true;
    if (!name) return null;

    const key = name.toLowerCase();
    const earlier = data.sets.filter(s => s.exercise.toLowerCase() === key && s.date < date);
    if (!earlier.length) return null;

    const lastDate = earlier.reduce((m, s) => (s.date > m ? s.date : m), earlier[0].date);
    const lastSets = earlier.filter(s => s.date === lastDate).sort((a, b) => a.ts - b.ts);
    hint.textContent = `Zuletzt (${fmtDate(lastDate)}): ` +
      lastSets.map(s => `${fmtNum(s.weight)}×${s.reps}`).join(', ');
    hint.hidden = false;
    return lastSets;
  }

  // Übung gewählt: Hinweis zeigen und Gewicht/Wiederholungen vorbelegen
  function onExerciseChange() {
    const lastSets = updateHint();
    const key = $('set-exercise').value.trim().toLowerCase();
    const date = $('set-date').value;

    const today = data.sets
      .filter(s => s.date === date && s.exercise.toLowerCase() === key)
      .sort((a, b) => a.ts - b.ts);
    const src = today.length ? today[today.length - 1] : (lastSets && lastSets[0]);

    $('set-weight').value = src ? fmtNum(src.weight) : '';
    $('set-reps').value = src ? src.reps : '';
  }

  $('set-form').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('set-date').value;
    const exercise = canonicalExercise($('set-exercise').value);
    const weight = parseNum($('set-weight').value);
    const reps = parseInt($('set-reps').value, 10);

    if (!date || !exercise || !(weight >= 0) || !(reps >= 1)) {
      alert('Bitte Übung, Gewicht (mindestens 0) und Wiederholungen (mindestens 1) prüfen.');
      return;
    }

    data.sets.push({ id: uid(), date, exercise, weight, reps, ts: Date.now() });
    save();
    $('set-exercise').value = exercise;
    renderTraining();
    updateHint();
    $('set-weight').focus();
  });

  $('set-date').addEventListener('change', () => { renderTraining(); updateHint(); });
  $('set-exercise').addEventListener('change', onExerciseChange);

  // ---------- Verlauf ----------
  function renderVerlauf() {
    const names = exerciseNames();
    $('verlauf-empty').hidden = names.length > 0;
    $('verlauf-content').hidden = names.length === 0;
    if (!names.length) return;

    const sel = $('verlauf-exercise');
    const current = sel.value;
    sel.replaceChildren(...names.map(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      return o;
    }));
    sel.value = names.includes(current) ? current : names[0];
    drawVerlauf();
  }

  function drawVerlauf() {
    const key = $('verlauf-exercise').value.toLowerCase();
    const sets = data.sets.filter(s => s.exercise.toLowerCase() === key).sort(byDateThenTs);

    const byDate = new Map();
    sets.forEach(s => {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    });

    const dates = [...byDate.keys()];
    const pts = dates.map(d => ({ date: d, y: Math.max(...byDate.get(d).map(s => s.weight)) }));

    drawChart($('verlauf-chart'), pts.slice(-20), {
      type: 'bar', theme: 'train', label: 'Letztes Training', aria: 'Top-Gewicht pro Training'
    });

    const best = pts.reduce((m, p) => (p.y > m.y ? p : m), pts[0]);
    $('verlauf-stats').textContent =
      `${dates.length} ${dates.length === 1 ? 'Training' : 'Trainings'} · ` +
      `Bestes Gewicht: ${fmtNum(best.y)} kg (${fmtDate(best.date)})`;

    const list = $('verlauf-list');
    list.replaceChildren();
    dates.slice().reverse().forEach(d => {
      const item = el('div', 'item');
      item.append(el('span', null, fmtDate(d)));
      item.append(el('span', null, byDate.get(d).map(s => `${fmtNum(s.weight)}×${s.reps}`).join(' · ')));
      list.append(item);
    });
  }

  $('verlauf-exercise').addEventListener('change', drawVerlauf);

  // ---------- Körpergewicht ----------
  function renderBody() {
    const sorted = data.body.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    drawChart($('body-chart'), sorted.map(b => ({ date: b.date, y: b.kg })), {
      type: 'line', theme: 'body', label: 'Zuletzt eingetragen', aria: 'Körpergewicht im Verlauf'
    });

    const list = $('body-list');
    list.replaceChildren();
    sorted.slice().reverse().forEach(b => {
      const item = el('div', 'item');
      item.append(el('span', null, `${fmtDate(b.date)}: ${fmtNum(b.kg)} kg`));
      const del = el('button', 'del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', 'Eintrag löschen');
      del.addEventListener('click', () => {
        if (confirm('Diesen Eintrag löschen?')) {
          data.body = data.body.filter(x => x.id !== b.id);
          save();
          renderBody();
        }
      });
      item.append(del);
      list.append(item);
    });
  }

  $('body-form').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('body-date').value;
    const kg = parseNum($('body-weight').value);
    if (!date || !(kg > 0 && kg < 500)) {
      alert('Bitte Datum und ein Körpergewicht zwischen 0 und 500 kg angeben.');
      return;
    }
    // pro Tag nur ein Eintrag: ersetzen
    data.body = data.body.filter(b => b.date !== date);
    data.body.push({ id: uid(), date, kg });
    save();
    $('body-weight').value = '';
    renderBody();
  });

  // ---------- Diagramm im Stil der Apple-Gesundheit/Fitness-App ----------
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * pow;
  }

  function dayNumber(str) {
    const [y, m, d] = str.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  }

  const shortDate = str => `${str.slice(8)}.${str.slice(5, 7)}.`;

  // pts: [{ date, y }] aufsteigend nach Datum
  // opts: { type: 'bar' | 'line', label (Text über dem Wert), aria }
  // Antippen wählt einen Punkt aus, erneutes Antippen hebt die Auswahl auf.
  function drawChart(box, pts, opts) {
    box.replaceChildren();
    box.dataset.theme = opts.theme;
    if (!pts.length) {
      box.append(el('div', 'empty', 'Noch keine Daten.'));
      return;
    }

    const W = 360, H = 250, L = 12, R = 46, T = 14, B = 34;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const isBar = opts.type === 'bar';
    const n = pts.length;

    // Wertebereich: Balken beginnen bei 0, Linien passen sich den Daten an
    const ys = pts.map(p => p.y);
    let min = isBar ? 0 : Math.min(...ys);
    let max = Math.max(...ys);
    if (isBar) { if (max <= 0) max = 1; }
    else if (min === max) { min -= 1; max += 1; }
    const step = niceStep((max - min) / 3);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const py = v => T + (hi - v) / (hi - lo) * plotH;

    // x-Mitte jedes Punktes
    let slot = 0;
    let cx;
    if (isBar) {
      slot = Math.min(plotW / n, 64);
      const x0 = L + plotW - slot * n; // rechtsbündig: neuestes Training an der Achse
      cx = i => x0 + slot * (i + 0.5);
    } else {
      const xs = pts.map(p => dayNumber(p.date));
      const a = xs[0];
      const b = xs[n - 1];
      const pad = 8;
      cx = i => (b === a ? L + plotW / 2 : L + pad + (xs[i] - a) / (b - a) * (plotW - 2 * pad));
    }

    // Wertanzeige oben
    const head = el('div', 'readout');
    const lab = el('div', 'readout-label');
    const val = el('div', 'readout-value');
    const dat = el('div', 'readout-date');
    head.append(lab, val, dat);

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria });
    box.append(head, svg);

    let sel = null; // null = nichts ausgewählt, Anzeige zeigt den neuesten Wert

    function draw() {
      const i = sel === null ? n - 1 : sel;
      lab.textContent = sel === null ? opts.label : 'Ausgewählt';
      val.replaceChildren(document.createTextNode(fmtNum(pts[i].y)), el('span', 'readout-unit', ' kg'));
      dat.textContent = fmtDate(pts[i].date);

      svg.replaceChildren();

      // Raster mit Werten rechts
      const ticks = Math.round((hi - lo) / step);
      for (let k = 0; k <= ticks; k++) {
        const v = lo + k * step;
        const y = py(v);
        svg.append(svgEl('line', {
          x1: L, x2: W - R, y1: y, y2: y, class: isBar && k === 0 ? 'baseline' : 'grid'
        }));
        svg.append(svgEl('text', { x: W - R + 8, y: y + 4, class: 'tick-label' }, fmtNum(v)));
      }

      // Datum unten
      let idxs;
      if (isBar) idxs = n <= 7 ? pts.map((_, k) => k) : [0, Math.floor((n - 1) / 2), n - 1];
      else idxs = n === 1 ? [0] : [0, n - 1];
      idxs.forEach(k => {
        const x = Math.min(Math.max(cx(k), L + 20), W - R - 20);
        svg.append(svgEl('text', { x, y: H - 10, 'text-anchor': 'middle', class: 'tick-label' }, shortDate(pts[k].date)));
      });

      if (isBar) {
        const bw = Math.min(slot * 0.62, 34);
        pts.forEach((p, k) => {
          const h = Math.max(py(lo) - py(p.y), 3);
          const x = cx(k) - bw / 2;
          const y = py(lo) - h;
          const r = Math.min(bw / 2, 9, h);
          // oben abgerundeter Balken
          const d = `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + bw - r}A${r},${r} 0 0 1 ${x + bw},${y + r}V${y + h}Z`;
          svg.append(svgEl('path', { d, class: 'bar' + (sel !== null && sel !== k ? ' dim' : '') }));
        });
      } else {
        if (sel !== null) {
          svg.append(svgEl('line', { x1: cx(sel), x2: cx(sel), y1: T, y2: T + plotH, class: 'marker' }));
        }
        if (n > 1) {
          svg.append(svgEl('polyline', {
            points: pts.map((p, k) => `${cx(k).toFixed(1)},${py(p.y).toFixed(1)}`).join(' '),
            class: 'line'
          }));
        }
        pts.forEach((p, k) => {
          svg.append(svgEl('circle', { cx: cx(k), cy: py(p.y), r: k === i ? 7 : 4.5, class: 'dot' }));
        });
      }
    }

    svg.addEventListener('click', e => {
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) * W / rect.width;
      let best = -1;
      let bestDist = Infinity;
      pts.forEach((p, k) => {
        const d = Math.abs(cx(k) - x);
        if (d < bestDist) { bestDist = d; best = k; }
      });
      const hit = bestDist <= (isBar ? slot / 2 : 24) ? best : -1;
      sel = hit === -1 || hit === sel ? null : hit;
      draw();
    });

    draw();
  }

  // ---------- Export / Import ----------
  function msg(text) { $('data-msg').textContent = text; }

  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fortschritt-${todayStr()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('Backup exportiert.');
  });

  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  function cleanSet(s) {
    if (!s || typeof s.exercise !== 'string' || !s.exercise.trim() || !isDate(s.date)) return null;
    const weight = Number(s.weight);
    const reps = Math.round(Number(s.reps));
    if (!(weight >= 0) || !(reps >= 1)) return null;
    return {
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      date: s.date,
      exercise: s.exercise.trim().replace(/\s+/g, ' '),
      weight,
      reps,
      ts: Number(s.ts) || 0
    };
  }

  function cleanDuration(x) {
    if (!x || !isDate(x.date)) return null;
    const seconds = Math.round(Number(x.seconds));
    if (!(seconds > 0 && seconds <= 86400)) return null;
    return { id: typeof x.id === 'string' && x.id ? x.id : uid(), date: x.date, seconds };
  }

  function cleanBody(b) {
    if (!b || !isDate(b.date)) return null;
    const kg = Number(b.kg);
    if (!(kg > 0 && kg < 500)) return null;
    return { id: typeof b.id === 'string' && b.id ? b.id : uid(), date: b.date, kg };
  }

  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const sets = (Array.isArray(d.sets) ? d.sets : []).map(cleanSet).filter(Boolean);
      const body = (Array.isArray(d.body) ? d.body : []).map(cleanBody).filter(Boolean);
      const durations = (Array.isArray(d.durations) ? d.durations : []).map(cleanDuration).filter(Boolean);

      const haveSets = new Set(data.sets.map(s => s.id));
      const haveDays = new Set(data.body.map(b => b.date));
      const newSets = sets.filter(s => !haveSets.has(s.id));
      const newBody = body.filter(b => !haveDays.has(b.date));
      const haveDurations = new Set(data.durations.map(x => x.id));
      const newDurations = durations.filter(x => !haveDurations.has(x.id));

      data.sets.push(...newSets);
      data.body.push(...newBody);
      data.durations.push(...newDurations);
      save();
      const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      msg(`${pl(newSets.length, 'Satz', 'Sätze')}, ${pl(newBody.length, 'Körpergewicht', 'Körpergewichte')} ` +
        `und ${pl(newDurations.length, 'Trainingsdauer', 'Trainingsdauern')} hinzugefügt.`);
    } catch (err) {
      msg('Die Datei konnte nicht gelesen werden.');
    }
    e.target.value = '';
  });

  // ---------- Start ----------
  $('set-date').value = todayStr();
  $('body-date').value = todayStr();
  renderHome();
  renderTimer(); // läuft ein Training noch, geht die Uhr weiter

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Cache weiter */ });
  }
})();
