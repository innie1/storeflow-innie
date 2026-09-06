import type { StoreData } from '@/types/store';
import { getProfitLeaks, getTopOpportunities, inventoryIntelligence } from '@/lib/manager-intel';
import { supportsFlowMessageOrders } from '@/lib/flow-message-orders';

/**
 * The three things worth offering this shop right now.
 *
 * The chat opened with nine buttons — five fixed prompts plus four import
 * shortcuts that duplicate the attachment menu — and none of them knew
 * anything about the shop they were sitting in. Three is enough, and they
 * should be about this store.
 *
 * Just as importantly, they come from the same engines the Manager screens
 * use. Flow had its own idea of what was urgent: `storeAnalysis` picked the
 * first out-of-stock product in array order, so the chat could name one thing
 * as the priority while the Manager screen — which ranks by profit at risk and
 * ignores products with no recent demand — named another. Two answers to the
 * same question, from the same data, is worse than either.
 */

export interface FlowQuickAction {
  label: string;
  /** What gets sent to the chat when it is tapped. */
  prompt: string;
}

/** Never more than this many, however much is wrong. */
const MAX_ACTIONS = 3;

export function flowQuickActions(store: StoreData): FlowQuickAction[] {
  const actions: FlowQuickAction[] = [];
  const seen = new Set<string>();

  const add = (label: string, prompt: string) => {
    if (actions.length >= MAX_ACTIONS || seen.has(label)) return;
    seen.add(label);
    actions.push({ label, prompt });
  };

  // 1. The single most expensive thing to be out of, if anything is.
  //    inventoryIntelligence is already sorted by profit at risk per day and
  //    only counts demand from the last sixty days, so this is the same
  //    product the restock screen would put first.
  const urgent = inventoryIntelligence(store)
    .find(f => f.worthRestocking && f.restockQty > 0);
  if (urgent) add(`Restock ${urgent.product.name}`, `restock ${urgent.product.name}`);

  // 2. For a shop that takes orders — a laundry, a tailor — writing one down
  //    is what they open the chat to do. It comes after a live stock problem,
  //    which is something going wrong rather than something routine, and
  //    before everything else.
  if (supportsFlowMessageOrders(store)) {
    add('New customer order', 'take a new customer order');
  }

  // 3. Money going astray, if any is.
  const leaking = getProfitLeaks(store).filter(l => l.kind === 'leaking');
  if (leaking.length > 0) add('Where am I losing money?', 'where am I losing money?');

  // 4. Something worth doing, when nothing is wrong.
  const opportunity = getTopOpportunities(store)[0];
  if (opportunity && !urgent) add(opportunity.title, opportunity.title.toLowerCase());

  // Fallbacks, so there are always three and they are always answerable.
  add("How's my store?", "how's my store?");
  add('Best sellers', 'show my best sellers');
  add("What's low?", "what's low?");

  return actions.slice(0, MAX_ACTIONS);
}
