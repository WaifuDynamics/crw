/**
 * Push-ups / Squats Counter - Translations & Internationalization (i18n)
 *
 * ============================================================================
 * HOW TO ADD A NEW LANGUAGE (JAK DODAĆ NOWY JĘZYK):
 * 1. Add your language code to the TRANSLATIONS object below (e.g., 'es', 'de', 'fr', 'uk').
 * 2. Copy the entire 'en' dictionary block and translate each string.
 * 3. Add the language code and native name to SUPPORTED_LANGUAGES.
 * 4. That's all! The app will automatically support switching to your language,
 *    and any missing key will safely fall back to English.
 * ============================================================================
 */

export const SUPPORTED_LANGUAGES = {
  en: "English",
  pl: "Polski",
  // e.g. es: "Español", de: "Deutsch", uk: "Українська"
};

export const TRANSLATIONS = {
  // --------------------------------------------------------------------------
  // ENGLISH (DEFAULT BASE)
  // --------------------------------------------------------------------------
  en: {
    appTitle: "{exercise} — duel",
    cam: {
      looking: "looking for you…",
      starting: "Starting camera…",
      waiting: "Waiting for camera access…",
      loadingModel: "Loading pose model…",
      hint: "Stand side-on to the camera. The video never leaves this browser — only your rep count is sent.",
      cantSee: "can't see you",
      cantSeeLegs: "can't see your legs",
    },
    exercises: {
      pushup: "Push-ups",
      squat: "Squats",
      pushupHint: "Side-on to the camera, whole torso in frame.",
      squatHint: "Side-on to the camera, whole body in frame — feet included.",
    },
    modes: {
      pickTitle: "Pick a mode",
      soloTitle: "Solo",
      soloDesc: "Just you. Count reps, track your pace, no waiting.",
      duo1v1Title: "Duo — 1v1",
      duo1v1Desc: "Head to head. First to the target wins.",
      duo2v2Title: "Duo — 2v2",
      duo2v2Desc: "Two against two. Your team's reps are added together.",
      playingAs: "Playing as",
      namePlaceholder: "Player",
    },
    queue: {
      eyebrow: "Matchmaking",
      findingOpponent: "{exercise}: finding an opponent…",
      findingThreeMore: "{exercise}: finding three more players…",
      playersReady: "{ready} of {needed} players ready",
      waitingOneMore: "waiting for one more player ({online} online)",
      backToModes: "Back to modes",
    },
    countdown: {
      eyebrow: "Get ready",
      status: "Get into position",
      go: "GO",
      vs: "vs",
    },
    race: {
      targetMsg: "{mode} · {exercise} · first to {target}",
      asTeam: " as a team",
      you: "You",
      opponent: "Opponent",
      depth: "depth",
      giveUp: "Give up",
      left: "(left)",
    },
    solo: {
      title: "Solo · {exercise}",
      noReps: "No reps · stopping in",
      idleHint: "Do a rep to keep going",
      time: "time",
      pace: "reps / min",
      bestSet: "best set",
      depth: "depth",
      finish: "Finish",
      reset: "Reset",
      backToModes: "Back to modes",
    },
    soloDone: {
      title: "Solo · {exercise}",
      stoppedAuto: "Stopped automatically - no reps for a while.",
      repsThisSession: "reps this session",
      newBestSet: "New best set!",
      bestSet: "best set",
      time: "time",
      pace: "reps / min",
      yourRecords: "Your records",
      lifetimeReps: "lifetime reps",
      bestSetEver: "best set ever",
      sessions: "sessions",
      saving: "Saving…",
      savedLocal: "Saved on this device",
      savedAccount: "Saved to your account",
      noRepsNote: "No reps this time - nothing saved.",
      goAgain: "Go again",
      backToModes: "Back to modes",
    },
    result: {
      eyebrow: "Match over",
      youWin: "YOU WIN",
      youLose: "YOU LOSE",
      playAgain: "Play again",
      changeMode: "Change mode",
      droppedOut: "{against} dropped out",
      youBeat: "you beat {against} · first to {target}",
      beatenBy: "beaten by {against} · first to {target}",
    },
    sound: {
      on: "Sound on",
      off: "Sound off",
    },
    errors: {
      tryAgain: "Try again",
      iframeCamera: "This page does not let the widget use the camera. The iframe needs allow=\"camera\".",
      notAllowed: "Camera access was denied. Allow it in the address bar and reload.",
      notFound: "No camera found.",
      notReadable: "The camera is in use by another app.",
      plainHttp: "Browsers block the camera over plain http. Start the server with --tunnel.",
      startFailed: "Could not start the camera: {message}",
      serverNoConn: "No connection to the server: {message}",
      testMode: "Test mode: {video}",
    },
  },

  // --------------------------------------------------------------------------
  // POLSKI (POLISH)
  // --------------------------------------------------------------------------
  pl: {
    appTitle: "{exercise} — pojedynek",
    cam: {
      looking: "szukam sylwetki…",
      starting: "Uruchamianie kamery…",
      waiting: "Oczekiwanie na dostęp do kamery…",
      loadingModel: "Ładowanie modelu sylwetki…",
      hint: "Ustaw się bokiem do kamery. Obraz wideo nie opuszcza przeglądarki — wysyłana jest tylko liczba powtórzeń.",
      cantSee: "nie widać Cię",
      cantSeeLegs: "nie widać nóg",
    },
    exercises: {
      pushup: "Pompki",
      squat: "Przysiady",
      pushupHint: "Ustaw się bokiem do kamery, cały tułów w kadrze.",
      squatHint: "Ustaw się bokiem do kamery, całe ciało w kadrze — łącznie ze stopami.",
    },
    modes: {
      pickTitle: "Wybierz tryb",
      soloTitle: "Solo",
      soloDesc: "Tylko Ty. Licznik powtórzeń, tempo i bez czekania.",
      duo1v1Title: "Duo — 1v1",
      duo1v1Desc: "Jeden na jednego. Kto pierwszy osiągnie cel, wygrywa.",
      duo2v2Title: "Duo — 2v2",
      duo2v2Desc: "Dwaj na dwóch. Powtórzenia drużyny sumują się.",
      playingAs: "Grasz jako",
      namePlaceholder: "Gracz",
    },
    queue: {
      eyebrow: "Dobieranie graczy",
      findingOpponent: "{exercise}: szukanie rywala…",
      findingThreeMore: "{exercise}: szukanie trzech kolejnych graczy…",
      playersReady: "{ready} z {needed} graczy gotowych",
      waitingOneMore: "oczekiwanie na jeszcze jednego gracza ({online} online)",
      backToModes: "Wróć do trybów",
    },
    countdown: {
      eyebrow: "Przygotuj się",
      status: "Ustaw się w pozycji",
      go: "START",
      vs: "vs",
    },
    race: {
      targetMsg: "{mode} · {exercise} · pierwszy do {target}",
      asTeam: " jako drużyna",
      you: "Ty",
      opponent: "Rywal",
      depth: "głębokość",
      giveUp: "Poddaj się",
      left: "(wyszedł)",
    },
    solo: {
      title: "Solo · {exercise}",
      noReps: "Brak powtórzeń · koniec za",
      idleHint: "Zrób powtórzenie, aby kontynuować",
      time: "czas",
      pace: "powt. / min",
      bestSet: "najlepsza seria",
      depth: "głębokość",
      finish: "Zakończ",
      reset: "Resetuj",
      backToModes: "Wróć do trybów",
    },
    soloDone: {
      title: "Solo · {exercise}",
      stoppedAuto: "Zatrzymano automatycznie — brak powtórzeń przez dłuższą chwilę.",
      repsThisSession: "powtórzeń w tej sesji",
      newBestSet: "Nowy rekord serii!",
      bestSet: "najlepsza seria",
      time: "czas",
      pace: "powt. / min",
      yourRecords: "Twoje rekordy",
      lifetimeReps: "wszystkie powtórzenia",
      bestSetEver: "rekord serii w historii",
      sessions: "sesje",
      saving: "Zapisywanie…",
      savedLocal: "Zapisano na tym urządzeniu",
      savedAccount: "Zapisano na Twoim koncie",
      noRepsNote: "Brak powtórzeń tym razem — nic nie zapisano.",
      goAgain: "Jeszcze raz",
      backToModes: "Wróć do trybów",
    },
    result: {
      eyebrow: "Koniec pojedynku",
      youWin: "WYGRANA",
      youLose: "PRZEGRANA",
      playAgain: "Zagraj ponownie",
      changeMode: "Zmień tryb",
      droppedOut: "{against} zrezygnował",
      youBeat: "pokonałeś {against} · pierwszy do {target}",
      beatenBy: "pokonany przez {against} · pierwszy do {target}",
    },
    sound: {
      on: "Dźwięk włączony",
      off: "Dźwięk wyłączony",
    },
    errors: {
      tryAgain: "Spróbuj ponownie",
      iframeCamera: "Ta strona nie zezwala widżetowi na użycie kamery. Iframe wymaga uprawnienia allow=\"camera\".",
      notAllowed: "Odmówiono dostępu do kamery. Zezwól na kamerę na pasku adresu i odśwież stronę.",
      notFound: "Nie znaleziono kamery.",
      notReadable: "Kamera jest używana przez inną aplikację.",
      plainHttp: "Przeglądarki blokują kamerę na zwykłym http. Uruchom serwer z parametrem --tunnel.",
      startFailed: "Nie udało się uruchomić kamery: {message}",
      serverNoConn: "Brak połączenia z serwerem: {message}",
      testMode: "Tryb testowy: {video}",
    },
  },
};

let currentLang = "en";

/**
 * Resolves current language preference:
 * 1. URL search param ?lang=pl
 * 2. Local storage 'pushups-lang'
 * 3. Browser language (navigator.language)
 * 4. Fallback: 'en'
 */
export function getLanguage() {
  try {
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang && TRANSLATIONS[urlLang]) return urlLang;
  } catch {}

  try {
    const saved = localStorage.getItem("pushups-lang");
    if (saved && TRANSLATIONS[saved]) return saved;
  } catch {}

  try {
    const nav = (navigator.language || "").split("-")[0].toLowerCase();
    if (nav && TRANSLATIONS[nav]) return nav;
  } catch {}

  return "en";
}

currentLang = getLanguage();

/**
 * Returns translated string by dot-path (e.g. "modes.pickTitle").
 * Supports variable replacement with {varName} or {{varName}}.
 */
export function t(path, params = {}, lang = currentLang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const fallbackDict = TRANSLATIONS.en;

  const resolve = (target) =>
    path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), target);

  let val = resolve(dict);
  if (val == null) val = resolve(fallbackDict);
  if (val == null) return path;

  let text = String(val);
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{\\{?\\s*${k}\\s*\\}?}`, "g"), String(v));
  }
  return text;
}

/**
 * Changes active language, updates storage and updates all translatable elements in DOM.
 */
export function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem("pushups-lang", lang);
  } catch {}

  applyTranslations(lang);
  window.dispatchEvent(new CustomEvent("languagechange", { detail: { lang } }));
}

/**
 * Applies translations to all elements with data-i18n, data-i18n-placeholder, etc.
 */
export function applyTranslations(lang = currentLang) {
  document.documentElement.lang = lang;

  // Text content
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, {}, lang);
  }

  // HTML content (for elements containing nested HTML tags like <span class="dot">.</span>)
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key, {}, lang);
  }

  // Placeholders
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.placeholder = t(key, {}, lang);
  }

  // Aria labels
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key, {}, lang));
  }

  // Language buttons active state
  for (const btn of document.querySelectorAll("[data-lang-picker]")) {
    const l = btn.getAttribute("data-lang-picker");
    btn.classList.toggle("active", l === lang);
  }
}
