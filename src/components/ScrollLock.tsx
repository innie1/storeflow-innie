import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

/**
 * Drop this inside an overlay's markup to stop the page behind it scrolling.
 *
 * Most overlays in the app are inline conditional JSX inside a large screen
 * ({showAddModal && <div className="fixed inset-0 …">}), so their open state is
 * declared far below where a hook call would have to sit. Rendering a component
 * instead ties the lock to exactly the thing it is about — the overlay being on
 * screen — and it unlocks itself on unmount. Locks are reference counted, so
 * stacked overlays behave.
 */
export default function ScrollLock() {
  useBodyScrollLock();
  return null;
}
