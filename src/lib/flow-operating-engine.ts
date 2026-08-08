import { Product, StoreData, TabId } from '@/types/store';
import { loadBrainMemory, resolveBrainAlias } from '@/lib/flow-brain-memory';

export type OperatingIntent = 'sell'|'restock'|'add_product'|'undo'|'store_overview'|'inventory'|'sales'|'profit'|'best_sellers'|'slow_products'|'pricing'|'customers'|'expenses'|'improvement'|'why'|'recommendations'|'navigation'|'settings'|'product_lookup'|'help'|'unknown';
export interface ProductMatch { product: Product; score: number; matchedBy: 'exact'|'alias'|'word'|'fuzzy'|'learned'; }
export interface FlowLineItem { product: ProductMatch; quantity: number; }
export interface OperatingPlan { intent: OperatingIntent; confidence: number; items: FlowLineItem[]; product?: ProductMatch; quantity?: number; tab?: TabId; reason: string; }

const STOP = new Set(['the','a','an','my','me','please','product','products','item','items','store','stock','inventory','now','today','for','of','to','on','is','are','what','whats','show','tell','about','do','i','can','you','give','get','some','something','thing','things','with','and','or','in','at','from','this','that','how','much','many','does','did','was','were']);
function norm(v:string){return v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9%₦]+/g,' ').trim().replace(/\s+/g,' ');}
function tokens(v:string){return norm(v).split(' ').filter(Boolean).filter(x=>!STOP.has(x));}
function distance(a:string,b:string){const aa=norm(a),bb=norm(b),prev=Array.from({length:bb.length+1},(_,i)=>i);for(let i=1;i<=aa.length;i++){const cur=[i];for(let j=1;j<=bb.length;j++)cur[j]=aa[i-1]===bb[j-1]?prev[j-1]:Math.min(prev[j-1]+1,prev[j]+1,cur[j-1]+1);for(let j=0;j<cur.length;j++)prev[j]=cur[j];}return prev[bb.length];}
function similarity(a:string,b:string){const aa=norm(a),bb=norm(b);if(!aa||!bb)return 0;if(aa===bb)return 1;if(aa.includes(bb)||bb.includes(aa))return .95;const ta=new Set(tokens(aa)),tb=new Set(tokens(bb));const overlap=[...ta].filter(x=>tb.has(x)).length;const union=new Set([...ta,...tb]).size||1;const fuzzy=1-distance(aa,bb)/Math.max(aa.length,bb.length);return Math.max(overlap/union*.94,fuzzy*.84);}
function aliases(p:Product){return[p.name,...(p.voiceAliases||[])].filter(Boolean);}

export function resolveProduct(store:StoreData,query:string):ProductMatch|null{
 const q=norm(query);if(!q)return null;
 const learned=resolveBrainAlias(store,q);if(learned)return{product:learned,score:1,matchedBy:'learned'};
 let best:ProductMatch|null=null;
 for(const p of store.products||[])for(const alias of aliases(p)){
  const n=norm(alias);if(n===q)return{product:p,score:1,matchedBy:alias===p.name?'exact':'alias'};
  const qt=tokens(q),nt=tokens(n);let score=similarity(q,n);
  if(qt.length&&qt.every(t=>nt.includes(t)))score=Math.max(score,.97);
  if(qt.length===1&&nt.some(t=>t.startsWith(qt[0])))score=Math.max(score,.9);
  if(!best||score>best.score)best={product:p,score,matchedBy:qt.every(t=>nt.includes(t))?'word':'fuzzy'};
 }
 return best&&best.score>=.70?best:null;
}

function cleanProductPhrase(s:string){return s.replace(/^\s*(?:please\s+)?(?:sell|sold|record\s+(?:a\s+)?sale|restock|receive|stock\s+up|add|buy|increase|reduce)\s*/i,'').replace(/^\s*(?:me|my|the)\s+/i,'').replace(/\b(?:qty|quantity|units?|stock)\s*[:=]?\s*\d+/ig,'').replace(/\b(?:at|for)\s+₦?[\d,]+/ig,'').trim();}
function extractQty(s:string){const patterns=[/^\s*(\d+(?:\.\d+)?)\s+(?:x\s*)?/i,/\bx\s*(\d+(?:\.\d+)?)\b/i,/\b(?:qty|quantity|units?|stock)\s*[:=]?\s*(\d+(?:\.\d+)?)\b/i,/\b(?:sell|sold|restock|receive|add|buy)\s+(?:me\s+)?(\d+(?:\.\d+)?)\b/i];for(const r of patterns){const m=s.match(r);if(m)return Math.max(1,Math.round(Number(m[1])));}return 1;}
function splitItems(text:string){const body=text.replace(/^\s*(?:please\s+)?(?:sell|sold|restock|receive|stock\s+up|add|buy)\s+/i,'').trim();return body.split(/\s*,\s*|\s+and\s+/i).map(x=>x.trim()).filter(Boolean);}
function parseItems(store:StoreData,text:string){const items:FlowLineItem[]=[];for(const part of splitItems(text)){const q=extractQty(part);const phrase=cleanProductPhrase(part).replace(/^\d+(?:\.\d+)?\s+(?:x\s*)?/i,'').trim();const match=resolveProduct(store,phrase);if(match&&match.score>=.76)items.push({product:match,quantity:q});}return items;}
function nav(text:string):TabId|undefined{const q=norm(text);if(!/^(open|go to|take me to|navigate to|switch to|show me)\b/.test(q))return undefined;const pairs:[string,TabId][]=[['dashboard','dashboard'],['home','dashboard'],['inventory','inventory'],['stock','inventory'],['products','inventory'],['sales','sales'],['sell','sales'],['history','history'],['expenses','expenses'],['settings','settings'],['orders','orders'],['customers','customers'],['suppliers','suppliers'],['goals','goals'],['staff','staff'],['cash drawer','cash-drawer'],['wishlist','wishlist']];return pairs.find(([w])=>q.includes(w))?.[1];}

export function understand(store:StoreData,raw:string,lastProduct?:Product|null,lastIntent?:OperatingIntent):OperatingPlan{
 const text=raw.trim(),q=norm(text);if(!q)return{intent:'unknown',confidence:0,items:[],reason:'empty input'};
 const tab=nav(text);if(tab)return{intent:'navigation',confidence:.99,items:[],tab,reason:'explicit navigation'};
 if(/^(undo|undo that|reverse that|cancel the last (sale|action)|take that back)$/i.test(q))return{intent:'undo',confidence:1,items:[],reason:'undo command'};
 if(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q))return{intent:'store_overview',confidence:.98,items:[],reason:'greeting'};
 if(/\b(?:dark|light|system)\s+(?:theme|mode)\b|\b(?:turn|switch)\s+(?:on|off)\s+(?:voice|sound|notifications?)\b/.test(q))return{intent:'settings',confidence:.98,items:[],reason:'setting command'};
 if(/\b(?:how'?s|how is|tell me about|overview)\s+(?:my\s+)?(?:store|business|shop)\b|\bmy store\b.*\b(?:doing|performance|health)\b/.test(q))return{intent:'store_overview',confidence:.99,items:[],reason:'store question'};
 if(/\b(?:why|what caused|what is causing|reason)\b/.test(q))return{intent:'why',confidence:.97,items:[],reason:'reasoning question'};
 if(/\b(?:what should i|what do i need to|what needs to|what can i do|what would you recommend|how can i improve|what else should i)\b/.test(q))return{intent:'recommendations',confidence:.97,items:[],reason:'recommendation question'};
 if(/\b(?:what should i|what do i need to|which items should i|what needs to)\s+restock\b|\b(?:restock|buy)\b.*\b(?:recommend|suggest|need|list)\b/.test(q))return{intent:'inventory',confidence:.98,items:[],reason:'restock recommendation'};
 if(/\b(?:low stock|running low|out of stock|sold out|inventory value|what is low|what's low)\b/.test(q))return{intent:'inventory',confidence:.98,items:[],reason:'inventory query'};
 if(/\b(?:best sellers?|top sellers?|what sells best)\b/.test(q))return{intent:'best_sellers',confidence:.98,items:[],reason:'best sellers query'};
 if(/\b(?:not selling|slow moving|dead stock|no sales)\b/.test(q))return{intent:'slow_products',confidence:.98,items:[],reason:'slow stock query'};
 if(/\b(?:profit|profitability|margin)\b/.test(q)){const p=resolveProduct(store,cleanProductPhrase(text));return{intent:'profit',confidence:p?.score||.94,items:[],product:p||undefined,reason:'profit query'};}
 if(/\b(?:revenue|sales|sold|selling)\b/.test(q)&&/\b(?:show|how|what|why|today|week|month|last|recent|performance)\b/.test(q)){const p=resolveProduct(store,cleanProductPhrase(text));return{intent:'sales',confidence:p?.score||.92,items:[],product:p||undefined,reason:'sales query'};}
 if(/\b(?:pricing|prices?|underpriced|overpriced|markup)\b/.test(q)&&!/\b(?:discount|off)\b/.test(q)){const p=resolveProduct(store,cleanProductPhrase(text));return{intent:'pricing',confidence:p?.score||.92,items:[],product:p||undefined,reason:'pricing query'};}
 if(/\b(?:customer|customers|buyers?|debt|debts|credit|payments?)\b/.test(q))return{intent:'customers',confidence:.93,items:[],reason:'customer query'};
 if(/\b(?:expense|expenses|spending|costs)\b/.test(q))return{intent:'expenses',confidence:.93,items:[],reason:'expense query'};
 const action=/^(?:please\s+)?(?:sell|sold|record\s+(?:a\s+)?sale)\b/i.test(text)?'sell':/^(?:please\s+)?(?:restock|receive|stock\s+up|add|increase|buy)\b/i.test(text)?'restock':null;
 if(action){const items=parseItems(store,text);return{intent:action,confidence:items.length?Math.min(.99,.82+items.length*.05):.55,items,product:items[0]?.product,quantity:items[0]?.quantity,reason:items.length>1?'batch operation':'single operation'};}
 if(/^(?:and|also|what about)\b/i.test(text)){const phrase=text.replace(/^(?:and|also|what about)\s*/i,'').trim();const match=resolveProduct(store,phrase.replace(/^\d+(?:\.\d+)?\s*/,'').trim());const qty=extractQty(phrase);if(match)return{intent:lastIntent==='restock'?'restock':lastIntent==='sell'?'sell':'product_lookup',confidence:.92,items:lastIntent==='restock'||lastIntent==='sell'?[{product:match,quantity:qty}]:[],product:match,quantity:qty,reason:'context follow-up'};if(lastProduct)return{intent:lastIntent==='restock'?'restock':lastIntent==='sell'?'sell':'product_lookup',confidence:.82,items:lastIntent==='restock'||lastIntent==='sell'?[{product:{product:lastProduct,score:1,matchedBy:'exact'},quantity:qty}]:[],product:{product:lastProduct,score:1,matchedBy:'exact'},quantity:qty,reason:'context follow-up'};}
 const direct=resolveProduct(store,text);if(direct&&direct.score>=.76)return{intent:'product_lookup',confidence:direct.score,items:[],product:direct,reason:'product match'};
 if(/\b(?:what can you do|help|commands?)\b/.test(q))return{intent:'help',confidence:.9,items:[],reason:'help'};
 return{intent:'help',confidence:.6,items:[],reason:'no safe match'};
}

function recent(store:StoreData,days:number){const cut=Date.now()-days*86400000;return(store.sales||[]).filter(s=>new Date(s.date).getTime()>=cut);}
function money(n:number){return`₦${Math.round(n||0).toLocaleString()}`;}
export function storeAnalysis(store:StoreData){
 const products=(store.products||[]).filter(p=>!p.discontinued),s7=recent(store,7),s30=recent(store,30),threshold=store.managerSettings?.criticalStockThreshold??5;const units=new Map<string,number>(),rev=new Map<string,number>();
 for(const s of s30){units.set(s.productId,(units.get(s.productId)||0)+s.quantity);rev.set(s.productId,(rev.get(s.productId)||0)+s.total);}
 const out=products.filter(p=>!p.isService&&p.quantity<=0),low=products.filter(p=>!p.isService&&p.quantity>0&&p.quantity<=threshold),dead=products.filter(p=>!p.isService&&p.quantity>0&&!units.get(p.id)),underpriced=products.filter(p=>p.costPrice>0&&((p.sellingPrice-p.costPrice)/p.sellingPrice)<.12);
 const top=[...units.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,u])=>({product:products.find(p=>p.id===id)!,units:u,revenue:rev.get(id)||0})).filter(x=>x.product);
 const revenue7=s7.reduce((a,s)=>a+s.total,0),profit7=s7.reduce((a,s)=>a+s.profit,0),revenue30=s30.reduce((a,s)=>a+s.total,0),profit30=s30.reduce((a,s)=>a+s.profit,0);const expenses30=(store.expenses||[]).filter(e=>new Date(e.date).getTime()>=Date.now()-30*86400000).reduce((a,e)=>a+e.amount,0);const debt=(store.pendingPayments||[]).reduce((a,p)=>a+(p.balance||0),0);const stockValue=products.reduce((a,p)=>a+p.quantity*p.costPrice,0);
 const avgDaily30=revenue30/30;const avgDaily7=revenue7/7;const salesChange=avgDaily30?Math.round((avgDaily7-avgDaily30)/avgDaily30*100):0;
 return{products,out,low,dead,underpriced,top,revenue7,profit7,revenue30,profit30,expenses30,debt,stockValue,threshold,salesChange,avgDaily30};
}

export function responseFor(store:StoreData,plan:OperatingPlan){const a=storeAnalysis(store),product=plan.product?.product;
 switch(plan.intent){
 case 'store_overview':{const health=Math.max(0,Math.min(100,Math.round(72+(a.revenue7>0?8:-8)-a.out.length*5-a.underpriced.length*2-a.dead.length)));return`Your store is at about **${health}/100**.\n\nRevenue (7 days): **${money(a.revenue7)}**\nProfit (7 days): **${money(a.profit7)}**\nInventory value: **${money(a.stockValue)}**\n${a.low.length+a.out.length?`⚠️ **${a.low.length+a.out.length} products** need restocking.`:'✅ Inventory looks stable.'}\n${a.salesChange>0?`📈 Sales pace is about **${a.salesChange}% higher** than your 30-day pace.`:a.salesChange<0?`📉 Sales pace is about **${Math.abs(a.salesChange)}% lower** than your 30-day pace.`:'Sales pace is stable.'}\n\n**Priority:** ${a.out.length?`restock ${a.out[0].name}`:a.low.length?`restock ${a.low[0].name}`:a.underpriced.length?`review ${a.underpriced[0].name}'s price`:'keep monitoring sales and stock'}.`;}
 case 'inventory':{const list=[...a.out,...a.low].slice(0,8);return list.length?`Products needing stock attention:\n${list.map((p,i)=>`${i+1}. **${p.name}** — ${p.quantity} left`).join('\n')}\n\n${a.out.length?`🔴 ${a.out.length} out of stock.`:''}`:'Your active products are not currently below the low-stock threshold.';}
 case 'best_sellers':return a.top.length?`Best sellers over the last 30 days:\n${a.top.map((x,i)=>`${i+1}. **${x.product.name}** — ${x.units} units / ${money(x.revenue)}`).join('\n')}`:'I do not have enough sales history yet.';
 case 'slow_products':return a.dead.length?`These products have stock but no recorded sale in 30 days:\n${a.dead.slice(0,8).map(p=>`• **${p.name}** — ${p.quantity} left`).join('\n')}\n\nI would pause new buying until they move.`:'Nothing is completely idle right now.';
 case 'sales':return product?`${product.name} sold **${(a.top.find(x=>x.product.id===product.id)?.units||0)} units** in the last 30 days.`:`Last 7 days: **${money(a.revenue7)} revenue** and **${money(a.profit7)} profit**. Last 30 days: **${money(a.revenue30)} revenue**.`;
 case 'profit':return product?`**${product.name}** sells for ${money(product.sellingPrice)} and costs ${money(product.costPrice)}. Gross profit is **${money(product.sellingPrice-product.costPrice)}** per unit (${product.sellingPrice?Math.round((product.sellingPrice-product.costPrice)/product.sellingPrice*100):0}% margin).`:`Last 7 days gross profit: **${money(a.profit7)}**.`;
 case 'pricing':return product?`**${product.name}** sells for ${money(product.sellingPrice)} with cost ${money(product.costPrice)}. Gross margin: **${product.sellingPrice?Math.round((product.sellingPrice-product.costPrice)/product.sellingPrice*100):0}%**.`:a.underpriced.length?`I found **${a.underpriced.length} thin-margin products**:\n${a.underpriced.slice(0,6).map(p=>`• ${p.name} — ${money(p.sellingPrice)} sell / ${money(p.costPrice)} cost`).join('\n')}`:'I do not see an obvious thin-margin pricing problem.';
 case 'customers':return`You have **${store.customers?.length||0} customers** and about **${money(a.debt)}** in outstanding balances.`;
 case 'expenses':return`Expenses in the last 30 days: **${money(a.expenses30)}**.`;
 case 'why':return whyAnalysis(a);
 case 'recommendations':
 case 'improvement':return recommendations(a);
 case 'product_lookup':return product?`**${product.name}**\nStock: ${product.quantity}\nSelling: ${money(product.sellingPrice)}\nCost: ${money(product.costPrice)}\nGross profit: ${money(product.sellingPrice-product.costPrice)} per unit.`:'Tell me the product name and I will look it up.';
 case 'help':return`I can operate your store locally. Try:\n• **Sell 2 Indomie**\n• **Sell 2 Indomie, 3 Milo and 1 Peak**\n• **Add 5 Milo, 3 Peak Milk and 10 Indomie**\n• **Undo that**\n• **How is my store?**\n• **What's low?**\n• **Show my best sellers**\n• **What's not selling?**\n• **Why are sales down?**\n• **What should I fix?**\n• **How much profit am I making?**`;
 default:return'I can operate sales, stock and store analysis locally. Tell me what you want done.';
 }
}

function whyAnalysis(a:ReturnType<typeof storeAnalysis>){
 const reasons:string[]=[];
 if(a.salesChange<0) reasons.push(`Sales pace is **${Math.abs(a.salesChange)}% lower** than your 30-day pace.`);
 if(a.out.length) reasons.push(`**${a.out.length} products are out of stock**, which can directly block sales.`);
 if(a.low.length) reasons.push(`**${a.low.length} more products are running low**, increasing the chance of missed sales.`);
 if(a.underpriced.length) reasons.push(`**${a.underpriced.length} products have margins below 12%**, so revenue may not be turning into enough profit.`);
 if(a.expenses30>a.profit30*0.5&&a.expenses30>0) reasons.push(`Expenses are **${money(a.expenses30)}** in the last 30 days and are consuming a large share of gross profit.`);
 if(!reasons.length) return`I don't see a strong problem signal yet. Sales, stock and margins look reasonably stable from the data available.`;
 return`I found ${reasons.length} likely reason${reasons.length===1?'':'s'}:\n\n${reasons.slice(0,5).map((r,i)=>`${i+1}. ${r}`).join('\n')}`;
}

function recommendations(a:ReturnType<typeof storeAnalysis>){
 const items:string[]=[];
 a.out.slice(0,3).forEach(p=>items.push(`Restock **${p.name}** — it is out of stock.`));
 a.low.slice(0,2).forEach(p=>items.push(`Restock **${p.name}** — only ${p.quantity} left.`));
 a.underpriced.slice(0,2).forEach(p=>items.push(`Review **${p.name}** — margin is only ${p.sellingPrice?Math.round((p.sellingPrice-p.costPrice)/p.sellingPrice*100):0}%.`));
 a.dead.slice(0,2).forEach(p=>items.push(`Reduce buying **${p.name}** — ${p.quantity} units have not sold in 30 days.`));
 if(a.debt>0)items.push(`Collect outstanding customer balances — about **${money(a.debt)}** is due.`);
 if(a.expenses30>a.profit30*0.5&&a.expenses30>0)items.push(`Review expenses — **${money(a.expenses30)}** recorded in the last 30 days.`);
 if(!items.length)return`Your store does not show a major operational problem from the data I can see. Keep monitoring stock, margins and sales.`;
 return`Your priorities:\n\n${items.slice(0,6).map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n**My first recommendation:** ${items[0]}`;
}

export function aliasSuggestion(store:StoreData,query:string){const match=resolveProduct(store,query);if(!match||match.score>=.9)return null;return`I think you mean **${match.product.name}**. Is that right?`;}

export function flowBrainSnapshot(store:StoreData){
 const memory=loadBrainMemory(store);const analysis=storeAnalysis(store);
 return { memory, analysis, priorities: recommendations(analysis) };
}
