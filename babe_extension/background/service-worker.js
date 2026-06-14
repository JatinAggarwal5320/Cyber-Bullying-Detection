/* ============================================================
   BABE — Service Worker (Background Script)
   Coordinates messages from content scripts and manages state.
   ============================================================ */

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    babe_enabled: true,
    babe_model: "svc",       // "svc" or "lr"
    babe_sensitivity: 0.0,   // threshold offset (higher = more aggressive filtering)
    babe_whitelist: [],       // domains to skip
    babe_stats: {
      pagesScanned: 0,
      sentencesBlocked: 0,
    },
  };

  const existing = await chrome.storage.local.get(Object.keys(defaults));
  const toSet = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (existing[key] === undefined) {
      toSet[key] = value;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  console.log("[BABE] Extension installed — defaults set.");
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "BABE_PAGE_SCANNED") {
        const { babe_stats = { pagesScanned: 0, sentencesBlocked: 0 } } =
          await chrome.storage.local.get("babe_stats");
        babe_stats.pagesScanned += 1;
        babe_stats.sentencesBlocked += (message.blocked || 0);
        await chrome.storage.local.set({ babe_stats });

        // Update badge with blocked count
        const total = babe_stats.sentencesBlocked;
        if (total > 0) {
          const text = total > 999 ? "999+" : String(total);
          await chrome.action.setBadgeText({ text, tabId: sender.tab?.id });
          await chrome.action.setBadgeBackgroundColor({
            color: "#6336FF",
            tabId: sender.tab?.id,
          });
        }

        sendResponse({ ok: true });
      } else if (message.type === "BABE_GET_SETTINGS") {
        const settings = await chrome.storage.local.get([
          "babe_enabled",
          "babe_model",
          "babe_sensitivity",
          "babe_whitelist",
        ]);
        sendResponse(settings);
      } else if (message.type === "BABE_RESET_STATS") {
        await chrome.storage.local.set({
          babe_stats: { pagesScanned: 0, sentencesBlocked: 0 },
        });
        await chrome.action.setBadgeText({ text: "" });
        sendResponse({ ok: true });
      } else {
        sendResponse({ error: "Unknown message type" });
      }
    } catch (err) {
      console.error("[BABE] Service worker error:", err);
      sendResponse({ error: err.message });
    }
  })();
  return true; // keeps channel open for async response
});
