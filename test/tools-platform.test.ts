import { describe, it, expect, vi } from 'vitest';
import { registerTools, type ToolServer, type ToolResult } from '../src/tools.js';
import type { CookieMunchClient } from '@cookiemunch/sdk';

/** Collects registered tools so we can assert on names, descriptions and handler wiring. */
function fakeServer() {
  const tools = new Map<string, { description: string; handler: (a: Record<string, unknown>) => Promise<ToolResult> }>();
  const server: ToolServer = {
    registerTool(name, config, handler) {
      tools.set(name, { description: config.description, handler });
      return undefined;
    },
  };
  return { server, tools };
}

/** A client stub where every namespace method is a spy returning a marker. */
function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const spy = (method: string) => vi.fn(async (...args: unknown[]) => { calls.push({ method, args }); return { ok: method }; });
  const client = {
    me: spy('me'),
    sites: { list: spy('sites.list'), create: spy('x'), get: spy('x'), delete: spy('x'), getConfig: spy('x'), putConfig: spy('x'), cookies: spy('x'), scan: spy('x'), scanStatus: spy('x'), ab: spy('x'), snippet: spy('x'), verify: spy('x'), brand: spy('x'), getFlow: spy('x'), setFlow: spy('x'), editFlow: spy('x'), policy: spy('x') },
    consent: { stats: spy('x'), log: spy('x'), exportCsv: spy('x'), verifyChain: spy('x'), receipt: spy('x'), eraseSubject: spy('x'), exportSubject: spy('x'), ingest: spy('x') },
    dsar: { list: spy('x'), create: spy('x'), advance: spy('x'), response: spy('x') },
    vendors: { list: spy('x'), create: spy('x') },
    ropa: { list: spy('x'), create: spy('x'), exportCsv: spy('x') },
    brandKits: { list: spy('x'), create: spy('x'), delete: spy('x') },
    preferences: { list: spy('x'), save: spy('x') },
    keys: { list: spy('x'), create: spy('x') },
    members: { list: spy('x') },
    usage: spy('x'),
    banners: { list: spy('x'), create: spy('x'), get: spy('x'), update: spy('x'), delete: spy('x'), assign: spy('x'), publish: spy('x') },
    webhooks: { list: spy('x'), create: spy('x'), delete: spy('x') },
    identity: { resolve: spy('identity.resolve'), link: spy('identity.link'), cluster: spy('identity.cluster') },
    vault: { record: spy('vault.record'), current: spy('vault.current'), permits: spy('vault.permits') },
    profile: { get: spy('profile.get'), setAttributes: spy('profile.setAttributes'), activate: spy('profile.activate') },
    subscriptions: { topics: spy('subs.topics'), setTopics: spy('subs.setTopics'), get: spy('subs.get'), set: spy('subs.set'), unsubscribeAll: spy('subs.unsubscribeAll'), resubscribe: spy('x'), activation: spy('x') },
    assessments: { templates: spy('a.templates'), list: spy('x'), start: spy('a.start'), get: spy('a.get'), answer: spy('a.answer'), autoPopulateFromMap: spy('a.auto'), submit: spy('a.submit'), approve: spy('x'), reject: spy('x') },
    discovery: { ingestMap: spy('x'), getMap: spy('d.getMap'), ropaDrafts: spy('d.ropaDrafts'), evidence: spy('x'), drift: spy('d.drift'), planEnforcement: spy('d.planEnforcement') },
    regulatory: { feed: spy('reg.feed'), upcoming: spy('reg.upcoming') },
    ai: { getPolicy: spy('x'), setPolicy: spy('x'), inspect: spy('ai.inspect'), inventory: spy('ai.inventory'), lineage: spy('ai.lineage'), registerSystem: spy('x'), audit: spy('x') },
    fulfillment: { sla: spy('f.sla'), plan: spy('f.plan'), status: spy('f.status'), pendingTasks: spy('x'), reportTask: spy('x') },
  } as unknown as CookieMunchClient;
  return { client, calls };
}

function setup() {
  const { server, tools } = fakeServer();
  const { client, calls } = fakeClient();
  registerTools(server, client);
  return { tools, calls };
}

const PLATFORM_TOOLS = [
  'resolve_identity', 'link_identity', 'record_consent_decision', 'get_consent_state',
  'get_profile', 'set_profile_attributes', 'activate_profile',
  'get_subscriptions', 'set_subscription', 'global_unsubscribe',
  'list_assessment_templates', 'start_assessment', 'get_assessment',
  'answer_assessment_question', 'autopopulate_assessment_from_data_map', 'submit_assessment',
  'get_data_map', 'get_data_drift', 'get_ropa_drafts',
  'get_dsr_sla', 'plan_dsr_fulfillment', 'get_dsr_fulfillment_status',
  'inspect_ai_prompt', 'get_ai_inventory', 'get_ai_lineage',
];

describe('platform MCP tools', () => {
  it('registers every platform tool alongside the existing ones', () => {
    const { tools } = setup();
    for (const name of PLATFORM_TOOLS) expect(tools.has(name)).toBe(true);
    expect(tools.has('whoami')).toBe(true); // core tools still registered
  });

  it('registers no duplicate tool names', () => {
    const { tools } = setup();
    expect(tools.size).toBeGreaterThanOrEqual(PLATFORM_TOOLS.length + 1);
  });

  it('every platform tool has a non-trivial description', () => {
    const { tools } = setup();
    for (const name of PLATFORM_TOOLS) {
      expect(tools.get(name)!.description.length).toBeGreaterThan(40);
    }
  });

  it('warns that link_identity is a durable merge, not a lookup', () => {
    const { tools } = setup();
    expect(tools.get('link_identity')!.description).toMatch(/merge|combined/i);
  });

  it('says activate_profile is consent-gated, so an agent knows it is safe to call', () => {
    const { tools } = setup();
    expect(tools.get('activate_profile')!.description).toMatch(/consent-gated/i);
  });

  it('says autopopulate never overwrites a human answer', () => {
    const { tools } = setup();
    expect(tools.get('autopopulate_assessment_from_data_map')!.description).toMatch(/never overwritten/i);
  });

  it('routes a call through to the right client method', async () => {
    const { tools, calls } = setup();
    await tools.get('resolve_identity')!.handler({ identifiers: [{ space: 'cookie', value: 'a' }] });
    expect(calls.at(-1)!.method).toBe('identity.resolve');

    await tools.get('activate_profile')!.handler({ identifiers: [{ space: 'cookie', value: 'a' }], purpose: 'marketing' });
    expect(calls.at(-1)).toMatchObject({ method: 'profile.activate' });

    await tools.get('inspect_ai_prompt')!.handler({ prompt: 'hi', purpose: 'support' });
    expect(calls.at(-1)!.method).toBe('ai.inspect');
  });

  it('passes subscription arguments through positionally', async () => {
    const { tools, calls } = setup();
    await tools.get('set_subscription')!.handler({ subjectId: 's1', topic: 'promos', channel: 'email', optedIn: true });
    expect(calls.at(-1)).toMatchObject({ method: 'subs.set', args: ['s1', 'promos', 'email', true] });
  });

  it('wraps a client error into an isError result rather than throwing', async () => {
    const { server, tools } = fakeServer();
    const { client } = fakeClient();
    (client.identity.resolve as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    registerTools(server, client);
    const res = await tools.get('resolve_identity')!.handler({ identifiers: [] });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/boom/);
  });
});

describe('warehouse enforcement + regulatory tools', () => {
  it('plans enforcement through the discovery namespace', async () => {
    const { server, tools } = fakeServer();
    const { client, calls } = fakeClient();
    registerTools(server, client as unknown as CookieMunchClient);
    await tools.get('plan_warehouse_enforcement')!.handler({
      dialect: 'snowflake',
      rules: [{ id: 'r', action: 'mask', minSensitivity: 'sensitive' }],
    });
    expect(calls.find((c) => c.method === 'd.planEnforcement')?.args[0]).toBe('snowflake');
  });

  it('says in its description that nothing is applied', () => {
    const { server, tools } = fakeServer();
    const { client } = fakeClient();
    registerTools(server, client as unknown as CookieMunchClient);
    expect(tools.get('plan_warehouse_enforcement')!.description.toLowerCase()).toContain('plan');
  });

  it('reads the regulatory feed, optionally filtered', async () => {
    const { server, tools } = fakeServer();
    const { client, calls } = fakeClient();
    registerTools(server, client as unknown as CookieMunchClient);
    await tools.get('get_regulatory_feed')!.handler({ jurisdictions: ['US-CA'] });
    expect(calls.find((c) => c.method === 'reg.feed')?.args[0]).toEqual(['US-CA']);
  });

  it('reads upcoming regulations with a horizon', async () => {
    const { server, tools } = fakeServer();
    const { client, calls } = fakeClient();
    registerTools(server, client as unknown as CookieMunchClient);
    await tools.get('get_upcoming_regulations')!.handler({ days: 90 });
    expect(calls.find((c) => c.method === 'reg.upcoming')?.args[0]).toBe(90);
  });

  it('reads and replaces the subscription topic catalog', async () => {
    const { server, tools } = fakeServer();
    const { client, calls } = fakeClient();
    registerTools(server, client as unknown as CookieMunchClient);
    await tools.get('get_subscription_topics')!.handler({});
    const topics = [{ code: 'product', name: 'Product news', channels: ['email'] }];
    await tools.get('set_subscription_topics')!.handler({ topics });
    expect(calls.find((c) => c.method === 'subs.topics')).toBeTruthy();
    expect(calls.find((c) => c.method === 'subs.setTopics')?.args[0]).toEqual(topics);
  });
});
