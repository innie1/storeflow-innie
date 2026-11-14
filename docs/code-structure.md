# How the code is organised

## Big screens: an entry file and a folder of parts

A screen that grew past a few hundred lines keeps its entry file where it
always was, so nothing that imports it changes. Its pieces go in a folder
beside it, named after it in kebab case:

| Entry | Parts |
| --- | --- |
| `src/pages/Index.tsx` | `src/pages/index/` |
| `src/components/Settings.tsx` | `src/components/settings/` |
| `src/components/Inventory.tsx` | `src/components/inventory/` |
| `src/components/Manager.tsx` | `src/components/manager/` |
| `src/components/StoreAccess.tsx` | `src/components/store-access/` |
| `src/components/Mascot.tsx` | `src/components/mascot/` |
| `src/components/Customers.tsx` | `src/components/customers/` |

Inside a folder:

- **`use<Screen>.tsx`** holds the screen's state, effects and handlers and
  returns them as one object. Its type is exported as `<Screen>State`.
- **One file per part**: a view, tab, step, sheet or modal. A part is a component
  `({ s }: { s: <Screen>State })` that takes what it needs from `s` on its
  first line. A part draws, and the hook decides.
- **`model.ts`** (where there is one) holds the screen's types and constants.
- **`ui.tsx`** (where there is one) holds the small building blocks the parts share.

The entry file is short. It calls the hook, then lays the parts out or
chooses between them. For example, `Settings.tsx` is one `if` per view.

### Adding to a screen

- New state or a new handler goes in the hook, added to the object it returns.
- A new view, sheet or modal gets its own file in the folder.
- Something only one part uses stays in that part.

## Big libraries: a folder of topics

A library file that grew too big keeps its path and becomes a list of
`export *` lines, one per topic file in a folder beside it:

- `src/lib/manager-intel.ts` → `src/lib/manager-intel/` (forecast, health,
  stock, advice, notifications, insights, flow-report, repayments and so on)
- `src/lib/store-data.ts` → `src/lib/store-data/` (load-save, products,
  sales, stock, expenses, pending-payments, customers, staff, roi and so on)

Everything still imports from `@/lib/manager-intel` and `@/lib/store-data`.
Inside a folder, topic files import each other directly, such as `./dates` or
`./load-save`. A new function goes in the topic file it belongs to. A new
topic gets a new file and a line in the entry.

## Tests that read source

Some tests check what the code says rather than what it does (see
`src/test/helpers/source.ts`). `readSource('src/components/Settings.tsx')`
returns the entry file followed by every file in its parts folder, in name
order. Moving code into a part therefore does not break a test that looks
for it. A test that checks the order of two things in one file should read
that file by its own path.

## Where the shop's records are kept

The shop's records, the spare copies cloud sync keeps, and the laundry bundle
records are read and written through `shopStorage` (`src/lib/shop-storage.ts`),
never through `localStorage` directly.

- While an entry fits in the browser's small store (about 5 MB for the whole
  app) it stays there, written at once, as it always was.
- The first time the small store has no room for an entry, that entry moves to
  the phone's larger store (IndexedDB) for good. It is read from memory, which
  `main.tsx` fills before the app draws, and each change is written through.

`shopStorage` has `getItem`, `setItem`, `removeItem` and `keys()`. Use `keys()`
rather than looping over `localStorage`, or a shop that has moved is missed.
Small settings (theme, session, lock timer) stay on `localStorage`.
