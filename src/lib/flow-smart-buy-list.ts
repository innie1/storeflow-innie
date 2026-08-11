import { Product, StoreData } from '@/types/store';

// Flow-only smart purchase recommender. It never mutates inventory; it only
// produces a reviewable list from demand, contribution, availability and the
// merchant's historical restock pattern.
export interface SmartBuyListItem { productId: string; name: string; quantity: number; unitCost: number; totalCost: number; score: number; reason: string; sold30: number; sold90: number; currentStock: number; daysCover: number | null; typicalRestockQty: number; }
export interface SmartBuyListResult { items: SmartBuyListItem[]; budget: number | null; estimatedCost: number; availableBalance: number; }
const DAY = 86_400_000; const n = (v: unknown) => Number(v) || 0;
const daysAgo = (date: string) => Math.max(0, (Date.now() - new Date(date).getTime()) / DAY);
function salesFor(store: StoreData, productId: string, days: number) { return (store.sales || []).filter(s => s.productId === productId && daysAgo(s.date) <= days); }
function restocksFor(store: StoreData, productId: string) { return (store.restocks || []).filter(r => r.productId === productId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()); }
function median(values: number[]) { if (!values.length) return 0; const sorted=[...values].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2); return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2; }
function availableBalance(store: StoreData) { return Math.max(0,n(store.cashBalance)+n(store.bankBalance)+n(store.walletBalance)); }
function scoreProduct(store: StoreData, product: Product) {
  if (product.discontinued || product.isService) return null;
  const s30=salesFor(store,product.id,30), s90=salesFor(store,product.id,90), sold30=s30.reduce((a,s)=>a+n(s.quantity),0), sold90=s90.reduce((a,s)=>a+n(s.quantity),0), revenue90=s90.reduce((a,s)=>a+n(s.total),0), profit90=s90.reduce((a,s)=>a+n(s.profit),0), lastSale=s90.length?Math.min(...s90.map(s=>daysAgo(s.date))):Infinity;
  if (sold90<=1 && lastSale>45) return null;
  if (sold30===0 && sold90<=2 && lastSale>30) return null;
  const restocks=restocksFor(store,product.id), typicalRestockQty=Math.max(1,Math.round(median(restocks.slice(0,8).map(r=>n(r.quantity)).filter(q=>q>0)))), velocity=(sold30/30)*.65+(sold90/90)*.35, daysCover=velocity>0?product.quantity/velocity:null, targetDays=restocks.length>=3?14:10, reorderLevel=n(product.reorderLevel)||Math.max(1,Math.ceil(velocity*5)), shortage=Math.max(0,Math.ceil(velocity*targetDays-product.quantity));
  const score=Math.min(40,velocity*8)+Math.min(18,revenue90>0?Math.log10(revenue90+1)*5:0)+Math.min(12,profit90>0?Math.log10(profit90+1)*3.2:0)+(product.quantity<=0?20:product.quantity<=reorderLevel?14:daysCover!==null&&daysCover<targetDays?10:0)+Math.min(10,restocks.length*1.5+(restocks.length>=3?3:0))+(lastSale<=7?8:lastSale<=14?6:lastSale<=30?3:0);
  if (shortage<=0 && product.quantity>reorderLevel) return null;
  if (sold30===0 && sold90<=2 && product.quantity>0) return null;
  const suggested=Math.max(1,shortage||Math.min(typicalRestockQty,Math.max(1,Math.ceil(velocity*7))));
  const reason=[sold30>0?`${sold30} sold in 30 days`:`${sold90} sold in 90 days`,product.quantity<=0?'currently out of stock':`${product.quantity} left`,restocks.length>=2?`usually buys about ${typicalRestockQty} at a time`:'',revenue90>0?'contributes to store sales':''].filter(Boolean).join(' · ');
  return {product,score,suggested,sold30,sold90,daysCover,typicalRestockQty,reason};
}
export function buildSmartBuyList(store: StoreData, budget?: number): SmartBuyListResult {
  const available=availableBalance(store), effectiveBudget=Number.isFinite(budget)&&(budget||0)>0?Number(budget):null, cap=effectiveBudget??available;
  const candidates=(store.products||[]).map(p=>scoreProduct(store,p)).filter(Boolean).sort((a,b)=>b!.score-a!.score) as NonNullable<ReturnType<typeof scoreProduct>>[];
  const items:SmartBuyListItem[]=[]; let remaining=cap;
  for(const c of candidates){ const unitCost=Math.max(0,n(c.product.costPrice)); if(unitCost<=0||remaining<unitCost)continue; let quantity=Math.min(c.suggested,Math.max(1,c.typicalRestockQty*2)); quantity=Math.min(quantity,Math.floor(remaining/unitCost)); if(quantity<=0)continue; const totalCost=quantity*unitCost; items.push({productId:c.product.id,name:c.product.name,quantity,unitCost,totalCost,score:Math.round(c.score*10)/10,reason:c.reason,sold30:c.sold30,sold90:c.sold90,currentStock:c.product.quantity,daysCover:c.daysCover,typicalRestockQty:c.typicalRestockQty}); remaining-=totalCost; }
  if(remaining>0) for(const c of candidates){ if(c.sold30<=0)continue; const unitCost=Math.max(0,n(c.product.costPrice)); if(items.some(i=>i.productId===c.product.id)||unitCost<=0||remaining<unitCost)continue; const quantity=Math.min(Math.floor(remaining/unitCost),Math.max(1,c.typicalRestockQty)); if(quantity<=0)continue; items.push({productId:c.product.id,name:c.product.name,quantity,unitCost,totalCost:quantity*unitCost,score:Math.round(c.score*10)/10,reason:`${c.reason} · extra budget went to a proven seller`,sold30:c.sold30,sold90:c.sold90,currentStock:c.product.quantity,daysCover:c.daysCover,typicalRestockQty:c.typicalRestockQty}); break; }
  return {items,budget:effectiveBudget,estimatedCost:items.reduce((sum,item)=>sum+item.totalCost,0),availableBalance:available};
}
export function smartBuyListText(result: SmartBuyListResult) { if(!result.items.length)return 'I could not find a purchase worth prioritising within that budget. I did not add slow/dead stock just to fill the list.'; return ['**Smart Buy List**',result.budget?`Budget: **₦${Math.round(result.budget).toLocaleString()}**`:`Budget: **₦${Math.round(result.availableBalance).toLocaleString()} available**`,'',...result.items.map((item,index)=>`${index+1}. **${item.name}** × ${item.quantity} — ₦${Math.round(item.totalCost).toLocaleString()}\n   ${item.reason}`),'',`Estimated total: **₦${Math.round(result.estimatedCost).toLocaleString()}**`].join('\n'); }
