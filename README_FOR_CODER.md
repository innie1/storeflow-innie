# StoreFlow — Update 016: Order Receipt Grouping + Online vs In-Store Split

## How to apply
```bash
git am 0001-Group-multi-item-orders-into-one-receipt-in-Sales-H.patch
npm install
npm run build
git push
```

## What this does
1. Orders with multiple items now show as ONE receipt in Sales History
   (they were showing as separate rows per product before).
2. Receipts from online orders are labeled "Online Order — N items" with a
   distinct icon, instead of a generic "Sale".
3. New "Where Your Sales Come From" bar at the top of Sales History
   showing the % (and ₦) split between online orders and in-store sales.
