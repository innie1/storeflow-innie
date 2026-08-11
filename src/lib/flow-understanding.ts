import { Product, StoreData } from '@/types/store';
import { addPurchaseOrder } from '@/lib/store-data';
import { buildSmartBuyList, smartBuyListText } from '@/lib/flow-smart-buy-list';
import '@/lib/flow-attachment-ui';

export type FlowTopic = 'theme'|'settings'|'stock'|'sales'|'customers'|'expenses'|'price'|'restock'|'product'|'store'|'unknown';
export type FlowUnderstanding =
  | { kind:'topic'; topic:FlowTopic; reply:string }
  | { kind:'product'; product:Product; score:number }
  | { kind:'product_choices'; query:string; products:Product[] }
  | { kind:'store'; reply:string }
  | { kind:'unknown'; reply:string };

const TOPICS: Array<[FlowTopic, RegExp, string]> = [
 ['theme', /^theme$|^themes$|\btheme\b/, 'What would you like to do with your theme?'],
 ['settings', /^settings?$|\bsettings\b/, 'What would you like to change in Settings?'],
 ['stock', /^stocks?$|^inventory$|\bstock\b/, 'What would you like to know about your stock?'],
 ['sales', /^sales?$|\bsales\b/, 'What would you like to see about your sales?'],
 ['customers', /^customers?$|\bcustomers\b/, 'What would you like to know about your customers?'],
 ['expenses', /^expenses?$|\bexpenses\b/, 'What would you like to know about your expenses?'],
 ['price', /^prices?$|^pricing$|\bprice\b/, "Which product's price do you want to check?"],
 ['restock', /^restock$|^buy list$|\brestock\b/, 'Which products do you want to restock?'],
];

const PENDING_KEY='storeflow_flow_pending_smart_buy_v1';
const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9₦]+/g,' ').trim().replace(/\s+/g,' ');
const tokens=(s:string)=>norm(s).split(' ').filter(Boolean);
function amount(s:string){const m=s.match(/(?:₦|ngn|n)?\s*([\d,]+(?:\.\d+)?)(?:\s*(?:k|thousand))?/i);if(!m)return undefined;const base=Number(m[1].replace(/,/g,''));if(!Number.isFinite(base))return undefined;return /(?:k|thousand)$/i.test(s.trim())?base*1000:base;}
function loadPending(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null') as {storeKey:string;budget?:number}|null;}catch{return null;}}
function savePending(v:{storeKey:string;budget?:number}){try{localStorage.setItem(PENDING_KEY,JSON.stringify(v));}catch{}}
function clearPending(){try{localStorage.removeItem(PENDING_KEY);}catch{}}
function isCreateList(q:string){return /^(?:please\s+)?(?:create|make|build|generate)\s+(?:a\s+)?(?:smart\s+)?(?:buy|shopping|purchase)\s+list\b/.test(q)||/^(?:create|make|build|generate)\s+list\b/.test(q)||/\b(?:create|make|generate)\s+(?:my\s+)?buy\s+list\b/.test(q);}
function isYes(q:string){return /^(yes|yeah|yep|sure|okay|ok|accept|accepted|go ahead|do it|create it|make it|build it)$/i.test(q);}
function isNo(q:string){return /^(no|nope|cancel|not now|leave it|i will choose)$/i.test(q);}

function similarity(a:string,b:string){
 const x=norm(a),y=norm(b); if(!x||!y)return 0; if(x===y)return 1;
 if(x.includes(y)||y.includes(x))return .94;
 const xs=new Set(tokens(x)),ys=new Set(tokens(y));
 const overlap=[...xs].filter(v=>ys.has(v)).length;
 const union=new Set([...xs,...ys]).size||1;
 let prev=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){const cur=[i];for(let j=1;j<=y.length;j++)cur[j]=x[i-1]===y[j-1]?prev[j-1]:Math.min(prev[j-1]+1,prev[j]+1,cur[j-1]+1);prev=cur;}
 return Math.max(overlap/union*.92,(1-prev[y.length]/Math.max(x.length,y.length))*.82);
}

function lowStockReply(store:StoreData){
 const products=(store.products||[]).filter(p=>!p.discontinued&&!p.isService),threshold=store.managerSettings?.criticalStockThreshold??5;
 const out=products.filter(p=>p.quantity<=0),low=products.filter(p=>p.quantity>0&&p.quantity<=threshold),items=[...out,...low];
 if(!items.length)return 'Your stock looks good right now. I do not see any products at or below the low-stock threshold.';
 const lines=items.slice(0,20).map(p=>`• **${p.name}** — ${p.quantity<=0?'Out of stock':`${p.quantity} left`}`);
 return `Here’s what’s low:\n${lines.join('\n')}${items.length>20?`\n• ...and ${items.length-20} more`:''}\n\nLow-stock threshold: **${threshold} units**.`;
}

function isStoreQuestion(q:string){return /^(hows|how s|how is|how are|how's)\s+(my\s+|the\s+)?(store|shop|business)\b/.test(q)||/^(tell me about|give me an overview of|show me|what about)\s+(my\s+|the\s+)?(store|shop|business)\b/.test(q)||/^(is|how)\s+(my\s+)?(store|shop|business)\s+(doing|performing|going)\b/.test(q)||/^(store|shop|business)\s+(health|overview|performance)$/.test(q)||q==='store'||q==='my store'||q==='business'||q==='my business';}
function isLowStockQuestion(q:string){return /^(what is|whats|what s|what's|show me|show|tell me)\s+(my\s+)?(?:items?\s+)?(?:that\s+are\s+)?(?:low|low stock|running low|almost out|nearly out)\b/.test(q)||/^(what|which)\s+(?:products?|items?)\s+(?:that\s+)?(?:are\s+)?(?:low|running low|almost out|nearly out)\b/.test(q)||/^(?:products?|items?)\s+(?:that\s+)?(?:are\s+)?(?:low|running low|almost out|nearly out)\b/.test(q)||/^(low stock|running low|almost out|nearly out|what s low|what's low|whats low|what is low)$/.test(q)||/^(what do i need|what needs)\s+(?:to be\s+)?restocked\b/.test(q)||/^(?:which|what)\s+(?:products?|items?)\s+(?:need|needs)\s+restocking\b/.test(q);}

function smartBuyConversation(store:StoreData,input:string):FlowUnderstanding|null{
 const q=norm(input),storeKey=store.id||store.storeId||store.accessCode||'default',pending=loadPending();
 if(isCreateList(q)){
   const budget=amount(input); savePending({storeKey,budget});
   return {kind:'topic',topic:'product',reply:budget?`Yes. I can build a smart Buy List around **₦${Math.round(budget).toLocaleString()}**.\n\nI’ll use what actually sells, current stock/availability, sales contribution, recent demand, and your repeated restock quantities. I will not select an item just because it is low if it has barely sold or has been sitting for months.\n\n**Do you want me to create the list from what I think you should buy?**\n\nReply **Accept** or **No**.`:'Yes. I can build a smart Buy List from your store data.\n\nI’ll use what actually sells, current stock/availability, sales contribution, recent demand, and your repeated restock quantities. I will not select an item just because it is low if it has barely sold or has been sitting for months.\n\n**Do you want me to create the list from what I think you should buy?**\n\nReply **Accept**, or tell me your budget such as **₦100,000**.'};
 }
 if(!pending||pending.storeKey!==storeKey)return null;
 if(isNo(q)){clearPending();return{kind:'topic',topic:'product',reply:'Okay. I won’t auto-generate anything. You can use the normal Buy List and choose the items yourself.'};}
 const suppliedBudget=amount(input);
 if(suppliedBudget&&!isYes(q)){savePending({storeKey,budget:suppliedBudget});return{kind:'topic',topic:'product',reply:`Got it — I’ll work with **₦${Math.round(suppliedBudget).toLocaleString()}**.\n\nReply **Accept** and I’ll build the list from your real sales, stock, contribution and buying pattern.`};}
 if(isYes(q)){
   const result=buildSmartBuyList(store,pending.budget);
   if(!result.items.length){clearPending();return{kind:'topic',topic:'product',reply:smartBuyListText(result)};}
   const order=addPurchaseOrder(store,{items:result.items.map(i=>({productId:i.productId,name:i.name,qty:i.quantity,costPrice:i.unitCost})),totalCost:result.estimatedCost,status:'draft',source:'auto_fix'});
   clearPending();
   return {kind:'topic',topic:'product',reply:`${smartBuyListText(result)}\n\n**List created in Buy List.**\nCode: **${order.purchaseOrders?.[0]?.importCode||'available in Buy List'}**\n\nReview it before ordering. **↗ Send/share** it from the Buy List when you’re ready.`};
 }
 return null;
}

export function understandFlexible(store:StoreData,input:string):FlowUnderstanding{
 const q=norm(input); if(!q)return{kind:'unknown',reply:'What would you like Flow to help you with?'};
 const smart=smartBuyConversation(store,input); if(smart)return smart;
 if(isStoreQuestion(q))return{kind:'store',reply:'I’ll give you an overview of your business.'};
 if(isLowStockQuestion(q))return{kind:'topic',topic:'stock',reply:lowStockReply(store)};
 for(const [topic,re,reply] of TOPICS)if(re.test(q)&&tokens(q).length<=3)return{kind:'topic',topic,reply};
 const products=store.products||[];
 const scored=products.map(product=>({product,score:Math.max(...[product.name,...(product.voiceAliases||[])].map(name=>similarity(q,name)))})).filter(x=>x.score>=.55).sort((a,b)=>b.score-a.score);
 if(scored.length){const best=scored[0],close=scored.filter(x=>x.score>=Math.max(.55,best.score-.12));if(close.length>1&&best.score<1)return{kind:'product_choices',query:input,products:close.slice(0,8).map(x=>x.product)};return{kind:'product',product:best.product,score:best.score};}
 return{kind:'unknown',reply:'I’m not sure what you mean yet. Try a product name or a topic like Settings, Stock, Sales, or Theme.'};
}
