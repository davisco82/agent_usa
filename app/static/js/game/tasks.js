const DEFAULT_LAB_STORY_CHARACTER = {
  name: "Dr. Elias Rook",
  role: "Vedoucí biometrického programu",
  image_url: "/static/assets/figures/dr_rook.webp",
  alt: "Dr. Elias Rook",
};

export function createTasksService({ state, dom, time, agent, map, ui }) {
  const taskState = state.tasks;
  const storyState = state.story;
  const agentState = state.agent;

  const storyPanelState = {
    lab: {
      buttonEl: dom.labStoryLaunchBtn,
      defaultButtonLabel: "Brífink Dr. Rooka",
      get isVisible() {
        return ui.isLabPanelVisible();
      },
      overlayDismissed: false,
      activeDialog: null,
      activeKey: null,
    },
    market: {
      buttonEl: null,
      defaultButtonLabel: null,
      get isVisible() {
        return ui.isMarketPanelVisible();
      },
      overlayDismissed: false,
      activeDialog: null,
      activeKey: null,
    },
  };

  let activeStoryPanel = null;

  function getActiveTask() {
    if (!Array.isArray(taskState.list) || taskState.list.length === 0) {
      return null;
    }

    if (taskState.activeTaskId) {
      const found = taskState.list.find((task) => task.id === taskState.activeTaskId);
      if (found) {
        return found;
      }
    }

    return taskState.list[0];
  }

  function getTaskForDetail() {
    if (taskState.detailTaskOverride) {
      return taskState.detailTaskOverride;
    }
    return getActiveTask();
  }

  function setActiveTask(taskId) {
    if (!taskId || taskId === taskState.activeTaskId) return;
    const exists = taskState.list.some((task) => task.id === taskId);
    if (!exists) return;
    taskState.detailTaskOverride = null;
    taskState.activeTaskId = taskId;
    renderTaskCard();
    renderTaskDetailPanel();
  }

  function normalizeTaskPayload(task) {
    if (!task || typeof task !== "object") return null;
    const normalized = { ...task };
    const objectives = Array.isArray(task.objectives) ? task.objectives : [];
    normalized.objectives = objectives;
    const completed = Array.isArray(task.completed_objectives)
      ? task.completed_objectives.slice(0, objectives.length)
      : Array(objectives.length).fill(false);
    normalized.completed_objectives = completed;
    const triggers = Array.isArray(task.objective_triggers) ? task.objective_triggers : [];
    normalized.objective_triggers = triggers;
    if (typeof normalized.progress !== "number") {
      const done = completed.filter(Boolean).length;
      normalized.progress = objectives.length ? done / objectives.length : 0;
    }
    return normalized;
  }

  function upsertTask(updatedTask) {
    const normalized = normalizeTaskPayload(updatedTask);
    if (!normalized || !normalized.id) return;
    const idx = taskState.list.findIndex((task) => task.id === normalized.id);
    if (idx >= 0) {
      taskState.list[idx] = { ...taskState.list[idx], ...normalized };
    } else {
      taskState.list.push(normalized);
    }
  }

  function buildDetailOverride(task) {
    const normalized = normalizeTaskPayload(task);
    if (!normalized) return null;
    if (normalized.status === "completed" || normalized.status === "rewarded") {
      normalized.completed_objectives = Array(normalized.objectives.length).fill(true);
      normalized.progress = 1;
    }
    return normalized;
  }

  function playTaskCompleteSound() {
    if (!dom.taskCompleteSound) return;
    try {
      dom.taskCompleteSound.currentTime = 0;
      dom.taskCompleteSound.play().catch(() => {});
    } catch (err) {
      console.warn("Task completion sound failed:", err);
    }
  }

  function exitTaskCard() {
    if (!dom.taskCardEl) return;
    if (taskState.cardIntroTimeout) {
      clearTimeout(taskState.cardIntroTimeout);
      taskState.cardIntroTimeout = null;
    }
    if (taskState.exitCleanupTimeout) {
      clearTimeout(taskState.exitCleanupTimeout);
    }
    dom.taskCardEl.classList.remove("task-card--intro-animating");
    dom.taskCardEl.classList.add("task-card--exit-right");
    taskState.exitCleanupTimeout = setTimeout(() => {
      taskState.exitCleanupTimeout = null;
      dom.taskCardEl.classList.remove("task-card--exit-right");
      dom.taskCardEl.classList.add("task-card--intro-hidden");
    }, 600);
  }

  async function claimTaskReward(taskId) {
    if (!taskId || taskState.claimInFlight) return;
    taskState.claimInFlight = true;
    if (dom.taskClaimRewardBtn) {
      dom.taskClaimRewardBtn.disabled = true;
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}/claim`, { method: "POST" });
      if (!res.ok) throw new Error("Reward claim failed");
      const data = await res.json();
      if (data?.task) {
        upsertTask(data.task);
      }
      showTaskDetailPanel(false);
      taskState.detailTaskOverride = null;
      exitTaskCard();
      const xpAwarded = data?.xp_awarded || 0;
      setTimeout(async () => {
        if (xpAwarded) {
          agent.grantTravelXp(xpAwarded);
        }
        await loadAgentTasks();
        if (typeof agent?.loadAgentAndLevels === "function") {
          await agent.loadAgentAndLevels();
        }
      }, 650);
    } catch (err) {
      console.error("Reward claim failed:", err);
    } finally {
      taskState.claimInFlight = false;
      if (dom.taskClaimRewardBtn) {
        dom.taskClaimRewardBtn.disabled = false;
      }
    }
  }

  function completeTaskObjective(taskId, objectiveIndex) {
    if (!taskId || objectiveIndex === undefined || objectiveIndex === null) return null;
    const key = `${taskId}:${objectiveIndex}`;
    if (taskState.objectiveCompletionPromises.has(key)) {
      return taskState.objectiveCompletionPromises.get(key);
    }

    const promise = (async () => {
      taskState.pendingObjectiveRequests.add(key);
      try {
        const res = await fetch(`/api/tasks/${taskId}/objectives/${objectiveIndex}/complete`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Objective completion failed");
        const data = await res.json();
        let shouldReloadTasks = false;
        if (data?.task) {
          upsertTask(data.task);
          if (data.task.status === "completed") {
            taskState.detailTaskOverride = buildDetailOverride(data.task);
            showTaskDetailPanel(true);
            renderTaskDetailPanel();
            playTaskCompleteSound();
          }
          if (data.task.status === "completed" || data.task.status === "rewarded") {
            time.persistGameMinutes();
          }
        }
        if (data?.xp_awarded) {
          agent.enqueueXpReward(data.xp_awarded);
          shouldReloadTasks = true;
        }
    if (shouldReloadTasks) {
      await loadAgentTasks();
    } else {
      renderTaskCard();
      renderTaskDetailPanel();
    }
    if (typeof agent?.loadAgentAndLevels === "function") {
      await agent.loadAgentAndLevels();
    }
        if (typeof agent?.loadAgentAndLevels === "function") {
          await agent.loadAgentAndLevels();
        }
      } catch (err) {
        console.error("Objective completion failed:", err);
      } finally {
        taskState.pendingObjectiveRequests.delete(key);
        taskState.objectiveCompletionPromises.delete(key);
      }
    })();

    taskState.objectiveCompletionPromises.set(key, promise);
    return promise;
  }

  function triggerObjectiveCompletion(taskId, objectiveIndex) {
    return completeTaskObjective(taskId, objectiveIndex);
  }

  function notifyTaskLocationChange() {
    const city = ui.getCurrentCitySnapshot();
    if (!city) return;
    evaluateVisitObjectives(city);
  }

  function normalizeCityName(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function evaluateVisitObjectives(city) {
    if (!city || !city.name) return;
    const cityName = normalizeCityName(city.name);
    taskState.list.forEach((task) => {
      const triggers = task.objective_triggers || [];
      const completed = task.completed_objectives || [];
      triggers.forEach((trigger, index) => {
        if (completed[index]) return;
        if (trigger?.type === "visit_city") {
          const triggerName = normalizeCityName(trigger.city_name);
          if (triggerName && triggerName === cityName) {
            triggerObjectiveCompletion(task.id, index);
          }
        }
      });
    });
  }

  function scheduleTaskCardIntro(taskId) {
    if (!dom.taskCardEl || !taskId) return;
    if (taskState.cardIntroTimeout) {
      clearTimeout(taskState.cardIntroTimeout);
    }
    taskState.pendingCardIntroId = taskId;
    dom.taskCardEl.classList.add("task-card--intro-hidden");
    dom.taskCardEl.classList.remove("task-card--intro-animating");
    taskState.cardIntroTimeout = setTimeout(() => {
      if (taskState.pendingCardIntroId !== taskId) {
        return;
      }
      taskState.revealedTaskIds.add(taskId);
      dom.taskCardEl.classList.remove("task-card--intro-hidden");
      dom.taskCardEl.classList.add("task-card--intro-animating");
      taskState.cardIntroTimeout = null;
    }, 2000);
  }

  function cancelTaskCardIntro() {
    if (!dom.taskCardEl) return;
    taskState.pendingCardIntroId = null;
    if (taskState.cardIntroTimeout) {
      clearTimeout(taskState.cardIntroTimeout);
      taskState.cardIntroTimeout = null;
    }
    dom.taskCardEl.classList.remove("task-card--intro-hidden");
    dom.taskCardEl.classList.remove("task-card--intro-animating");
  }

  function renderTaskCard() {
    if (!dom.taskCardEl || !dom.currentTaskTitleEl || !dom.currentTaskSummaryEl) return;
    const task = getActiveTask();
    if (!task) {
      if (taskState.revealedTaskIds.size > 0) {
        cancelTaskCardIntro();
      }
      dom.currentTaskTitleEl.textContent = "Žádné zadání";
      dom.currentTaskSummaryEl.textContent = "Velitelství zatím neposlalo žádnou operaci. Sleduj kanál HQ.";
      if (dom.currentTaskLocationEl) dom.currentTaskLocationEl.textContent = "-";
      if (dom.currentTaskRewardEl) dom.currentTaskRewardEl.textContent = "0 XP";
      dom.currentTaskPriorityBadgeEl?.classList.add("hidden");
      if (dom.currentTaskProgressBarEl) dom.currentTaskProgressBarEl.style.width = "0%";
      if (dom.currentTaskProgressLabelEl) dom.currentTaskProgressLabelEl.textContent = "0%";
      dom.taskCardEl.classList.add("opacity-60");
      dom.taskCardEl.setAttribute("aria-disabled", "true");
      return;
    }

    const shouldHoldIntro =
      !!taskState.pendingCelebration ||
      (dom.taskCardEl && (dom.taskCardEl.classList.contains("task-card--celebrating") || dom.taskCardEl.classList.contains("task-card--exit-right")));
    if (!shouldHoldIntro) {
      const isIntroPending = task && taskState.pendingCardIntroId === task.id;
      const hasBeenRevealed = task && taskState.revealedTaskIds.has(task.id);
      if (task && !hasBeenRevealed && !isIntroPending) {
        scheduleTaskCardIntro(task.id);
      } else if (!isIntroPending) {
        cancelTaskCardIntro();
      }
    }

    dom.taskCardEl.classList.remove("opacity-60");
    dom.taskCardEl.removeAttribute("aria-disabled");
    dom.currentTaskTitleEl.textContent = task.title;
    dom.currentTaskSummaryEl.textContent = task.summary;
    if (dom.currentTaskLocationEl) dom.currentTaskLocationEl.textContent = task.location || "-";
    if (dom.currentTaskRewardEl) {
      dom.currentTaskRewardEl.textContent = task.reward || "XP";
    }
    if (dom.currentTaskPriorityBadgeEl) {
      if ((task.priority || "").toLowerCase() === "vysoká") {
        dom.currentTaskPriorityBadgeEl.classList.remove("hidden");
      } else {
        dom.currentTaskPriorityBadgeEl.classList.add("hidden");
      }
    }
    const progressPercent = Math.max(0, Math.min(100, Math.round((task.progress || 0) * 100)));
    if (dom.currentTaskProgressBarEl) dom.currentTaskProgressBarEl.style.width = `${progressPercent}%`;
    if (dom.currentTaskProgressLabelEl) dom.currentTaskProgressLabelEl.textContent = `${progressPercent}%`;
  }

  function hideTaskCelebration(flushXp = false) {
    if (taskState.celebrationTimeout) {
      clearTimeout(taskState.celebrationTimeout);
      taskState.celebrationTimeout = null;
    }
    if (taskState.exitCleanupTimeout) {
      clearTimeout(taskState.exitCleanupTimeout);
      taskState.exitCleanupTimeout = null;
    }
    if (dom.taskCardEl) {
      dom.taskCardEl.classList.remove("task-card--celebrating");
      dom.taskCardEl.classList.remove("task-card--exit-right");
    }
    if (flushXp) {
      agent.flushPendingXpRewards();
    }
    renderTaskCard();
  }

  function scheduleTaskCardExit() {
    if (!dom.taskCardEl) return;
    dom.taskCardEl.classList.add("task-card--exit-right");
    if (taskState.exitCleanupTimeout) {
      clearTimeout(taskState.exitCleanupTimeout);
    }
    taskState.exitCleanupTimeout = setTimeout(() => {
      taskState.exitCleanupTimeout = null;
      hideTaskCelebration(true);
    }, 600);
  }

  function showTaskCompletionCelebration(payload = {}) {
    if (!dom.taskCardEl) return;
    const { completedTitle, xpAwarded, rewardText } = payload;
    const rewardLabel =
      rewardText || (typeof xpAwarded === "number" && xpAwarded > 0 ? `+${xpAwarded} XP` : null);

    if (dom.currentTaskTitleEl) {
      dom.currentTaskTitleEl.textContent = completedTitle || dom.currentTaskTitleEl.textContent || "Úkol dokončen";
    }
    if (dom.currentTaskSummaryEl) {
      dom.currentTaskSummaryEl.textContent = rewardLabel ? `Odměna: ${rewardLabel}` : "Úkol dokončen.";
    }
    if (dom.currentTaskRewardEl && rewardLabel) {
      dom.currentTaskRewardEl.textContent = rewardLabel;
    }
    if (dom.currentTaskProgressLabelEl) {
      dom.currentTaskProgressLabelEl.textContent = "100%";
    }
    if (dom.currentTaskProgressBarEl) {
      dom.currentTaskProgressBarEl.style.width = "100%";
    }

    if (dom.taskCompleteSound) {
      try {
        dom.taskCompleteSound.currentTime = 0;
        dom.taskCompleteSound.play().catch(() => {});
      } catch (err) {
        console.warn("Task completion sound failed:", err);
      }
    }

    dom.taskCardEl.classList.remove("task-card--exit-right");
    dom.taskCardEl.classList.add("task-card--celebrating");

    if (taskState.celebrationTimeout) {
      clearTimeout(taskState.celebrationTimeout);
    }
    taskState.celebrationTimeout = setTimeout(() => {
      taskState.celebrationTimeout = null;
      scheduleTaskCardExit();
    }, 2000);
  }

  function maybeShowPendingTaskCelebration() {
    if (!taskState.pendingCelebration) return;
    const active = getActiveTask();
    showTaskCompletionCelebration({
      completedTitle: taskState.pendingCelebration.completedTitle,
      xpAwarded: taskState.pendingCelebration.xpAwarded,
      rewardText: taskState.pendingCelebration.rewardText,
      nextTitle: active ? active.title : null,
    });
    taskState.pendingCelebration = null;
  }

  function renderTaskList() {
    if (!dom.taskListContainerEl) return;
    if (!Array.isArray(taskState.list) || taskState.list.length === 0) {
      dom.taskListContainerEl.innerHTML = `<p class="text-sm text-slate-300">Velitelství zatím nepřiřadilo žádné operace.</p>`;
      return;
    }

    const active = getActiveTask();
    dom.taskListContainerEl.innerHTML = taskState.list
      .map((task) => {
        const isActive = active && task.id === active.id;
        const border = isActive
          ? "border-violet-400/70 bg-violet-500/10 shadow-[0_10px_25px_rgba(99,102,241,0.25)]"
          : "border-white/10 bg-white/5 hover:border-violet-300/40";
        return `
          <button
            type="button"
            data-task-id="${task.id}"
            class="w-full text-left rounded-2xl border ${border} px-4 py-3 transition focus:outline-none focus:ring-2 focus:ring-violet-400/70"
          >
            <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">${task.priority || "Standard"} • ${task.eta || "—"}</p>
            <p class="text-sm font-semibold text-slate-100">${task.title}</p>
            <p class="text-xs text-slate-300">${task.location}</p>
          </button>
        `;
      })
      .join("");

    dom.taskListContainerEl.querySelectorAll("[data-task-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-task-id");
        setActiveTask(id);
      });
    });
  }

  function renderTaskDetailPanel() {
    renderTaskList();
    renderTaskDetail();
  }

  function renderTaskDetail() {
    if (
      !dom.taskDetailPanelEl ||
      !dom.taskDetailTitleEl ||
      !dom.taskDetailSubtitleEl ||
      !dom.taskDetailLocationEl ||
      !dom.taskDetailDescEl ||
      !dom.taskObjectiveListEl ||
      !dom.taskRewardLabelEl
    ) {
      return;
    }

    const task = getTaskForDetail();
    if (!task) {
      dom.taskDetailTitleEl.textContent = "Žádný aktivní úkol";
      dom.taskDetailSubtitleEl.textContent = "Jakmile HQ přiřadí operaci, uvidíš ji tady.";
      dom.taskDetailLocationEl.textContent = "---";
      dom.taskDetailDescEl.textContent = "Čekáme na instrukce velitelství.";
      dom.taskObjectiveListEl.innerHTML = `<li class="text-slate-400">Žádné kroky nejsou zadány.</li>`;
      dom.taskRewardLabelEl.textContent = "-";
      if (dom.taskStatusBadgeEl) {
        dom.taskStatusBadgeEl.classList.add("hidden");
        dom.taskStatusBadgeEl.textContent = "-";
        dom.taskStatusBadgeEl.removeAttribute("data-status");
      }
      if (dom.taskCompletionBannerEl) {
        dom.taskCompletionBannerEl.classList.add("hidden");
      }
      if (dom.taskClaimRewardBtn) {
        dom.taskClaimRewardBtn.classList.add("hidden");
        dom.taskClaimRewardBtn.disabled = true;
      }
      if (dom.taskDetailPanelEl) {
        dom.taskDetailPanelEl.classList.remove("task-detail--completed");
      }
      return;
    }

    dom.taskDetailTitleEl.textContent = task.title;
    dom.taskDetailSubtitleEl.textContent = task.summary;
    dom.taskDetailLocationEl.textContent = task.location || "---";
    if (dom.taskDetailPriorityEl) dom.taskDetailPriorityEl.textContent = task.priority || "Standard";
    if (dom.taskDetailEtaEl) dom.taskDetailEtaEl.textContent = task.eta || "—";
    dom.taskDetailDescEl.textContent = task.description || "-";
    const objectives = task.objectives || [];
    const completed = task.completed_objectives || [];
    const triggers = task.objective_triggers || [];
    dom.taskObjectiveListEl.innerHTML = objectives
      .map((step, index) => {
        const done = !!completed[index];
        const trigger = triggers[index] || {};
        const icon = done ? "✔" : "◆";
        const iconColor = done ? "text-emerald-300" : "text-violet-300";
        const textClasses = done ? "text-slate-400 line-through" : "text-slate-100";
        const manualButton =
          !done && trigger?.type === "manual"
            ? `<button type="button" class="ml-auto text-xs text-violet-200 underline hover:text-white" data-complete-objective="true" data-task-id="${task.id}" data-objective-index="${index}">Označit splněno</button>`
            : "";
        return `
          <li class="flex items-start gap-2">
            <span class="${iconColor} mt-[3px] text-xs">${icon}</span>
            <div class="flex flex-col gap-1 sm:flex-row sm:items-center w-full">
              <span class="${textClasses}">${step}</span>
              ${manualButton}
            </div>
          </li>
        `;
      })
      .join("");
    if (!objectives.length) {
      dom.taskObjectiveListEl.innerHTML = `<li class="text-slate-400">Žádné kroky nejsou zadány.</li>`;
    }
    dom.taskObjectiveListEl.querySelectorAll("[data-complete-objective]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-objective-index"));
        if (Number.isNaN(idx)) return;
        completeTaskObjective(task.id, idx);
      });
    });
    dom.taskRewardLabelEl.textContent = task.reward || "-";
    if (dom.taskStatusBadgeEl) {
      const status = (task.status || "").toLowerCase();
      const labels = {
        active: "Probíhá",
        completed: "Úkol splněn",
        rewarded: "Odměna vyzvednuta",
      };
      dom.taskStatusBadgeEl.textContent = labels[status] || "Neznámý stav";
      dom.taskStatusBadgeEl.classList.remove("hidden");
      if (status) {
        dom.taskStatusBadgeEl.setAttribute("data-status", status);
      } else {
        dom.taskStatusBadgeEl.removeAttribute("data-status");
      }
    }
    const isCompleted = task.status === "completed" || task.status === "rewarded";
    if (dom.taskCompletionBannerEl) {
      dom.taskCompletionBannerEl.classList.toggle("hidden", !isCompleted);
      dom.taskCompletionBannerEl.classList.toggle("task-completion-banner--visible", isCompleted);
      const bannerText = task.status === "rewarded" ? "Odměna převzata." : "Odměna je připravena k vyzvednutí.";
      const body = dom.taskCompletionBannerEl.querySelector(".task-completion-banner__body");
      if (body) {
        body.textContent = bannerText;
      }
    }
    if (dom.taskClaimRewardBtn) {
      const canClaim = task.status === "completed" && !task.reward_claimed;
      dom.taskClaimRewardBtn.classList.toggle("hidden", !canClaim);
      dom.taskClaimRewardBtn.disabled = !canClaim || taskState.claimInFlight;
    }
    if (dom.taskDetailPanelEl) {
      dom.taskDetailPanelEl.classList.toggle("task-detail--completed", isCompleted);
    }
  }

  function showTaskDetailPanel(show) {
    if (!dom.taskDetailPanelEl) return;
    const shouldShow = !!show;
    dom.taskDetailPanelEl.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) {
      taskState.detailTaskOverride = null;
    }
    if (shouldShow) {
      if (state.ui.activeFooterButton) {
        ui.setActiveFooterButton(null);
      }
      ui.hideAllPanelsExcept("tasks");
      if (dom.taskListContainerEl && !dom.taskListContainerEl.children.length) {
        renderTaskDetailPanel();
      }
    }
  }

  function hideStoryNotice() {
    if (dom.labStoryNoticeEl) {
      dom.labStoryNoticeEl.classList.add("hidden");
      dom.labStoryNoticeEl.setAttribute("aria-hidden", "true");
    }
    storyState.confirmHandler = null;
    if (dom.labStoryConfirmEl) {
      dom.labStoryConfirmEl.disabled = false;
    }
    activeStoryPanel = null;
  }

  function showStoryNotice(options = {}) {
    if (!dom.labStoryNoticeEl) return;
    const { title, body, confirmLabel = "Pokračovat", onConfirm, character } = options;
    if (dom.labStoryTitleEl) {
      dom.labStoryTitleEl.textContent = title || "Laboratorní briefing";
    }
    if (dom.labStoryBodyEl) {
      dom.labStoryBodyEl.textContent =
        body ||
        "Dr. Rook sdílí aktuální data o mlze. Potvrď, že pokračujete společně v další fázi mise.";
    }
    if (dom.labStoryConfirmEl) {
      dom.labStoryConfirmEl.textContent = confirmLabel;
    }
    const hero = {
      ...DEFAULT_LAB_STORY_CHARACTER,
      ...(character || {}),
    };
    if (dom.labStoryHeroNameEl) {
      dom.labStoryHeroNameEl.textContent = hero.name || DEFAULT_LAB_STORY_CHARACTER.name;
    }
    if (dom.labStoryHeroRoleEl) {
      const roleText = hero.role || "";
      if (roleText) {
        dom.labStoryHeroRoleEl.textContent = roleText;
        dom.labStoryHeroRoleEl.classList.remove("hidden");
      } else {
        dom.labStoryHeroRoleEl.textContent = "";
        dom.labStoryHeroRoleEl.classList.add("hidden");
      }
    }
    if (dom.labStoryHeroImgEl) {
      dom.labStoryHeroImgEl.src = hero.image_url || DEFAULT_LAB_STORY_CHARACTER.image_url;
      dom.labStoryHeroImgEl.alt = hero.alt || hero.name || "Postava";
    }
    storyState.confirmHandler = typeof onConfirm === "function" ? onConfirm : null;
    dom.labStoryNoticeEl.classList.remove("hidden");
    dom.labStoryNoticeEl.setAttribute("aria-hidden", "false");
  }

  function getStoryDialogKey(dialog) {
    if (!dialog) {
      return null;
    }
    if (dialog.cache_key) {
      return dialog.cache_key;
    }
    if (dialog.task_id) {
      return `${dialog.task_id}:${dialog.objective_index ?? 0}`;
    }
    return dialog.title || "lab-dialog";
  }

  function buildStoryDialogOptions(dialog) {
    if (!dialog) return null;
    return {
      title: dialog.title,
      body: dialog.body,
      confirmLabel: dialog.confirm_label || "Pokračovat",
      character: dialog.character || null,
      onConfirm: () => handleStoryDialogConfirm(dialog),
    };
  }

  function maybeShowStoryOverlay(panel) {
    const state = storyPanelState[panel];
    if (!state) return;
    const dialog = state.activeDialog;
    if (!dialog) {
      if (activeStoryPanel === panel) {
        hideStoryNotice();
      }
      return;
    }
    if (!state.isVisible || state.overlayDismissed) {
      if (activeStoryPanel === panel) {
        hideStoryNotice();
      }
      return;
    }
    const options = buildStoryDialogOptions(dialog);
    if (options) {
      activeStoryPanel = panel;
      showStoryNotice(options);
    }
  }

  function getStoryDialogForPanel(panel) {
    return storyState.dialogs.find((dialog) => dialog.panel === panel);
  }

  async function loadStoryDialogs(force = false) {
    if (storyState.loading) return storyState.promise;
    if (!force && storyState.dialogs.length > 0) {
      renderStoryDialogs();
      return Promise.resolve();
    }
    storyState.loading = true;
    storyState.promise = (async () => {
      try {
        const res = await fetch("/api/tasks/story-dialogs");
        if (!res.ok) throw new Error("Failed to fetch story dialogs");
        const data = await res.json();
        storyState.dialogs = Array.isArray(data?.dialogs) ? data.dialogs : [];
      } catch (err) {
        console.error("Story dialog load failed:", err);
        storyState.dialogs = [];
      } finally {
        storyState.loading = false;
        storyState.promise = null;
        renderStoryDialogs();
      }
    })();
    return storyState.promise;
  }

  function updateStoryDialogForPanel(panel) {
    const state = storyPanelState[panel];
    if (!state) return;
    const dialog = getStoryDialogForPanel(panel);
    const nextKey = getStoryDialogKey(dialog);
    if (nextKey !== state.activeKey) {
      state.overlayDismissed = false;
    }
    state.activeKey = nextKey;
    state.activeDialog = dialog || null;
    if (state.buttonEl) {
      const hasDialog = !!dialog;
      state.buttonEl.classList.toggle("hidden", !hasDialog);
      if (hasDialog) {
        state.buttonEl.textContent =
          dialog?.button_label || state.defaultButtonLabel || "Story dialog";
      }
    } else if (!dialog && activeStoryPanel === panel) {
      hideStoryNotice();
    }
    maybeShowStoryOverlay(panel);
  }

  function renderStoryDialogs() {
    updateStoryDialogForPanel("lab");
    updateStoryDialogForPanel("market");
  }

  async function handleStoryDialogConfirm(dialog) {
    if (!dialog || !dialog.task_id) {
      hideStoryNotice();
      return;
    }
    try {
      if (dom.labStoryConfirmEl) {
        dom.labStoryConfirmEl.disabled = true;
      }
      await completeTaskObjective(dialog.task_id, dialog.objective_index);
    } finally {
      if (dom.labStoryConfirmEl) {
        dom.labStoryConfirmEl.disabled = false;
      }
      hideStoryNotice();
      await loadStoryDialogs(true);
    }
  }

  async function loadAgentTasks() {
    let tasks = [];
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    } catch (err) {
      console.error("Task load failed, using empty list:", err);
    }

    taskState.list = tasks.map((task) => normalizeTaskPayload(task)).filter(Boolean);
    if (!taskState.list.length) {
      taskState.activeTaskId = null;
    } else {
      const currentTask = taskState.activeTaskId ? taskState.list.find((task) => task.id === taskState.activeTaskId) : null;
      const hasCurrentActive = currentTask && currentTask.status === "active";
      if (!hasCurrentActive) {
        const nextActive = taskState.list.find((task) => task.status === "active");
        if (nextActive) {
          taskState.activeTaskId = nextActive.id;
        } else if (!currentTask) {
          taskState.activeTaskId = taskState.list[0].id;
        }
      }
      if (taskState.activeTaskId && !taskState.list.some((task) => task.id === taskState.activeTaskId)) {
        taskState.activeTaskId = taskState.list[0].id;
      }
    }

    renderTaskCard();
    renderTaskDetailPanel();
    notifyTaskLocationChange();
    await loadStoryDialogs(true);
    maybeShowPendingTaskCelebration();
  }

  function initTaskEvents() {
    if (dom.labStoryConfirmEl) {
      dom.labStoryConfirmEl.addEventListener("click", (e) => {
        e.preventDefault();
        const handler = storyState.confirmHandler;
        if (typeof handler === "function") {
          handler();
        }
      });
    }

    if (dom.labStoryCloseEl) {
      dom.labStoryCloseEl.addEventListener("click", (e) => {
        e.preventDefault();
        if (activeStoryPanel && storyPanelState[activeStoryPanel]) {
          storyPanelState[activeStoryPanel].overlayDismissed = true;
        }
        hideStoryNotice();
      });
    }

    if (dom.labStoryNoticeEl) {
      dom.labStoryNoticeEl.addEventListener("click", (event) => {
        if (event.target === dom.labStoryNoticeEl) {
          if (activeStoryPanel && storyPanelState[activeStoryPanel]) {
            storyPanelState[activeStoryPanel].overlayDismissed = true;
          }
          hideStoryNotice();
        }
      });
    }

    if (dom.labStoryLaunchBtn) {
      dom.labStoryLaunchBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const state = storyPanelState.lab;
        if (!state || !state.activeDialog) return;
        state.overlayDismissed = false;
        maybeShowStoryOverlay("lab");
      });
    }

    if (dom.taskCardEl) {
      dom.taskCardEl.addEventListener("animationend", (event) => {
        if (event.animationName === "taskCardSlideIn") {
          dom.taskCardEl.classList.remove("task-card--intro-animating");
          dom.taskCardEl.classList.remove("task-card--intro-hidden");
          taskState.pendingCardIntroId = null;
        }
        if (event.animationName === "taskCardExitRight") {
          if (dom.taskCardEl.classList.contains("task-card--celebrating")) {
            hideTaskCelebration(true);
          }
        }
      });

      dom.taskCardEl.addEventListener("click", (e) => {
        e.preventDefault();
        hideTaskCelebration();
        const isVisible = dom.taskDetailPanelEl && !dom.taskDetailPanelEl.classList.contains("hidden");
        if (isVisible) {
          showTaskDetailPanel(false);
        } else {
          renderTaskDetailPanel();
          ui.setTimetableRaised(false);
          showTaskDetailPanel(true);
        }
      });
    }

    if (dom.closeTaskDetailBtn) {
      dom.closeTaskDetailBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showTaskDetailPanel(false);
      });
    }

    if (dom.taskClaimRewardBtn) {
      dom.taskClaimRewardBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const task = getTaskForDetail();
        if (!task || !task.id) return;
        claimTaskReward(task.id);
      });
    }
  }

  return {
    getActiveTask,
    setActiveTask,
    renderTaskCard,
    renderTaskDetailPanel,
    showTaskDetailPanel,
    hideTaskCelebration,
    notifyTaskLocationChange,
    maybeShowPendingTaskCelebration,
    loadAgentTasks,
    loadStoryDialogs,
    maybeShowStoryOverlay,
    completeTaskObjective,
    initTaskEvents,
  };
}
