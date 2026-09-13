import type { StoreData, TabId } from '@/types/store';
import { getBusinessTemplate, resolveBusinessType } from '@/lib/business-runtime';

export interface TradeAnswer { reply: string; tab?: TabId; }

/** Trade language comes from the same templates that define the actual screens. */
export function answerTradeQuestion(store: StoreData, input: string): TradeAnswer | null {
  const q = input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const template = getBusinessTemplate(store);
  const type = resolveBusinessType(store);
  const noun = template.labels.orderNoun.toLowerCase();
  const terms = new Set([noun, ...noun.split(' '), ...(template.modules.includes('orders') ? ['order'] : []), ...(template.modes.includes('appointments') ? ['appointment', 'booking'] : []), ...(template.modes.includes('sessions') ? ['session'] : [])]);
  const mentionsWork = [...terms].some(term => term.length > 2 && q.split(' ').some(word => word === term || word === `${term}s`));
  if (/^(?:help|what can you do|how can you help)(?: me)?(?: here)?$/.test(q)) {
    const bullets = [];
    if (template.modes.includes('products')) bullets.push('• Ask about stock, sales, or a saved product.');
    if (template.modules.includes('orders')) bullets.push(`• Ask which ${noun}s are active, overdue, or ready.`);
    if (template.modes.some(mode => mode === 'services' || mode === 'metered')) bullets.push(`• Ask for your ${template.labels.offeringNoun.toLowerCase()} catalog or workflow.`);
    if (template.modes.includes('sessions')) bullets.push('• Ask about recorded sessions and their workflow.');
    bullets.push('• Use exact catalog names when recording an action; I will ask about unclear items.');
    return { reply: `For **${template.name}**, I use your saved ${template.labels.offeringNoun.toLowerCase()} catalog and business records.\n\n${bullets.join('\n')}`, tab: type === 'games' ? 'games-dashboard' : 'orders' };
  }
  if (/\b(?:workflow|stages|steps)\b/.test(q) && /\b(?:show|what|how|which|workflow|stages)\b/.test(q)) {
    return { reply: `Your **${template.name}** workflow:\n${template.workflow.map((stage, i) => `${i + 1}. ${stage.replace(/_/g, ' ')}`).join('\n')}\n\nOpen the relevant record to change its stage.`, tab: type === 'games' ? 'games-dashboard' : 'orders' };
  }
  if (/\b(?:services?|treatments?|packages?|menu|offerings?|price list|products?|items?|games?|resources?)\b/.test(q) && /\b(?:show|list|offer|available|what|which)\b/.test(q)) {
    const offerings = (store.businessTemplate?.offerings || []).filter(x => x.enabled !== false && x.active !== false && !x.discontinued);
    const names = [...new Set([...(store.products || []).filter(p => !p.discontinued && (p.isService || template.modes.includes('products'))).map(p => p.name), ...offerings.map(x => String(x.name || '').trim()).filter(Boolean)])];
    return { reply: names.length ? `Your saved ${template.labels.offeringNoun.toLowerCase()} catalog:\n${names.map(name => `• **${name}**`).join('\n')}` : `Your ${template.labels.offeringNoun.toLowerCase()} catalog is empty. Add your own offerings and prices before asking me to charge for them.`, tab: 'inventory' };
  }
  if (!mentionsWork || !/\b(?:which|what|how many|show|list|any)\b/.test(q) || !/\b(?:open|pending|active|ready|overdue|late|waiting|due|today)\b/.test(q)) return null;
  if (type === 'laundry') return null; // The laundry engine merges its local intake book.
  if (type === 'games') {
    const sessionCount = store.gameSessions?.length || 0;
    return { reply: `I can see **${sessionCount} recorded session${sessionCount === 1 ? '' : 's'}**. Those records do not include live timer or booking status, so I cannot tell which sessions are still active.`, tab: 'games-dashboard' };
  }
  const records = (store as StoreData & { orders?: Record<string, unknown>[] }).orders;
  if (!Array.isArray(records)) return { reply: `I do not have the ${noun} records loaded yet. Open Orders to load them before I count what is pending or overdue.`, tab: 'orders' };
  const now = Date.now();
  const stage = (r: Record<string, unknown>) => String(r.workflow_stage || r.workflowStage || r.status || '').toLowerCase();
  const active = records.filter(r => !['completed', 'complete', 'collected', 'cancelled', 'canceled', 'rejected'].includes(stage(r)) && !['completed', 'cancelled', 'rejected'].includes(String(r.status || '').toLowerCase()));
  const wanted = /\b(?:overdue|late)\b/.test(q) ? 'overdue' : /\bready\b/.test(q) ? 'ready' : /\b(?:due|today)\b/.test(q) ? 'due today' : 'active';
  let unknownDates = 0;
  const selected = active.filter(r => {
    if (wanted === 'active') return true;
    if (wanted === 'ready') return stage(r) === 'ready';
    const raw = r.promised_for || r.promisedFor || r.scheduled_for || r.scheduledFor;
    const date = new Date(String(raw || ''));
    if (!Number.isFinite(date.getTime())) { unknownDates++; return false; }
    return wanted === 'overdue' ? date.getTime() < now : date.toDateString() === new Date(now).toDateString();
  });
  return { reply: `**${selected.length} ${noun}${selected.length === 1 ? '' : 's'} ${wanted}** in the loaded records.${unknownDates ? `\n${unknownDates} active record${unknownDates === 1 ? ' has' : 's have'} no valid due date and ${unknownDates === 1 ? 'is' : 'are'} excluded from this count.` : ''}${selected.length ? '\n' + selected.slice(0, 8).map(r => `• ${String(r.customer_name || r.customerName || r.order_number || r.id || 'Customer')} — ${stage(r).replace(/_/g, ' ')}`).join('\n') : ''}`, tab: 'orders' };
}
