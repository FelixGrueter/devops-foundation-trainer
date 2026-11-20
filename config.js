/* Prüfungsspezifische Konfiguration – die EINZIGE Stelle, die sich zwischen Trainer-Apps unterscheidet.
   Alles andere (app.js, index.html) ist generisch. Bei Änderungen hier den Versionsparameter in index.html erhöhen.
   Zweisprachig (DE/EN): Felder mit Anzeigetext enthalten SCHLÜSSEL (z. B. 'cfg.hint'); der Text steht in i18n.js (I18N.de / I18N.en).
   Nur Markennamen (brand, logoAlt, brandWord) und technische Werte bleiben als Klartext. */
window.APP_CONFIG = {
  appId: 'devops-foundation-trainer',            // steht in Verlaufs-Exporten; Import akzeptiert nur Dateien mit dieser ID
  appTitle: 'app.title',                         // Schlüssel (i18n.js): Browser-Tab, Berichte, Feedback-Betreff
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
  // Alle vier Prüfungen sind Einzelauswahl (A–D); Begründung je Option mit Foliennummer (KI-erstellt aus den Trainer-Folien, Stand 18.11.2026).
  exams: [
    { code: 'SP1', title: 'exam.SP1.title', sub: 'exam.SP1.sub', official: true, badge: 'exam.badgeExpl',
      hint: 'exam.hint.sample' },
    { code: 'SP2', title: 'exam.SP2.title', sub: 'exam.SP2.sub', official: true, badge: 'exam.badgeExpl',
      hint: 'exam.hint.sample' },
    { code: 'MOA', title: 'exam.MOA.title', sub: 'exam.MOA.sub', official: true, badge: 'exam.badgeExpl',
      hint: 'exam.hint.mock' },
    { code: 'MOB', title: 'exam.MOB.title', sub: 'exam.MOB.sub', official: true, badge: 'exam.badgeExpl',
      hint: 'exam.hint.mock' },
  ],
  countStep: 10,                                 // Schieberegler im Trainingsmodus: 10er-Schritte bis zur Katalogsgröße (rechts = „Alle“)
  passRate: 0.65,                                // 65 % → 26 von 40 (vorläufige Bestehensgrenze laut Syllabus v3.6.1)
  examInfo: 'cfg.examInfo',                     // Schlüssel: Text im Tooltip der Tempo-Leiste (Prüfungsregel in Worten)
  secondsPerQuestion: 60 * 60 / 40,              // echte Prüfung: 60 Minuten für 40 Fragen (Countdown bei Simulation); Open Book; nur 60 min (Entscheidung Felix 18.11.2026)

  sourceNote: 'cfg.sourceNote',
  topicNote: 'cfg.topicNote',
  topicNoteShort: 'cfg.topicNoteShort',            // hinter dem Themenbereich einer Frage (nur wenn keine Fundstelle vorhanden – bei DevOps immer vorhanden)
  trademark: 'cfg.trademark',
  explHint: 'cfg.explHint',
  // Feedback: Teams-Direktlink (Entscheidung Felix 18.11.2026; die Adresse ist bewusst öffentlich, die Nutzer sind im selben Team)
  feedbackTeams: 'felixpascal.grueter@gfn.education',
  hint: 'cfg.hint',
  refLabel: 'cfg.refLabel',                        // Bezeichnung der Referenz in der Frage (statt „Lehrplan“)
  refHint: 'cfg.refHint',
};
