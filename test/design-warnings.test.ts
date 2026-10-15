/**
 * An AI agent acts on the first thing it reads. When a config write leaves Accept all more
 * prominent than Reject all, the tool result opens with that, in plain words, plus the reject
 * style that would fix it — before the JSON.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerTools, type ToolServer } from '../src/tools.js';
import { designWarningText } from '../src/design-warnings.js';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

const FINDING = {
  code: 'saturation_gap',
  severity: 'warning',
  layer: 'banner',
  accept: { label: 'Accept all', element: 'button', background: '#22c55e', color: '#052e12', borderColor: '#22c55e', borderWidth: 1, fontSize: 14, fontWeight: 600, width: 112, height: 42 },
  reject: { label: 'Reject all', element: 'button', background: '#6b4f2a', color: '#ffffff' },
  metric: { name: 'chroma', accept: 0.19, reject: 0.07, value: 0.12, threshold: 0.08 },
  detail: 'Accept is bright and saturated (#22c55e) while Reject is muted (#6b4f2a), which pulls the eye to Accept.',
  fix: 'Use the same colour for both buttons, or two colours of equal saturation and weight.',
  where: { view: 'bar', theme: 'light', breakpoint: 'desktop' },
};
const NOTICE = { ...FINDING, code: 'confirmshaming', severity: 'notice', detail: 'The Reject label reads as confirmshaming.', fix: 'Use neutral wording such as "Reject all".' };

function setup(sites: Record<string, unknown>) {
  const tools = new Map<string, Handler>();
  const server: ToolServer = { registerTool: (name, _c, h) => void tools.set(name, h as unknown as Handler) };
  registerTools(server, { sites } as never);
  return tools;
}

describe('config writes lead with design warnings', () => {
  it('patch_site_config: the warning, why it matters, and the fix come before the JSON', async () => {
    const tools = setup({ patchConfig: vi.fn(async () => ({ cbid: 'a', designWarnings: [FINDING] })) });
    const r = await tools.get('patch_site_config')!({ cbid: 'a', config: {} });
    const text = r.content[0]!.text;
    expect(text.startsWith('Design warning:')).toBe(true);
    expect(text).toMatch(/Accept button is more prominent than Reject/);
    expect(text).toMatch(/Regulators .* dark pattern/);
    expect(text).toMatch(/Make both buttons the same style/);
    expect(text).toContain(FINDING.detail);
    expect(text).toMatch(/Suggested fix: style Reject all .*background #22c55e.*text #052e12.*112×42px/);
    expect(text.indexOf('Design warning')).toBeLessThan(text.indexOf('{'));
    expect(JSON.parse(text.slice(text.indexOf('\n{') + 1))).toMatchObject({ cbid: 'a' });
  });

  it('update_site_config and preview_site_config do the same', async () => {
    const tools = setup({
      putConfig: vi.fn(async () => ({ cbid: 'a', designWarnings: [FINDING] })),
      dryRunConfig: vi.fn(async () => ({ dryRun: true, config: {}, diff: [], designWarnings: [FINDING] })),
    });
    for (const name of ['update_site_config', 'preview_site_config']) {
      const r = await tools.get(name)!({ cbid: 'a', config: {} });
      expect(r.content[0]!.text.startsWith('Design warning:'), name).toBe(true);
    }
  });

  it('a fair config is answered with plain JSON', async () => {
    const tools = setup({ patchConfig: vi.fn(async () => ({ cbid: 'a', designWarnings: [] })) });
    const r = await tools.get('patch_site_config')!({ cbid: 'a', config: {} });
    expect(JSON.parse(r.content[0]!.text)).toEqual({ cbid: 'a', designWarnings: [] });
  });

  it('notices are worded as notices', () => {
    const text = designWarningText([NOTICE] as never);
    expect(text.startsWith('Design notice:')).toBe(true);
    expect(text).not.toMatch(/^Design warning/m);
  });
});

describe('lint_banner_config', () => {
  it('lints without saving, passing replace through', async () => {
    const lintConfig = vi.fn(async () => ({ mode: 'replaced', designWarnings: [FINDING], score: 80, suggestedReject: [{ layer: 'banner', background: '#22c55e', color: '#052e12' }] }));
    const tools = setup({ lintConfig });
    const r = await tools.get('lint_banner_config')!({ cbid: 'a', config: { v: 2 }, replace: true });
    expect(lintConfig).toHaveBeenCalledWith('a', { v: 2 }, { replace: true });
    const text = r.content[0]!.text;
    expect(text.startsWith('Design warning:')).toBe(true);
    expect(text).toMatch(/Suggested fix: style Reject all .*background #22c55e/);
  });

  it('says so plainly when the buttons are fair', async () => {
    const tools = setup({ lintConfig: vi.fn(async () => ({ mode: 'merged', designWarnings: [], score: 100, suggestedReject: [] })) });
    const r = await tools.get('lint_banner_config')!({ cbid: 'a', config: {} });
    expect(r.content[0]!.text.startsWith('No design warnings: Accept all and Reject all have equal weight')).toBe(true);
  });
});

describe('scan status', () => {
  it('a scan that measured an unfair live banner leads with it too', async () => {
    const tools = setup({ scanStatus: vi.fn(async () => ({ status: 'idle', lastScannedAt: 1, buttonParity: { url: 'https://a.com/', bannerFound: true, cmp: 'other', acceptFound: true, rejectFound: true, score: 80, designWarnings: [FINDING] } })) });
    const name = [...tools.keys()].find((n) => n === 'get_scan_status' || n === 'scan_status')!;
    const r = await tools.get(name)!({ cbid: 'a' });
    expect(r.content[0]!.text.startsWith('Design warning:')).toBe(true);
  });
});

describe('the header says what actually happened (review I8)', () => {
  const SAVED = /The config was saved as sent/;
  it('a write says it was saved', async () => {
    const tools = setup({ patchConfig: vi.fn(async () => ({ cbid: 'a', designWarnings: [FINDING] })) });
    const text = (await tools.get('patch_site_config')!({ cbid: 'a', config: {} })).content[0]!.text;
    expect(text).toMatch(SAVED);
  });
  it('a preview says nothing was saved', async () => {
    const tools = setup({ dryRunConfig: vi.fn(async () => ({ dryRun: true, config: {}, diff: [], designWarnings: [FINDING] })) });
    const text = (await tools.get('preview_site_config')!({ cbid: 'a', config: {} })).content[0]!.text;
    expect(text).not.toMatch(SAVED);
    expect(text).toMatch(/Nothing was saved: this is a preview/);
  });
  it('a lint says nothing was saved', async () => {
    const tools = setup({ lintConfig: vi.fn(async () => ({ mode: 'merged', designWarnings: [FINDING], score: 80, suggestedReject: [] })) });
    const text = (await tools.get('lint_banner_config')!({ cbid: 'a', config: {} })).content[0]!.text;
    expect(text).not.toMatch(SAVED);
    expect(text).toMatch(/Nothing was saved: this is a lint/);
  });
  it('a read says nothing was changed', async () => {
    const tools = setup({ getConfig: vi.fn(async () => ({ cbid: 'a', designWarnings: [FINDING] })) });
    const text = (await tools.get('get_site_config')!({ cbid: 'a' })).content[0]!.text;
    expect(text).not.toMatch(SAVED);
    expect(text).toMatch(/as it is stored now; nothing was changed/);
  });
  it('a scan says it measured the live site', async () => {
    const tools = setup({ scanStatus: vi.fn(async () => ({ status: 'idle', lastScannedAt: 1, buttonParity: { url: 'https://a.com/', bannerFound: true, cmp: 'other', acceptFound: true, rejectFound: true, score: 80, designWarnings: [FINDING] } })) });
    const text = (await tools.get('get_scan_status')!({ cbid: 'a' })).content[0]!.text;
    expect(text).not.toMatch(SAVED);
    expect(text).toMatch(/measured on the live site/);
  });
  it('a banner design write says it was saved; a read of one does not', async () => {
    const tools = setup({});
    expect(tools.has('create_banner') && tools.has('get_banner')).toBe(true);
    expect(designWarningText([FINDING] as never, undefined, 'saved')).toMatch(SAVED);
    expect(designWarningText([FINDING] as never, undefined, 'read')).not.toMatch(SAVED);
  });
});
