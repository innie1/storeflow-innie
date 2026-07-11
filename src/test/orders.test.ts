import { describe, it, expect } from "vitest";
import { StoreData, Product } from "@/types/store";
import { createStore } from "@/lib/store-data";

// Mock localStorage for Vitest running in Node environment
const localStorageMock = (() => {
  let storeMock: Record<string, string> = {};
  return {
    getItem: (key: string) => storeMock[key] || null,
    setItem: (key: string, value: string) => {
      storeMock[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete storeMock[key];
    },
    clear: () => {
      storeMock = {};
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Helper normalization logic matching Index.tsx / Orders.tsx
function getNormalizedStatus(status?: string): string {
  if (!status) return 'Pending';
  const s = status.trim().toLowerCase();
  if (s === 'pending' || s === 'pending approval') return 'Pending';
  if (s === 'accepted') return 'Accepted';
  if (s === 'preparing') return 'Preparing';
  if (s === 'ready' || s === 'ready for pickup' || s === 'ready for delivery') return 'Ready';
  if (s === 'completed') return 'Completed';
  if (s === 'rejected') return 'Rejected';
  if (s === 'cancelled') return 'Cancelled';
  return status;
}

// Mock of status update stock logic
function simulateOrderStatusUpdate(
  store: StoreData,
  order: { status: string; order_items: { product_id: string; quantity: number }[] },
  newStatus: string
) {
  let updatedStore = { ...store };
  const currentNormalized = getNormalizedStatus(order.status);
  const targetNormalized = getNormalizedStatus(newStatus);

  // 1. Reserve Stock if transitioning to Accepted
  if (targetNormalized === 'Accepted') {
    const updatedProducts = store.products.map((p) => {
      const item = order.order_items.find(oi => oi.product_id === p.id);
      if (item) {
        return {
          ...p,
          quantity: Math.max(0, p.quantity - Number(item.quantity))
        };
      }
      return p;
    });
    updatedStore.products = updatedProducts;
  }

  // 2. Release Stock if previously accepted (Accepted/Preparing/Ready) but now rejected/cancelled
  const wasAccepted = currentNormalized === 'Accepted' || currentNormalized === 'Preparing' || currentNormalized === 'Ready';
  if ((targetNormalized === 'Rejected' || targetNormalized === 'Cancelled') && wasAccepted) {
    const updatedProducts = store.products.map((p) => {
      const item = order.order_items.find(oi => oi.product_id === p.id);
      if (item) {
        return {
          ...p,
          quantity: p.quantity + Number(item.quantity)
        };
      }
      return p;
    });
    updatedStore.products = updatedProducts;
  }

  return updatedStore;
}

describe("Order Management System (OMS) Unit Tests", () => {
  it("should normalize status casing correctly", () => {
    expect(getNormalizedStatus("pending")).toBe("Pending");
    expect(getNormalizedStatus("pending approval")).toBe("Pending");
    expect(getNormalizedStatus("accepted")).toBe("Accepted");
    expect(getNormalizedStatus("preparing")).toBe("Preparing");
    expect(getNormalizedStatus("ready for pickup")).toBe("Ready");
    expect(getNormalizedStatus("ready for delivery")).toBe("Ready");
    expect(getNormalizedStatus("completed")).toBe("Completed");
    expect(getNormalizedStatus("rejected")).toBe("Rejected");
    expect(getNormalizedStatus("cancelled")).toBe("Cancelled");
  });

  it("should reserve stock when order is Accepted", () => {
    let store = createStore("Test Store Retail", "retail");
    // Ensure product exists
    const targetProduct = store.products[0];
    const initialQty = targetProduct.quantity;

    const mockOrder = {
      status: "Pending",
      order_items: [{ product_id: targetProduct.id, quantity: 5 }]
    };

    // Transition to Accepted
    store = simulateOrderStatusUpdate(store, mockOrder, "Accepted");

    const updatedProduct = store.products.find(p => p.id === targetProduct.id);
    expect(updatedProduct?.quantity).toBe(initialQty - 5);
  });

  it("should release stock when accepted order is Cancelled", () => {
    let store = createStore("Test Store Retail", "retail");
    const targetProduct = store.products[0];
    const initialQty = targetProduct.quantity;

    const mockOrder = {
      status: "Pending",
      order_items: [{ product_id: targetProduct.id, quantity: 3 }]
    };

    // Transition: Pending -> Accepted (Reserves Stock)
    store = simulateOrderStatusUpdate(store, mockOrder, "Accepted");
    expect(store.products[0].quantity).toBe(initialQty - 3);

    // Update order state to Accepted
    mockOrder.status = "Accepted";

    // Transition: Accepted -> Cancelled (Releases Stock)
    store = simulateOrderStatusUpdate(store, mockOrder, "Cancelled");
    expect(store.products[0].quantity).toBe(initialQty);
  });

  it("should NOT release stock when pending order is Rejected", () => {
    let store = createStore("Test Store Retail", "retail");
    const targetProduct = store.products[0];
    const initialQty = targetProduct.quantity;

    const mockOrder = {
      status: "Pending",
      order_items: [{ product_id: targetProduct.id, quantity: 4 }]
    };

    // Transition: Pending -> Rejected (Direct rejection, no reservation took place)
    store = simulateOrderStatusUpdate(store, mockOrder, "Rejected");
    expect(store.products[0].quantity).toBe(initialQty);
  });

  it("should calculate daily order limits correctly", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0); // local noon

    const mockOrders = [
      { id: "1", status: "Pending", created_at: today.toISOString() },
      { id: "2", status: "Completed", created_at: today.toISOString() },
      { id: "3", status: "Pending", created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() } // 2 days ago
    ];

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const todayOrdersCount = mockOrders.filter(o => new Date(o.created_at).getTime() >= todayMidnight.getTime()).length;
    expect(todayOrdersCount).toBe(2);
  });
});
