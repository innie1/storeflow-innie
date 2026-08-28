import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./storeflow-ui-overhaul.css";
import { initTheme } from "./lib/theme";

initTheme();

document.body.classList.add("storeflow-ui-overhaul");

const applyStoreFlowNavigation = () => {
  const nav = document.querySelector("nav.fixed.bottom-0");
  if (!nav) return;

  const buttons = Array.from(nav.querySelectorAll("button"));
  for (const button of buttons) {
    const labelNode = button.querySelector("span:last-child");
    const label = labelNode?.textContent?.trim();
    if (!label || !labelNode) continue;

    if (label === "Dashboard") labelNode.textContent = "Home";
    if (label === "Inventory") labelNode.textContent = "Stock";
    if (label === "Sales") labelNode.textContent = "Sell";

    if (label === "Orders") button.style.display = "none";
  }
};

const navigationObserver = new MutationObserver(() => applyStoreFlowNavigation());
navigationObserver.observe(document.documentElement, { childList: true, subtree: true });

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
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => {});

  let reloaded = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
watchForNotificationOrder();
