/**
 * Who is using the app right now.
 *
 * The functions that change the books - addExpense, receiveStock, buying
 * supplies - were written long before anybody but the owner could reach them,
 * and none of them is told who is acting. Passing the person through every
 * screen that can spend money is how one gets missed, so Index says once who
 * is signed in and the books ask here.
 *
 * Nobody signed in means the owner: before staff accounts existed every
 * change was the owner's, and nothing that changes the books runs before
 * sign-in resolves.
 */

export interface Actor {
  /** The staff member's id. The owner has none. */
  id?: string;
  name: string;
  role: string;
}

const OWNER: Actor = { name: 'Owner', role: 'owner' };

let actor: Actor | null = null;

export function setCurrentActor(user: { id?: string; name?: string; role?: string } | null | undefined): void {
  actor = user && (user.name || user.role)
    ? { id: user.id, name: user.name || 'Owner', role: user.role || 'owner' }
    : null;
}

export function currentActor(): Actor {
  return actor || OWNER;
}
