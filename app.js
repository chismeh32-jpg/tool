(() => {
  "use strict";

  const STORAGE_KEY = "infiltrado:v1";
  const $ = (sel) => document.querySelector(sel);

  // ---------- Estado ----------
  const state = {
    players: [],
    categories: Object.keys(CATEGORIES),
    impostors: 1,
    minutes: 3,
    hint: true,
    scores: {},
    roundNumber: 0,
    round: null,
    usedWords: [],
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (Array.isArray(saved.players)) state.players = saved.players.slice(0, 20);
      if (Array.isArray(saved.categories)) {
        const valid = saved.categories.filter((c) => c in CATEGORIES);
        if (valid.length) state.categories = valid;
      }
      if (Number.isInteger(saved.impostors)) state.impostors = saved.impostors;
      if (Number.isInteger(saved.minutes)) state.minutes = saved.minutes;
      if (typeof saved.hint === "boolean") state.hint = saved.hint;
    } catch { /* almacenamiento no disponible: seguimos con valores por defecto */ }
  }

  function save() {
    try {
      const { players, categories, impostors, minutes, hint } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ players, categories, impostors, minutes, hint }));
    } catch { /* ignorar */ }
  }

  // ---------- Utilidades ----------
  const rand = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const pick = (arr) => arr[rand(arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const maxImpostors = () => Math.max(1, Math.floor((state.players.length - 1) / 2));
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* nada */ } };

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
    window.scrollTo(0, 0);
  }

  // ---------- Configuración ----------
  function renderPlayers() {
    const list = $("#player-list");
    list.innerHTML = "";
    state.players.forEach((name, i) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = name;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Quitar a ${name}`);
      del.addEventListener("click", () => {
        state.players.splice(i, 1);
        state.impostors = Math.min(state.impostors, maxImpostors());
        save();
        renderSetup();
      });
      li.append(span, del);
      list.append(li);
    });
    $("#player-count").textContent = state.players.length;
    const missing = 3 - state.players.length;
    $("#player-hint").textContent = missing > 0
      ? `Faltan ${missing} jugador${missing === 1 ? "" : "es"} (mínimo 3).`
      : "¡Listos! Añade más si queréis.";
  }

  function renderCategories() {
    const grid = $("#category-list");
    grid.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([name, { emoji }]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cat";
      b.setAttribute("aria-pressed", state.categories.includes(name));
      b.innerHTML = `<span aria-hidden="true">${emoji}</span>`;
      b.append(document.createTextNode(name));
      b.addEventListener("click", () => {
        const on = state.categories.includes(name);
        if (on && state.categories.length === 1) return; // al menos una
        state.categories = on ? state.categories.filter((c) => c !== name) : [...state.categories, name];
        save();
        renderCategories();
      });
      grid.append(b);
    });
  }

  function renderSettings() {
    document.querySelector('[data-key="impostors"] output').textContent = state.impostors;
    document.querySelector('[data-key="minutes"] output').textContent = state.minutes;
    $("#hint-toggle").checked = state.hint;
  }

  function renderSetup() {
    renderPlayers();
    renderCategories();
    renderSettings();
    $("#start-btn").disabled = state.players.length < 3;
  }

  $("#add-player-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#player-input");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      input.select();
      return;
    }
    if (state.players.length >= 20) return;
    state.players.push(name);
    input.value = "";
    input.focus();
    save();
    renderSetup();
  });

  document.querySelectorAll(".stepper").forEach((stepper) => {
    const key = stepper.dataset.key;
    stepper.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        if (key === "impostors") state.impostors = Math.min(maxImpostors(), Math.max(1, state.impostors + step));
        if (key === "minutes") state.minutes = Math.min(10, Math.max(1, state.minutes + step));
        save();
        renderSettings();
      });
    });
  });

  $("#hint-toggle").addEventListener("change", (e) => { state.hint = e.target.checked; save(); });

  $("#rules-btn").addEventListener("click", () => $("#rules-dialog").showModal());

  $("#start-btn").addEventListener("click", () => {
    state.scores = Object.fromEntries(state.players.map((p) => [p, 0]));
    state.roundNumber = 0;
    state.usedWords = [];
    newRound();
  });

  // ---------- Ronda ----------
  function newRound() {
    state.impostors = Math.min(state.impostors, maxImpostors());
    const category = pick(state.categories);
    const pool = CATEGORIES[category].words.filter((w) => !state.usedWords.includes(w));
    const word = pick(pool.length ? pool : CATEGORIES[category].words);
    state.usedWords.push(word);

    const order = shuffle(state.players);
    const impostors = shuffle(state.players).slice(0, state.impostors);

    state.roundNumber += 1;
    state.round = {
      category, word, order, impostors,
      revealIndex: 0,
      starter: pick(state.players),
      lastPoints: {},
    };
    showPass();
  }

  function showPass() {
    const { order, revealIndex } = state.round;
    const name = order[revealIndex];
    $("#pass-progress").textContent = `Jugador ${revealIndex + 1} de ${order.length}`;
    $("#pass-name").textContent = name;
    $("#reveal-btn").textContent = `Soy ${name}, ver mi palabra`;
    show("screen-pass");
  }

  $("#reveal-btn").addEventListener("click", () => {
    const { order, revealIndex, impostors, word, category } = state.round;
    const name = order[revealIndex];
    const isImpostor = impostors.includes(name);
    const card = $("#role-card");
    card.classList.toggle("impostor", isImpostor);
    // reiniciar animación
    card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";

    if (isImpostor) {
      $("#role-label").textContent = "Tu papel";
      $("#role-word").textContent = "🕵️ Eres el infiltrado";
      $("#role-sub").textContent = state.hint
        ? `Categoría: ${CATEGORIES[category].emoji} ${category}. Escucha y disimula.`
        : "No sabes la palabra. Escucha y disimula.";
      vibrate([60, 60, 60]);
    } else {
      $("#role-label").textContent = `${CATEGORIES[category].emoji} ${category}`;
      $("#role-word").textContent = word;
      $("#role-sub").textContent = impostors.length > 1
        ? `Hay ${impostors.length} infiltrados entre vosotros.`
        : "Hay un infiltrado entre vosotros.";
      vibrate(40);
    }
    show("screen-reveal");
  });

  $("#hide-btn").addEventListener("click", () => {
    state.round.revealIndex += 1;
    if (state.round.revealIndex < state.round.order.length) showPass();
    else startDiscussion();
  });

  // ---------- Temporizador ----------
  let timerId = null;
  let remaining = 0;
  let paused = false;

  function renderTimer() {
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, "0");
    const el = $("#timer");
    el.textContent = `${m}:${s}`;
    el.classList.toggle("low", remaining <= 10 && remaining > 0);
  }

  function stopTimer() { clearInterval(timerId); timerId = null; }

  function startDiscussion() {
    $("#starter-name").textContent = state.round.starter;
    remaining = state.minutes * 60;
    paused = false;
    $("#pause-btn").textContent = "Pausar";
    renderTimer();
    show("screen-discuss");
    stopTimer();
    timerId = setInterval(() => {
      if (paused) return;
      remaining -= 1;
      renderTimer();
      if (remaining <= 0) {
        stopTimer();
        $("#timer").textContent = "¡Tiempo!";
        vibrate([200, 100, 200, 100, 400]);
      }
    }, 1000);
  }

  $("#pause-btn").addEventListener("click", () => {
    if (!timerId) return;
    paused = !paused;
    $("#pause-btn").textContent = paused ? "Reanudar" : "Pausar";
  });

  $("#to-vote-btn").addEventListener("click", () => {
    stopTimer();
    const grid = $("#vote-list");
    grid.innerHTML = "";
    state.players.forEach((name) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      b.addEventListener("click", () => resolveVote(name));
      grid.append(b);
    });
    show("screen-vote");
  });

  // ---------- Resultado y puntos ----------
  function addPoints(names, pts) {
    names.forEach((n) => {
      state.scores[n] = (state.scores[n] || 0) + pts;
      state.round.lastPoints[n] = (state.round.lastPoints[n] || 0) + pts;
    });
  }

  function resolveVote(accused) {
    const { impostors } = state.round;
    state.round.accused = accused;
    const caught = impostors.includes(accused);

    $("#reveal-panel").classList.add("hidden");
    $("#to-scores-btn").classList.add("hidden");

    if (caught) {
      $("#result-emoji").textContent = "🎯";
      $("#result-title").textContent = `¡Pillado! ${accused} se había infiltrado`;
      $("#result-text").textContent = "Le habéis pillado… pero aún puede salvarse.";
      $("#guess-name").textContent = accused;
      $("#guess-panel").classList.remove("hidden");
    } else {
      $("#result-emoji").textContent = "😈";
      $("#result-title").textContent = `${accused} era inocente`;
      $("#result-text").textContent = impostors.length > 1
        ? "Los infiltrados se han salido con la suya."
        : "El infiltrado se ha salido con la suya.";
      $("#guess-panel").classList.add("hidden");
      addPoints(impostors, 3);
      finishRound();
    }
    vibrate(80);
    show("screen-result");
  }

  function onGuess(guessed) {
    const { impostors, accused } = state.round;
    const others = impostors.filter((n) => n !== accused);
    const civilians = state.players.filter((n) => !impostors.includes(n));
    $("#guess-panel").classList.add("hidden");
    if (guessed) {
      $("#result-emoji").textContent = "🧠";
      $("#result-text").textContent = `¡${accused} ha adivinado la palabra y se lleva los puntos!`;
      addPoints([accused], 2);
    } else {
      $("#result-emoji").textContent = "🏆";
      $("#result-text").textContent = "No ha adivinado la palabra. ¡Victoria para el grupo!";
      addPoints(civilians, 1);
    }
    if (others.length) addPoints(others, 3); // los infiltrados no descubiertos también puntúan
    finishRound();
  }

  $("#guess-yes").addEventListener("click", () => onGuess(true));
  $("#guess-no").addEventListener("click", () => onGuess(false));

  function finishRound() {
    const { word, impostors, lastPoints } = state.round;
    $("#final-word").textContent = word;
    $("#final-impostors").textContent = impostors.length > 1
      ? `Infiltrados: ${impostors.join(" y ")}`
      : `Infiltrado: ${impostors[0]}`;
    const summary = Object.entries(lastPoints).map(([n, p]) => `${n} +${p}`).join(" · ");
    $("#final-points").textContent = summary;
    $("#reveal-panel").classList.remove("hidden");
    $("#to-scores-btn").classList.remove("hidden");
  }

  $("#to-scores-btn").addEventListener("click", () => {
    const list = $("#score-list");
    list.innerHTML = "";
    const ranked = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    ranked.forEach(([name, pts], i) => {
      const li = document.createElement("li");
      const delta = state.round.lastPoints[name];
      li.innerHTML = `<span class="pos">${i === 0 && pts > 0 ? "👑" : i + 1}</span>`;
      const n = document.createElement("span");
      n.className = "name";
      n.textContent = name;
      li.append(n);
      if (delta) {
        const d = document.createElement("span");
        d.className = "delta";
        d.textContent = `+${delta}`;
        li.append(d);
      }
      const p = document.createElement("span");
      p.className = "pts";
      p.textContent = pts;
      li.append(p);
      list.append(li);
    });
    $("#round-label").textContent = `Tras la ronda ${state.roundNumber}`;
    show("screen-scores");
  });

  $("#next-round-btn").addEventListener("click", newRound);
  $("#menu-btn").addEventListener("click", () => { stopTimer(); renderSetup(); show("screen-setup"); });

  // ---------- Inicio ----------
  load();
  state.impostors = Math.min(state.impostors, maxImpostors());
  renderSetup();
})();
