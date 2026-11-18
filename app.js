/* Prüfungstrainer – generische App-Logik (Blaupause ~/Projekte/_vorlagen/app-projekt.md; Stand Basis: Referenzprojekt vom 20.10.2026)
   Alles Prüfungsspezifische steht in config.js (window.APP_CONFIG).
   Datenbasis: data/katalog.json (ein Eintrag pro Frage, siehe README „Datenmodell“).
   Änderungshistorie und Begründungen: docs/PROTOKOLL.md */

/* ---------- Konstanten aus der Konfiguration ---------- */
const CFG = window.APP_CONFIG;
const EXAMS = CFG.exams;
const COUNT_STEP = CFG.countStep || 10;
const PASS_RATE = CFG.passRate;
const PASS_PCT = Math.round(PASS_RATE * 100);
const SECONDS_PER_QUESTION = CFG.secondsPerQuestion;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];   // angezeigte Buchstaben je Position; Fragen haben 4 (klassisch) bis 6 Optionen (Zuordnung)
/* Texte kommen aus i18n.js (t(), getLang() …); config.js führt für Texte nur Schlüssel (siehe dort). Anzeige-Hilfen: */
const cfgT = k => k ? t(k) : '';                      // Konfig-Feld (Schlüssel) → Text in der aktuellen Sprache
const appName = () => t(CFG.appTitle);
const sourceNote = () => t(CFG.sourceNote);
const nounOf = s => t(s.mode === 'exam' ? 'noun.exam' : 'noun.practice');   // „Prüfung“ / „Übung“
/* Frage in der aktuellen Sprache: optionales Feld q.en = { question, opts:{A..}, expl:{A..}, items?, scenario?, groupIntro?, rationale? }.
   Fehlt es (oder einzelne Teile), gilt der deutsche Text (Rückfall). Der Katalog selbst bleibt unverändert. */
const _enCache = new WeakMap();
function L(q){
  if(getLang() !== 'en' || !q.en) return q;
  let v = _enCache.get(q);
  if(!v){ v = { ...q, ...q.en, opts: { ...q.opts, ...(q.en.opts || {}) }, expl: { ...q.expl, ...(q.en.expl || {}) } }; _enCache.set(q, v); }
  return v;
}
/* Feedback per Teams-Direktlink (config.feedbackTeams); Hinweis-Banner auf der Startseite ist wegklickbar, die Wahl wird gemerkt ({Präfix}hint) */
const feedbackUrl = msg => CFG.feedbackTeams ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURI(CFG.feedbackTeams)}${msg ? '&message=' + encodeURIComponent(msg) : ''}` : '';
const HINT_KEY = (CFG.storagePrefix || '') + 'hint';
const hintDismissed = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch(e) { return false; } };
const minutesFor = n => Math.round(n * SECONDS_PER_QUESTION / 60);

/* ---------- Einstellungen (pro Browser gemerkt) ---------- */
const DEFAULT_SETTINGS = {
  mode: 'exam',                              // 'exam' = Reale Prüfung, 'training' = Trainieren
  exam: EXAMS[0].code,
  count: 20,                                 // Fragen im Training; 0 = „Alle“ (alle Fragen der Auswahl)
  examOpts: { sim: true, shuffle: false },   // Reale Prüfung: Simulation standardmäßig an, Mischen aus
  scenDesk: false,                           // Szenario-Seitenleiste am Desktop beim Start einer Prüfung geöffnet
  trainingOpts: { sim: false, source: 'all', topics: [], exams: [] },  // Trainieren: immer gemischt; Quelle siehe SOURCES; topics/exams leer = alle
};
/* Fragenquellen im Training (Fehler = zuletzt falsch beantwortet, Markiert = beim letzten Vorkommen markiert) */
const SOURCES = [{ id: 'all' }, { id: 'errors' }, { id: 'flagged' }, { id: 'both' }];   // Beschriftungen: Schlüssel src.<id>.label/.title/.short
const srcLabel = x => t('src.' + x.id + '.label');
const srcTitle = (x, lang) => t('src.' + x.id + '.title', null, lang);
function loadSettings(){
  try {
    const s = JSON.parse(localStorage.getItem(CFG.storagePrefix + 'settings') || '{}');
    const t = { ...DEFAULT_SETTINGS.trainingOpts, ...(s.trainingOpts || {}) };
    // Abwärtskompatibel: bis 15.10.2026 gab es nur den Schalter „errorsOnly“
    if(!(s.trainingOpts && s.trainingOpts.source)) t.source = s.trainingOpts && s.trainingOpts.errorsOnly ? 'errors' : 'all';
    if(!SOURCES.some(x => x.id === t.source)) t.source = 'all';
    if(!Array.isArray(t.topics)) t.topics = [];          // Abwärtskompatibel: Einstellungen vor dem 20.10.2026 ohne Themenauswahl
    if(!Array.isArray(t.exams)) t.exams = [];            // Abwärtskompatibel: Einstellungen vor dem 26.10.2026 ohne Fragequellen
    // Gültig: 0 = „Alle“ oder ein Vielfaches der Schrittweite (frühere Knöpfe 10–70 bleiben damit gültig)
    if(s.count !== undefined && s.count !== 0 && !(Number.isInteger(s.count) && s.count > 0 && s.count % COUNT_STEP === 0)) s.count = DEFAULT_SETTINGS.count;
    delete t.errorsOnly;
    if(!EXAMS.some(e => e.code === s.exam)) delete s.exam;   // gemerkte Prüfung gibt es nicht mehr → Standard
    return { ...DEFAULT_SETTINGS, ...s, examOpts: { ...DEFAULT_SETTINGS.examOpts, ...(s.examOpts || {}) }, trainingOpts: t };
  } catch(e) { return structuredClone(DEFAULT_SETTINGS); }
}
function saveSettings(){ try { localStorage.setItem(CFG.storagePrefix + 'settings', JSON.stringify(settings)); } catch(e) {} }
const settings = loadSettings();

/* ---------- Verlauf: Speicherschicht ----------
   Gekapselt, damit sie später (Roadmap Schritt 4: Konten/Server) ausgetauscht werden kann.
   Ein Durchlauf („run“) speichert je Frage nur ID, angezeigte Optionsreihenfolge, Antwort-Schlüssel und Markierung;
   Fragetexte kommen beim Ansehen wieder aus dem Katalog. */
const store = {
  key: CFG.storagePrefix + 'history',
  load(){ try { const h = JSON.parse(localStorage.getItem(this.key) || '[]'); return Array.isArray(h) ? h : []; } catch(e) { return []; } },
  save(history){ try { localStorage.setItem(this.key, JSON.stringify(history)); return true; } catch(e) { return false; } },
};
let HISTORY = store.load();

/* ---------- Zustand ---------- */
let CATALOG = [];
let BY_ID = {};
let GROUPS = {};        // Zuordnungsblöcke: group → Teilfragen in Originalreihenfolge
let SCENARIO = null;    // data/szenario.json (optional; ohne Datei gibt es keinen Szenario-Knopf)
const state = {
  view: 'start',        // 'start' | 'exam' | 'result'
  loading: true, loadError: null,
  session: null,        // laufende Prüfung / Trainingseinheit, siehe newSession()
  pos: 0,
  reviewMode: false,
  modal: null,
  timerId: null,
  scenOpen: false,      // Szenario-Panel sichtbar (nur in der Prüfungsansicht)
  filterOpen: null,     // Trainings-Filter aufgeklappt; null = automatisch (offen, wenn ein Filter aktiv ist)
};

const app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuffled = arr => { const a = [...arr]; for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const examOf = code => EXAMS.find(e => e.code === code);
const passMark = n => Math.ceil(n * PASS_RATE);

/* ---------- Fragen & Antworten ----------
   Antworten werden intern über feste Schlüssel (A–D der Katalogfrage) gespeichert.
   Angezeigt wird ein Buchstabe je Position: item.perm[i] ist der Schlüssel, der an Position LETTERS[i] steht. */
const keysOf = q => Object.keys(q.opts).sort();               // Optionsschlüssel der Katalogfrage (A–D bzw. A–F)
const hasExpl = q => { const v = L(q); return keysOf(q).every(k => v.expl[k]); };          // Begründung zu jeder Option vorhanden (in der aktuellen Sprache, sonst deutsch)
const rightKeys = q => Array.isArray(q.answer) ? q.answer : [q.answer];
const isRight = (q, key) => !!key && rightKeys(q).includes(key);
const shown = (item, key) => LETTERS[item.perm.indexOf(key)];
/* Gespeicherte Reihenfolge nur übernehmen, wenn sie zur heutigen Frage passt (Fragen können durch eine neue Fassung
   ersetzt sein, z. B. Musterprüfung 2 am 27.10.2026) – sonst Originalreihenfolge. Ebenso nur Antworten mit gültigem Schlüssel. */
const fitPerm = (q, perm) => { const k = keysOf(q); return perm && [...perm].sort().join('') === [...k].sort().join('') ? perm.split('') : k; };
const fitAns = (q, a) => a && keysOf(q).includes(a) ? a : null;
const rightLabel = item => rightKeys(item.q).map(k => shown(item, k)).sort().join(t('join.or'));
const rightText = item => rightKeys(item.q).map(k => `${shown(item, k)} – ${esc(L(item.q).opts[k])}`).join(' / ');
const originNo = (q, code) => { const o = q.origin.find(o => o.startsWith(code + '-')); return o ? Number(o.split('-')[1]) : 0; };
/* Zuordnungsblöcke (Feld group): gemeinsame Einleitung + Optionsliste, die Einleitung nennt die Buchstaben („A–F“).
   Daher werden ihre Optionen nie gemischt und die Teilfragen eines Blocks bleiben immer zusammen und in Reihenfolge. */
const qLabel = q => q.group ? t('group.label', { q: L(q).question }) : L(q).question;
const groupPos = q => GROUPS[q.group].indexOf(q) + 1;
/* Fokus-Hinweis (Fehler-/Markiert-Training) ist deutsch gespeichert; Anzeige in der aktuellen Sprache */
const focusLabel = f => String(f).split(' · ').map(x => ({ 'zuletzt falsch': 'focus.wrong', 'markiert': 'focus.flagged' }[x])).map((k, i, a) => k ? t(k) : String(f).split(' · ')[i]).join(' · ');
/* Fragen zu „Einheiten“ bündeln: ein Block = eine Einheit (alle Teilfragen), sonst jede Frage einzeln */
function unitsFrom(questions){
  const seen = new Set(), units = [];
  questions.forEach(q => {
    if(!q.group){ units.push([q]); return; }
    if(seen.has(q.group)) return;
    seen.add(q.group); units.push(GROUPS[q.group]);
  });
  return units;
}
/* Größte erreichbare Fragenanzahl ≤ target, wenn Blöcke nur ganz gezogen werden */
function unitTotal(units, target){
  const blocks = units.filter(u => u.length > 1), singles = units.length - blocks.length;
  let best = 0;
  for(let b = 0, sum = 0; b <= blocks.length && sum <= target; sum += (blocks[b] || []).length, b++) best = Math.max(best, sum + Math.min(singles, target - sum));
  return best;
}
/* Zufällige Einheiten bis genau unitTotal(): zuerst zufällig auffüllen, eine Restlücke durch Tausch Einzelfragen → Block schließen */
function pickUnits(units, target){
  const goal = unitTotal(units, target), pool = shuffled(units);
  let chosen = [], n = 0;
  pool.forEach(u => { if(n + u.length <= goal){ chosen.push(u); n += u.length; } });
  for(const blk of pool.filter(u => u.length > 1 && !chosen.includes(u))){
    const need = blk.length - (goal - n), singles = chosen.filter(u => u.length === 1);
    if(n >= goal) break;
    if(need >= 0 && singles.length >= need){ const drop = new Set(singles.slice(0, need)); chosen = chosen.filter(u => !drop.has(u)); chosen.push(blk); n = n - need + blk.length; }
  }
  return shuffled(chosen);
}

/* ---------- Laden ---------- */
function loadCatalog(){
  // Passwortschutz: Die Anmeldemaske in index.html hat die verschlüsselten Daten (data/inhalt.enc.json) bereits entschlüsselt
  const pre = window.APP_DATA;
  // cache: 'no-cache' = beim Server nachfragen (ETag); Katalog-Korrekturen kommen sofort an, unverändert kostet es kaum etwas
  (pre ? Promise.resolve(pre.katalog) : fetch('data/katalog.json', { cache: 'no-cache' }).then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }))
    .then(data => {
      CATALOG = data; BY_ID = Object.fromEntries(data.map(q => [q.id, q]));
      GROUPS = {};
      data.filter(q => q.group).forEach(q => (GROUPS[q.group] ||= []).push(q));
      Object.values(GROUPS).forEach(g => g.sort((a, b) => a.origin[0].localeCompare(b.origin[0], 'de', { numeric: true })));   // technische Sortierung, sprachunabhängig
      state.loading = false;
      const saved = loadCurrent();                          // unterbrochener Durchlauf (Neuladen, Tab geschlossen …)?
      if(saved) state.modal = { type: 'restore', saved };
      render();
    })
    .catch(err => {
      state.loading = false;
      state.loadError = location.protocol === 'file:' ? { key: 'load.errFile' } : { key: 'load.errFetch', vars: { msg: err.message } };   // Schlüssel statt Text: folgt der Sprache
      render();
    });
  (pre ? Promise.resolve(pre.szenario) : fetch('data/szenario.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null))
    .then(data => { SCENARIO = data; renderScenario(); if(state.view === 'exam') render(); })
    .catch(() => {});
}

/* ---------- Sitzung erzeugen ---------- */
function newSession(){
  let items, title, sim, shuffle;
  if(settings.mode === 'exam'){
    const code = settings.exam;
    sim = settings.examOpts.sim; shuffle = settings.examOpts.shuffle;
    const qs = CATALOG.filter(q => q.origin.some(o => o.startsWith(code + '-')))
      .sort((a, b) => originNo(a, code) - originNo(b, code));
    // Gemischt: Einheiten mischen (Blöcke bleiben zusammen und in Reihenfolge)
    items = (shuffle ? shuffled(unitsFrom(qs)).flat() : qs).map(q => {
        const own = q.origin.find(o => o.startsWith(code + '-'));
        // Originalreihenfolge der Optionen dieser Prüfung, oder gemischt (Zuordnungsblöcke nie)
        const perm = shuffle && !q.group ? shuffled(keysOf(q)) : (q.optOrder?.[own] || keysOf(q).join('')).split('');
        return { q, perm, origNo: originNo(q, code) };
      });
    title = t(examOf(code).title, null, 'de');     // gespeichert deutsch (siehe oben)
  } else {
    sim = settings.trainingOpts.sim; shuffle = true;
    const src = SOURCES.find(x => x.id === settings.trainingOpts.source) || SOURCES[0];
    const st = questionStatus(), pool = narrow(sourcePool(src.id, st)), inPool = new Set(pool.map(q => q.id));
    // Blöcke nur komplett (jeder Block gehört ganz zu einem Thema); bei Fehler-/Markiert-Training wird die betroffene Teilfrage gekennzeichnet
    items = pickUnits(unitsFrom(pool), wantedCount()).flat().map(q => ({
      q, perm: q.group ? keysOf(q) : shuffled(keysOf(q)),
      focus: src.id !== 'all' && q.group && inPool.has(q.id) ? [st.wrong[q.id] && 'zuletzt falsch', st.flagged[q.id] && 'markiert'].filter(Boolean).join(' · ') : '',   // gespeichert deutsch (Format unverändert), angezeigt über focusLabel()
    }));
    title = trainingTitle(src, chosenTopics(), chosenExams(), items.length, 'de');   // gespeichert immer deutsch (Verlauf/Sicherung unverändert), angezeigt über sessionTitle()
  }
  return { mode: settings.mode, exam: settings.mode === 'exam' ? settings.exam : null, title, sim, shuffle, items,
           answers: {}, flags: new Set(), elapsed: 0,
           pending: {},     // ohne Simulation: ausgewählt, aber noch nicht bestätigt (zählt als offen, wird nicht gespeichert)
           limit: sim ? Math.round(items.length * SECONDS_PER_QUESTION) : 0,   // 0 = Stoppuhr ohne Limit
           timeout: false };
}

/* ---------- Szenario-Panel ----------
   Statisches Element außerhalb von #app (index.html), damit Scrollposition und Inhalt beim Neuzeichnen der Frage
   erhalten bleiben. Desktop: Seitenleiste, der Inhalt rückt nach links; Handy (≤ 900 px): Overlay über der Frage. */
const scenPanel = document.getElementById('scenPanel');
const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;
/* Szenario in der aktuellen Sprache: optionales Feld SCENARIO.en (gleiche Form wie das Original), sonst deutsch */
const scen = () => getLang() === 'en' && SCENARIO.en ? { ...SCENARIO, ...SCENARIO.en } : SCENARIO;
function renderScenario(){
  if(!SCENARIO) return;
  const sc = scen();
  scenPanel.innerHTML = `<div class="scen-head"><b>${esc(sc.title)}</b><button class="btn small" id="scenClose">${t('scen.close')}</button></div>
    <div class="scen-body">${scenarioBody(sc)}<p class="time-note">${esc(sc.source)}</p></div>`;
  document.getElementById('scenClose').onclick = () => setScen(false);
}
function setScen(open, remember = true){
  state.scenOpen = !!open && !!SCENARIO && state.view === 'exam';
  scenPanel.hidden = !state.scenOpen;
  document.body.classList.toggle('scen-open', state.scenOpen);
  if(remember && isDesktop()){ settings.scenDesk = state.scenOpen; saveSettings(); }
  document.querySelectorAll('[data-scen]').forEach(b => {
    b.classList.toggle('active', state.scenOpen); b.setAttribute('aria-expanded', state.scenOpen);
    b.textContent = t(state.scenOpen ? 'scen.hide' : 'scen.show');
  });
  if(state.scenOpen && !isDesktop()) scenPanel.focus();
}
// Panel beginnt unter der (klebenden) Kopfzeile – deren Höhe ändert sich mit Schriftgröße und Breite
const headerEl = document.querySelector('header');
const setHdr = () => document.documentElement.style.setProperty('--hdr', headerEl.offsetHeight + 'px');
new ResizeObserver(setHdr).observe(headerEl); setHdr();

/* ---------- Zeit: Simulation an = Countdown (1 Min./Frage), sonst Stoppuhr ---------- */
function fmt(s){ return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function showTimer(){
  const s = state.session;
  const countdown = s.limit > 0;
  timer.hidden = false;
  // Tempo-Leiste (immer): Ø Zeit pro Antwort im Vergleich zum Prüfungstempo (Zeitlimit der Prüfung ÷ Fragenanzahl, siehe config.js).
  // Punkt links = schneller, rechts = langsamer. Ohne Simulation zählen bestätigte Antworten,
  // in der Simulation alle gegebenen (dort gibt es kein „Bestätigen“).
  const done = Object.keys(s.answers).length, avg = done ? s.elapsed / done : 0;
  const ratio = done ? avg / SECONDS_PER_QUESTION : 1;
  const pos = Math.max(4, Math.min(96, 50 + (ratio - 1) * 50));            // 0,5× … 1,5× Prüfungstempo → 4 … 96 %
  const slow = done && ratio > 1;
  const fill = pos < 50 ? `left:${pos}%;right:50%` : `left:50%;right:${100 - pos}%`;
  const target = fmt(Math.round(SECONDS_PER_QUESTION));
  const pace = `<div class="tbar pace${slow ? ' slow' : ''}" title="${esc(t('timer.paceTitle', { target, info: cfgT(CFG.examInfo) }))}"
      aria-label="${esc(t('timer.paceAria', { time: fmt(s.elapsed) }) + (done ? t('timer.paceAriaAvg', { avg: fmt(Math.round(avg)), target }) : ''))}">
      <span class="pv">${t('timer.duration')} <b>${fmt(s.elapsed)}</b></span>
      <span class="pace-m" aria-hidden="true">${done ? `<i class="pace-f" style="${fill}"></i><i class="pace-d" style="left:${pos}%"></i>` : ''}</span>
      <span class="pv pv-r">Ø <b>${done ? fmt(Math.round(avg)) : '–'}</b><span class="pf"> ${t('timer.perQuestion')}</span></span></div>`;
  let count = '';
  if(countdown){
    // Simulation: Restzeit-Leiste füllt sich mit der verstrichenen Zeit; Text mittig, zweimal gesetzt
    // (normal auf dem leeren Teil, Kontrastfarbe auf dem gefüllten Teil – per clip-path exakt an der Füllkante getrennt)
    const left = s.limit - s.elapsed, warn = left <= Math.min(300, s.limit / 5);
    const pct = Math.min(100, s.elapsed / s.limit * 100).toFixed(2);
    const label = `${t('timer.remaining')} <b>${fmt(left)}</b>`;
    count = `<div class="tbar count${warn ? ' warn' : ''}" role="timer" aria-label="${esc(t('timer.remainingAria', { time: fmt(left) }))}">
      <i class="tb-fill" style="width:${pct}%"></i><span class="tb-lbl" aria-hidden="true">${label}</span><span class="tb-lbl on" style="clip-path:inset(0 ${100 - pct}% 0 0)" aria-hidden="true">${label}</span></div>`;
  }
  timer.innerHTML = pace + count;
}
/* Pause: Zeit anhalten, ganze App mit undurchsichtigem Bildschirm abdecken (Frage nicht lesbar), Tastatur gesperrt */
function pauseSession(){
  if(state.view !== 'exam' || state.reviewMode || state.modal || !state.session) return;
  stopTimer(); state.modal = { type: 'pause' }; render();
  document.getElementById('modalResume')?.focus();
}
function resumeSession(){
  if(state.modal?.type !== 'pause') return;
  state.modal = null; render(); startTimer();                // läuft ab dem angehaltenen Stand weiter (elapsed bleibt)
}
document.getElementById('pauseBtn').onclick = pauseSession;
function startTimer(){
  stopTimer(); showTimer();
  state.timerId = setInterval(() => {
    const s = state.session; s.elapsed++; showTimer();
    if(s.limit && s.elapsed >= s.limit){ s.timeout = true; finish(); }
  }, 1000);
}
function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId = null; } }

/* ---------- Aktionen ---------- */
/* ---------- Laufenden Durchlauf sichern (Neuladen/Schließen) ----------
   Gesichert wird bei jeder Aktion (render) und beim Verlassen/Ausblenden der Seite (beforeunload, pagehide,
   visibilitychange) – nicht im Sekundentakt, damit die laufende Zeit trotzdem bis zum Verlassen mitgesichert ist. Beim nächsten Öffnen wird angeboten, fortzusetzen;
   die Zeit bleibt während der Unterbrechung stehen (läuft ab dem gesicherten Stand weiter). Nach Abgabe, Abbruch über
   „Startseite“ oder „Verwerfen“ wird die Sicherung gelöscht. Nur Verlauf-Durchläufe (past) werden nie gesichert. */
const CURRENT_KEY = CFG.storagePrefix + 'current';
const isRunning = () => state.view === 'exam' && !state.reviewMode && state.session && !state.session.past;
function currentSnapshot(){
  const s = state.session;
  return { v: 1, savedAt: new Date().toISOString(),
    mode: s.mode, exam: s.exam, title: s.title, sim: s.sim, shuffle: s.shuffle, limit: s.limit, elapsed: s.elapsed,
    items: s.items.map(it => ({ id: it.q.id, perm: it.perm.join(''), focus: it.focus || '' })),
    answers: s.answers, pending: s.pending || {}, flags: [...s.flags], pos: state.pos };
}
function saveCurrent(){
  if(!isRunning()) return;
  try { localStorage.setItem(CURRENT_KEY, JSON.stringify(currentSnapshot())); } catch(e) {}
}
function clearCurrent(){ try { localStorage.removeItem(CURRENT_KEY); } catch(e) {} }
/* Gesicherten Durchlauf prüfen (aus dem Browser-Speicher oder aus einer Sicherungsdatei); null = nicht fortsetzbar */
function checkCurrent(d){
  if(!d || d.v !== 1 || !Array.isArray(d.items) || typeof d.elapsed !== 'number') return null;
  const items = d.items.filter(x => x && BY_ID[x.id]);
  return items.length ? { ...d, items } : null;
}
function loadCurrent(){
  try {
    const raw = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null'), d = checkCurrent(raw);
    if(raw && !d) clearCurrent();                            // Katalog geändert → nichts mehr fortsetzbar
    return d;
  } catch(e) { return null; }
}
function restoreCurrent(d){
  const ids = new Set(d.items.map(x => x.id)), keep = o => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => ids.has(k) && fitAns(BY_ID[k], v)));
  state.session = { mode: d.mode, exam: d.exam, title: d.title, sim: d.sim, shuffle: d.shuffle, limit: d.limit, elapsed: d.elapsed, timeout: false,
    items: d.items.map(x => ({ q: BY_ID[x.id], perm: fitPerm(BY_ID[x.id], x.perm), focus: x.focus || '', origNo: d.exam ? originNo(BY_ID[x.id], d.exam) : 0 })),
    answers: keep(d.answers), pending: keep(d.pending), flags: new Set((d.flags || []).filter(id => ids.has(id))) };
  state.pos = Math.min(d.pos || 0, state.session.items.length - 1); state.reviewMode = false; state.modal = null;
  state.view = 'exam'; startTimer(); render(); window.scrollTo(0, 0);
}
/* Browser-Rückfrage beim Neuladen/Schließen, solange ein Durchlauf läuft (Text gibt der Browser vor) */
/* Eigene Knöpfe erlaubt der Browser dort nicht. Bleibt man auf der Seite („Abbrechen“), läuft der Zeitgeber danach weiter
   und bietet die Sicherung an; verlässt man sie, wird er nie ausgeführt (pagehide setzt leaving). */
let leaving = false;
addEventListener('beforeunload', e => {
  if(!isRunning()) return;
  saveCurrent(); e.preventDefault(); e.returnValue = '';
  setTimeout(() => { if(!leaving && isRunning() && !state.modal){ state.modal = { type: 'stay' }; render(); } }, 400);
});
addEventListener('pagehide', () => { leaving = true; saveCurrent(); });   // Handy/Safari: beforeunload kommt dort nicht zuverlässig
addEventListener('pageshow', () => { leaving = false; });
document.addEventListener('visibilitychange', () => { if(document.hidden) saveCurrent(); });

function start(){
  if(state.loading || state.loadError || !CATALOG.length) return;
  state.session = newSession(); state.pos = 0; state.reviewMode = false; state.modal = null;
  state.view = 'exam'; startTimer(); render(); window.scrollTo(0, 0);
  setScen(isDesktop() && settings.scenDesk, false);
}
function current(){ return state.session.items[state.pos]; }
/* Simulation: Klick = Antwort (jederzeit änderbar, Feedback erst nach Abgabe).
   Ohne Simulation: Klick = nur Auswahl (frei wechselbar); erst „Bestätigen“ wertet und zeigt die Begründung. */
function choose(letter){
  const s = state.session, item = current(), key = item.perm[LETTERS.indexOf(letter)];
  if(state.reviewMode) return;
  if(s.sim){ s.answers[item.q.id] = key; render(); return; }
  if(s.answers[item.q.id]) return;               // bestätigte Antwort bleibt stehen
  s.pending[item.q.id] = key;
  render();
}
function confirmAnswer(){
  const s = state.session, id = current().q.id;
  if(state.reviewMode || s.sim || s.answers[id] || !s.pending[id]) return;
  s.answers[id] = s.pending[id]; delete s.pending[id];
  render();
}
function go(pos){ state.pos = Math.max(0, Math.min(state.session.items.length - 1, pos)); render(); window.scrollTo({top: 0, behavior: 'smooth'}); }
function toggleFlag(){ const f = state.session.flags, id = current().q.id; f.has(id) ? f.delete(id) : f.add(id); render(); }
function askFinish(){
  const s = state.session; const open = s.items.length - Object.keys(s.answers).length;
  if(open === 0) return finish();
  state.modal = { type: 'finish', open }; render();
}
function finish(){
  stopTimer(); timer.hidden = true; state.modal = null; clearCurrent();
  if(!state.session.past) recordRun();
  state.view = 'result'; render(); window.scrollTo(0, 0);
}

/* ---------- Verlauf: aufzeichnen, wiederherstellen, auswerten ---------- */
function recordRun(){
  const s = state.session;
  if(s.runId) return;
  const run = {
    v: 1,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    mode: s.mode, exam: s.exam, title: s.title, sim: s.sim, shuffle: s.shuffle,
    limit: s.limit, elapsed: s.elapsed, timeout: s.timeout,
    total: s.items.length, score: score(),
    items: s.items.map(it => ({ id: it.q.id, perm: it.perm.join(''), a: s.answers[it.q.id] || null, f: s.flags.has(it.q.id) ? 1 : 0 })),
  };
  HISTORY.push(run);
  s.runId = run.id; s.date = run.date;
  s.saved = store.save(HISTORY);
}
function sessionFromRun(run){
  const known = run.items.filter(x => BY_ID[x.id]);
  return {
    mode: run.mode, exam: run.exam, title: run.title, sim: run.sim, shuffle: run.shuffle,
    items: known.map(x => ({ q: BY_ID[x.id], perm: fitPerm(BY_ID[x.id], x.perm), origNo: run.exam ? originNo(BY_ID[x.id], run.exam) : 0 })),
    answers: Object.fromEntries(known.filter(x => fitAns(BY_ID[x.id], x.a)).map(x => [x.id, x.a])),
    flags: new Set(known.filter(x => x.f).map(x => x.id)),
    elapsed: run.elapsed, limit: run.limit, timeout: run.timeout,
    runId: run.id, date: run.date, saved: true, past: true,
  };
}
const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
/* Status je Frage über alle Durchläufe (chronologisch):
   - wrong:   Ergebnis der letzten *beantworteten* Vorlage (true = falsch). Unbeantwortete Vorlagen ändern nichts –
              so landen bei einem Abbruch die offenen Fragen nicht im Fehlertraining (für die Bewertung zählen sie weiter als falsch).
   - flagged: Markierung bei der letzten Vorlage (wer eine Frage später nicht mehr markiert, nimmt sie wieder heraus). */
function questionStatus(){
  const wrong = {}, flagged = {};
  [...HISTORY].sort(byDate).forEach(run => run.items.forEach(x => {
    const q = BY_ID[x.id]; if(!q) return;
    if(x.a) wrong[x.id] = !isRight(q, x.a);
    flagged[x.id] = !!x.f;
  }));
  return { wrong, flagged };
}
function sourcePool(source, st = questionStatus()){
  if(source === 'errors')  return CATALOG.filter(q => st.wrong[q.id]);
  if(source === 'flagged') return CATALOG.filter(q => st.flagged[q.id]);
  if(source === 'both')    return CATALOG.filter(q => st.wrong[q.id] || st.flagged[q.id]);
  return CATALOG;
}
function errorPool(){ return sourcePool('errors'); }
/* Themenbereiche in Katalogreihenfolge (= Reihenfolge der Abschnitte in der Prüfung) */
const topicList = () => [...new Set(CATALOG.map(q => q.topic).filter(Boolean))];
/* Gewählte Themen; unbekannte (z. B. nach Katalogänderung) werden ignoriert, leer = alle */
const chosenTopics = () => settings.trainingOpts.topics.filter(t => topicList().includes(t));
const byTopics = (qs, topics = chosenTopics()) => topics.length ? qs.filter(q => topics.includes(q.topic)) : qs;
const wantedCount = () => settings.count || Infinity;     // 0 = „Alle“
const countLabel = (v, max) => v >= max ? t('count.all', { n: CATALOG.length }) : t('count.n', { n: v });
const topicShort = tp => topicLabel(tp.replace(/^Practice: /, ''));
const topicTitle = (topics, lang) => !topics.length ? '' : topics.length === 1 ? ` · ${topicShort(topics[0])}` : ` · ${t('filter.nTopics', { n: topics.length }, lang)}`;
/* Fragequellen = Prüfungen aus config.js (Musterprüfungen, später Mocks); leer = alle. Eine Frage zählt zu jeder Prüfung in origin. */
const inExam = (q, code) => q.origin.some(o => o.startsWith(code + '-'));
const chosenExams = () => settings.trainingOpts.exams.filter(c => EXAMS.some(e => e.code === c));
const byExams = (qs, exams = chosenExams()) => exams.length ? qs.filter(q => exams.some(c => inExam(q, c))) : qs;
const narrow = (qs, topics = chosenTopics(), exams = chosenExams()) => byExams(byTopics(qs, topics), exams);
const examNameOf = (code, lang) => t(examOf(code).title, null, lang);
const examTitle = (exams, lang) => !exams.length ? '' : exams.length === 1 ? ` · ${examNameOf(exams[0], lang)}` : ` · ${t('filter.nExams', { n: exams.length }, lang)}`;
const filterTitle = (topics, exams, lang) => examTitle(exams, lang) + topicTitle(topics, lang);
/* Titel einer Trainingseinheit: „Training · Prüfung · Thema · 20 Fragen“ */
const trainingTitle = (src, topics, exams, n, lang) => `${srcTitle(src, lang)}${filterTitle(topics, exams, lang)} · ${t('n.question', { n }, lang)}`;
/* Gespeicherte Titel sind deutsch (Verlauf, Sicherung, Berichte bleiben unverändert). Anzeige: Prüfungen über die Konfiguration,
   Trainingstitel (auch ältere Einträge) über Zerlegung des deutschen Titels; unbekannte Titel bleiben unverändert. */
function sessionTitle(s){
  if(getLang() === 'de') return s.title;
  if(s.mode === 'exam' && s.exam && examOf(s.exam)) return t(examOf(s.exam).title);
  const parts = String(s.title).split(' · '), last = /^(\d+) Fragen?$/.exec(parts[parts.length - 1] || '');
  const src = SOURCES.find(x => srcTitle(x, 'de') === parts[0]);
  if(!src || !last || parts.length < 2) return s.title;
  const mid = parts.slice(1, -1).map(p => {
    const ex = EXAMS.find(e => t(e.title, null, 'de') === p), nE = /^(\d+) Prüfungen$/.exec(p), nT = /^(\d+) Themen$/.exec(p);
    return ex ? t(ex.title) : nE ? t('filter.nExams', { n: +nE[1] }) : nT ? t('filter.nTopics', { n: +nT[1] }) : topicLabel(p);
  });
  return [srcTitle(src), ...mid, t('n.question', { n: +last[1] })].join(' · ');
}
function review(pos){ state.view = 'exam'; state.reviewMode = true; state.pos = pos; render(); window.scrollTo(0, 0); }
function score(){ const s = state.session; return s.items.filter(it => isRight(it.q, s.answers[it.q.id])).length; }

/* Begründungszeilen in derselben Reihenfolge wie die Antwortoptionen darüber (A, B, C …); richtig/eigene falsche Antwort
   erkennt man an der Farbe (und am Text „Richtig“ bzw. „Deine Antwort“), nicht an der Position.
   Falsche Optionen mit identischem Text (z. B. Zuordnungsblöcke: nur Literatur-Verweis wie „Siehe 5.5“) werden zusammengefasst. */
function explRows(item, chosen){
  const q = item.q, Q = L(q), ok = isRight(q, chosen), rows = [];
  [...item.perm].forEach(key => {
    const right = isRight(q, key), mine = key === chosen && !ok;
    const same = !right && !mine && rows.find(r => !r.right && !r.mine && r.text === Q.expl[key]);
    if(same) same.keys.push(key); else rows.push({ keys: [key], right, mine, text: Q.expl[key] });
  });
  return rows.map(r => ({ ...r, letters: r.keys.map(k => shown(item, k)).sort() }));
}
const scenarioBody = sc => `${sc.intro.map(b => `${b.heading ? `<h4>${esc(b.heading)}</h4>` : ''}${b.text ? `<p>${esc(b.text)}</p>` : ''}${b.list ? `<ul>${b.list.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`).join('')}
  <h3>${esc(sc.extraTitle)}</h3>
  <dl>${sc.roles.map(r => `<dt>${esc(r.name)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl>`;

/* ---------- Bericht zum Herunterladen (offline lesbar) ----------
   Eine einzelne HTML-Datei ohne externe Abhängigkeiten: öffnet in jedem Browser, druckbar / als PDF speicherbar.
   Reihenfolge: zuerst falsch und nicht beantwortete Fragen (aufgeklappt), dann richtige (zugeklappt). */
const fmtDate = iso => new Date(iso).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
function download(name, content, type){
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function reportFileName(s){
  const d = new Date(s.date || Date.now());
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const what = (s.mode === 'exam' ? t(examOf(s.exam).title, null, 'de') : s.title).replace(/[^\wäöüÄÖÜß]+/g, '-').replace(/-+$/, '');
  return `${CFG.reportPrefix}-Bericht_${what}_${stamp}.html`;
}
function reportQuestion(s, it, i){
  const q = it.q, Q = L(q), chosen = s.answers[q.id], ok = isRight(q, chosen);
  const withExpl = hasExpl(q);
  // Zusammengefasste Begründungen (identischer Text bei mehreren falschen Optionen) nur einmal unter der Liste
  const rows = withExpl ? explRows(it, chosen) : [], shared = rows.filter(r => r.keys.length > 1);
  const opts = it.perm.map((key, k) => {
    const right = isRight(q, key), mine = key === chosen;
    const cls = right ? 'right' : mine ? 'wrong' : '';
    const tag = right && mine ? t('opt.rightMine') : right ? t('opt.right') : mine ? t('opt.mine') : '';
    const own = withExpl && !shared.some(r => r.keys.includes(key));
    return `<li class="${cls}"><b>${right ? ICON_CHECK : mine ? ICON_X : LETTERS[k]}</b><div><span class="ot">${esc(Q.opts[key])}</span>${tag ? `<i>${tag}</i>` : ''}${own ? `<em>${esc(Q.expl[key])}</em>` : ''}</div></li>`;
  }).join('');
  const sharedHtml = shared.map(r => `<p class="sh"><b>${t('rep.shared', { letters: r.letters.join(', ') })}</b> ${esc(r.text)}</p>`).join('');
  const st = ok ? 'ok' : chosen ? 'bad' : 'open';
  const status = t(ok ? 'verdict.right' : chosen ? 'verdict.wrong' : 'rep.statusOpen');
  return `<details class="q ${st}" ${ok ? '' : 'open'}>
  <summary><span class="nr">${i + 1}</span><span class="qt">${esc(qLabel(q))}</span><span class="tp">${esc(q.topic ? topicLabel(q.topic) : '')}</span><span class="st">${status}</span></summary>
  <div class="qb">
  ${q.group ? `<p class="sc">${esc(Q.groupIntro)}</p><p class="gp">${t('group.pos', { i: groupPos(q), n: GROUPS[q.group].length })}</p>` : ''}
  ${Q.scenario ? `<p class="sc">${esc(Q.scenario)}</p>` : ''}
  <p class="qq">${esc(Q.question)}</p>
  ${Q.items.length ? `<ol class="it">${Q.items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
  <ul class="op">${opts}</ul>${sharedHtml}
  ${!withExpl && Q.rationale ? `<div class="ra"><b>${t('fb.rationale')}</b><p>${esc(Q.rationale)}</p></div>` : ''}
  ${!withExpl && !Q.rationale ? `<div class="ra"><b>${t('fb.solution')}</b><p>${t('rep.noRationale', { right: rightLabel(it) })}</p></div>` : ''}
  <p class="meta">${q.topic ? `${esc(topicLabel(q.topic))}${!q.ref && CFG.topicNoteShort ? ` (${esc(cfgT(CFG.topicNoteShort))})` : ''} · ` : ''}${q.ref ? `${esc(cfgT(CFG.refLabel))} ${esc(refLabel(q.ref))} · ` : ''}${t('meta.origin')} ${esc(q.origin.join(', '))} · ${q.id}</p>
  </div>
</details>`;
}
function buildReport(s){
  const total = s.items.length, sc = s.items.filter(it => isRight(it.q, s.answers[it.q.id])).length, pass = passMark(total);
  const passed = sc >= pass, pct = Math.round(sc / total * 100);
  const rows = s.items.map((it, i) => ({ it, i }));
  const notOk = rows.filter(({it}) => !isRight(it.q, s.answers[it.q.id]));
  const okRows = rows.filter(({it}) => isRight(it.q, s.answers[it.q.id]));
  const openN = notOk.filter(({it}) => !s.answers[it.q.id]).length, wrongN = notOk.length - openN;
  const topics = {};
  s.items.forEach(it => { if(!it.q.topic) return; const t = topics[it.q.topic] ||= {c: 0, n: 0}; t.n++; if(isRight(it.q, s.answers[it.q.id])) t.c++; });
  // Themenbereiche wie in der App: schwächster zuerst, Balken rosé unter der Bestehensgrenze
  const topicRows = Object.entries(topics).map(([tp, v]) => ({ t: topicLabel(tp), ...v, p: Math.round(v.c / v.n * 100) })).sort((a, b) => a.p - b.p || a.t.localeCompare(b.t, getLocale()));
  const timeVal = fmt(s.elapsed), timeSub = s.limit ? t('rep.timeOf', { limit: fmt(s.limit) }) + (s.timeout ? t('rep.timeUp') : '') : t('rep.stopwatch');
  const kind = [t(s.mode === 'exam' ? 'mode.exam' : 'mode.training'), s.sim ? t('badge.sim') : '', s.shuffle ? t('kind.shuffled') : ''].filter(Boolean).join(' · ');
  const title = sessionTitle(s);
  const R = 52, C = 2 * Math.PI * R;                       // Ergebnis-Ring (SVG)
  return `<!doctype html>
<html lang="${getLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t('rep.docTitle', { app: appName(), title }))}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Montserrat:wght@500;600;700&display=swap" rel="stylesheet">
<style>
/* Farben wie in der App (DevOps Foundation): Blau = Aktion, Grün = richtig, Orange-Rot = falsch (jeweils zusätzlich mit Symbol/Text) */
:root{--bg:#fff;--surf:#fff;--surf2:#f2f4f8;--border:#d5dde8;--line:#aab6c8;--ink:#1f2230;--muted:#55657a;
  --acc:#2f4c75;--accsoft:#e8eef7;--accink:#2f4c75;--ok:#3fb57f;--oksoft:#cdeedd;--okink:#0f4d33;--onok:#07301f;
  --bad:#ee6a48;--badsoft:#fdeae4;--badink:#8c2a12;--onbad:#2a0d05;--open:#c9a24a;--opensoft:#f8f0dc;--openink:#7a5a12}
@media screen and (prefers-color-scheme:dark){:root{--bg:#0f1722;--surf:#172230;--surf2:#212d3c;--border:#26364a;--line:#3f5470;--ink:#e6ecf4;--muted:#9aabc0;
  --acc:#8fb2e3;--accsoft:#1f2c45;--accink:#a9c4ec;--oksoft:#16362a;--okink:#9fe0bd;--badsoft:#3d211a;--badink:#f5b7a4;--opensoft:#3a3220;--openink:#e6c77a}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{font:15px/1.6 'Figtree',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg);max-width:880px;margin:0 auto;padding:0 20px 56px;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,.kpi b,.ring text,.eyebrow,.nr,.bw{font-family:'Montserrat',system-ui,sans-serif}
svg{flex:none}
.rh{display:flex;align-items:center;gap:14px;padding:22px 0 18px;border-bottom:1px solid var(--border);margin-bottom:32px}
.rh img{height:26px;width:auto}
.rh .lg-d{display:none}
@media screen and (prefers-color-scheme:dark){.rh .lg-l{display:none}.rh .lg-d{display:inline}}
.bw{font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:16px;color:var(--acc)}
.rh .doc{margin-left:auto;font-family:'Montserrat',system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accink);margin:0 0 6px}
h1{font-size:30px;line-height:1.15;font-weight:600;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 22px}
h2{font-size:20px;font-weight:600;margin:40px 0 14px;display:flex;align-items:baseline;gap:10px}
h2 small{font-family:'Figtree',sans-serif;font-size:14px;font-weight:500;color:var(--muted)}
.card{background:var(--surf);border:1px solid var(--border);border-radius:18px}
/* Ergebnis */
.hero{display:flex;align-items:center;gap:28px;padding:24px 28px}
.ring{width:132px;height:132px}
.ring .tr{stroke:var(--surf2)}.ring .fg{stroke:${passed ? 'var(--ok)' : 'var(--bad)'}}
.ring text{fill:var(--ink)}
.res{flex:1;min-width:0}
.pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 14px;font-weight:700;font-size:15px}
.pill.pass{background:var(--oksoft);color:var(--okink)}.pill.fail{background:var(--badsoft);color:var(--badink)}
.res p{margin:10px 0 14px;color:var(--muted)}
.res p b{color:var(--ink)}
.pbar{position:relative;height:10px;border-radius:999px;background:var(--surf2)}
.pbar i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:${passed ? 'var(--ok)' : 'var(--bad)'}}
.pbar u{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink);opacity:.55;border-radius:1px}
.pbar-l{position:relative;height:18px;font-size:12px;color:var(--muted);margin-top:8px}
.pbar-l span{position:absolute;top:0;white-space:nowrap}.pbar-l .m{transform:translateX(-50%)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.kpi{padding:14px 16px}.kpi b{display:block;font-size:22px;font-weight:600;line-height:1.2}.kpi span{color:var(--muted);font-size:13px}
.kpi.ok b{color:var(--okink)}.kpi.bad b{color:var(--badink)}.kpi.open b{color:var(--openink)}
/* Themenbereiche */
.topics{padding:8px 22px}
.tr-row{display:grid;grid-template-columns:minmax(0,1fr) 180px 92px;gap:16px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
.tr-row:last-child{border-bottom:0}
.tr-row .b{height:8px;border-radius:999px;background:var(--surf2);overflow:hidden}.tr-row .b i{display:block;height:100%;border-radius:999px;background:var(--ok)}
.tr-row.low .b i{background:var(--bad)}
.tr-row .v{text-align:right;font-variant-numeric:tabular-nums;font-size:14px;color:var(--muted)}.tr-row .v b{color:var(--ink);font-weight:600}
.note{font-size:13px;color:var(--muted);margin:10px 2px 0}
/* Fragen */
details.q{background:var(--surf);border:1px solid var(--border);border-radius:16px;margin:0 0 12px;break-inside:avoid}
summary{display:flex;gap:14px;align-items:center;padding:14px 18px;cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
.nr{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:14px}
.q.ok .nr{background:var(--oksoft);color:var(--okink)}.q.bad .nr{background:var(--badsoft);color:var(--badink)}.q.open .nr{background:var(--opensoft);color:var(--openink)}
.qt{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp{display:none;flex:1;min-width:0;font-size:13px;color:var(--muted)}
details[open] .qt{display:none}details[open] .tp{display:block}         /* aufgeklappt: Frage steht im Inhalt, oben nur der Themenbereich */
.st{flex:none;font-size:12px;font-weight:700;border-radius:999px;padding:4px 11px}
.q.ok .st{background:var(--oksoft);color:var(--okink)}.q.bad .st{background:var(--badsoft);color:var(--badink)}.q.open .st{background:var(--opensoft);color:var(--openink)}
.qb{padding:0 18px 16px 66px}
.sc{background:var(--surf2);border-radius:12px;padding:12px 16px;margin:0 0 12px;white-space:pre-line;font-size:14px}
.gp{font-family:'Montserrat',sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--accink);margin:0 0 6px}
.qq{font-weight:600;font-size:16px;margin:4px 0 12px}
ol.it{margin:0 0 12px;padding-left:22px}
ul.op{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:8px}
ul.op li{display:flex;gap:12px;border:1px solid var(--border);border-radius:14px;padding:10px 14px}
ul.op li>b{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:var(--surf2);color:var(--muted)}
ul.op li>div{flex:1;min-width:0}
ul.op li .ot{display:inline}
ul.op li i{display:inline-block;margin-left:8px;font-style:normal;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;vertical-align:1px}
ul.op li.right{background:var(--oksoft);border-color:transparent}ul.op li.right>b{background:var(--ok);color:var(--onok)}ul.op li.right i{background:var(--surf);color:var(--okink)}
ul.op li.wrong{background:var(--badsoft);border-color:transparent}ul.op li.wrong>b{background:var(--bad);color:var(--onbad)}ul.op li.wrong i{background:var(--surf);color:var(--badink)}
ul.op li em{display:block;font-style:normal;color:var(--muted);font-size:13.5px;margin-top:6px;line-height:1.55}
ul.op li.right em{color:var(--okink);opacity:.85}ul.op li.wrong em{color:var(--badink);opacity:.9}
.sh{font-size:13.5px;color:var(--muted);margin:0 0 10px;padding:0 4px}.sh b{color:var(--ink);font-weight:600}
.ra{background:var(--surf2);border-radius:12px;padding:10px 14px;margin:0 0 10px}.ra p{margin:4px 0 0;white-space:pre-line}
.meta{font-size:12px;color:var(--muted);margin:6px 0 0}
.empty{padding:18px 22px;color:var(--muted)}
/* Szenario-Anhang */
.scen{padding:6px 24px 18px}.scen h3{font-size:16px;margin:20px 0 6px}.scen h4{margin:14px 0 4px}.scen ul{margin:4px 0}
.scen dt{font-weight:700;margin-top:10px}.scen dd{margin:2px 0 0}
.foot{margin-top:44px;padding-top:18px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
.foot b{color:var(--ink);font-weight:600}
@media (max-width:640px){
  .hero{flex-direction:column;text-align:center;padding:22px}.res p{margin:10px 0}
  .kpis{grid-template-columns:repeat(2,1fr)}
  .tr-row{grid-template-columns:1fr 70px;gap:6px 12px}.tr-row .b{grid-column:1/-1;grid-row:2}
  .qb{padding:0 14px 14px}summary{padding:12px 14px;gap:10px}.qt{white-space:normal}
  .pbar-l span:first-child,.pbar-l span:last-child{display:none}
  .rh .doc{display:none}.rh img{height:22px}.bw{font-size:14px}
  h1{font-size:25px}
}
@media print{body{max-width:none;padding:0}.rh{padding-top:0}details.q,.card{break-inside:avoid}h2{break-after:avoid}}
</style>
<script>addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(d=>d.open=true))<\/script>
</head><body>
<header class="rh">${LOGO_DATA ? `<img class="lg-l" src="${LOGO_DATA}" alt="${esc(CFG.logoAlt || appName())}">${LOGO_DARK_DATA ? `<img class="lg-d" src="${LOGO_DARK_DATA}" alt="" aria-hidden="true">` : ''}` : `<b>${esc(CFG.brand)}</b>`}${CFG.brandWord ? `<span class="bw">${esc(CFG.brandWord)}</span>` : ''}<span class="doc">${t('rep.docLabel')}</span></header>
<p class="eyebrow">${t('rep.eyebrow', { kind: esc(kind) })}</p>
<h1>${esc(title)}</h1>
<p class="sub">${fmtDate(s.date || new Date().toISOString())}</p>
<section class="card hero">
  <svg class="ring" viewBox="0 0 132 132" role="img" aria-label="${esc(t('rep.ringAria', { pct }))}">
    <circle class="tr" cx="66" cy="66" r="${R}" fill="none" stroke-width="12"/>
    <circle class="fg" cx="66" cy="66" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * sc / total).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 66 66)"/>
    <text x="66" y="66" text-anchor="middle" font-size="28" font-weight="700">${pct} %</text>
    <text x="66" y="88" text-anchor="middle" font-size="13" font-weight="500" opacity=".65">${sc} / ${total}</text>
  </svg>
  <div class="res">
    <span class="pill ${passed ? 'pass' : 'fail'}">${passed ? ICON_CHECK : ICON_X}${t(passed ? 'res.passed' : 'res.failed')}</span>
    <p>${t('rep.summary', { sc, total, pass, pct: PASS_PCT })}</p>
    <div class="pbar"><i style="width:${pct}%"></i><u style="left:${PASS_PCT}%"></u></div>
    <div class="pbar-l"><span style="left:0">0 %</span><span class="m" style="left:${PASS_PCT}%">${t('pass.limit', { pct: PASS_PCT })}</span><span style="right:0">100 %</span></div>
  </div>
</section>
<div class="kpis">
  <div class="card kpi ok"><b>${sc}</b><span>${t('kpi.right')}</span></div>
  <div class="card kpi bad"><b>${wrongN}</b><span>${t('kpi.wrong')}</span></div>
  <div class="card kpi open"><b>${openN}</b><span>${t('kpi.open')}</span></div>
  <div class="card kpi"><b>${timeVal}</b><span>${timeSub}</span></div>
</div>
${topicRows.length ? `<h2>${t('topics.result')}</h2>
<section class="card topics">${topicRows.map(r => `<div class="tr-row${r.p < PASS_PCT ? ' low' : ''}"><span>${esc(r.t)}</span><div class="b"><i style="width:${r.p}%"></i></div><span class="v"><b>${r.p} %</b> · ${r.c}/${r.n}</span></div>`).join('')}</section>
<p class="note">${t('rep.topicNote', { pct: PASS_PCT })}</p>` : ''}
<h2>${t('rep.h.notok')} <small>${t('n.question', { n: notOk.length })}</small></h2>
${notOk.length ? notOk.map(({it, i}) => reportQuestion(s, it, i)).join('') : `<div class="card empty">${t('rep.noneWrong')}</div>`}
<h2>${t('rep.h.ok')} <small>${t('n.question', { n: okRows.length })}${t('rep.expand')}</small></h2>
${okRows.length ? okRows.map(({it, i}) => reportQuestion(s, it, i)).join('') : `<div class="card empty">${t('rep.noneRight')}</div>`}
${SCENARIO ? `<h2>${t('rep.appendix', { title: esc(scen().title) })}</h2><section class="card scen">${scenarioBody(scen())}<p class="meta">${esc(scen().source)}</p></section>` : ''}
<footer class="foot"><b>${t('rep.madeWith', { app: esc(appName()) })}</b>${CFG.liveUrl ? ` · ${esc(CFG.liveUrl)}` : ''}<br>${esc(sourceNote())} ${esc(cfgT(CFG.trademark))} ${t('rep.footTail')}</footer>
</body></html>`;
}
function downloadReport(s){ download(reportFileName(s), buildReport(s), 'text/html;charset=utf-8'); }

/* ---------- Ansichten ---------- */
function render(){
  if(state.view === 'start') app.innerHTML = viewStart();
  else if(state.view === 'exam') app.innerHTML = viewExam();
  else if(state.view === 'progress') app.innerHTML = viewProgress();
  else app.innerHTML = viewResult();
  if(state.modal) app.insertAdjacentHTML('beforeend', viewModal());
  updateChrome();
  bind();
  saveCurrent();
}
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19h16"/><path d="M6 15l4-5 4 3 5-7"/></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>';
function updateChrome(){
  const s = state.session;
  footSource.textContent = sourceNote(); footTrademark.textContent = cfgT(CFG.trademark); footLearn.textContent = t('foot.learn');
  footFeedback.innerHTML = `${t('foot.disclaimer')}${feedbackUrl() ? ` <a href="${esc(feedbackUrl(t('fb.msgGeneral', { app: appName() })))}" target="_blank" rel="noopener">${t('foot.feedback')}</a>.` : ''}`;
  // Während einer laufenden Bearbeitung kein Wechsel in den Lernfortschritt (sonst ginge die Sitzung verloren)
  progressBtn.hidden = state.view === 'exam' && !state.reviewMode;
  if(state.view !== 'exam' || state.reviewMode){ if(!state.reviewMode) stopTimer(); timer.hidden = true; }
  // Im Lernfortschritt wird der Knopf zu „⌂ Zurück“ (zur Startseite), sonst „Lernfortschritt“
  const inProgress = state.view === 'progress';
  const pbKey = (inProgress ? 'back' : 'progress') + getLang();          // Sprache gehört dazu: Beschriftung folgt dem Sprachwechsel
  if(progressBtn.dataset.mode !== pbKey){
    progressBtn.dataset.mode = pbKey;
    progressBtn.innerHTML = inProgress ? `${ICON_HOME}<span>${t('nav.backShort')}</span>` : `${ICON_CHART}<span>${t('nav.progress')}</span>`;
    progressBtn.setAttribute('aria-label', t(inProgress ? 'nav.backHome' : 'nav.progress'));
    progressBtn.title = t(inProgress ? 'nav.backHome' : 'nav.progress');
  }
  if(state.view !== 'exam' && state.scenOpen) setScen(false, false);
}

function switchRow(id, checked, title, text){
  return `<div class="opt-row">
        <label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><i></i></label>
        <label for="${id}"><b>${title}</b><span>${text}</span></label>
      </div>`;
}

function viewStart(){
  const ready = !state.loading && !state.loadError;
  const isExam = settings.mode === 'exam';
  const opts = isExam ? settings.examOpts : settings.trainingOpts;
  const st = ready ? questionStatus() : { wrong: {}, flagged: {} };
  const topicsSel = ready ? chosenTopics() : [], examsSel = ready ? chosenExams() : [];
  // Zahlen der Quellen beziehen sich auf die gewählten Themen; Zahlen der Themen auf die gewählte Quelle
  const poolSize = Object.fromEntries(SOURCES.map(x => [x.id, ready ? narrow(sourcePool(x.id, st), topicsSel, examsSel).length : 0]));
  const src = SOURCES.find(x => x.id === settings.trainingOpts.source) || SOURCES[0];
  const examSize = code => CATALOG.filter(q => q.origin.some(o => o.startsWith(code + '-'))).length;
  const srcPool = ready ? sourcePool(src.id, st) : [];
  const n = isExam ? examSize(settings.exam) : ready ? unitTotal(unitsFrom(narrow(srcPool, topicsSel, examsSel)), wantedCount()) : 0;
  state.startN = n;                                    // für die Kopfzeile (updateChrome)
  // Zahlen je Knopf: Themen innerhalb der gewählten Quelle + Prüfungen, Prüfungen innerhalb der gewählten Quelle + Themen
  const srcByExams = byExams(srcPool, examsSel), srcByTopics = byTopics(srcPool, topicsSel);
  const topicCount = Object.fromEntries((ready ? topicList() : []).map(t => [t, srcByExams.filter(q => q.topic === t).length]));
  const examCount = Object.fromEntries((ready ? EXAMS : []).map(e => [e.code, srcByTopics.filter(q => inExam(q, e.code)).length]));
  const canStart = ready && n > 0;
  const ex = examOf(settings.exam);

  const modeCards = [
    ['exam', t('mode.exam'), EXAMS.length > 1 ? t('mode.examDescMany', { n: EXAMS.length }) : t('mode.examDescOne')],
    ['training', t('mode.train'), ready ? t('mode.trainDescN', { n: CATALOG.length }) : t('mode.trainDesc')],
  ].map(([v, title, d]) => `
        <label class="pick mode">
          <input type="radio" name="mode" value="${v}" ${settings.mode === v ? 'checked' : ''}>
          <span class="dot" aria-hidden="true"></span>
          <span><b>${title}</b><small>${d}</small></span>
        </label>`).join('');

  const examCards = EXAMS.map(e => `
        <label class="pick">
          <input type="radio" name="exam" value="${e.code}" ${e.code === settings.exam ? 'checked' : ''}>
          <span class="dot" aria-hidden="true"></span>
          <span><b>${esc(t(e.title))}</b><small>${esc(t(e.sub))}</small>
            <span class="badge ${e.official ? 'official' : ''}">${esc(e.badge ? t(e.badge) : t(e.official ? 'exam.badgeExpl' : 'exam.badgeSolOnly'))}</span></span>
        </label>`).join('');

  // Schieberegler: 10er-Schritte bis zur Katalogsgröße (aufgerundet); ganz rechts = „Alle“ (gespeichert als 0)
  const countMax = Math.max(COUNT_STEP, Math.ceil(CATALOG.length / COUNT_STEP) * COUNT_STEP);
  const countVal = settings.count && settings.count < countMax ? settings.count : countMax;
  const countPct = v => ((v - COUNT_STEP) / (countMax - COUNT_STEP || 1) * 100).toFixed(2) + '%';   // Füllstand der Leiste
  const countSlider = `
        <div class="cnt-slider">
          <output id="countOut" for="countRange">${countLabel(countVal, countMax)}</output>
          <input type="range" id="countRange" min="${COUNT_STEP}" max="${countMax}" step="${COUNT_STEP}" value="${countVal}" style="--p:${countPct(countVal)}" aria-label="${esc(t('count.aria'))}" aria-valuetext="${countLabel(countVal, countMax)}">
          <div class="cnt-ticks" aria-hidden="true">${'<i></i>'.repeat(countMax / COUNT_STEP)}</div>
          <div class="cnt-scale" aria-hidden="true"><span>${COUNT_STEP}</span><span>${t('count.scaleAll', { n: CATALOG.length })}</span></div>
        </div>`;
  // Filter-Chips: kompakte Pillen mit Zahl; jede Zeile beginnt mit „Alle“ (bei Themen/Quellen = keine Einzelauswahl)
  const chip = (type, name, value, label, count, checked, disabled) => `
          <label class="fchip"><input type="${type}" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(label)}<small>${count}</small></span></label>`;
  const sourceChips = SOURCES.map(x => chip('radio', 'source', x.id, t('src.' + x.id + '.short'), poolSize[x.id], x.id === src.id, x.id !== 'all' && !poolSize[x.id] && x.id !== src.id)).join('');
  const topicButtons = chip('checkbox', 'topicAll', 'all', t('filter.all'), srcByExams.length, !topicsSel.length, false) + Object.entries(topicCount).map(([tp, c]) => chip('checkbox', 'topic', tp, topicShort(tp), c, topicsSel.includes(tp), !c && !topicsSel.includes(tp))).join('');
  const examButtons = chip('checkbox', 'qsrcAll', 'all', t('filter.all'), srcByTopics.length, !examsSel.length, false) + Object.entries(examCount).map(([c, k]) => chip('checkbox', 'qsrc', c, examNameOf(c), k, examsSel.includes(c), !k && !examsSel.includes(c))).join('');
  // Kurzbeschreibung aktiver Filter (für den eingeklappten Zustand)
  const filterParts = [src.id !== 'all' ? srcLabel(src) : '', examsSel.length === 1 ? examNameOf(examsSel[0]) : examsSel.length ? t('filter.nExams', { n: examsSel.length }) : '',
    topicsSel.length === 1 ? topicShort(topicsSel[0]) : topicsSel.length ? t('filter.nTopics', { n: topicsSel.length }) : ''].filter(Boolean);
  const filterOpen = state.filterOpen ?? filterParts.length > 0;
  const frow = (id, title, help, body) => `<div class="frow"><div class="frow-head">${title}${tip('tip' + id, title, help)}</div><div class="fchips">${body}</div></div>`;

  const topics = {};
  if(isExam) CATALOG.filter(q => q.origin.some(o => o.startsWith(settings.exam + '-')))
    .forEach(q => { if(q.topic) topics[q.topic] = (topics[q.topic] || 0) + 1; });

  const timeText = opts.sim ? t('time.min', { n: minutesFor(n) }) : t('time.stopwatch');
  // Fehler-/Markiert-Training: Teilfragen von Zuordnungsblöcken ziehen ihren ganzen Block mit
  const topicPhrase = !topicsSel.length ? '' : topicsSel.length === 1 ? t('phrase.topic1', { name: esc(topicLabel(topicsSel[0])) }) : t('phrase.topicN', { n: topicsSel.length });
  const examName = !examsSel.length ? '' : examsSel.length === 1 ? examNameOf(examsSel[0]) : t('filter.nExams', { n: examsSel.length });
  const plusBlocks = (examName ? t('phrase.inExam', { name: esc(examName) }) : '') + topicPhrase + (ready && src.id !== 'all' && unitsFrom(narrow(srcPool, topicsSel, examsSel)).flat().length > poolSize[src.id] ? t('phrase.plusBlocks') : '');
  const mix = t('lead.mix'), rnd = t('lead.rnd', { n });
  const lead = isExam
    ? t('lead.exam', { title: esc(t(ex.title)), n, order: t(settings.examOpts.shuffle ? 'lead.orderShuffled' : 'lead.orderOriginal'),
        hint: ex.hint ? t(ex.hint) : ex.official ? cfgT(CFG.explHint) : t('lead.noExpl') })
    : src.id === 'errors' ? t('lead.errors', { rnd, from: t('lead.fromErrors', { n: poolSize.errors }), plus: plusBlocks, mix })
    : src.id === 'flagged' ? t('lead.flagged', { rnd, from: t('lead.fromFlagged', { n: poolSize.flagged }), plus: plusBlocks, mix })
    : src.id === 'both' ? t('lead.both', { n, pool: poolSize.both, plus: plusBlocks, mix })
    : t('lead.all', { rnd: settings.count ? t('lead.allRnd', { n }) : t('lead.allAll', { n }),
        from: examName ? esc(examName) + topicPhrase : topicsSel.length ? (topicsSel.length === 1 ? t('lead.fromTopic1', { name: esc(topicLabel(topicsSel[0])) }) : t('lead.fromTopicN', { n: topicsSel.length })) : t('lead.fromCatalog'),
        order: t(settings.count ? 'lead.noRepeat' : 'lead.randomOrder'), mix });
  const blockNote = GROUPS && Object.keys(GROUPS).length ? t('lead.blockNote') : '';

  return `
  ${CFG.hint && !hintDismissed() ? `<div class="hint-banner" role="note"><p>${esc(cfgT(CFG.hint))}${feedbackUrl() ? ` <a href="${esc(feedbackUrl(t('fb.msgGeneral', { app: appName() })))}" target="_blank" rel="noopener">${t('hint.feedback')}</a>` : ''}</p><button type="button" class="hint-x" data-hintx aria-label="${esc(t('hint.close'))}"><span aria-hidden="true">✕</span></button></div>` : ''}
  <section class="hero">
    <div>
      <h1>${t('start.h1')}</h1>
      <fieldset class="picker">
        <legend>${t('step.1')}</legend>
        <div class="picker-grid">${modeCards}</div>
      </fieldset>
      ${isExam ? `
      <fieldset class="picker">
        <legend>${t('step.2exam')}</legend>
        <div class="picker-grid">${examCards}</div>
      </fieldset>` : `
      <fieldset class="picker">
        <legend>${t('step.2train')}</legend>
        ${countSlider}
      </fieldset>
      <section class="filter${filterOpen ? ' open' : ''}">
        <button type="button" class="filter-head" data-ftoggle aria-expanded="${filterOpen}" aria-controls="filterBody">
          <span class="fh-title">${t('filter.title')}<svg class="fh-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span>
          ${filterParts.length ? `<span class="filter-sum">${esc(filterParts.join(' · '))}</span>` : ''}
          <span class="sr">${t(filterOpen ? 'filter.hide' : 'filter.show')}</span>
        </button>
        ${filterOpen ? `<div class="filter-body" id="filterBody">
          ${filterParts.length ? `<div class="filter-reset"><button type="button" class="linkbtn" data-freset>${t('filter.reset')}</button></div>` : ''}
          ${frow('Fragenart', t('filter.kind'), t('filter.kindHelp'), sourceChips)}
          ${EXAMS.length > 1 ? frow('Fragequellen', t('filter.sources'), t('filter.sourcesHelp'), examButtons) : ''}
          ${frow('Themenbereiche', t('filter.topics'), t('filter.topicsHelp'), topicButtons)}
          ${CFG.topicNote ? `<p class="time-note topic-note">${esc(cfgT(CFG.topicNote))}</p>` : ''}
        </div>` : ''}
        ${(src.id !== 'all' || topicsSel.length || examsSel.length) && settings.count && n < settings.count ? `<p class="time-note">${poolSize[src.id] ? t('filter.few', { pool: poolSize[src.id], blocks: n !== poolSize[src.id] ? t('filter.fewBlocks', { n }) : '' }) : t('filter.none')}</p>` : ''}
      </section>`}
      <p class="lead wide">${lead}${isExam ? '' : blockNote}</p>
      <div class="facts">
        <div class="fact"><b>${n}</b><span>${t('facts.questions')}</span></div>
        <div class="fact"><b>${passMark(n)}</b><span>${t('facts.pass', { pct: PASS_PCT })}</span></div>
        <div class="fact"><b>${timeText}</b><span>${t(opts.sim ? 'facts.timeSim' : 'facts.timeFree')}</span></div>
      </div>
      ${isExam && ready ? `<div class="topics">${Object.entries(topics).map(([tp, c]) => `<span class="chip"><b>${c}</b> ${esc(topicLabel(tp))}</span>`).join('')}</div>` : ''}
    </div>
    <div class="card">
      <h2>${t('set.title')}</h2>
      ${switchRow('optSim', opts.sim, t('set.simTitle'),
        t('set.simText', { noun: t(isExam ? 'noun.exam' : 'noun.practice'), min: minutesFor(n), n }))}
      ${isExam ? switchRow('optShuffle', settings.examOpts.shuffle, t('set.shuffleTitle'),
        t('set.shuffleText') + (Object.keys(GROUPS).length ? t('set.shuffleBlocks') : '')) : `
      <div class="opt-row info"><span class="info-icon" aria-hidden="true">↻</span>
        <span><b>${t('set.alwaysShuffled')}</b><span>${t('set.alwaysShuffledText')}</span></span>
      </div>`}
      <p class="time-note">${opts.sim
        ? t('set.timeSim', { min: minutesFor(n) })
        : t('set.timeFree')}</p>
      <div class="nav" style="margin-top:var(--space-5)">
        <button class="btn primary" id="startBtn" style="width:100%;justify-content:center" ${canStart ? '' : 'disabled'}>${t('start.btn', { title: isExam ? esc(t(ex.title)) : esc(trainingTitle(src, topicsSel, examsSel, n)) })}</button>
      </div>
      ${state.loading ? `<p class="load-note">${t('load.wait')}</p>` : ''}
      ${state.loadError ? `<p class="load-note err">${esc(t(state.loadError.key, state.loadError.vars))}</p>` : ''}
    </div>
  </section>`;
}

function originHint(item){
  const s = state.session;
  if(s.mode === 'exam') return s.shuffle ? t('origin.orig', { n: item.origNo }) : '';
  return t('origin.from', { list: item.q.origin.join(', ') });
}

function viewExam(){
  const s = state.session, item = current(), q = item.q, Q = L(q), total = s.items.length;
  const chosen = s.answers[q.id];                      // gespeicherter Schlüssel
  const answered = Object.keys(s.answers).length;
  const hidden = s.sim && !state.reviewMode;           // Simulation: Lösung erst nach Abgabe
  const reveal = !hidden && (chosen || state.reviewMode);
  const locked = state.reviewMode || (chosen && !s.sim);
  const awaiting = !s.sim && !state.reviewMode && !chosen;   // ohne Simulation: Frage noch nicht bestätigt
  const picked = awaiting ? s.pending?.[q.id] : null;       // aktuelle, unbestätigte Auswahl
  const noun = nounOf(s);

  const options = item.perm.map((key, i) => {
    const L = LETTERS[i];
    let cls = 'opt', tag = '', mark = '';
    if(hidden){
      if(key === chosen){ cls += ' selected'; tag = t('opt.mine'); }
    } else if(awaiting){
      if(key === picked){ cls += ' selected'; tag = t('opt.selected'); }
    } else if(reveal){
      if(isRight(q, key)){ cls += ' correct'; tag = t('opt.right'); mark = ICON_CHECK; }
      else if(key === chosen){ cls += ' wrong'; tag = t('opt.mine'); mark = ICON_X; }
    }
    return `<button class="${cls}" data-choose="${L}" ${locked ? 'disabled' : ''} aria-pressed="${(chosen || picked) === key}">
      <span class="letter">${mark ? `${mark}<span class="sr">${L}</span>` : L}</span><span>${esc(Q.opts[key])}</span>${tag ? `<span class="tag">${tag}</span>` : ''}
    </button>`;
  }).join('');

  let feedback = '';
  if(reveal){
    const ok = isRight(q, chosen);
    const withExpl = hasExpl(q);
    const body = withExpl
      ? explRows(item, chosen).map(r => `<div class="expl ${r.right ? 'right' : 'other'}${r.mine ? ' mine' : ''}"><span class="letter${r.letters.length > 1 ? ' multi' : ''}">${r.letters.join(' · ')}</span><div><span class="verdict">${t(r.right ? 'verdict.right' : r.keys.length > 1 ? 'verdict.others' : 'verdict.wrong')}${r.mine ? t('verdict.mine') : ''}</span><p>${esc(r.text)}</p></div></div>`).join('')
      : rightKeys(q).map((key, i, all) => `<div class="expl right"><span class="letter">${shown(item, key)}</span><div><span class="verdict">${t('verdict.rightIs', { l: shown(item, key), text: esc(Q.opts[key]) })}</span>${Q.rationale && i === all.length - 1 ? `<p>${esc(Q.rationale)}</p>` : ''}</div></div>`).join('');
    feedback = `
    <div class="feedback">
      <div class="fb-head ${ok ? 'ok' : 'bad'}">
        ${ok ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><span>' + t('fb.ok') + '</span>'
             : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg><span>${t(chosen ? 'fb.wrongLine' : 'fb.openLine', { right: rightLabel(item) })}</span>`}
      </div>
      <div class="fb-body">
        <div class="fb-title"><h3>${t(withExpl || Q.rationale ? 'fb.rationale' : 'fb.solution')}</h3>${feedbackUrl() ? `<a class="btn" href="${esc(feedbackUrl(t('fb.msgQuestion', { id: q.id, origin: q.origin.join(', ') })))}" target="_blank" rel="noopener">${t('fb.report')}</a>` : ''}</div>
        ${body}
        <div class="ref">${q.ref ? `<span>${esc(cfgT(CFG.refLabel))}: <code>${esc(refLabel(q.ref))}</code></span><span>${esc(cfgT(CFG.refHint))}</span>` : ''}${!q.ref && q.topic && CFG.topicNoteShort ? `<span>${t('ref.topic', { topic: esc(topicLabel(q.topic)), short: esc(cfgT(CFG.topicNoteShort)) })}</span>` : ''}<span>${t('ref.id')} <code>${q.id}</code> · ${esc(q.origin.join(', '))}</span></div>
      </div>
    </div>`;
  }

  const cells = s.items.map((it, i) => {
    const a = s.answers[it.q.id];
    let cls = 'cell';
    if(a) cls += hidden ? ' done' : (isRight(it.q, a) ? ' ok' : ' bad');
    if(i === state.pos) cls += ' cur';
    if(s.flags.has(it.q.id)) cls += ' flag';
    return `<button class="${cls}" data-go="${i}" aria-label="${esc(t('nav.qAria', { n: i + 1 }))}">${i + 1}</button>`;
  }).join('');
  const flagged = s.flags.has(q.id);
  // Navigationsleiste – identisch über der Frage und unter den Antworten (daher data-Attribute statt IDs)
  const navBar = where => `<div class="nav ${where}">
        <button class="btn" data-nav="-1" ${state.pos === 0 ? 'disabled' : ''}>${t('nav.back')}</button>
        <button class="btn ${flagged ? 'flagged' : ''}" data-flag>${t(flagged ? 'nav.flagged' : 'nav.flag')}</button>
        ${awaiting ? `<button class="btn primary" data-confirm ${picked ? '' : 'disabled'} title="${esc(t('nav.confirmTitle'))}">${t('nav.confirm')}</button>` : ''}
        <span class="spacer"></span>
        ${state.reviewMode ? `<button class="btn" data-back>${t('nav.toResult')}</button>` : ''}
        ${state.pos < total - 1
          ? (awaiting ? `<button class="btn" data-nav="1">${t('nav.skip')}</button>` : `<button class="btn primary" data-nav="1">${t('nav.next')}</button>`)
          : (state.reviewMode ? '' : `<button class="btn primary" data-finish>${t('nav.submit', { noun })}</button>`)}
      </div>`;

  return `
  <div class="exam">
    <section>
      <div class="progress" role="progressbar" aria-valuenow="${answered}" aria-valuemax="${total}"><i style="width:${answered / total * 100}%"></i></div>
      <div class="qmeta">
        <span class="qnum">${t('q.of', { i: state.pos + 1, n: total })}</span>
        ${hidden ? `<span class="mode-badge">${t('badge.sim')}</span>` : ''}
        <span class="qtopic">${q.topic ? `· ${esc(topicLabel(q.topic))}` : ''}${originHint(item)}</span>
        ${item.focus ? `<span class="focus-badge">${esc(focusLabel(item.focus))}</span>` : ''}
        ${SCENARIO ? `<button class="btn small scen-btn${state.scenOpen ? ' active' : ''}" data-scen aria-expanded="${!!state.scenOpen}" aria-controls="scenPanel">${t(state.scenOpen ? 'scen.hide' : 'scen.show')}</button>` : ''}
      </div>
      ${navBar('top')}
      ${q.group ? `<div class="scenario group-intro">${esc(Q.groupIntro)}</div>
      <div class="group-pos">${t('group.pos', { i: groupPos(q), n: GROUPS[q.group].length })}</div>` : ''}
      ${Q.scenario ? `<div class="scenario">${esc(Q.scenario)}</div>` : ''}
      <p class="qtext">${esc(Q.question)}</p>
      ${Q.items.length ? `<ol class="items">${Q.items.map((it, i) => `<li><b>${i + 1}.</b><span>${esc(it)}</span></li>`).join('')}</ol>` : ''}
      <div class="options">${options}</div>
      ${feedback}
      ${navBar('bottom')}
    </section>
    <aside class="side">
      <h2>${t('side.overview')} <span>${t('side.answered', { a: answered, n: total })}</span></h2>
      <div class="grid">${cells}</div>
      <div class="legend">
        ${hidden
          ? `<span><i style="background:var(--accent);border-color:var(--accent)"></i> ${t('legend.answered')}</span>`
          : `<span><i style="background:var(--ok);border-color:var(--ok)"></i> ${t('legend.right')}</span>
        <span><i style="background:var(--bad);border-color:var(--bad)"></i> ${t('legend.wrong')}</span>`}
        <span><i></i> ${t('legend.open')}</span>
        <span><i style="background:var(--flag);border-color:var(--flag);border-radius:999px"></i> ${t('legend.flagged')}</span>
      </div>
      ${state.reviewMode ? `<button class="btn" id="backToResult2">${t('nav.toResult')}</button>` : `<button class="btn" id="finishBtn2">${t('nav.submit', { noun })}</button>`}
    </aside>
  </div>`;
}

function viewResult(){
  const s = state.session, total = s.items.length, pass = passMark(total);
  const sc = score(); const passed = sc >= pass; const pct = Math.round(sc / total * 100);
  const r = 74, circ = 2 * Math.PI * r;
  const topics = {};
  s.items.forEach(it => { if(!it.q.topic) return; const t = topics[it.q.topic] ||= {c: 0, n: 0}; t.n++; if(isRight(it.q, s.answers[it.q.id])) t.c++; });
  const rows = s.items.map((it, i) => ({ it, i }));
  const wrong = rows.filter(({it}) => s.answers[it.q.id] && !isRight(it.q, s.answers[it.q.id]));
  const open = rows.filter(({it}) => !s.answers[it.q.id]);
  const noun = nounOf(s);
  const time = s.limit ? t('res.time', { a: fmt(s.elapsed), b: fmt(s.limit) }) : t('res.timeNoLimit', { a: fmt(s.elapsed) });
  const line = ({it, i}, cls, extra) => `<button class="rv" data-review="${i}"><span class="n ${cls}">${i + 1}</span><span>${esc(qLabel(it.q))}<small>${extra}${t('res.rightLine', { right: rightText(it), origin: esc(it.q.origin.join(', ')) })}</small></span></button>`;
  return `
  <section class="result-head">
    <div class="ring ${passed ? '' : 'fail'}">
      <svg viewBox="0 0 170 170"><circle class="track" cx="85" cy="85" r="${r}"/><circle class="val" cx="85" cy="85" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - sc / total)}"/></svg>
      <div class="num"><div><b>${sc}/${total}</b><br><span>${t('res.pctRight', { pct })}</span></div></div>
    </div>
    <div>
      <div class="eyebrow">${t('result.eyebrow', { title: esc(sessionTitle(s)) })}${s.sim ? ' · ' + t('badge.sim') : ''}</div>
      <div class="verdict-big ${passed ? 'ok' : 'bad'}">${t(passed ? 'res.passed' : 'res.failed')}</div>
      <p class="lead" style="margin-bottom:var(--space-4)">${passed
        ? t('res.passText', { sc, total, pass, pct: PASS_PCT })
        : t('res.failText', { sc, total, pass, n: pass - sc })}
        ${s.timeout ? ' ' + t('res.timeout', { noun }) : ''}
        ${time}
      </p>
      <div class="nav" style="margin-top:0">
        ${s.past ? `<button class="btn" id="backToProgress">${t('res.toProgress')}</button>` : ''}
        <button class="btn primary" id="restartBtn">${t('res.restart', { noun })}</button>
        <button class="btn" id="reviewAllBtn">${t('res.reviewAll')}</button>
        <button class="btn" id="reportBtn">${t('res.report')}</button>
      </div>
      <p class="time-note">${s.past ? t('res.runOf', { date: fmtDate(s.date) }) : s.saved
        ? t('res.saved')
        : t('res.notSaved')}</p>
    </div>
  </section>
  ${s.past ? '' : `<div class="backup-hint"><p>${t('res.backupHint')}</p>${state.notice === t('notice.backupDone') ? (state.notice = null, `<span class="backup-done">${t('backup.doneBadge')}</span>`) : `<button class="btn" data-backup>${t('backup.download')}</button>`}</div>`}

  ${Object.keys(topics).length ? `<h2 class="section-title">${t('topics.result')}</h2>
  <div class="topic-list">
    ${Object.entries(topics).map(([tp, v]) => `<div class="topic-row"><span>${esc(topicLabel(tp))} <span style="color:var(--text-muted)">(${v.c}/${v.n})</span></span><div class="bar"><i style="width:${v.c / v.n * 100}%"></i></div><span class="pct">${Math.round(v.c / v.n * 100)} %</span></div>`).join('')}
  </div>${s.mode === 'training' && Object.values(topics).reduce((a, v) => a + v.n, 0) < total ? `<p class="time-note">${t('res.noTopicNote')}</p>` : ''}` : ''}

  ${wrong.length ? `<h2 class="section-title">${t('res.h.wrong', { n: wrong.length })}</h2>
  <div class="review">${wrong.map(w => line(w, 'bad', t('res.yourAnswer', { l: shown(w.it, s.answers[w.it.q.id]) }))).join('')}</div>` : ''}

  ${open.length ? `<h2 class="section-title">${t('res.h.open', { n: open.length })}</h2>
  <div class="review">${open.map(o => line(o, 'skip', '')).join('')}</div>` : ''}

  ${!wrong.length && !open.length ? `<p class="lead" style="margin-top:var(--space-6)">${t('res.perfect', { total })}</p>` : ''}`;
}

/* Sicherungsknopf für Fenster; nach dem Herunterladen Bestätigung statt Knopf */
const backupBtn = (label = t('backup.download')) => state.modal?.backedUp
  ? `<span class="backup-done">${t('backup.doneBadge')}</span>` : `<button class="btn" data-backup>${label}</button>`;
function runInfo(d, newer){
  const done = Object.keys(d.answers || {}).filter(id => d.items.some(x => x.id === id)).length;
  return `<strong>${esc(sessionTitle(d))}</strong>${d.sim ? ' · ' + t('badge.sim') : ''}<br>${t('run.answered', { done, total: d.items.length })} · ${d.limit ? t('run.timeLeft', { time: fmt(d.limit - d.elapsed) }) : t('run.timeSoFar', { time: fmt(d.elapsed) })}<br>${t('run.stand', { date: fmtDate(d.savedAt) })}${newer ? t('run.newer') : ''}`;
}
function viewModal(){
  if(state.modal.type === 'stay'){ const noun = nounOf(state.session); return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="stayTitle"><div class="card">
    <h2 id="stayTitle">${t('stay.title')}</h2>
    <p>${t('stay.text', { noun })}</p>
    <div class="nav">${backupBtn()}<span class="spacer"></span><button class="btn primary" id="modalStay">${t('stay.continue')}</button></div>
  </div></div>`; }
  if(state.modal.type === 'choose'){ const m = state.modal; return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="chooseTitle"><div class="card">
    <h2 id="chooseTitle">${t('choose.title')}</h2>
    <p>${t('choose.text')}</p>
    <p><b>${t('choose.fromFile')}</b><br>${runInfo(m.fromFile, m.fromFile.savedAt > m.local.savedAt)}</p>
    <p><b>${t('choose.local')}</b><br>${runInfo(m.local, m.local.savedAt > m.fromFile.savedAt)}</p>
    <div class="nav"><button class="btn" id="modalPickLocal">${t('choose.pickLocal')}</button><span class="spacer"></span><button class="btn primary" id="modalPickFile">${t('choose.pickFile')}</button></div>
  </div></div>`; }
  if(state.modal.type === 'restore'){
    const d = state.modal.saved, noun = nounOf(d);
    const done = Object.keys(d.answers || {}).filter(id => d.items.some(x => x.id === id)).length;
    const timeInfo = d.limit ? t('run.timeLeft', { time: fmt(d.limit - d.elapsed) }) : t('run.timeSoFar', { time: fmt(d.elapsed) });
    return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="restoreTitle"><div class="card">
    <h2 id="restoreTitle">${t(state.modal.fromFile ? 'restore.titleFile' : 'restore.title', { noun })}</h2>
    <p><strong>${esc(sessionTitle(d))}</strong>${d.sim ? ' · ' + t('badge.sim') : ''}<br>${t('run.answered', { done, total: d.items.length })} · ${timeInfo}<br>
      ${t('restore.text', { date: fmtDate(d.savedAt) })}</p>
    <div class="nav"><button class="btn danger" id="modalDiscard">${t('restore.discard')}</button><span class="spacer"></span><button class="btn primary" id="modalRestore">${t('restore.continue')}</button></div>
  </div></div>`;
  }
  if(state.modal.type === 'pause'){
    const s = state.session, noun = nounOf(s);
    const timeInfo = s.limit ? t('pause.timeLeft', { left: fmt(s.limit - s.elapsed), elapsed: fmt(s.elapsed) }) : t('pause.timeSoFar', { time: fmt(s.elapsed) });
    return `<div class="modal pause" id="modal" role="dialog" aria-modal="true" aria-labelledby="pauseTitle"><div class="card">
    <div class="pause-ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg></div>
    <h2 id="pauseTitle">${t('pause.title', { noun })}</h2>
    <p>${t('pause.text', { timeInfo, answered: t('run.answered', { done: Object.keys(s.answers).length, total: s.items.length }) })}</p>
    <div class="nav"><button class="btn primary" id="modalResume">${t('pause.resume')}</button></div>
    <div class="pause-backup">${backupBtn()}<p class="time-note">${t('backup.hint')}</p></div>
  </div></div>`;
  }
  if(state.modal.type === 'leave'){ const s = state.session, noun = nounOf(s); return `<div class="modal" id="modal"><div class="card">
    <h2>${t('leave.title', { noun })}</h2>
    <p>${t(s.mode === 'exam' ? 'leave.text_exam' : 'leave.text_practice')}</p>
    <div class="nav">${backupBtn()}<span class="spacer"></span><button class="btn" id="modalCancel">${t('leave.keep')}</button><button class="btn primary danger" id="modalLeave">${t('leave.confirm', { noun })}</button></div>
  </div></div>`; }
  if(state.modal.type === 'clear') return `<div class="modal" id="modal"><div class="card">
    <h2>${t('clear.title')}</h2>
    <p>${t('clear.text', { n: HISTORY.length })}</p>
    <div class="nav"><button class="btn" id="modalCancel">${t('clear.cancel')}</button><span class="spacer"></span><button class="btn primary danger" id="modalClear">${t('clear.confirm')}</button></div>
  </div></div>`;
  const noun = nounOf(state.session);
  return `<div class="modal" id="modal"><div class="card">
    <h2>${t('finish.title', { noun })}</h2>
    <p>${t('finish.text', { n: state.modal.open })}</p>
    <div class="nav"><button class="btn" id="modalCancel">${t('leave.keep')}</button><span class="spacer"></span><button class="btn primary" id="modalOk">${t('finish.confirm')}</button></div>
  </div></div>`;
}

/* ---------- Lernfortschritt ---------- */
const progressFilter = { pmode: 'all', psim: 'all' };
function showProgress(){ stopTimer(); timer.hidden = true; state.reviewMode = false; state.view = 'progress'; render(); window.scrollTo(0, 0); }
function openRun(id){
  const run = HISTORY.find(r => r.id === id); if(!run) return;
  state.session = sessionFromRun(run); state.reviewMode = false; state.view = 'result'; render(); window.scrollTo(0, 0);
}
const runPct = run => Math.round(run.score / run.total * 100);
const runPassed = run => run.score >= passMark(run.total);

function progressChart(runs){
  if(runs.length < 2) return `<p class="time-note">${t('chart.needTwo')}</p>`;
  // Breite an den verfügbaren Platz anpassen, damit die Beschriftung auf dem Handy lesbar bleibt (1:1 statt verkleinert)
  const W = Math.max(300, Math.min(900, (app.clientWidth || 680) - 40)), H = 230, L = 40, R = 14, T = 14, B = 30;
  const x = i => L + i / (runs.length - 1) * (W - L - R);
  const y = p => T + (1 - p / 100) * (H - T - B);
  const grid = [0, 20, 40, 60, 80, 100].map(p => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end" class="axis">${p} %</text>`).join('');
  const pts = runs.map((r, i) => `${x(i).toFixed(1)},${y(runPct(r)).toFixed(1)}`).join(' ');
  const step = Math.ceil(runs.length / 10);
  const xl = runs.map((r, i) => (i % step === 0 || i === runs.length - 1) ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="axis">${i + 1}</text>` : '').join('');
  const dots = runs.map((r, i) => `<circle cx="${x(i)}" cy="${y(runPct(r))}" r="5" class="${runPassed(r) ? 'dot-ok' : 'dot-bad'}"><title>${fmtDate(r.date)} · ${esc(sessionTitle(r))} · ${r.score}/${r.total} (${runPct(r)} %)</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chart.aria'))}">
    ${grid}
    <line x1="${L}" x2="${W - R}" y1="${y(PASS_PCT)}" y2="${y(PASS_PCT)}" class="passline"/>
    <polyline points="${pts}" class="line"/>${dots}${xl}
  </svg>
  <div class="legend chart-legend">
    <span><i class="lg-pass"></i> ${t('pass.limit', { pct: PASS_PCT })}</span>
    <span><i style="background:var(--ok);border-color:var(--ok);border-radius:999px"></i> ${t('run.passed')}</span>
    <span><i style="background:var(--bad);border-color:var(--bad);border-radius:999px"></i> ${t('run.failed')}</span>
    <span>${t('chart.horizontal')}</span>
  </div>`;
}

/* Kleines „?“ mit Erklärung: erscheint beim Darüberfahren/Fokus (CSS) und beim Antippen (Klasse .open, siehe bind) */
const tip = (id, label, text) => `<span class="tip"><button type="button" class="tip-btn" aria-label="${esc(t('tip.aria', { label }))}" aria-expanded="false" aria-describedby="${id}" data-tip>?</button><span class="tip-text" role="tooltip" id="${id}">${esc(text)}</span></span>`;

function viewProgress(){
  const notice = state.notice; state.notice = null;
  const backup = `<div class="card backup">
      <h2>${t('backup.h')}</h2>
      <p class="time-note">${t('backup.text')}<br>
        ${lastBackup() ? t('backup.last', { date: fmtDate(lastBackup()) }) : t('backup.none')}</p>
      <div class="nav">
        <button class="btn" data-backup>${t('backup.download')}</button>
        <button class="btn" id="importBtn">${t('backup.load')}</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <span class="spacer"></span>
        <button class="btn danger" id="clearBtn" ${HISTORY.length ? '' : 'disabled'}>${t('clear.confirm')}</button>
      </div>
    </div>`;
  const head = `<div class="eyebrow">${t('nav.progress')}</div><h1>${t('prog.h1')}</h1>
    ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}`;
  if(!HISTORY.length) return `${head}
    <div class="card empty">
      <h2>${t('prog.emptyTitle')}</h2>
      <p class="lead">${t('prog.emptyText')}</p>
      <button class="btn primary" id="homeBtn">${t('nav.home')}</button>
    </div>${backup}`;

  const runs = [...HISTORY].sort(byDate).filter(r =>
    (progressFilter.pmode === 'all' || r.mode === progressFilter.pmode) && (progressFilter.psim === 'all' || r.sim));
  const avg = runs.length ? Math.round(runs.reduce((a, r) => a + runPct(r), 0) / runs.length) : 0;
  // Quote der beantworteten Fragen: gewichtet über alle Antworten der gefilterten Durchläufe (offene Fragen ausgeschlossen),
  // damit ein kurzes Training nicht so viel zählt wie eine ganze Prüfung. „Bestanden“ und „Ø richtig“ bleiben bei der
  // Prüfungsregel (offen = falsch).
  const answeredAll = runs.flatMap(r => r.items.filter(x => x.a && BY_ID[x.id]));
  const answeredOk = answeredAll.filter(x => isRight(BY_ID[x.id], x.a)).length;
  const passedN = runs.filter(runPassed).length;
  const seen = new Set(HISTORY.flatMap(r => r.items.filter(x => x.a && BY_ID[x.id]).map(x => x.id)));   // nur Fragen, die es im Katalog noch gibt
  const qst = questionStatus();
  const errN = sourcePool('errors', qst).length, flagN = sourcePool('flagged', qst).length;

  // Statistik je Frage und Thema (über die gefilterten Durchläufe)
  const stat = {}, topics = {};
  runs.forEach(r => r.items.forEach(x => {
    const q = BY_ID[x.id]; if(!q) return;
    const ok = isRight(q, x.a), st = stat[x.id] ||= { n: 0, wrong: 0 };
    if(x.a){ st.n++; if(!ok) st.wrong++; }   // „Am häufigsten falsch“: nur beantwortete Vorlagen
    if(q.topic){ const t = topics[q.topic] ||= { c: 0, n: 0 }; t.n++; if(ok) t.c++; }
  }));
  const hard = Object.entries(stat).filter(([, v]) => v.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong || b[1].wrong / b[1].n - a[1].wrong / a[1].n).slice(0, 10);

  const seg = (name, val, opts) => `<div class="seg small" role="radiogroup">${opts.map(([v, label]) =>
    `<label class="seg-opt"><input type="radio" name="${name}" value="${v}" data-pfilter ${val === v ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;

  return `${head}
  <div class="filters">
    ${seg('pmode', progressFilter.pmode, [['all', t('pf.all')], ['exam', t('mode.exam')], ['training', t('mode.training')]])}
    ${seg('psim', progressFilter.psim, [['all', t('pf.simAll')], ['sim', t('pf.simOnly')]])}
  </div>
  <div class="facts five">
    <div class="fact"><b>${runs.length}</b><span>${t(runs.length === 1 ? 'fact.run' : 'fact.runs')}</span></div>
    <div class="fact"><b>${runs.length ? `Ø ${avg} %` : '–'}</b><span>${t('fact.examScore')}${tip('tipExam', t('fact.examScoreLabel'), t('fact.examScoreTip'))}</span></div>
    <div class="fact"><b>${answeredAll.length ? `Ø ${Math.round(answeredOk / answeredAll.length * 100)} %` : '–'}</b><span>${t('fact.trainScore')}${tip('tipTrain', t('fact.trainScoreLabel'), t('fact.trainScoreTip', { ok: answeredOk, total: answeredAll.length }))}</span></div>
    <div class="fact"><b>${passedN} / ${runs.length}</b><span>${t('run.passed')}</span></div>
    <div class="fact"><b>${seen.size} / ${CATALOG.length}</b><span>${t('fact.seen')}</span></div>
  </div>

  <h2 class="section-title">${t('prog.h.perRun')}</h2>
  ${runs.length ? progressChart(runs) : `<p class="time-note">${t('prog.noRuns')}</p>`}

  <div class="card errcard">
    <div><b>${t('prog.errCount', { n: errN })} · ${t('prog.flagCount', { n: flagN })}</b><span>${t('prog.errText')}</span></div>
    <span class="run-actions"><button class="btn primary" data-train="errors" ${errN ? '' : 'disabled'}>${t('prog.trainErrors')}</button><button class="btn" data-train="flagged" ${flagN ? '' : 'disabled'}>${t('prog.trainFlagged')}</button></span>
  </div>

  <h2 class="section-title">${t('prog.h.all', { n: runs.length })}</h2>
  <div class="runs">${[...runs].reverse().map(r => `
    <div class="run">
      <span class="n ${runPassed(r) ? 'ok' : 'bad'}">${runPct(r)}%</span>
      <span class="run-main"><b>${esc(sessionTitle(r))}</b>
        <small>${t('run.line', { date: fmtDate(r.date), score: r.score, total: r.total, verdict: t(runPassed(r) ? 'run.passed' : 'run.failed'), time: fmt(r.elapsed) })}${r.sim ? t('run.sim') : ''}${r.timeout ? t('run.timeout') : ''}</small></span>
      ${r.items.some(x => BY_ID[x.id])
        ? `<span class="run-actions"><button class="btn" data-run="${esc(r.id)}">${t('run.view')}</button><button class="btn" data-run-report="${esc(r.id)}" aria-label="${esc(t('run.reportAria'))}">${t('run.report')}</button></span>`
        : `<small class="run-actions">${t('run.gone')}</small>`}
    </div>`).join('')}</div>

  ${Object.keys(topics).length ? `<h2 class="section-title">${t('topics.result')}</h2>
  <div class="topic-list">${Object.entries(topics).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).map(([tp, v]) => `<div class="topic-row"><span>${esc(topicLabel(tp))} <span style="color:var(--text-muted)">(${v.c}/${v.n})</span></span><div class="bar"><i style="width:${v.c / v.n * 100}%"></i></div><span class="pct">${Math.round(v.c / v.n * 100)} %</span></div>`).join('')}</div>
  <p class="time-note">${t('prog.topicNote')}</p>` : ''}

  ${hard.length ? `<h2 class="section-title">${t('prog.h.hard')}</h2>
  <div class="review">${hard.map(([id, v]) => { const q = BY_ID[id]; return `<div class="rv static"><span class="n bad">${v.wrong}×</span><span>${esc(qLabel(q))}<small>${t('prog.hardLine', { wrong: v.wrong, n: v.n, id, origin: esc(q.origin.join(', ')) })}</small></span></div>`; }).join('')}</div>` : ''}

  ${backup}`;
}

/* ---------- Sicherung: alle Daten als eine Datei ----------
   Enthält Verlauf, Einstellungen und – falls vorhanden – den laufenden bzw. unterbrochenen Durchlauf. Damit lässt sich der
   Stand gegen gelöschte Browserdaten sichern und auf ein anderes Gerät mitnehmen. Auf Handy/Tablet öffnet sich das
   Teilen-Menü (iCloud, Google Drive, OneDrive …), sonst ein normaler Download. Dateiformat v2; Exporte v1 (nur
   Durchläufe) und ältere reine Listen werden weiter gelesen. */
const BACKUP_KEY = CFG.storagePrefix + 'backupAt';
const lastBackup = () => { try { return localStorage.getItem(BACKUP_KEY); } catch(e) { return null; } };
function backupData(){
  let current = null;
  if(isRunning()) current = currentSnapshot();
  else try { current = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null'); } catch(e) {}
  return { app: CFG.appId, kind: 'backup', version: 2, exported: new Date().toISOString(), runs: HISTORY, settings, current };
}
function backupName(d){
  const p = n => String(n).padStart(2, '0');
  return `${CFG.reportPrefix}-Sicherung_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}
function saveBackup(){
  const data = backupData(), name = backupName(new Date(data.exported)), json = JSON.stringify(data, null, 1);
  const done = () => {
    try { localStorage.setItem(BACKUP_KEY, data.exported); } catch(e) {}
    if(state.modal) state.modal.backedUp = true; else state.notice = t('notice.backupDone');
    render();
  };
  // Teilen-Menü nur auf Touch-Geräten – am PC ist der Download erwartbarer
  const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
  if(file && matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })){
    navigator.share({ files: [file], title: name }).then(done).catch(err => {
      if(err && err.name === 'AbortError') return;          // im Teilen-Menü abgebrochen
      download(name, json, 'application/json'); done();
    });
    return;
  }
  download(name, json, 'application/json'); done();
}
/* Importierte Durchläufe prüfen: nur erwartete Typen übernehmen, damit eine manipulierte Datei nichts einschleusen kann (Protokoll, Befund 1) */
const SAFE_ID = /^[a-z0-9]{1,40}$/i;
function cleanRun(r){
  if(!r || typeof r !== 'object' || typeof r.id !== 'string' || !SAFE_ID.test(r.id) || typeof r.date !== 'string' || !Array.isArray(r.items)) return null;
  const nonNeg = v => Number.isFinite(v) && v >= 0;
  if(!Number.isInteger(r.total) || r.total <= 0 || !Number.isInteger(r.score) || r.score < 0 || r.score > r.total) return null;
  if(!nonNeg(r.elapsed) || (r.limit != null && !nonNeg(r.limit))) return null;
  const items = r.items.filter(x => x && typeof x.id === 'string' && typeof x.perm === 'string' && (x.a == null || typeof x.a === 'string'))
    .map(x => ({ id: x.id, perm: x.perm, a: x.a ?? null, f: x.f ? 1 : 0 }));
  return { id: r.id, date: r.date, mode: String(r.mode ?? ''), exam: typeof r.exam === 'string' ? r.exam : null, title: String(r.title ?? ''),
    sim: !!r.sim, shuffle: !!r.shuffle, limit: r.limit ?? null, elapsed: r.elapsed, timeout: !!r.timeout,
    total: r.total, score: r.score, items };
}
function loadBackup(file){
  if(!file) return;
  let restore = null;
  file.text().then(text => {
    const data = JSON.parse(text);
    // Nur Dateien dieser App annehmen – sonst könnten Verläufe einer anderen Trainer-App (andere Fragen) hineingeraten
    if(!Array.isArray(data) && data.app && data.app !== CFG.appId) throw new Error(t('import.errApp', { app: data.app }));
    const runs = Array.isArray(data) ? data : data.runs;
    if(!Array.isArray(runs)) throw new Error(t('import.errNoRuns'));
    const valid = runs.map(cleanRun).filter(Boolean);
    const known = new Set(HISTORY.map(r => r.id));
    const fresh = valid.filter(r => !known.has(r.id));
    HISTORY = [...HISTORY, ...fresh];
    const ok = store.save(HISTORY);
    const msg = [t('import.taken', { n: fresh.length }) + (valid.length - fresh.length ? t('import.existing', { n: valid.length - fresh.length }) : '') + (runs.length - valid.length ? t('import.invalid', { n: runs.length - valid.length }) : '') + '.'];
    // Einstellungen übernehmen (Entscheidung Felix 27.10.2026) – über loadSettings, damit ungültige Werte abgefangen werden
    if(data.settings && typeof data.settings === 'object'){
      try { localStorage.setItem(CFG.storagePrefix + 'settings', JSON.stringify(data.settings)); } catch(e) {}
      Object.assign(settings, loadSettings()); saveSettings(); msg.push(t('import.settings'));
    }
    const cur = checkCurrent(data.current);
    if(cur){
      const local = loadCurrent();
      restore = local && local.savedAt !== cur.savedAt ? { type: 'choose', fromFile: cur, local } : { type: 'restore', saved: cur, fromFile: true };
    } else if(data.current) msg.push(t('import.staleCurrent'));
    state.notice = msg.join(' ') + (ok ? '' : t('import.saveFail'));
  }).catch(err => { state.notice = t('import.failed', { msg: err.message }); })
    .finally(() => { state.modal = restore; render(); });
}
/* Unterbrochenen Durchlauf übernehmen: in den Browser-Speicher schreiben, dann wie nach dem Neuladen fortsetzen */
function adoptCurrent(d){ try { localStorage.setItem(CURRENT_KEY, JSON.stringify(d)); } catch(e) {} restoreCurrent(d); }

/* ---------- Bindings ---------- */
function bind(){
  const $ = id => document.getElementById(id);
  const $c = (name, fn) => document.querySelectorAll(`input[name="${name}"]`).forEach(fn);
  const change = (fn, focusSel) => e => { fn(e); saveSettings(); render(); const el = focusSel && document.querySelector(focusSel); el && el.focus(); };
  document.querySelectorAll('input[name="mode"]').forEach(r => r.onchange = change(() => settings.mode = r.value, `input[name="mode"][value="${r.value}"]`));
  document.querySelectorAll('input[name="exam"]').forEach(r => r.onchange = change(() => settings.exam = r.value, `input[name="exam"][value="${r.value}"]`));
  const cr = $('countRange');
  if(cr){
    const max = Number(cr.max);
    const min = Number(cr.min);
    cr.oninput = () => { const v = Number(cr.value), t = countLabel(v, max); $('countOut').textContent = t; cr.setAttribute('aria-valuetext', t);
      cr.style.setProperty('--p', ((v - min) / (max - min || 1) * 100).toFixed(2) + '%'); };
    cr.onchange = change(() => { const v = Number(cr.value); settings.count = v >= max ? 0 : v; }, '#countRange');
  }
  $('optSim') && ($('optSim').onchange = change(e => (settings.mode === 'exam' ? settings.examOpts : settings.trainingOpts).sim = e.target.checked, '#optSim'));
  $('optShuffle') && ($('optShuffle').onchange = change(e => settings.examOpts.shuffle = e.target.checked, '#optShuffle'));
  document.querySelectorAll('input[name="topic"]').forEach(r => r.onchange = change(() => {
    const t = new Set(chosenTopics()); r.checked ? t.add(r.value) : t.delete(r.value);
    // Alle Themen einzeln gewählt = „Alle“ (gleiches Ergebnis, eindeutigere Anzeige)
    settings.trainingOpts.topics = t.size === topicList().length ? [] : topicList().filter(x => t.has(x));
  }, `input[name="topic"][value="${CSS.escape(r.value)}"]`));

  $c('qsrc', r => r.onchange = change(() => {
    const e = new Set(chosenExams()); r.checked ? e.add(r.value) : e.delete(r.value);
    // Alle Prüfungen einzeln gewählt = „Alle“
    settings.trainingOpts.exams = e.size === EXAMS.length ? [] : EXAMS.map(x => x.code).filter(c => e.has(c));
  }, `input[name="qsrc"][value="${CSS.escape(r.value)}"]`));
  $c('topicAll', r => r.onchange = change(() => settings.trainingOpts.topics = [], 'input[name="topicAll"]'));
  $c('qsrcAll', r => r.onchange = change(() => settings.trainingOpts.exams = [], 'input[name="qsrcAll"]'));
  document.querySelectorAll('[data-ftoggle]').forEach(b => b.onclick = () => { state.filterOpen = !(b.getAttribute('aria-expanded') === 'true'); render(); document.querySelector('[data-ftoggle]').focus(); });
  document.querySelectorAll('[data-hintx]').forEach(b => b.onclick = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch(e) {} render(); });
  document.querySelectorAll('[data-freset]').forEach(b => b.onclick = () => { Object.assign(settings.trainingOpts, { source: 'all', topics: [], exams: [] }); saveSettings(); render(); document.querySelector('[data-ftoggle]').focus(); });
  document.querySelectorAll('input[name="source"]').forEach(r => r.onchange = change(() => settings.trainingOpts.source = r.value, `input[name="source"][value="${r.value}"]`));
  $('reportBtn') && ($('reportBtn').onclick = () => downloadReport(state.session));
  $('backToProgress') && ($('backToProgress').onclick = showProgress);
  document.querySelectorAll('[data-run]').forEach(b => b.onclick = () => openRun(b.dataset.run));
  document.querySelectorAll('[data-run-report]').forEach(b => b.onclick = () => { const run = HISTORY.find(r => r.id === b.dataset.runReport); run && downloadReport(sessionFromRun(run)); });
  document.querySelectorAll('[data-pfilter]').forEach(b => b.onchange = () => { progressFilter[b.name] = b.value; render(); });
  document.querySelectorAll('[data-train]').forEach(b => b.onclick = () => { settings.mode = 'training'; settings.trainingOpts.source = b.dataset.train; settings.trainingOpts.topics = []; settings.trainingOpts.exams = []; saveSettings(); state.view = 'start'; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-backup]').forEach(b => b.onclick = saveBackup);
  $('importBtn') && ($('importBtn').onclick = () => $('importFile').click());
  $('importFile') && ($('importFile').onchange = e => loadBackup(e.target.files[0]));
  $('modalStay') && ($('modalStay').onclick = () => { state.modal = null; render(); });
  $('modalPickFile') && ($('modalPickFile').onclick = () => adoptCurrent(state.modal.fromFile));
  $('modalPickLocal') && ($('modalPickLocal').onclick = () => adoptCurrent(state.modal.local));
  $('clearBtn') && ($('clearBtn').onclick = () => { state.modal = { type: 'clear' }; render(); });
  $('modalClear') && ($('modalClear').onclick = () => { HISTORY = []; store.save(HISTORY); state.modal = null; state.notice = t('notice.cleared'); render(); });
  $('startBtn') && ($('startBtn').onclick = start);
  document.querySelectorAll('[data-choose]').forEach(b => b.onclick = () => choose(b.dataset.choose));
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => go(state.pos + Number(b.dataset.nav)));
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(Number(b.dataset.go)));
  document.querySelectorAll('[data-flag]').forEach(b => b.onclick = toggleFlag);
  document.querySelectorAll('[data-confirm]').forEach(b => b.onclick = confirmAnswer);
  document.querySelectorAll('[data-scen]').forEach(b => b.onclick = () => setScen(!state.scenOpen));
  document.querySelectorAll('[data-tip]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const open = !b.parentElement.classList.contains('open');
    closeTips(); b.parentElement.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('[data-finish]').forEach(b => b.onclick = askFinish);
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { state.view = 'result'; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => review(Number(b.dataset.review)));
  ['finishBtn', 'finishBtn2'].forEach(id => $(id) && ($(id).onclick = askFinish));
  ['backToResult', 'backToResult2'].forEach(id => $(id) && ($(id).onclick = () => { state.view = 'result'; render(); window.scrollTo(0, 0); }));
  $('restartBtn') && ($('restartBtn').onclick = () => { state.reviewMode = false; state.view = 'start'; render(); window.scrollTo(0, 0); });
  $('homeBtn') && ($('homeBtn').onclick = () => { state.view = 'start'; render(); window.scrollTo(0, 0); });
  $('reviewAllBtn') && ($('reviewAllBtn').onclick = () => review(0));
  $('modalCancel') && ($('modalCancel').onclick = () => { state.modal = null; render(); });
  $('modalOk') && ($('modalOk').onclick = finish);
  $('modalLeave') && ($('modalLeave').onclick = () => goHome(true));
  $('modalResume') && ($('modalResume').onclick = resumeSession);
  $('modalRestore') && ($('modalRestore').onclick = () => state.modal.fromFile ? adoptCurrent(state.modal.saved) : restoreCurrent(state.modal.saved));
  $('modalDiscard') && ($('modalDiscard').onclick = () => { if(!state.modal.fromFile) clearCurrent(); state.modal = null; render(); });
}

/* Offene Erklärungen schließen: Klick daneben oder Esc */
function closeTips(){ document.querySelectorAll('.tip.open').forEach(t => { t.classList.remove('open'); t.querySelector('[data-tip]').setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', closeTips);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeTips(); });

/* Tastatur: A–F wählen (angezeigte Buchstaben der aktuellen Frage), Enter bestätigt (ohne Simulation), Pfeile navigieren, Esc schließt das Szenario */
document.addEventListener('keydown', e => {
  if(state.view !== 'exam' || state.modal) return;
  if(e.target.closest && e.target.closest('input, textarea')) return;
  if(e.key === 'Escape' && state.scenOpen){ setScen(false); return; }
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if(LETTERS.slice(0, current().perm.length).includes(k)) choose(k);
  else if(e.key === 'Enter' && !state.session.sim && !state.reviewMode && state.session.pending?.[current().q.id]){ e.preventDefault(); confirmAnswer(); }
  else if(e.key === 'ArrowRight') go(state.pos + 1);
  else if(e.key === 'ArrowLeft') go(state.pos - 1);
});

document.title = appName();
/* Kopfzeile: Logo + „Startseite“ = Home; Links zu verwandten Apps (neuer Tab, damit ein laufender Durchlauf erhalten bleibt) */
const EXT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const appLinksHtml = () => (CFG.otherApps || []).map(a =>
  `<a class="app-link" href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.title || a.label)}" aria-label="${esc(t('link.newTab', { label: a.label }))}"><span class="brand-word">${esc(a.label)}</span>${EXT_ICON}</a>`).join('');
document.getElementById('appLinks').innerHTML = appLinksHtml();
document.getElementById('brandWord').textContent = CFG.brandWord || '';
/* Sprachwechsel (Knopf in i18n.js): alles neu zeichnen, ohne Zustand zu verlieren – laufende Prüfung, Auswahl, Zeit und Daten bleiben in
   state/settings/HISTORY; gezeichnet wird nur die Anzeige. */
onLangChange(() => {
  document.title = appName();
  document.getElementById('appLinks').innerHTML = appLinksHtml();
  render(); renderScenario();
  if(state.view === 'exam' && state.session && !timer.hidden) showTimer();
});
if(CFG.brandColor) document.documentElement.style.setProperty('--brand', CFG.brandColor);
function goHome(force = false){
  // Während einer laufenden Prüfung/Übung erst nachfragen – der Durchlauf würde sonst verloren gehen
  if(!force && state.view === 'exam' && !state.reviewMode && state.session && !state.session.past){ state.modal = { type: 'leave' }; render(); return; }
  if(isRunning()) clearCurrent();                         // bewusst abgebrochen → Sicherung verwerfen
  stopTimer(); timer.hidden = true; state.reviewMode = false; state.modal = null; state.view = 'start'; render(); window.scrollTo(0, 0);
}
document.getElementById('homeLogo').onclick = () => goHome();
let LOGO_DATA = '', LOGO_DARK_DATA = '';
if(CFG.logoDark) fetch(CFG.logoDark).then(r => r.ok ? r.blob() : null).then(b => {
  if(!b) return; const fr = new FileReader(); fr.onload = () => { LOGO_DARK_DATA = fr.result; }; fr.readAsDataURL(b);
}).catch(() => {});
if(CFG.logo) fetch(CFG.logo).then(r => r.ok ? r.blob() : null).then(b => {
  if(!b) return; const fr = new FileReader(); fr.onload = () => { LOGO_DATA = fr.result; }; fr.readAsDataURL(b);
}).catch(() => {});
if(CFG.logo){                                              // eigenes Logo statt des eingebauten SVG
  const img = new Image(32, 32); img.src = CFG.logo; img.alt = ''; img.className = 'logo-img';
  img.onerror = () => img.remove();                        // Datei fehlt → Standard-Logo bleibt
  img.onload = () => document.querySelector('#homeLogo svg')?.remove();
  document.getElementById('homeLogo').prepend(img);
}

/* ---------- Theme ---------- */
/* Hell/Dunkel-Wahl wird gemerkt ({Präfix}theme); ohne Speicher oder ohne Wahl gilt das Farbschema des Geräts */
const THEME_KEY = (CFG.storagePrefix || '') + 'theme';
const themeSaved = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : null; } catch(e) { return null; } };
let theme = document.documentElement.dataset.theme || themeSaved() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  iconSun.hidden = theme === 'dark'; iconMoon.hidden = theme !== 'dark';
  const li = document.querySelector('#homeLogo .logo-img');   // helles/weißes Logo je Farbschema (optional: CFG.logoDark)
  if(li && CFG.logo) li.src = theme === 'dark' && CFG.logoDark ? CFG.logoDark : CFG.logo;
}
themeBtn.onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); try { localStorage.setItem(THEME_KEY, theme); } catch(e) {} };
applyTheme();
progressBtn.onclick = () => state.view === 'progress' ? goHome() : showProgress();

render();
loadCatalog();
