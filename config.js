/* Prüfungsspezifische Konfiguration – die EINZIGE Stelle, die sich zwischen Trainer-Apps unterscheidet.
   Alles andere (app.js, index.html) ist generisch. Bei Änderungen hier den Versionsparameter in index.html erhöhen. */
window.APP_CONFIG = {
  appId: 'devops-foundation-trainer',            // steht in Verlaufs-Exporten; Import akzeptiert nur Dateien mit dieser ID
  appTitle: 'DevOps Foundation Trainer',          // Browser-Tab, Kopfzeile, Berichte
  brand: 'DevOps · Foundation',                   // Rückfalltext, falls das Logo nicht lädt
  liveUrl: 'felixgrueter.github.io/devops-foundation-trainer',   // noch nicht veröffentlicht (Phase 6, nur nach Freigabe)
  // Kopfzeile: Logo (Quelle: DOI-COLOUR@4x.png, ohne „Institute“, mit ®) + Wort daneben im Stil der Wortmarke
  logo: 'img/logo-devops.png',
  logoDark: 'img/logo-devops-weiss.svg',          // Dunkelmodus: weiße Fassung (Marineblau wäre auf dunklem Grund kaum lesbar)
  logoAlt: 'DevOps',
  brandWord: 'Foundation',
  // brandColor: bewusst nicht gesetzt – die Farbe der Wortmarke steht als --brand (hell/dunkel) in index.html
  // Links in der Kopfzeile zu verwandten Trainer-Apps (öffnen in neuem Tab) – derzeit keine
  otherApps: [],
  // Eigener Präfix ist Pflicht: alle Apps unter felixgrueter.github.io teilen sich denselben Browser-Speicher.
  // Hier 'dof-' (Abgleich mit der Projektübersicht in ~/Projekte/CLAUDE.md: p2-, p2p-, it5-).
  storagePrefix: 'dof-',
  reportPrefix: 'DevOps-Foundation',              // Dateinamen von Bericht und Verlaufs-Export

  // Prüfungen: code = Präfix in katalog.json → origin (z. B. "SP1-19" = Musterprüfung 1, Frage 19)
  // Alle sechs Prüfungen sind Einzelauswahl (A–D); Begründung je Option mit Foliennummer (KI-erstellt aus den Trainer-Folien, Stand 18.11.2026).
  exams: [
    { code: 'SP1', title: 'Musterprüfung 1', sub: 'Offizielle PeopleCert-Musterprüfung (Sample Paper 1)', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Musterprüfung mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
    { code: 'SP2', title: 'Musterprüfung 2', sub: 'Offizielle PeopleCert-Musterprüfung (Sample Paper 2)', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Musterprüfung mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
    { code: 'MOA', title: 'Mock A', sub: 'Offizielle Mock-Prüfung', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Mock-Prüfungsfragen mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
    { code: 'MOB', title: 'Mock B', sub: 'Offizielle Mock-Prüfung', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Mock-Prüfungsfragen mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
    // Quiz 1/2 (früher „Leecon“): Bezeichnung „Offizielle Test-Prüfung“ (Entscheidung Felix 18.11.2026, zuvor „Mock-Prüfung“ wie Mock A/B)
    { code: 'QUIZ1', title: 'Quiz 1', sub: 'Offizielle Test-Prüfung', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Test-Prüfungsfragen mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
    { code: 'QUIZ2', title: 'Quiz 2', sub: 'Offizielle Test-Prüfung', official: true, badge: 'mit Begründungen',
      hint: 'Offizielle Test-Prüfungsfragen mit Lösung und Begründung zu jeder Antwortoption samt Foliennummer (von einer KI aus den offiziellen Trainer-Folien erstellt).' },
  ],
  countStep: 10,                                 // Schieberegler im Trainingsmodus: 10er-Schritte bis zur Katalogsgröße (rechts = „Alle“)
  passRate: 0.65,                                // 65 % → 26 von 40 (vorläufige Bestehensgrenze laut Syllabus v3.6.1)
  examInfo: '60 min für 40 Fragen',              // Text im Tooltip der Tempo-Leiste (Prüfungsregel in Worten)
  secondsPerQuestion: 60 * 60 / 40,              // echte Prüfung: 60 Minuten für 40 Fragen (Countdown bei Simulation); Open Book; nur 60 min (Entscheidung Felix 18.11.2026)

  sourceNote: 'Fragen und Lösungen: DevOps Foundation®, Musterprüfung 1 und 2 (PeopleCert, offizielle Schulungsunterlagen); Mock A und Mock B: offizielle Mock-Prüfungsfragen; Quiz 1 und Quiz 2: offizielle Test-Prüfungsfragen. Die Begründungen je Antwortoption (mit Foliennummer) und die Themenzuordnung wurden von einer KI aus den offiziellen Trainer-Folien (v3.6.1) erstellt. Prüfungsregeln nach dem offiziellen Syllabus v3.6.1.',
  topicNote: 'Hinweis: Alle Fragen sind den acht offiziellen Themenbereichen zugeordnet. Musterprüfungen: laut offiziellem Antwortschlüssel; Mock A und B: laut Quelle; Quiz 1 und 2: durch eine KI nach den Trainer-Folien – dort eine Einschätzung, keine offizielle Zuordnung.',
  topicNoteShort: 'durch KI zugeordnet',            // hinter dem Themenbereich einer Frage (nur wenn keine Fundstelle vorhanden – bei DevOps immer vorhanden)
  trademark: 'DevOps Foundation® ist eine Marke von PeopleCert. Diese App ist ein unabhängiges Übungsangebot und steht in keiner Verbindung zu PeopleCert.',
  explHint: 'Mit Begründung zu jeder Antwortoption und Foliennummer der offiziellen Trainer-Folien (KI-erstellt).',
  // Feedback: Teams-Direktlink (Entscheidung Felix 18.11.2026; die Adresse ist bewusst öffentlich, die Nutzer sind im selben Team)
  feedbackTeams: 'felixpascal.grueter@gfn.education',
  hint: 'Alle Inhalte sind ohne Gewähr. Begründungen und Themenzuordnungen wurden teils von einer KI erstellt und können Fehler enthalten. Fällt dir etwas Fragwürdiges auf (Frage, Lösung oder Begründung), gib mir bitte kurz Feedback.',
  refLabel: 'Fundstelle',                        // Bezeichnung der Referenz in der Frage (statt „Lehrplan“)
  refHint: '„Folie n“ = Seite der offiziellen Trainer-Folien (PDF v3.6.1)',
};
