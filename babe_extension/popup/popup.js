/* ============================================================
   BABE — Popup Script
   Manages settings UI, syncs with chrome.storage, updates stats.
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  // ── DOM References ──────────────────────────────────────
  const toggleEnabled = document.getElementById("toggle-enabled");
  const statusBanner  = document.getElementById("status-banner");
  const statusText    = document.getElementById("status-text");
  const statPages     = document.getElementById("stat-pages");
  const statBlocked   = document.getElementById("stat-blocked");
  const modelSelect   = document.getElementById("model-select");
  const sensitivitySlider = document.getElementById("sensitivity-slider");
  const sensitivityValue  = document.getElementById("sensitivity-value");
  const whitelistInput    = document.getElementById("whitelist-input");
  const whitelistAdd      = document.getElementById("whitelist-add");
  const whitelistList     = document.getElementById("whitelist-list");
  const resetStats        = document.getElementById("reset-stats");

  // ── Load current settings ───────────────────────────────
  const data = await chrome.storage.local.get([
    "babe_enabled",
    "babe_model",
    "babe_sensitivity",
    "babe_whitelist",
    "babe_stats",
  ]);

  const enabled     = data.babe_enabled !== false;
  const model       = data.babe_model || "svc";
  const sensitivity = data.babe_sensitivity ?? 0;
  const whitelist   = data.babe_whitelist || [];
  const stats       = data.babe_stats || { pagesScanned: 0, sentencesBlocked: 0 };

  // ── Initialize UI ───────────────────────────────────────
  toggleEnabled.checked = enabled;
  updateStatusUI(enabled);
  modelSelect.value = model;
  sensitivitySlider.value = sensitivity;
  sensitivityValue.textContent = Number(sensitivity).toFixed(1);
  statPages.textContent = formatNumber(stats.pagesScanned);
  statBlocked.textContent = formatNumber(stats.sentencesBlocked);
  renderWhitelist(whitelist);

  // ── Event: Toggle ON/OFF ────────────────────────────────
  toggleEnabled.addEventListener("change", async () => {
    const val = toggleEnabled.checked;
    await chrome.storage.local.set({ babe_enabled: val });
    updateStatusUI(val);
  });

  // ── Event: Model selection ──────────────────────────────
  modelSelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ babe_model: modelSelect.value });
  });

  // ── Event: Sensitivity slider ───────────────────────────
  sensitivitySlider.addEventListener("input", () => {
    sensitivityValue.textContent = Number(sensitivitySlider.value).toFixed(1);
  });

  sensitivitySlider.addEventListener("change", async () => {
    await chrome.storage.local.set({
      babe_sensitivity: parseFloat(sensitivitySlider.value),
    });
  });

  // ── Event: Add whitelist domain ─────────────────────────
  async function addDomain() {
    const domain = whitelistInput.value.trim().toLowerCase();
    if (!domain) return;

    const current = (await chrome.storage.local.get("babe_whitelist")).babe_whitelist || [];
    if (current.includes(domain)) {
      whitelistInput.value = "";
      return;
    }

    current.push(domain);
    await chrome.storage.local.set({ babe_whitelist: current });
    renderWhitelist(current);
    whitelistInput.value = "";
  }

  whitelistAdd.addEventListener("click", addDomain);
  whitelistInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain();
    }
  });

  // ── Event: Reset stats ──────────────────────────────────
  resetStats.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "BABE_RESET_STATS" });
    statPages.textContent = "0";
    statBlocked.textContent = "0";

    // Flash feedback
    resetStats.textContent = "✓ Cleared";
    resetStats.style.color = "var(--success)";
    resetStats.style.borderColor = "var(--success)";
    setTimeout(() => {
      resetStats.textContent = "Reset Statistics";
      resetStats.style.color = "";
      resetStats.style.borderColor = "";
    }, 1500);
  });

  // ── Listen for live storage changes ─────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.babe_stats) {
      const s = changes.babe_stats.newValue || { pagesScanned: 0, sentencesBlocked: 0 };
      statPages.textContent = formatNumber(s.pagesScanned);
      statBlocked.textContent = formatNumber(s.sentencesBlocked);
    }
  });

  // ── Helpers ─────────────────────────────────────────────
  function updateStatusUI(isEnabled) {
    if (isEnabled) {
      statusBanner.classList.remove("disabled");
      statusText.textContent = "Protection Active";
      statusText.style.color = "var(--success)";
    } else {
      statusBanner.classList.add("disabled");
      statusText.textContent = "Protection Disabled";
      statusText.style.color = "var(--text-muted)";
    }
  }

  function formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function renderWhitelist(domains) {
    whitelistList.innerHTML = "";
    for (const domain of domains) {
      const li = document.createElement("li");
      li.className = "whitelist-item";

      const span = document.createElement("span");
      span.textContent = domain;

      const btn = document.createElement("button");
      btn.className = "whitelist-remove";
      btn.textContent = "✕";
      btn.setAttribute("aria-label", `Remove ${domain}`);
      btn.addEventListener("click", async () => {
        const current = (await chrome.storage.local.get("babe_whitelist")).babe_whitelist || [];
        const updated = current.filter((d) => d !== domain);
        await chrome.storage.local.set({ babe_whitelist: updated });
        renderWhitelist(updated);
      });

      li.appendChild(span);
      li.appendChild(btn);
      whitelistList.appendChild(li);
    }
  }
});
