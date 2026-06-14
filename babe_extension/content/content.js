/* ============================================================
   BABE — Content Script
   Loads model weights, scans visible text, and applies blur
   censoring to detected abusive/hate-speech content.
   ============================================================ */

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let MODEL = null;        // { stopwords: Set, weights: {}, svc_intercept, lr_intercept }
  let SETTINGS = null;     // { babe_enabled, babe_model, babe_sensitivity, babe_whitelist }
  let blockedCount = 0;
  let isScanning = false;
  const PROCESSED_ATTR = "data-babe-processed";
  const ABUSIVE_CLASS = "babe-abusive";
  const BATCH_SIZE = 30;

  // ── Model loading ─────────────────────────────────────────
  async function loadModel() {
    if (MODEL) return MODEL;
    try {
      const url = chrome.runtime.getURL("model_data.json");
      const resp = await fetch(url);
      const data = await resp.json();
      MODEL = {
        stopwordsSet: new Set(data.stopwords),
        weights: data.weights,
        svc_intercept: data.svc_intercept,
        lr_intercept: data.lr_intercept,
      };
      return MODEL;
    } catch (err) {
      console.error("[BABE] Failed to load model:", err);
      return null;
    }
  }

  // ── Settings ──────────────────────────────────────────────
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "BABE_GET_SETTINGS" }, (resp) => {
        if (chrome.runtime.lastError) {
          // Extension context invalidated — use defaults
          resolve({
            babe_enabled: true,
            babe_model: "svc",
            babe_sensitivity: 0.0,
            babe_whitelist: [],
          });
          return;
        }
        SETTINGS = resp;
        resolve(resp);
      });
    });
  }

  function isDomainWhitelisted() {
    if (!SETTINGS || !SETTINGS.babe_whitelist) return false;
    const host = window.location.hostname.toLowerCase();
    return SETTINGS.babe_whitelist.some((d) => host.includes(d.toLowerCase()));
  }

  // ── Text preprocessing (mirrors sklearn TfidfVectorizer) ──
  function tokenize(text) {
    // sklearn's default token pattern: (?u)\b\w\w+\b
    return text.toLowerCase().match(/\b[a-z][a-z]+\b/g) || [];
  }

  // ── Prediction ────────────────────────────────────────────
  function predict(text) {
    if (!MODEL) return { label: 0, score: 0 };

    const tokens = tokenize(text);
    if (tokens.length === 0) return { label: 0, score: 0 };

    // Filter stopwords and count term frequencies
    const tf = {};
    for (const token of tokens) {
      if (MODEL.stopwordsSet.has(token)) continue;
      if (!(token in MODEL.weights)) continue;
      tf[token] = (tf[token] || 0) + 1;
    }

    const keys = Object.keys(tf);
    if (keys.length === 0) return { label: 0, score: 0 };

    // L2 normalization of the TF vector
    let l2 = 0;
    for (const k of keys) {
      l2 += tf[k] * tf[k];
    }
    l2 = Math.sqrt(l2);

    // Compute decision value: dot(coef, x_normalized) + intercept
    const modelKey = (SETTINGS && SETTINGS.babe_model === "lr") ? 1 : 0;
    const intercept = modelKey === 0 ? MODEL.svc_intercept : MODEL.lr_intercept;
    const sensitivity = (SETTINGS && SETTINGS.babe_sensitivity) || 0;

    let decision = intercept;
    for (const k of keys) {
      const w = MODEL.weights[k];
      if (w) {
        decision += w[modelKey] * (tf[k] / l2);
      }
    }

    // Apply sensitivity: shift the threshold
    // Positive sensitivity → more aggressive (lower threshold to flag)
    decision += sensitivity;

    return { label: decision > 0 ? 1 : 0, score: decision };
  }

  // ── DOM scanning ──────────────────────────────────────────
  function getTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          // Skip script, style, noscript, and already-processed
          const tag = parent.tagName;
          if (
            tag === "SCRIPT" ||
            tag === "STYLE" ||
            tag === "NOSCRIPT" ||
            tag === "TEXTAREA" ||
            tag === "INPUT" ||
            tag === "CODE" ||
            tag === "PRE"
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest(`[${PROCESSED_ATTR}]`)) {
            return NodeFilter.FILTER_REJECT;
          }
          const text = node.textContent.trim();
          if (text.length < 4) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function wrapWithBlur(textNode) {
    const parent = textNode.parentElement;
    if (!parent) return;

    // Find the closest block-level ancestor to blur at sentence level
    const wrapper = document.createElement("span");
    wrapper.classList.add(ABUSIVE_CLASS);
    wrapper.setAttribute(PROCESSED_ATTR, "1");
    wrapper.setAttribute("title", "⚠️ BABE: Potentially abusive content detected. Hover to reveal.");

    // Move text into wrapper
    parent.insertBefore(wrapper, textNode);
    wrapper.appendChild(textNode);
  }

  async function scanNodes(textNodes) {
    let localBlocked = 0;

    for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
      const batch = textNodes.slice(i, i + BATCH_SIZE);

      await new Promise((resolve) =>
        requestAnimationFrame(() => {
          for (const node of batch) {
            const text = node.textContent.trim();
            if (text.length < 4) continue;

            // Split into sentences and check each
            const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 3);
            if (sentences.length <= 1) {
              // Check the whole text node
              const result = predict(text);
              if (result.label === 1) {
                wrapWithBlur(node);
                localBlocked++;
              } else {
                // Mark as processed so we skip next time
                if (node.parentElement) {
                  node.parentElement.setAttribute(PROCESSED_ATTR, "0");
                }
              }
            } else {
              // If mixed content, wrap the whole node if any sentence is abusive
              let hasAbusive = false;
              for (const sentence of sentences) {
                const result = predict(sentence);
                if (result.label === 1) {
                  hasAbusive = true;
                  break;
                }
              }
              if (hasAbusive) {
                wrapWithBlur(node);
                localBlocked++;
              } else if (node.parentElement) {
                node.parentElement.setAttribute(PROCESSED_ATTR, "0");
              }
            }
          }
          resolve();
        })
      );

      // Yield to the main thread between batches
      if (globalThis.scheduler?.yield) {
        await scheduler.yield();
      }
    }

    return localBlocked;
  }

  async function scanPage() {
    if (isScanning) return;
    isScanning = true;

    try {
      const model = await loadModel();
      if (!model) {
        isScanning = false;
        return;
      }

      const settings = await loadSettings();
      if (!settings.babe_enabled || isDomainWhitelisted()) {
        isScanning = false;
        return;
      }

      const textNodes = getTextNodes(document.body);
      if (textNodes.length === 0) {
        isScanning = false;
        return;
      }

      const blocked = await scanNodes(textNodes);
      blockedCount += blocked;

      // Notify background
      try {
        chrome.runtime.sendMessage({
          type: "BABE_PAGE_SCANNED",
          blocked,
        });
      } catch (e) {
        // Extension context may be invalidated — ignore
      }
    } catch (err) {
      console.error("[BABE] Scan error:", err);
    }

    isScanning = false;
  }

  // ── MutationObserver for dynamic content ──────────────────
  let scanTimeout = null;
  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanPage();
    }, 500);
  }

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      let hasNewContent = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewContent = true;
          break;
        }
      }
      if (hasNewContent) {
        debouncedScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── Listen for setting changes ────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.babe_enabled || changes.babe_model || changes.babe_sensitivity || changes.babe_whitelist) {
      // Re-load settings
      loadSettings().then(() => {
        if (changes.babe_enabled) {
          if (SETTINGS.babe_enabled) {
            // Re-scan if turned back on
            // Remove processed attributes so we re-scan
            document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
              el.removeAttribute(PROCESSED_ATTR);
            });
            // Remove existing blur wrappers
            document.querySelectorAll(`.${ABUSIVE_CLASS}`).forEach((wrapper) => {
              const parent = wrapper.parentElement;
              if (parent) {
                while (wrapper.firstChild) {
                  parent.insertBefore(wrapper.firstChild, wrapper);
                }
                parent.removeChild(wrapper);
              }
            });
            blockedCount = 0;
            scanPage();
          } else {
            // Remove all blurs
            document.querySelectorAll(`.${ABUSIVE_CLASS}`).forEach((wrapper) => {
              const parent = wrapper.parentElement;
              if (parent) {
                while (wrapper.firstChild) {
                  parent.insertBefore(wrapper.firstChild, wrapper);
                }
                parent.removeChild(wrapper);
              }
            });
          }
        }

        if (changes.babe_model || changes.babe_sensitivity) {
          // Re-scan everything with new model/sensitivity
          document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
            el.removeAttribute(PROCESSED_ATTR);
          });
          document.querySelectorAll(`.${ABUSIVE_CLASS}`).forEach((wrapper) => {
            const parent = wrapper.parentElement;
            if (parent) {
              while (wrapper.firstChild) {
                parent.insertBefore(wrapper.firstChild, wrapper);
              }
              parent.removeChild(wrapper);
            }
          });
          blockedCount = 0;
          scanPage();
        }
      });
    }
  });

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    await loadSettings();
    if (!SETTINGS.babe_enabled || isDomainWhitelisted()) return;

    await scanPage();
    setupObserver();
  }

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
