// script.js - Smart Study Planner (Upgraded & Fixed)
// -------------------------------------------------
// Fully self-contained, replaces previous script.
// Make sure Chart.js is loaded in the page (you already had it).

(() => {
  // ------------------------
  // 0️⃣ Initial Setup
  // ------------------------
  const STORAGE_KEYS = {
    TASKS: "ssp_tasks_v1",
    SETTINGS: "ssp_settings_v1",
    NOTES: "ssp_session_notes",
    MOODS: "ssp_moods_v1",
    STATS: "ssp_stats_v1",
    ACHIEVEMENTS: "ssp_achievements_v1",
    FOCUS_HISTORY: "ssp_focus_history_v1"
  };

  let tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS)) || [];
  let settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)) || {
    fontSize: "medium",
    sortMode: "added",
    showDeadlines: true,
    showPriorities: true,
    timerLength: 1500,
    compact: false
  };

  // simple stats (streaks, total focus minutes)
  let stats = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)) || {
    currentStreak: 0,
    lastStudyDate: null,
    totalFocusMinutes: 0
  };

  let achievements = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS)) || {
    firstTask: false,
    fiveTasks: false,
    threeDayStreak: false
  };

  let timerInterval = null;
  let timerRemaining = settings.timerLength; // in seconds
  let focusSessionActive = false;

  // Chart objects placeholders
  let taskDoughnutChart = null;
  let weeklyBarChart = null;
  let focusHistoryChart = null;

  // Cached DOM references (safe lookup)
  const el = id => document.getElementById(id);
  const q = selector => document.querySelector(selector);
  const qa = selector => Array.from(document.querySelectorAll(selector));

  // Elements used
  const mainContent = el("main-content");
  const taskCountEl = el("task-count");
  const completedCountEl = el("completed-count");
  const progressPercentEl = el("progress-percent");
  const studyStreakEl = el("study-streak");
  const taskListEl = el("taskList");
  const progressTextEl = el("progressText");
  const progressCircleEl = el("progressCircle");
  const timerDisplayEl = el("timer-display");
  const quoteEl = el("quote");
  const notesEl = el("notes");
  const audioPlayer = el("audio-player");

  // Helper: safe getContext (Chart.js)
  function getCanvasContext(id) {
    const c = el(id);
    if (!c) return null;
    return c.getContext ? c.getContext("2d") : null;
  }

  // ------------------------
  // Utilities
  // ------------------------
  function saveTasks() {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }
  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }
  function saveStats() {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  }
  function saveAchievements() {
    localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(achievements));
  }
  function saveFocusHistory(history) {
    localStorage.setItem(STORAGE_KEYS.FOCUS_HISTORY, JSON.stringify(history || []));
  }
  function loadFocusHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FOCUS_HISTORY) || "[]");
  }

  function toast(msg, timeout = 2200) {
    // simple toast creation
    let t = document.createElement("div");
    t.className = "ssp-toast";
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("visible"), 20);
    setTimeout(() => {
      t.classList.remove("visible");
      setTimeout(() => t.remove(), 300);
    }, timeout);
  }

  function formatDateISO(dStr) {
    if (!dStr) return "";
    const d = new Date(dStr);
    if (isNaN(d)) return dStr;
    return d.toLocaleDateString();
  }

  // ------------------------
  // Window onload
  // ------------------------
  window.onload = () => {
    applySettings();
    bindUI();
    renderTasks();
    updateDashboard();
    updateProgressRing();
    updateFocusTimerDisplay();
    showQuote();
    loadNotesToUI();
    initializeCharts(); // create charts with existing stored data
    updateAchievementsUI();
  };

  // ------------------------
  // Section Switching
  // ------------------------
  window.loadSection = (id) => {
    qa(".section").forEach(s => s.classList.remove("active"));
    const target = el(id);
    if (target) target.classList.add("active");
    // update charts when switching to dashboard/focus, to ensure redraw
    if (id === "home") {
      refreshCharts();
    } else if (id === "focus") {
      refreshCharts();
    }
  };

  // ------------------------
  // Bind UI events (buttons, quick actions)
  // ------------------------
  function bindUI() {
    // Add Task button (in Study area)
    const addBtn = qa(".task-input button")[0];
    if (addBtn) addBtn.addEventListener("click", handleAddTaskFromForm);

    // Filters buttons
    qa(".task-filters button").forEach(btn => {
      btn.addEventListener("click", () => filterTasks(btn.textContent.trim().toLowerCase()));
    });

    // Timer Controls
    const startBtn = el("start-timer");
    const pauseBtn = el("pause-timer");
    const resetBtn = el("reset-timer");
    if (startBtn) startBtn.addEventListener("click", startFocusTimer);
    if (pauseBtn) pauseBtn.addEventListener("click", pauseFocusTimer);
    if (resetBtn) resetBtn.addEventListener("click", resetFocusTimer);

    // Template switcher handled below (setup)
    qa("#template-switcher button").forEach(btn => {
      btn.addEventListener("click", () => {
        const template = btn.getAttribute("data-template");
        const focusSection = el("focus");
        if (focusSection) {
          focusSection.style.backgroundImage = `url('images/${template}')`;
          focusSection.style.backgroundSize = "cover";
          focusSection.style.backgroundPosition = "center";
        }
      });
    });

    // Save Notes
    const saveNotesBtn = el("save-notes");
    if (saveNotesBtn) saveNotesBtn.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEYS.NOTES, notesEl.value || "");
      toast("Notes saved");
    });

    // Music player
    qa("#music-player button").forEach(btn => {
      btn.addEventListener("click", () => {
        const sound = btn.getAttribute("data-sound");
        if (!sound) return;
        audioPlayer.src = `sounds/${sound}`;
        audioPlayer.play().catch(e => {
          // autoplay policies may block - handle gracefully
          toast("Audio play blocked by browser. Click to allow.");
        });
      });
    });

    // Mood tracker
    qa("#mood-tracker button").forEach(btn => {
      btn.addEventListener("click", () => {
        const mood = btn.getAttribute("data-mood");
        if (!mood) return;
        let moods = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOODS) || "[]");
        moods.push({ mood, timestamp: new Date().toISOString() });
        localStorage.setItem(STORAGE_KEYS.MOODS, JSON.stringify(moods));
        toast(`Mood saved: ${mood}`);
      });
    });

    // Quick actions on dashboard area
    qa(".quick-actions button").forEach(btn => {
      btn.addEventListener("click", () => {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt.includes("add task")) loadSection("study");
        if (txt.includes("focus")) loadSection("focus");
        if (txt.includes("review notes")) {
          loadSection("study");
          toast("Open notes on Study panel");
        }
      });
    });

    // Settings selects and toggles (exists in HTML with onchange attributes already - but ensure sync)
    // Set timerLength select to reflect settings
    qa("select").forEach(s => {
      if (s.value && settings[s.id]) {
        s.value = settings[s.id];
      }
    });
  }

  // ------------------------
  // Tasks: creation, render, toggle, delete, edit
  // ------------------------
  function handleAddTaskFromForm() {
    const input = el("taskInput");
    const deadline = el("taskDeadline").value || "";
    const priority = el("taskPriority").value || "medium";
    const category = el("taskCategory") ? el("taskCategory").value : "general";
    if (!input || !input.value.trim()) {
      toast("Please enter a task");
      return;
    }
    const newTask = {
      id: Date.now(),
      text: input.value.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      deadline: deadline || null,
      priority: priority,
      category: category,
      notes: "",
      tags: []
    };
    tasks.push(newTask);
    saveTasks();
    input.value = "";
    if (el("taskDeadline")) el("taskDeadline").value = "";
    renderTasks();
    updateDashboard();
    toast("Task added");
    checkAchievements();
  }

  function toggleTask(id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    tasks[idx].completed = !tasks[idx].completed;
    saveTasks();
    renderTasks();
    updateDashboard();
  }

  function deleteTask(id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    tasks.splice(idx, 1);
    saveTasks();
    renderTasks();
    updateDashboard();
    toast("Task deleted");
    checkAchievements();
  }

  function editTask(id, updates) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    tasks[idx] = { ...tasks[idx], ...updates };
    saveTasks();
    renderTasks();
    updateDashboard();
    toast("Task updated");
  }

  // Render tasks with interactive features
  function renderTasks(filter = null) {
    // Sorting
    let sorted = [...tasks];
    if (settings.sortMode === "deadline") {
      sorted.sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline) : new Date(8640000000000000);
        const db = b.deadline ? new Date(b.deadline) : new Date(8640000000000000);
        return da - db;
      });
    } else if (settings.sortMode === "priority") {
      const order = { high: 1, medium: 2, low: 3 };
      sorted.sort((a, b) => (order[a.priority] || 4) - (order[b.priority] || 4));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // apply external filter param (if passed)
    if (filter) {
      if (filter === "today") {
        const todayStr = new Date().toISOString().slice(0, 10);
        sorted = sorted.filter(t => t.deadline === todayStr);
      } else if (filter === "high priority") {
        sorted = sorted.filter(t => t.priority === "high");
      } else if (filter === "completed") {
        sorted = sorted.filter(t => t.completed);
      } else if (filter === "all") {
        // no-op
      } else {
        // unknown filter - no-op
      }
    }

    // render
    if (!taskListEl) return;
    taskListEl.innerHTML = "";
    taskListEl.className = settings.compact ? "compact" : "task-list";

    sorted.forEach((t) => {
      const li = document.createElement("li");
      li.className = "task-item";
      if (t.completed) li.classList.add("task-completed");

      // header row: checkbox + title + meta + actions
      const header = document.createElement("div");
      header.className = "task-header";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!t.completed;
      chk.addEventListener("change", () => toggleTask(t.id));
      header.appendChild(chk);

      const titleWrap = document.createElement("div");
      titleWrap.className = "task-title-wrap";

      const title = document.createElement("div");
      title.className = "task-title";
      title.textContent = t.text;
      titleWrap.appendChild(title);

      // details meta
      const meta = document.createElement("div");
      meta.className = "task-meta";
      if (settings.showPriorities) meta.innerHTML += `<span class="meta priority ${t.priority}">${t.priority}</span>`;
      if (settings.showDeadlines && t.deadline) meta.innerHTML += `<span class="meta deadline">${formatDateISO(t.deadline)}</span>`;
      if (t.category) meta.innerHTML += `<span class="meta category">${t.category}</span>`;
      titleWrap.appendChild(meta);

      header.appendChild(titleWrap);

      // actions: expand, edit, delete
      const actions = document.createElement("div");
      actions.className = "task-actions";
      const expandBtn = document.createElement("button");
      expandBtn.className = "small";
      expandBtn.title = "Expand details";
      expandBtn.innerHTML = "<i class='fas fa-chevron-down'></i>";
      actions.appendChild(expandBtn);

      const editBtn = document.createElement("button");
      editBtn.className = "small";
      editBtn.title = "Edit";
      editBtn.innerHTML = "<i class='fas fa-pen'></i>";
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "small";
      delBtn.title = "Delete";
      delBtn.innerHTML = "<i class='fas fa-trash'></i>";
      actions.appendChild(delBtn);

      header.appendChild(actions);
      li.appendChild(header);

      // details content (hidden by default)
      const details = document.createElement("div");
      details.className = "task-details";
      details.style.display = "none";
      details.innerHTML = `
        <label>Notes</label>
        <textarea class="detail-notes" placeholder="Add details...">${t.notes || ""}</textarea>
        <label>Tags (comma separated)</label>
        <input class="detail-tags" value="${(t.tags || []).join(", ")}" placeholder="eg: exam,chapter1">
        <div class="detail-actions">
          <button class="save-detail">Save</button>
          <button class="cancel-detail">Cancel</button>
        </div>
      `;
      li.appendChild(details);

      // Events for action buttons
      expandBtn.addEventListener("click", () => {
        const visible = details.style.display !== "none";
        details.style.display = visible ? "none" : "block";
        expandBtn.innerHTML = visible ? "<i class='fas fa-chevron-down'></i>" : "<i class='fas fa-chevron-up'></i>";
      });

      editBtn.addEventListener("click", () => {
        // open quick edit modal inline by toggling details and focusing notes
        details.style.display = details.style.display === "none" ? "block" : "none";
      });

      delBtn.addEventListener("click", () => {
        if (confirm("Delete this task?")) deleteTask(t.id);
      });

      // Save details inside details panel
      const saveDetailBtn = details.querySelector(".save-detail");
      const cancelDetailBtn = details.querySelector(".cancel-detail");
      const notesInput = details.querySelector(".detail-notes");
      const tagsInput = details.querySelector(".detail-tags");

      saveDetailBtn.addEventListener("click", () => {
        const newNotes = notesInput.value;
        const newTags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
        editTask(t.id, { notes: newNotes, tags: newTags });
        details.style.display = "none";
      });

      cancelDetailBtn.addEventListener("click", () => {
        details.style.display = "none";
      });

      taskListEl.appendChild(li);
    });

    updateProgress();
  }

  // filter entrypoint from filter button text
  function filterTasks(filterLabel) {
    // Accept "today", "all", "high priority", "completed"
    filterLabel = filterLabel.toLowerCase();
    if (filterLabel === "high priority") renderTasks("high priority");
    else renderTasks(filterLabel);
  }

  // ------------------------
  // Update Progress & Dashboard
  // ------------------------
  function updateProgress() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;

    // Update dashboard display (progress percent text)
    if (progressTextEl) progressTextEl.textContent = `${percent}%`;

    // If there is an old progress-bar (legacy), keep it in sync if present
    const progressBar = q(".progress-container #progress-bar");
    if (progressBar) progressBar.style.width = percent + "%";

    // Update progress ring stroke offset
    updateProgressRing(percent);

    // Update dashboard numbers
    updateDashboard(); // redisplay counters

    // Update charts maybe
    refreshCharts();
  }

  function updateDashboard() {
    if (taskCountEl) taskCountEl.innerText = tasks.length;
    if (completedCountEl) completedCountEl.innerText = tasks.filter(t => t.completed).length;
    const percent = tasks.length ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0;
    if (progressPercentEl) progressPercentEl.innerText = `${percent}%`;

    // Streak logic: if user completed at least one task today, increment streak
    const today = new Date().toISOString().slice(0, 10);
    const anyCompletedToday = tasks.some(t => {
      if (!t.completed) return false;
      const completedAt = t.completedAt || null; // tasks don't store completedAt by default
      // fallback: if createdAt is today and completed true - treat as completed today
      const createdDate = t.createdAt ? t.createdAt.slice(0, 10) : null;
      return createdDate === today || (completedAt && completedAt.slice(0, 10) === today);
    });

    // Update streak display using stored stats
    if (stats && studyStreakEl) studyStreakEl.innerText = `🔥 ${stats.currentStreak}`;

    // Upcoming deadlines (a new element on dashboard)
    const upcomingContainer = q(".upcoming-deadlines");
    if (upcomingContainer) {
      const upcoming = tasks
        .filter(t => t.deadline && !t.completed)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 5);
      upcomingContainer.innerHTML = upcoming.length ? upcoming.map(t => `<div class="upcoming-item"><strong>${t.text}</strong><span>${formatDateISO(t.deadline)}</span></div>`).join("") : "<div class='upcoming-empty'>No upcoming deadlines</div>";
    }

    saveStats();
  }

  // ------------------------
  // Achievements
  // ------------------------
  function checkAchievements() {
    // First task
    if (!achievements.firstTask && tasks.length >= 1) {
      achievements.firstTask = true;
      toast("Achievement: First Task!");
    }
    // 5 tasks
    if (!achievements.fiveTasks && tasks.length >= 5) {
      achievements.fiveTasks = true;
      toast("Achievement: 5 Tasks Created!");
    }
    // streaks: if stats.currentStreak >=3
    if (!achievements.threeDayStreak && stats.currentStreak >= 3) {
      achievements.threeDayStreak = true;
      toast("Achievement: 3 Day Streak!");
    }
    saveAchievements();
    updateAchievementsUI();
  }

  function updateAchievementsUI() {
    // mild UI hookup - if badges exist in DOM update classes
    const badgeFirst = el("badge-first-task");
    const badgeFive = el("badge-5-tasks");
    const badgeStreak = el("badge-streak");
    if (badgeFirst) badgeFirst.classList.toggle("achieved", !!achievements.firstTask);
    if (badgeFive) badgeFive.classList.toggle("achieved", !!achievements.fiveTasks);
    if (badgeStreak) badgeStreak.classList.toggle("achieved", !!achievements.threeDayStreak);
  }

  // ------------------------
  // Progress Ring (SVG)
  // ------------------------
  const PROGRESS_RADIUS = 50;
  const CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;
  function updateProgressRing(percent = null) {
    if (!progressCircleEl) return;
    if (percent === null) {
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed).length;
      percent = total ? Math.round((completed / total) * 100) : 0;
    }
    // ensure stroke-dasharray is set
    progressCircleEl.setAttribute("stroke-dasharray", CIRCUMFERENCE.toString());
    const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
    progressCircleEl.style.transition = "stroke-dashoffset 600ms ease";
    progressCircleEl.style.strokeDashoffset = offset;
    if (progressTextEl) progressTextEl.textContent = `${percent}%`;
  }

  // ------------------------
  // Focus Timer Functions
  // ------------------------
  function updateFocusTimerDisplay() {
    if (!timerDisplayEl) return;
    const minutes = Math.floor(timerRemaining / 60).toString().padStart(2, "0");
    const seconds = (timerRemaining % 60).toString().padStart(2, "0");
    timerDisplayEl.textContent = `${minutes}:${seconds}`;
  }

  function startFocusTimer() {
    if (focusSessionActive) return; // prevent duplicate
    focusSessionActive = true;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timerRemaining > 0) {
        timerRemaining--;
        updateFocusTimerDisplay();
      } else {
        // finished
        clearInterval(timerInterval);
        focusSessionActive = false;
        playSound("bell.mp3");
        recordFocusSession(settings.timerLength);
        showQuote();
        toast("Focus session complete!");
        // reset timer to default
        timerRemaining = settings.timerLength;
        updateFocusTimerDisplay();
        refreshCharts();
      }
    }, 1000);
  }

  function pauseFocusTimer() {
    if (!focusSessionActive) return;
    clearInterval(timerInterval);
    focusSessionActive = false;
    toast("Timer paused");
  }

  function resetFocusTimer() {
    clearInterval(timerInterval);
    focusSessionActive = false;
    timerRemaining = settings.timerLength;
    updateFocusTimerDisplay();
    toast("Timer reset");
  }

  function setTimerLengthFromUI(seconds) {
    const intSec = parseInt(seconds, 10) || settings.timerLength;
    settings.timerLength = intSec;
    timerRemaining = settings.timerLength;
    saveSettings();
    updateFocusTimerDisplay();
    toast("Session length updated");
  }

  // record focus session in history and stats
  function recordFocusSession(secondsFocused) {
    // add to stats
    stats.totalFocusMinutes = (stats.totalFocusMinutes || 0) + Math.round(secondsFocused / 60);
    // track streak (if a session done today)
    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastStudyDate === today) {
      // already counted for today
    } else {
      // increment streak if date was yesterday, else reset
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (stats.lastStudyDate === yesterday) {
        stats.currentStreak = (stats.currentStreak || 0) + 1;
      } else {
        stats.currentStreak = 1;
      }
      stats.lastStudyDate = today;
    }
    saveStats();
    // Focus history array (simple last 20 sessions)
    const history = loadFocusHistory();
    history.push({ minutes: Math.round(secondsFocused / 60), timestamp: new Date().toISOString() });
    if (history.length > 50) history.splice(0, history.length - 50);
    saveFocusHistory(history);
    updateDashboard();
    checkAchievements();
  }

  function playSound(name) {
    if (!audioPlayer) return;
    audioPlayer.src = `sounds/${name}`;
    audioPlayer.play().catch(() => {
      // ignore playback errors
    });
  }

  // ------------------------
  // Notes Panel functions
  // ------------------------
  function loadNotesToUI() {
    if (!notesEl) return;
    notesEl.value = localStorage.getItem(STORAGE_KEYS.NOTES) || "";
  }

  // ------------------------
  // Quotes
  // ------------------------
  const quotes = [
    "Stay focused, stay humble.",
    "Deep work is the key to mastery.",
    "Small progress is still progress.",
    "Discipline beats motivation.",
    "One pomodoro at a time.",
    "Your future self will thank you.",
    "Focus is a muscle — train it daily."
  ];
  function showQuote() {
    if (!quoteEl) return;
    const r = Math.floor(Math.random() * quotes.length);
    quoteEl.textContent = `"${quotes[r]}"`;
  }

  // ------------------------
  // Charts (Chart.js)
  // ------------------------
  function initializeCharts() {
    // Task doughnut: completed vs remaining
    const taskCtx = getCanvasContext("taskChart");
    if (taskCtx) {
      const completed = tasks.filter(t => t.completed).length;
      const remaining = Math.max(0, tasks.length - completed);
      taskDoughnutChart = new Chart(taskCtx, {
        type: "doughnut",
        data: {
          labels: ["Completed", "Remaining"],
          datasets: [{
            data: [completed, remaining],
            backgroundColor: ["#4caf50", "#e0e0e0"]
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom" }
          }
        }
      });
    }

    // Weekly focus bar (from focus history)
    const weeklyCtx = getCanvasContext("weeklyChart");
    if (weeklyCtx) {
      const weeklyData = buildWeeklyFocusData();
      weeklyBarChart = new Chart(weeklyCtx, {
        type: "bar",
        data: {
          labels: weeklyData.labels,
          datasets: [{
            label: "Minutes Focused (last 7 days)",
            data: weeklyData.data,
            backgroundColor: "#90caf9"
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }

    // Focus session history on focus page (small line)
    const historyCtx = getCanvasContext("chart"); // the canvas in focus section
    if (historyCtx) {
      const history = loadFocusHistory().slice(-8);
      focusHistoryChart = new Chart(historyCtx, {
        type: "line",
        data: {
          labels: history.map(h => new Date(h.timestamp).toLocaleDateString()),
          datasets: [{
            label: "Focus (min)",
            data: history.map(h => h.minutes),
            fill: true,
            tension: 0.3
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }
  }

  function buildWeeklyFocusData() {
    const history = loadFocusHistory();
    // buckets for last 7 days
    const days = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    const data = days.map(day => {
      return history.filter(h => h.timestamp.slice(0, 10) === day).reduce((s, it) => s + (it.minutes || 0), 0);
    });
    return { labels, data };
  }

  function refreshCharts() {
    // update doughnut
    if (taskDoughnutChart) {
      const completed = tasks.filter(t => t.completed).length;
      const remaining = Math.max(0, tasks.length - completed);
      taskDoughnutChart.data.datasets[0].data = [completed, remaining];
      taskDoughnutChart.update();
    }
    // update weekly
    if (weeklyBarChart) {
      const weeklyData = buildWeeklyFocusData();
      weeklyBarChart.data.labels = weeklyData.labels;
      weeklyBarChart.data.datasets[0].data = weeklyData.data;
      weeklyBarChart.update();
    }
    // update focus history
    if (focusHistoryChart) {
      const history = loadFocusHistory().slice(-8);
      focusHistoryChart.data.labels = history.map(h => new Date(h.timestamp).toLocaleDateString());
      focusHistoryChart.data.datasets[0].data = history.map(h => h.minutes);
      focusHistoryChart.update();
    }
  }

  // ------------------------
  // Settings functions (exposed)
  // ------------------------
  window.changeFontSize = (size) => {
    settings.fontSize = size;
    applySettings();
    saveSettings();
    toast("Font size updated");
  };

  window.changeSort = (mode) => {
    settings.sortMode = mode;
    saveSettings();
    renderTasks();
    refreshCharts();
  };

  window.toggleDeadline = (show) => {
    settings.showDeadlines = !!show;
    saveSettings();
    renderTasks();
  };

  window.togglePriority = (show) => {
    settings.showPriorities = !!show;
    saveSettings();
    renderTasks();
  };

  window.setTimerLength = (sec) => {
    setTimerLengthFromUI(sec);
  };

  window.resetTasks = () => {
    if (!confirm("Delete all tasks? This cannot be undone.")) return;
    tasks = [];
    saveTasks();
    renderTasks();
    updateDashboard();
    toast("All tasks removed");
  };

  window.resetStats = () => {
    if (!confirm("Reset all stats?")) return;
    stats = { currentStreak: 0, lastStudyDate: null, totalFocusMinutes: 0 };
    saveStats();
    toast("Stats reset");
    updateDashboard();
  };

  window.toggleCompact = (c) => {
    settings.compact = !!c;
    saveSettings();
    renderTasks();
  };

  function applySettings() {
    document.body.style.fontSize =
      settings.fontSize === "small" ? "14px" :
      settings.fontSize === "large" ? "18px" : "16px";
    // update timerDuration
    timerRemaining = settings.timerLength;
    // store settings
    saveSettings();
  }

  // ------------------------
  // Misc helpers for external buttons
  // ------------------------
  // Expose some functions for inline onclick usage in HTML where needed
  window.addTask = handleAddTaskFromForm;
  window.toggleTask = (iOrId) => {
    // support both index in tasks array and id
    if (typeof iOrId === "number") {
      // if it's an id (large number) find by id else treat as index
      if (tasks[iOrId] && tasks[iOrId].id) {
        // index style
        toggleTask(tasks[iOrId].id);
      } else {
        // id style
        toggleTask(iOrId);
      }
    } else {
      toggleTask(iOrId);
    }
  };
  window.deleteTask = (iOrId) => {
    if (typeof iOrId === "number") {
      // find id by index if exists
      if (tasks[iOrId] && tasks[iOrId].id) {
        deleteTask(tasks[iOrId].id);
      } else {
        deleteTask(iOrId);
      }
    } else {
      deleteTask(iOrId);
    }
  };

  // ------------------------
  // Initialization utilities
  // ------------------------
  function initializeDummyIfEmpty() {
    // optional helper to populate starter tasks for first time use
    if (!tasks || tasks.length === 0) {
      tasks = [
        { id: Date.now() - 100000, text: "Welcome: Create your first task", completed: false, createdAt: new Date().toISOString(), deadline: null, priority: "medium", category: "welcome", notes: "Use the Study Hub to add tasks", tags: [] },
        { id: Date.now() - 90000, text: "Try the Focus Timer", completed: false, createdAt: new Date().toISOString(), deadline: null, priority: "low", category: "focus", notes: "", tags: [] }
      ];
      saveTasks();
    }
  }
  initializeDummyIfEmpty();

  // run initial render
  renderTasks();
  updateDashboard();
  updateProgressRing();
  initializeCharts();

  // expose small debug functions (optional)
  window.ssp = {
    tasks, settings, stats, achievements,
    reRender: () => { renderTasks(); updateDashboard(); refreshCharts(); updateAchievementsUI(); }
  };

  // Ensure settings select for timer length is wired
  qa("select").forEach(s => {
    if (s.onchange == null) {
      // Some selects in HTML used inline onchange already; if not, attach
      if (s.id === "taskPriority") return;
      if (s.id === "taskCategory") return;
    }
  });

  // End of IIFE
})();
