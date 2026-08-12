from pathlib import Path

p = Path('src/components/StoreAccess.tsx')
s = p.read_text()

if "@/lib/business-templates" not in s:
    s = s.replace("import { createStore, loadStore, saveStore } from '@/lib/store-data';", "import { createStore, loadStore, saveStore } from '@/lib/store-data';\nimport { applyBusinessTemplate } from '@/lib/business-templates';")

s = s.replace("const businessCategory = (type: string): StoreCategory => type === 'games' ? 'games' : type === 'restaurant' ? 'restaurant' : 'other' as StoreCategory;", "const businessCategory = (type: string): StoreCategory => type === 'games' ? 'games' : type === 'restaurant' ? 'restaurant' : type === 'other' ? 'other' : 'retail';")

cloud_old = """      const store = createStore(
        storeName.trim(),
        category,
        category === 'retail' ? retailType : undefined,
        selectedLogoStyle,
        category === 'retail' ? retailTypeToStoreType(retailType) : (category as StoreType)
      );"""
cloud_new = """      const store = createStore(
        storeName.trim(),
        businessCategory(businessType),
        businessType,
        selectedLogoStyle,
        businessStoreType(businessType)
      );
      const templatedStore = applyBusinessTemplate(store, businessType);"""
s = s.replace(cloud_old, cloud_new)
s = s.replace("      if (store.managerSettings) {", "      if (templatedStore.managerSettings) {")
s = s.replace("        store.managerSettings.multiDeviceSync", "        templatedStore.managerSettings.multiDeviceSync")
s = s.replace("        store.managerSettings.ownerPassword", "        templatedStore.managerSettings.ownerPassword")
s = s.replace("      const storeId = store.storeId || store.accessCode;", "      const storeId = templatedStore.storeId || templatedStore.accessCode;")
s = s.replace("          business_type: category,", "          business_type: businessType,")
s = s.replace("          access_code: store.accessCode,", "          access_code: templatedStore.accessCode,")
s = s.replace("          owner_password: store.managerSettings?.ownerPassword || 'owner',", "          owner_password: templatedStore.managerSettings?.ownerPassword || 'owner',")
s = s.replace("          data: store as any", "          data: templatedStore as any")
s = s.replace("      localStorage.setItem('storeflow_store_' + store.accessCode, JSON.stringify(store));", "      localStorage.setItem('storeflow_store_' + templatedStore.accessCode, JSON.stringify(templatedStore));")
s = s.replace("            storeName: store.storeName,", "            storeName: templatedStore.storeName,")
s = s.replace("            accessCode: store.accessCode,", "            accessCode: templatedStore.accessCode,")
s = s.replace("      onStoreLoaded(store);", "      onStoreLoaded(templatedStore);")

start = 0
while True:
    a = s.find('            <div>\n              <label className="block text-xs text-muted-foreground uppercase font-bold mb-2">Business Category</label>', start)
    if a < 0:
        break
    b = s.find('            <div className="space-y-2">\n              <label className="block text-xs text-muted-foreground uppercase font-bold">What kind of business do you run?</label>', a)
    if b < 0:
        break
    s = s[:a] + s[b:]
    start = b

p.write_text(s)
print('patched', len(s), 'bytes')
