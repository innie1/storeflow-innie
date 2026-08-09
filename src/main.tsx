import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./storeflow-ui-overhaul.css";
import { initTheme } from "./lib/theme";

initTheme();

// StoreFlow UI overhaul is intentionally mounted outside the business logic.
// It only adjusts presentation/navigation labels and never changes store data.
document.body.classList.add("storeflow-ui-overhaul");

const applyStoreFlowNavigation = () => {
  const nav = document.querySelector("nav.fixed.bottom-0");
  if (!nav) return;

  const buttons = Array.from(nav.querySelectorAll("button"));
  for (const button of buttons) {
    const label = button.querySelector("span:last-child")?.textContent?.trim();
    if (!label) continue;

    // Mobile navigation is intentionally action-oriented.
    if (label === "Dashboard") {
      const span = button.querySelector("span:last-child");
      if (span) span.textContent = "Home";
    }
    if (label === "Inventory") {
      const span = button.querySelector("span:last-child");
      if (span) span.textContent = "Stock";
    }
    if (label === "Sales") {
      const span = button.querySelector("span:last-child");
      if (span) span.textContent = "Sell";
    }
  }
};

// React owns the markup, so observe only the small navigation-label change.
const navigationObserver = new MutationObserver(() => applyStoreFlowNavigation());
navigationObserver.observe(document.documentElement, { childList: true, subtree: true });

// Service worker registration — guarded against Lovable preview/iframe contexts.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("preview--") ||
  host.includes("lovableproject.com") ||
  host.includes("lovableproject-dev.com");

const isLocalDev =
  host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");

if (isPreviewHost || isInIframe || isLocalDev) {
  // Make sure no stale SW from a prior session interferes with the preview,
  // and clean up any leftover SW registered while devOptions.enabled was
  // previously true (that old registration otherwise keeps serving stale
  // cached files on localhost even after this fix ships).
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => {});

  // When a new SW takes over mid-session (autoUpdate + skipWaiting),
  // the already-loaded page can be left in a torn state — some old chunks,
  // some new — which shows up as the app "freezing" until the user clicks
  // something. Reload once, automatically, the moment control changes.
  let reloaded = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
