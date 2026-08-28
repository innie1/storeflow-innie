import type { Plugin } from 'vite';

const SETTINGS = '/src/components/Settings.tsx';

function patchFloatingFlowSetting(source: string): string {
  let code = source;
  const anchor = `            <ToggleRow label="Voice Notes" checked={mgr.voiceFeatures} onChange={v => updateMgr({ voiceFeatures: v })} />`;
  if (!code.includes('floatingFlowShortcutEnabled')) {
    if (!code.includes(anchor)) throw new Error('[floating-flow-setting] Flow tools anchor missing');
    const toggle = `            <ToggleRow
              label="Floating Flow Shortcut"
              description="Show the floating Flow message button. Tap to message Flow or hold for 3 seconds to speak."
              checked={(mgr as any).floatingFlowShortcutEnabled !== false}
              onChange={v => updateMgr({ floatingFlowShortcutEnabled: v } as any)}
            />\n`;
    code = code.replace(anchor, toggle + anchor);
  }
  return code;
}

export default function floatingFlowSettingPlugin(): Plugin {
  return {
    name: 'storeflow-floating-flow-setting',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.split('?')[0].replace(/\\/g, '/');
      if (normalized.endsWith(SETTINGS)) return { code: patchFloatingFlowSetting(code), map: null };
      return null;
    },
  };
}

export { patchFloatingFlowSetting };
