import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./storeflow-ui-overhaul.css";
import { initTheme } from "./lib/theme";
import { workInProgress } from "@/lib/work-in-progress";
import { showToast } from "@/components/Toast";

initTheme();

document.body.classList.add("storeflow-ui-overhaul");

// Notification deep-link bridge.
// Orders.tsx owns its expansion state, so this small presentation-layer bridge
// waits for the Orders list to render and clicks the exact order's existing
// "View Items" control. This keeps the order UI/business logic untouched while
// making a notification tap land inside the specific order immediately.
const openNotificationOrder = () => {
  const params = new URLSearchParams(window.location.search);
  const orderNumber = params.get("order_number");
  const orderId = params.get("order_id");
  if (!orderNumber || !orderId || params.get("tab") !== "orders") return false;

  const target = `Order #${orderNumber}`;
  const cards = Array.from(document.querySelectorAll("[class*='bg-card']"));
  const card = cards.find((element) => {
    const text = element.textContent || "";
    return text.includes(target) &&
      Array.from(element.querySelectorAll("button")).some((button) =>
        /^(View Items|Hide Items)/i.test(button.textContent?.trim() || "")
      );
  });

  if (!card) return false;

  const toggle = Array.from(card.querySelectorAll("button")).find((button) =>
    /^(View Items|Hide Items)/i.test(button.textContent?.trim() || "")
  );

  if (toggle && /^View Items/i.test(toggle.textContent?.trim() || "")) {
    toggle.click();
  }

  // Remove the one-shot deep-link parameters after opening the order so a
  // normal refresh/back navigation doesn't repeatedly re-trigger the click.
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("order_id");
  cleanUrl.searchParams.delete("order_number");
  window.history.replaceState(window.history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  return true;
};

const watchForNotificationOrder = () => {
  if (!new URLSearchParams(window.location.search).get("order_number")) return;

  let attempts = 0;
  const tryOpen = () => {
    attempts += 1;
    if (openNotificationOrder() || attempts >= 80) {
      observer.disconnect();
      window.clearInterval(timer);
    }
  };

  const observer = new MutationObserver(tryOpen);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = window.setInterval(tryOpen, 150);
  window.setTimeout(() => {
    observer.disconnect();
    window.clearInterval(timer);
  }, 12000);
  tryOpen();
};

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
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  /*
   * Installed apps were never checking for a new version.
   *
   * The browser looks for an updated worker on navigation. An app on the home
   * screen does not navigate - it is resumed from the app switcher, the same
   * document as yesterday - so the check never ran and the shop stayed on
   * whatever build it installed with. Reported from the field as "the
   * installed apps are the ones still showing the old UI", and they were.
   *
   * So we ask, ourselves: every half hour, and whenever the app comes back to
   * the foreground, which is the moment an installed app most looks like a
   * fresh launch and least is one.
   */
  const CHECK_EVERY_MS = 30 * 60 * 1000;

  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        const check = () => { registration.update().catch(() => {}); };
        window.setInterval(check, CHECK_EVERY_MS);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) check();
        });
      },
    });
  }).catch(() => {});

  /*
   * And applying it only when it costs nothing.
   *
   * This used to reload the instant a new worker took over. Checking for
   * updates as often as we now do, that would eventually land in the middle of
   * an intake - customer at the counter, twelve shirts counted into a form,
   * screen goes blank. So the new version waits for the app to be in the
   * background with nothing unsaved open, and the merchant finds it already
   * updated the next time they look.
   */
  let pending = false;
  let reloaded = false;
  let offered = false;

  const applyNow = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  const applyWhenSafe = () => {
    if (reloaded || !pending) return;
    if (!document.hidden) return;
    if (workInProgress()) return;
    applyNow();
  };

  /*
   * And saying so, when it cannot just do it.
   *
   * Waiting for the app to be in the background is right - nobody wants the
   * screen to blank with twelve shirts counted into a form - but a merchant
   * who opens the app, sees the old screen and never backgrounds it waits
   * forever, which is what "the web has the update but the installed app does
   * not" actually was. So the new version is offered as well: one tap, at a
   * moment they chose.
   */
  const offerUpdate = () => {
    if (offered || reloaded || !pending) return;
    offered = true;
    showToast("A new version is ready — tap here to update", "info", 12000, applyNow);
  };

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    pending = true;
    applyWhenSafe();
    // Still on screen: tell them rather than waiting for a background that
    // may not come for hours.
    if (!reloaded && !document.hidden) offerUpdate();
  });
  document.addEventListener("visibilitychange", () => {
    applyWhenSafe();
    if (!document.hidden) offerUpdate();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
watchForNotificationOrder();
