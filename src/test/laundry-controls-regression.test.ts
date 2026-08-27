import { beforeEach, describe, expect, it } from 'vitest';
import businessIsolationPlugin from '../../vite-plugin-business-isolation';
import {
  LAUNDRY_INTAKE_OPEN_SIGNAL,
  LAUNDRY_INTAKE_OPEN_STORAGE,
  requestLaundryWorkspace,
} from '@/lib/laundry-workspace';

describe('laundry control regressions', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('opens Record Laundry even when the record workspace is already mounted', () => {
    let opens = 0;
    const listener = () => { opens += 1; };
    window.addEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, listener);

    requestLaundryWorkspace('record');
    requestLaundryWorkspace('record');

    expect(window.sessionStorage.getItem(LAUNDRY_INTAKE_OPEN_STORAGE)).toBe('1');
    expect(opens).toBe(2);
    window.removeEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, listener);
  });

  it('adds show/hide controls and stronger custom clothing handling to laundry pricing', () => {
    const plugin = businessIsolationPlugin();
    const fixture = `import { useState } from 'react';\nimport { Check, Pencil, Plus, Power, Shirt, Trash2, X } from 'lucide-react';\nfunction x() {\n  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);\n  const [customGarment, setCustomGarment] = useState('');\n  const config: any = { garmentTypes: [] };\n  const allServices: any[] = [];\n  const store: any = {};\n  const addGarment = () => {\n    const clean = customGarment.trim();\n    if (!clean) return;\n    let next = addLaundryGarmentType(store, clean);\n    for (const service of allServices) {\n      next = setLaundryGarmentPrice(next, String(service.id), clean, Math.max(0, Number(service.sellingPrice) || 0));\n    }\n    persist(next);\n    setCustomGarment('');\n    showToast(\`${'${clean}'} added\`);\n  };\n\n  const openNewService = () => {};\n  return selectedPricing === 'per_piece' ? (\n                <div className="divide-y divide-border/70">\n                  {config.garmentTypes.map(garment => {\n                    return (\n                      <div key={garment} className="p-3.5 flex items-center gap-3">{garment}</div>\n                    );\n                  })}\n                </div>\n              ) : (\n                <div className="p-4 text-xs text-muted-foreground">\n                  For KG, load or fixed-price services, edit the service.\n                </div>\n              );\n}`;
    const transform = plugin.transform as any;
    const code = transform(fixture, '/repo/src/components/laundry/LaundryPricingSetup.tsx')?.code || fixture;

    expect(code).toContain('showGarmentPrices');
    expect(code).toContain("'Hide all'");
    expect(code).toContain("'Show all'");
    expect(code).toContain('added to every laundry treatment');
    expect(code).toContain('already in the price list');
    expect(code).toContain('laundry-garment-');
  });

  it('keeps the cloud business type aligned with the actual store type', () => {
    const plugin = businessIsolationPlugin();
    const fixture = `const payload = { business_type: store.category || 'retail', data: store };`;
    const transform = plugin.transform as any;
    const code = transform(fixture, '/repo/src/lib/store-data.ts')?.code || fixture;
    expect(code).toContain("business_type: store.storeType || store.category || 'retail'");
  });

  it('mounts one floating Flow Shirt entry point in the main app shell', () => {
    const plugin = businessIsolationPlugin();
    const fixture = `import { StoreData, TabId, Product } from '@/types/store';\nfunction Index() {\n  const store: any = {}; const setStore = () => {}; const handleNavigate = () => {}; const currentUser = {}; const tab = 'dashboard';\n  return <>\n        <main className={\`flex-1 ${'${store.uiMode === \'simple\' && tab === \'dashboard\' ? \'px-3 pt-1 pb-16 md:pt-2 space-y-3\' : \'p-4 md:p-6 pb-20 md:pb-6 space-y-6\'}'} w-full max-w-5xl lg:max-w-6xl mx-auto\`}>x</main>\n  </>;\n}`;
    const transform = plugin.transform as any;
    const code = transform(fixture, '/repo/src/pages/Index.tsx')?.code || fixture;
    expect(code).toContain("import FlowShirtFab from '@/components/FlowShirtFab';");
    expect(code).toContain('<FlowShirtFab store={store} onUpdate={setStore} onNavigate={handleNavigate} currentUser={currentUser} />');
  });
});
