(() => {
  "use strict";

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */
  const STORAGE_KEY = "taskLedger.tasks.v1";
  const COUNT_KEY   = "taskLedger.everLogged.v1";
  const THEME_KEY   = "taskLedger.theme.v1";

  let tasks = loadTasks();
  let everLogged = Number(localStorage.getItem(COUNT_KEY) || tasks.length);

  let state = {
    filter: "all",       // all | active | done
    category: "all",
    sort: "created",     // created | due | priority | alpha
    search: ""
  };

  /* ---------------------------------------------------------
     DOM REFS
  --------------------------------------------------------- */
  const taskList      = document.getElementById("taskList");
  const emptyState     = document.getElementById("emptyState");
  const emptyTitle     = document.getElementById("emptyTitle");
  const emptySub       = document.getElementById("emptySub");
  const taskTemplate   = document.getElementById("taskTemplate");

  const taskForm       = document.getElementById("taskForm");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskDueInput   = document.getElementById("taskDue");
  const taskPriorityInput = document.getElementById("taskPriority");
  const taskCategoryInput = document.getElementById("taskCategory");
  const categoryOptions = document.getElementById("categoryOptions");

  const filterTabs     = document.getElementById("filterTabs");
  const categoryFilter = document.getElementById("categoryFilter");
  const sortSelect      = document.getElementById("sortSelect");
  const searchInput     = document.getElementById("searchInput");

  const statTotal = document.getElementById("statTotal");
  const statActive = document.getElementById("statActive");
  const statDone = document.getElementById("statDone");
  const statOverdue = document.getElementById("statOverdue");

  const gaugeFill = document.getElementById("gaugeFill");
  const gaugePct  = document.getElementById("gaugePct");
  const logNumber = document.getElementById("logNumber");
  const todayLabel = document.getElementById("todayLabel");

  const themeToggle = document.getElementById("themeToggle");
  const themeLabel  = document.getElementById("themeLabel");

  const GAUGE_CIRCUMFERENCE = 326.7;

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  function init() {
    applyStoredTheme();
    todayLabel.textContent = formatLongDate(new Date());
    logNumber.textContent = String(everLogged + 1).padStart(3, "0");

    taskForm.addEventListener("submit", handleAddTask);
    filterTabs.addEventListener("click", handleFilterClick);
    categoryFilter.addEventListener("change", () => { state.category = categoryFilter.value; render(); });
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; render(); });
    searchInput.addEventListener("input", debounce(() => { state.search = searchInput.value.trim().toLowerCase(); render(); }, 120));
    themeToggle.addEventListener("click", toggleTheme);

    render();
  }

  /* ---------------------------------------------------------
     STORAGE
  --------------------------------------------------------- */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  /* ---------------------------------------------------------
     ADD / TOGGLE / DELETE
  --------------------------------------------------------- */
  function handleAddTask(e) {
    e.preventDefault();
    const title = taskTitleInput.value.trim();
    if (!title) return;

    const task = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      title,
      due: taskDueInput.value || null,
      priority: taskPriorityInput.value,
      category: taskCategoryInput.value.trim(),
      done: false,
      createdAt: Date.now()
    };

    tasks.unshift(task);
    everLogged += 1;
    localStorage.setItem(COUNT_KEY, String(everLogged));
    saveTasks();

    taskForm.reset();
    taskPriorityInput.value = "medium";
    taskTitleInput.focus();
    logNumber.textContent = String(everLogged + 1).padStart(3, "0");

    render();
  }

  function toggleDone(id) {
    const t = tasks.find(t => t.id === id);
    if (t) t.done = !t.done;
    saveTasks();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }

  /* ---------------------------------------------------------
     FILTER TABS
  --------------------------------------------------------- */
  function handleFilterClick(e) {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    [...filterTabs.children].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    render();
  }

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  function render() {
    updateCategoryOptions();

    let visible = tasks.slice();

    // filter: status
    if (state.filter === "active") visible = visible.filter(t => !t.done);
    if (state.filter === "done") visible = visible.filter(t => t.done);

    // filter: category
    if (state.category !== "all") {
      visible = visible.filter(t => (t.category || "Uncategorized") === state.category);
    }

    // filter: search
    if (state.search) {
      visible = visible.filter(t =>
        t.title.toLowerCase().includes(state.search) ||
        (t.category || "").toLowerCase().includes(state.search)
      );
    }

    // sort
    visible = sortTasks(visible, state.sort);

    // render list
    taskList.innerHTML = "";
    visible.forEach(t => taskList.appendChild(buildTaskNode(t)));

    // empty state
    const hasAnyTasks = tasks.length > 0;
    const hasVisible = visible.length > 0;
    emptyState.style.display = hasVisible ? "none" : "flex";
    taskList.style.display = hasVisible ? "flex" : "none";

    if (!hasVisible) {
      if (!hasAnyTasks) {
        emptyTitle.textContent = "The log is clean.";
        emptySub.textContent = "Add your first task above to open today's entry.";
      } else if (state.search) {
        emptyTitle.textContent = "No matches in the log.";
        emptySub.textContent = `Nothing found for "${searchInput.value.trim()}".`;
      } else if (state.filter === "done") {
        emptyTitle.textContent = "Nothing closed out yet.";
        emptySub.textContent = "Completed tasks will land here.";
      } else if (state.filter === "active") {
        emptyTitle.textContent = "All clear.";
        emptySub.textContent = "Every open task has been closed out.";
      } else {
        emptyTitle.textContent = "No entries in this category.";
        emptySub.textContent = "Try a different filter.";
      }
    }

    updateStats();
  }

  function sortTasks(list, mode) {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    switch (mode) {
      case "due":
        return list.sort((a, b) => {
          if (!a.due && !b.due) return 0;
          if (!a.due) return 1;
          if (!b.due) return -1;
          return new Date(a.due) - new Date(b.due);
        });
      case "priority":
        return list.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
      case "alpha":
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case "created":
      default:
        return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  function buildTaskNode(t) {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.priority = t.priority;
    node.classList.toggle("done", t.done);

    node.querySelector(".task-title").textContent = t.title;
    node.querySelector(".task-priority-flag").textContent = t.priority;

    const categoryEl = node.querySelector(".task-category");
    categoryEl.textContent = t.category || "";

    const dueEl = node.querySelector(".task-due");
    dueEl.textContent = "";
    dueEl.classList.remove("overdue", "due-today");
    if (t.due) {
      const { label, status } = describeDue(t.due, t.done);
      dueEl.textContent = label;
      if (status) dueEl.classList.add(status);
    }

    node.querySelector(".task-check").addEventListener("click", () => toggleDone(t.id));
    node.querySelector(".task-delete").addEventListener("click", () => deleteTask(t.id));

    return node;
  }

  function describeDue(dueStr, done) {
    const due = new Date(dueStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due - today) / 86400000);

    const label = due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

    if (done) return { label, status: null };
    if (diffDays < 0) return { label: `${label} · overdue`, status: "overdue" };
    if (diffDays === 0) return { label: `${label} · today`, status: "due-today" };
    if (diffDays === 1) return { label: `${label} · tomorrow`, status: null };
    return { label, status: null };
  }

  /* ---------------------------------------------------------
     STATS + GAUGE
  --------------------------------------------------------- */
  function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    const active = total - done;
    const overdue = tasks.filter(t => {
      if (t.done || !t.due) return false;
      const due = new Date(t.due + "T00:00:00");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return due < today;
    }).length;

    statTotal.textContent = total;
    statActive.textContent = active;
    statDone.textContent = done;
    statOverdue.textContent = overdue;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    gaugePct.textContent = `${pct}%`;
    const offset = GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE * pct) / 100;
    gaugeFill.style.strokeDashoffset = String(offset);
  }

  /* ---------------------------------------------------------
     CATEGORIES
  --------------------------------------------------------- */
  function updateCategoryOptions() {
    const cats = [...new Set(tasks.map(t => t.category).filter(Boolean))].sort();

    // datalist for the input field
    categoryOptions.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");

    // filter dropdown — preserve current selection if still valid
    const current = categoryFilter.value;
    categoryFilter.innerHTML = `<option value="all">All categories</option>` +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...categoryFilter.options].some(o => o.value === current)) {
      categoryFilter.value = current;
    } else {
      state.category = "all";
    }
  }

  /* ---------------------------------------------------------
     THEME
  --------------------------------------------------------- */
  function applyStoredTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    setTheme(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTheme(current === "light" ? "dark" : "light");
  }

  function setTheme(mode) {
    if (mode === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      themeLabel.textContent = "Day watch";
    } else {
      document.documentElement.removeAttribute("data-theme");
      themeLabel.textContent = "Night watch";
    }
    localStorage.setItem(THEME_KEY, mode);
  }

  /* ---------------------------------------------------------
     UTIL
  --------------------------------------------------------- */
  function formatLongDate(d) {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
