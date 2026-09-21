import { describe, it, expect, vi } from 'vitest';
import { registerTools, type ToolServer } from '../src/tools.js';
import type { CookieMunchClient } from '@cookiemunch/sdk';

interface Registered {
  name: string;
  config: { description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

/** A fake ToolServer that records every registerTool call. */
function fakeServer() {
  const tools: Registered[] = [];
  const server: ToolServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config: config as Registered['config'], handler: handler as Registered['handler'] });
    },
  };
  return { server, tools, byName: (n: string) => tools.find((t) => t.name === n)! };
}

/** A mock SDK client where every method is a spy returning a canned value. */
function mockClient(): CookieMunchClient {
  return {
    me: vi.fn(async () => ({ orgId: 'o1', plan: 'free', keyPrefix: 'fck_abcd' })),
    sites: {
      list: vi.fn(async () => [{ cbid: 'a', orgId: 'o1', domain: 'a.com' }]),
      create: vi.fn(async () => ({ cbid: 'new', orgId: 'o1', domain: 'x.com' })),
      get: vi.fn(async () => ({ cbid: 'a', orgId: 'o1', domain: 'a.com' })),
      delete: vi.fn(async () => undefined),
      getConfig: vi.fn(async () => ({ cbid: 'a' })),
      putConfig: vi.fn(async () => ({ cbid: 'a', banner: {} })),
      cookies: vi.fn(async () => []),
      scan: vi.fn(async () => ({ scanId: 's1', status: 'queued' })),
      scanStatus: vi.fn(async () => ({ scanId: 's1', status: 'complete' })),
      ab: vi.fn(async () => []),
      snippet: vi.fn(async () => ({
        snippet: '<script id="CookieMunch"\n  src="https://cmp.example.com/consent.js"\n  data-cbid="a"\n  data-blockingmode="auto"></script>',
        src: 'https://cmp.example.com/consent.js',
        cbid: 'a',
        blockingMode: 'auto',
      })),
      verify: vi.fn(async () => ({ verified: true, method: 'dns' })),
      brand: vi.fn(async () => ({ suggestion: { highlight: '#ff0000' } })),
      getFlow: vi.fn(async () => ({ v: 2, flow: { views: [] }, categories: {}, lint: [] })),
      editFlow: vi.fn(async () => ({ ok: true, flow: { views: [] } })),
      setFlow: vi.fn(async () => ({ ok: true, flow: { views: [] } })),
    },
    consent: {
      stats: vi.fn(async () => []),
      log: vi.fn(async () => []),
      export: vi.fn(async () => 'csv'),
      receipt: vi.fn(async () => ({ receipt: {} })),
      eraseSubject: vi.fn(async () => ({ erased: 1 })),
      exportSubject: vi.fn(async () => ({ cbid: 'cb', stamp: 'st', records: [], count: 2 })),
    },
    dsar: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ request: { id: 'd1' } as never })),
      advance: vi.fn(async () => ({ request: { id: 'd1', status: 'verifying' } as never })),
    },
    vendors: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ vendor: { id: 'v1' }, risk: { score: 0, band: 'low' } })),
    },
    ropa: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ entry: { id: 'r1' } as never })),
    },
    brandKits: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ kit: { id: 'bk1', orgId: 'o1', name: 'Kit', theme: {}, createdAt: 0 } })),
      delete: vi.fn(async () => undefined),
    },
    preferences: {
      list: vi.fn(async () => []),
      save: vi.fn(async () => ({ record: { subjectId: 'u1', purposes: {} } })),
    },
    members: {
      list: vi.fn(async () => []),
      invite: vi.fn(async () => ({ member: { userId: 'u1', email: 'new@x.com', role: 'member' } })),
      setRole: vi.fn(async () => ({ member: { userId: 'u1', email: 'x@x.com', role: 'admin' } })),
      remove: vi.fn(async () => ({ ok: true })),
    },
    keys: {
      list: vi.fn(async () => []),
      issue: vi.fn(async () => ({ id: 'k1', orgId: 'o1', prefix: 'fck_x', createdAt: 0, secret: 'fck_secret' })),
    },
    usage: vi.fn(async () => ({ orgId: 'o1', plan: 'free', period: { from: 0, to: 0 }, consents: 0, sites: 0 })),
    webhooks: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({
        id: 'w1',
        orgId: 'o1',
        url: 'https://x.com/hook',
        secret: 'whsec_x',
        events: ['consent.created'],
        cbid: null,
        active: true,
        createdAt: 0,
      })),
      delete: vi.fn(async () => undefined),
    },
    banners: {
      list: vi.fn(async () => [{ id: 'b1', name: 'Design 1', updatedAt: 0, assignedCbids: [] }]),
      create: vi.fn(async () => ({ id: 'b1', orgId: 'o1', name: 'Design 1', json: {}, createdAt: 0, updatedAt: 0 })),
      get: vi.fn(async () => ({ id: 'b1', orgId: 'o1', name: 'Design 1', json: {}, createdAt: 0, updatedAt: 0 })),
      update: vi.fn(async () => ({ id: 'b1', orgId: 'o1', name: 'Renamed', json: {}, createdAt: 0, updatedAt: 1 })),
      delete: vi.fn(async () => undefined),
      assignments: vi.fn(async () => ({ cbids: ['a'] })),
      setAssignments: vi.fn(async () => ({ cbids: ['a', 'b'] })),
      publish: vi.fn(async () => ({ publishedCbids: ['a', 'b'] })),
    },
  } as unknown as CookieMunchClient;
}

/** Minimal valid v2 config — one view with acceptAll so no trap, start is valid. */
const VALID_V2_CONFIG = {
  v: 2 as const,
  flow: {
    start: 'v1',
    views: [
      {
        id: 'v1',
        surface: 'bar' as const,
        layoutMode: 'flow' as const,
        elements: [
          {
            id: 'e-accept',
            type: 'button' as const,
            props: { action: { kind: 'acceptAll' } },
            layout: { desktop: { x: 0, y: 0, w: 1 } },
          },
        ],
      },
    ],
  },
  categories: { standard: {}, custom: [] },
};

const EXPECTED_TOOLS = [
  // --- platform surfaces (identity / vault / profile / subscriptions / assessments /
  //     discovery / DSR fulfillment / AI governance) ---
  'resolve_identity',
  'link_identity',
  'record_consent_decision',
  'get_consent_state',
  'get_profile',
  'set_profile_attributes',
  'activate_profile',
  'get_subscription_topics',
  'set_subscription_topics',
  'plan_warehouse_enforcement',
  'get_regulatory_feed',
  'get_upcoming_regulations',
  'get_subscriptions',
  'set_subscription',
  'global_unsubscribe',
  'list_assessment_templates',
  'start_assessment',
  'get_assessment',
  'answer_assessment_question',
  'autopopulate_assessment_from_data_map',
  'submit_assessment',
  'get_data_map',
  'get_data_drift',
  'get_ropa_drafts',
  'get_dsr_sla',
  'plan_dsr_fulfillment',
  'get_dsr_fulfillment_status',
  'inspect_ai_prompt',
  'get_ai_inventory',
  'get_ai_lineage',
  // --- CMP tools ---
  'whoami',
  'list_sites',
  'create_site',
  'get_site_config',
  'update_site_config',
  'get_consent_stats',
  'get_consent_log',
  'list_dsar',
  'create_dsar',
  'advance_dsar',
  'export_consent',
  'get_receipt',
  'delete_site',
  'list_vendors',
  'create_vendor',
  'list_ropa',
  'create_ropa',
  'get_site_cookies',
  'scan_site',
  'get_scan_status',
  'get_ab_results',
  'list_brand_kits',
  'list_preferences',
  'list_members',
  'list_api_keys',
  'get_usage',
  'list_webhooks',
  'create_webhook',
  'delete_webhook',
  'get_flow',
  'edit_flow',
  'set_flow',
  'get_install_snippet',
  'verify_site',
  'match_site_brand',
  // Task 3: structured config tools
  'set_blocking',
  'set_geo_rules',
  'list_supported_languages',
  'set_languages',
  'set_consent_mode',
  'set_ab_experiment',
  'set_consent_policy',
  'set_banner_basics',
  // Task 4: org/member/brand-kit/preference writes + issue_api_key
  'invite_member',
  'set_member_role',
  'remove_member',
  'create_brand_kit',
  'delete_brand_kit',
  'save_preference',
  'issue_api_key',
  // Task 7: consent erasure
  'erase_subject_data',
  // Task 2: subject data export
  'export_subject_data',
  // Task 7: account-level banner library
  'list_banners',
  'create_banner',
  'get_banner',
  'update_banner',
  'delete_banner',
  'assign_banner',
  'publish_banner',
  'get_site',
  'get_site_banner',
  'get_banner_assignments',
  'get_ai_policy',
  'set_ai_policy',
  'register_ai_system',
  'get_ai_audit_log',
  'get_identity_cluster',
  'list_permits',
  'resubscribe',
  'get_subscription_activation',
  'list_assessments',
  'get_discovery_evidence',
  'get_privacy_policy',
  'set_ad_personalization',
  'analyze_session',
  'autopopulate_assessment',
  'list_ai_systems',
  'list_customers',
  'get_customer',
  'provision_customer',
  'update_customer',
  'suspend_customer',
  'list_customer_keys',
  'issue_customer_key',
  'revoke_customer_key',
  'get_dsar_response_notice',
  'export_ropa_csv',
  'create_sites_bulk',
  'get_subject_consent',
  'update_webhook',
  'get_verification_challenge',
  'revoke_api_key',
  'roll_api_key',
  'update_api_key',
  'get_org',
  'update_org',
  'get_audit_log',
  'upload_asset',
  'delete_asset',
  'get_blocked_pages',
  'import_cookie_declaration',
  'roll_webhook_secret',
  'test_webhook',
  'list_webhook_dead_letters',
  'replay_webhook_dead_letter',
  'erase_dsar_subject',
  'export_dsar_subject',
  'get_preference',
];

describe('registerTools', () => {
  it('registers every expected tool', () => {
    const { server, tools } = fakeServer();
    registerTools(server, mockClient());
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('gives each tool a non-empty description', () => {
    const { server, tools } = fakeServer();
    registerTools(server, mockClient());
    for (const t of tools) {
      expect(typeof t.config.description).toBe('string');
      expect(t.config.description!.length).toBeGreaterThan(0);
    }
  });

  /** The DSAR-gated erasure passes the request id through, so the server can check it. */
  it('erase_dsar_subject erases by request, not by stamp alone', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const erase = vi.fn(async () => ({ erased: 2, encryptionEnabled: true, request: {} }));
    (client.dsar as unknown as { erase: typeof erase }).erase = erase;
    registerTools(server, client);
    await byName('erase_dsar_subject').handler({ id: 'dsar_1', cbid: 'site-a', stamp: 'st-1' });
    expect(erase).toHaveBeenCalledWith('dsar_1', 'site-a', 'st-1');
  });

  /** Only the fields given are sent, so an agent renaming the org cannot clear its logo. */
  it('update_org sends only the fields given', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const update = vi.fn(async () => ({}));
    (client as unknown as { org: { update: typeof update } }).org = { update } as never;
    registerTools(server, client);
    await byName('update_org').handler({ name: 'Acme' });
    expect(update).toHaveBeenCalledWith({ name: 'Acme' });
    await byName('update_org').handler({ logoUrl: null });
    expect(update).toHaveBeenLastCalledWith({ logoUrl: null });
  });

  it('whoami calls client.me and returns its JSON', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('whoami').handler({});
    expect(client.me).toHaveBeenCalledOnce();
    expect(res.content[0]!.text).toContain('fck_abcd');
  });

  it('list_sites calls client.sites.list', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('list_sites').handler({});
    expect(client.sites.list).toHaveBeenCalledOnce();
  });

  it('create_site forwards domain + cbid', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('create_site').handler({ domain: 'x.com', cbid: 'c1' });
    expect(client.sites.create).toHaveBeenCalledWith({ domain: 'x.com', cbid: 'c1' });
  });

  it('get_site_config forwards cbid', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_site_config').handler({ cbid: 'a' });
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
  });

  it('update_site_config forwards cbid + config', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('update_site_config').handler({ cbid: 'a', config: { banner: { layout: 'bottom' } } });
    expect(client.sites.putConfig).toHaveBeenCalledWith('a', { banner: { layout: 'bottom' } });
  });

  it('get_consent_stats passes the from/to range', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_consent_stats').handler({ cbid: 'a', from: 1, to: 2 });
    expect(client.consent.stats).toHaveBeenCalledWith('a', { from: 1, to: 2 });
  });

  it('get_consent_log passes limit', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_consent_log').handler({ cbid: 'a', limit: 5 });
    expect(client.consent.log).toHaveBeenCalledWith('a', { limit: 5 });
  });

  it('create_dsar forwards the payload', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('create_dsar').handler({ type: 'access', subjectEmail: 's@x.com', regulation: 'gdpr' });
    expect(client.dsar.create).toHaveBeenCalledWith({ type: 'access', subjectEmail: 's@x.com', regulation: 'gdpr' });
  });

  it('advance_dsar forwards id + toStatus', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('advance_dsar').handler({ id: 'd1', toStatus: 'verifying' });
    expect(client.dsar.advance).toHaveBeenCalledWith('d1', 'verifying');
  });

  it('scan_site forwards cbid to client.sites.scan', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('scan_site').handler({ cbid: 'a' });
    expect(client.sites.scan).toHaveBeenCalledWith('a');
  });

  it('create_webhook forwards url + events + cbid', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('create_webhook').handler({ url: 'https://x.com/hook', events: ['consent.created'], cbid: 'a' });
    expect(client.webhooks.create).toHaveBeenCalledWith({ url: 'https://x.com/hook', events: ['consent.created'], cbid: 'a' });
  });

  it('delete_webhook forwards id', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('delete_webhook').handler({ id: 'w1' });
    expect(client.webhooks.delete).toHaveBeenCalledWith('w1');
  });

  it('get_usage calls client.usage', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_usage').handler({});
    expect(client.usage).toHaveBeenCalledOnce();
  });

  it('returns an isError result when the client throws', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    registerTools(server, client);
    const res = await byName('list_sites').handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('boom');
  });

  it('get_install_snippet calls client.sites.snippet with cbid + opts and returns the snippet', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('get_install_snippet').handler({ cbid: 'a', blockingMode: 'manual', culture: 'fr' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.snippet).toHaveBeenCalledWith('a', { blockingMode: 'manual', culture: 'fr' });
    expect(res.content[0]!.text).toContain('consent.js');
  });

  it('get_install_snippet rejects an unsupported blockingMode ("checklist") instead of silently passing it through', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('get_install_snippet').handler({ cbid: 'a', blockingMode: 'checklist' });
    expect(res.isError).toBe(true);
    expect(client.sites.snippet).not.toHaveBeenCalled();
  });

  it('verify_site forwards cbid + method', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('verify_site').handler({ cbid: 'a', method: 'dns' });
    expect(client.sites.verify).toHaveBeenCalledWith('a', 'dns');
  });

  it('match_site_brand forwards cbid', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('match_site_brand').handler({ cbid: 'a' });
    expect(client.sites.brand).toHaveBeenCalledWith('a');
  });
});

describe('v2 flow tools (delegate to the SDK; the flow engine runs server-side)', () => {
  it('get_flow: delegates to client.sites.getFlow', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('get_flow').handler({ cbid: 'site1' });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
    expect(parsed['v']).toBe(2);
    expect(client.sites.getFlow).toHaveBeenCalledWith('site1');
  });

  it('edit_flow: forwards the operations to client.sites.editFlow', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const ops = [{ op: 'addCustomCategory', id: 'mycat', label: 'My Category', default: false, mapsTo: 'statistics' }];
    const res = await byName('edit_flow').handler({ cbid: 'site1', operations: ops });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);
    expect(client.sites.editFlow).toHaveBeenCalledWith('site1', ops);
  });

  it('edit_flow: surfaces a server-side validation failure as data, not an error', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.editFlow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      issues: [{ code: 'unknown_op', message: 'unknown op: bogus' }],
    });
    registerTools(server, client);
    const res = await byName('edit_flow').handler({ cbid: 'site1', operations: [{ op: 'bogus' }] });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
    expect(parsed['ok']).toBe(false);
    expect((parsed['issues'] as Array<{ code: string }>)[0]!.code).toBe('unknown_op');
  });

  it('set_flow: forwards the config to client.sites.setFlow', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_flow').handler({ cbid: 'site1', config: VALID_V2_CONFIG });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);
    expect(client.sites.setFlow).toHaveBeenCalledWith('site1', VALID_V2_CONFIG);
  });
});

// ---------------------------------------------------------------------------
// Task 3: Structured config tools — typed per-domain setters
// ---------------------------------------------------------------------------

/** A rich baseline config so tests can verify that non-target domains are preserved. */
const BASELINE_CONFIG = {
  cbid: 'a',
  ver: 1,
  banner: {
    type: 'multilevel',
    layout: 'bottom',
    theme: { background: '#fff', text: '#000', highlight: '#1a73e8', shade: '#dfe3e8', scheme: 'light' },
    i18n: { en: { title: 'We use cookies' } },
    content: { acceptAll: 'Accept all', rejectAll: 'Reject', policyUrl: 'https://example.com/policy' },
  },
  categories: {},
  blocking: { mode: 'auto', ignoreSelectors: ['#keep-me'] },
  i18n: { defaultCulture: 'en', autoDetect: true },
  framework: 'none',
  consentMode: { enabled: true, mode: 'advanced', waitForUpdate: 500 },
  defaultMode: 'opt-in',
  geoRules: [{ match: { countries: ['de'] }, mode: 'opt-in' }],
  consent: { expiryDays: 365, version: 1 },
  experiment: { enabled: false, splitB: 10, variantB: { theme: { highlight: '#f00' } } },
};

describe('structured config tools', () => {
  // --- set_blocking ---

  it('set_blocking: valid mode → fetches config + PUTs with only blocking changed', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_blocking').handler({ cbid: 'a', mode: 'manual' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect((putArg['blocking'] as Record<string, unknown>)['mode']).toBe('manual');
    // Other domains must be preserved
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
    expect(putArg['geoRules']).toEqual(BASELINE_CONFIG.geoRules);
    expect(putArg['consent']).toEqual(BASELINE_CONFIG.consent);
  });

  it('set_blocking: ignoreSelectors forwarded when provided', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    await byName('set_blocking').handler({ cbid: 'a', mode: 'auto', ignoreSelectors: ['.my-widget'] });
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect((putArg['blocking'] as Record<string, unknown>)['ignoreSelectors']).toEqual(['.my-widget']);
  });

  it('set_blocking: invalid mode "bogus" → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_blocking').handler({ cbid: 'a', mode: 'bogus' });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  // --- set_geo_rules ---

  it('set_geo_rules: valid rules → fetches config + PUTs with geoRules + defaultMode changed, others preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const newRules = [{ match: { countries: ['fr'] }, mode: 'opt-out' }];
    const res = await byName('set_geo_rules').handler({ cbid: 'a', geoRules: newRules, defaultMode: 'opt-out' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect(putArg['geoRules']).toEqual(newRules);
    expect(putArg['defaultMode']).toBe('opt-out');
    // Other domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
  });

  it('set_geo_rules: invalid rule mode → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_geo_rules').handler({
      cbid: 'a',
      geoRules: [{ match: { countries: ['de'] }, mode: 'invalid' }],
    });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  // --- set_languages ---

  it('set_languages: defaultCulture + autoDetect → fetches config + PUTs i18n changed, others preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_languages').handler({ cbid: 'a', defaultCulture: 'fr', autoDetect: false });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const i18n = putArg['i18n'] as Record<string, unknown>;
    expect(i18n['defaultCulture']).toBe('fr');
    expect(i18n['autoDetect']).toBe(false);
    // Other domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
  });

  it('set_languages: translations → merged onto banner.i18n, other banner fields preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const translations = { fr: { title: 'Nous utilisons des cookies' } };
    await byName('set_languages').handler({ cbid: 'a', translations });
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const banner = putArg['banner'] as Record<string, unknown>;
    // existing en translation preserved, fr added
    expect((banner['i18n'] as Record<string, unknown>)['en']).toEqual(BASELINE_CONFIG.banner.i18n.en);
    expect((banner['i18n'] as Record<string, unknown>)['fr']).toEqual(translations.fr);
    // other banner fields preserved
    expect(banner['type']).toBe(BASELINE_CONFIG.banner.type);
    expect(banner['layout']).toBe(BASELINE_CONFIG.banner.layout);
  });

  // --- set_consent_mode ---

  it('set_consent_mode: valid args → fetches config + PUTs consentMode changed, others preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_consent_mode').handler({ cbid: 'a', enabled: false, mode: 'basic', waitForUpdate: 1000 });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const cm = putArg['consentMode'] as Record<string, unknown>;
    expect(cm['enabled']).toBe(false);
    expect(cm['mode']).toBe('basic');
    expect(cm['waitForUpdate']).toBe(1000);
    // Other domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['geoRules']).toEqual(BASELINE_CONFIG.geoRules);
  });

  it('set_consent_mode: invalid mode "pro" → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_consent_mode').handler({ cbid: 'a', enabled: true, mode: 'pro' });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  // --- set_ab_experiment ---

  it('set_ab_experiment: valid args → fetches config + PUTs experiment changed, others preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_ab_experiment').handler({ cbid: 'a', enabled: true, splitB: 30, variantB: { theme: { highlight: '#ff0000' } } });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const exp = putArg['experiment'] as Record<string, unknown>;
    expect(exp['enabled']).toBe(true);
    expect(exp['splitB']).toBe(30);
    expect((exp['variantB'] as Record<string, unknown>)['theme']).toEqual({ highlight: '#ff0000' });
    // Other domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
  });

  it('set_ab_experiment: splitB out of range (> 100) → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_ab_experiment').handler({ cbid: 'a', enabled: true, splitB: 150 });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  it('set_ab_experiment: partial update (enabled + splitB only) → preserves existing variantB', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_ab_experiment').handler({ cbid: 'a', enabled: true, splitB: 30 });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const exp = putArg['experiment'] as Record<string, unknown>;
    expect(exp['enabled']).toBe(true);
    expect(exp['splitB']).toBe(30);
    // variantB from baseline must be preserved, not dropped
    expect(exp['variantB']).toEqual(BASELINE_CONFIG.experiment.variantB);
  });

  // --- set_consent_policy ---

  it('set_consent_policy: valid args → fetches config + PUTs consent changed, others preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_consent_policy').handler({ cbid: 'a', expiryDays: 180, version: 2 });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const consent = putArg['consent'] as Record<string, unknown>;
    expect(consent['expiryDays']).toBe(180);
    expect(consent['version']).toBe(2);
    // Other domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
    expect(putArg['geoRules']).toEqual(BASELINE_CONFIG.geoRules);
  });

  it('set_consent_policy: partial update (only version) → merges with existing expiryDays', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    await byName('set_consent_policy').handler({ cbid: 'a', version: 3 });
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const consent = putArg['consent'] as Record<string, unknown>;
    expect(consent['version']).toBe(3);
    // existing expiryDays preserved from BASELINE_CONFIG.consent
    expect(consent['expiryDays']).toBe(BASELINE_CONFIG.consent.expiryDays);
  });

  // --- set_banner_basics ---

  it('set_banner_basics: type + layout → fetches config + PUTs banner type/layout changed, other banner fields preserved', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_banner_basics').handler({ cbid: 'a', type: 'accept-decline', layout: 'popup' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const banner = putArg['banner'] as Record<string, unknown>;
    expect(banner['type']).toBe('accept-decline');
    expect(banner['layout']).toBe('popup');
    // Other banner fields preserved (i18n, content, theme)
    expect(banner['i18n']).toEqual(BASELINE_CONFIG.banner.i18n);
    expect(banner['content']).toEqual(BASELINE_CONFIG.banner.content);
    // Other top-level domains preserved
    expect(putArg['blocking']).toEqual(BASELINE_CONFIG.blocking);
    expect(putArg['consentMode']).toEqual(BASELINE_CONFIG.consentMode);
  });

  it('set_banner_basics: theme record merged onto existing banner theme', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    await byName('set_banner_basics').handler({ cbid: 'a', theme: { highlight: '#ff0000' } });
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const banner = putArg['banner'] as Record<string, unknown>;
    const theme = banner['theme'] as Record<string, unknown>;
    // highlight updated
    expect(theme['highlight']).toBe('#ff0000');
    // other theme keys preserved from BASELINE_CONFIG.banner.theme
    expect(theme['background']).toBe(BASELINE_CONFIG.banner.theme.background);
    expect(theme['text']).toBe(BASELINE_CONFIG.banner.theme.text);
  });

  it('set_banner_basics: invalid type "floating" → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_banner_basics').handler({ cbid: 'a', type: 'floating' });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  it('set_banner_basics: invalid layout "sidebar" → isError, no PUT', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('set_banner_basics').handler({ cbid: 'a', layout: 'sidebar' });
    expect(res.isError).toBe(true);
    expect(client.sites.putConfig).not.toHaveBeenCalled();
  });

  it('set_banner_basics: partial content update → preserves other content fields', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_banner_basics').handler({ cbid: 'a', content: { acceptAll: 'Accept All' } });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const banner = putArg['banner'] as Record<string, unknown>;
    const content = banner['content'] as Record<string, unknown>;
    // updated field
    expect(content['acceptAll']).toBe('Accept All');
    // other content fields from baseline must be preserved, not dropped
    expect(content['rejectAll']).toBe(BASELINE_CONFIG.banner.content.rejectAll);
    expect(content['policyUrl']).toBe(BASELINE_CONFIG.banner.content.policyUrl);
  });

  it('set_consent_mode: partial update (enabled + mode only) → preserves existing waitForUpdate', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    const res = await byName('set_consent_mode').handler({ cbid: 'a', enabled: true, mode: 'basic' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.getConfig).toHaveBeenCalledWith('a');
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const cm = putArg['consentMode'] as Record<string, unknown>;
    expect(cm['enabled']).toBe(true);
    expect(cm['mode']).toBe('basic');
    // waitForUpdate from baseline must be preserved
    expect(cm['waitForUpdate']).toBe(BASELINE_CONFIG.consentMode.waitForUpdate);
  });
});

// =============================================================================
// Task 4 — new MCP tools: member writes + brand-kit writes + preference + key
// =============================================================================
describe('Task 4 tools', () => {
  it('invite_member forwards email + role to client.members.invite', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('invite_member').handler({ email: 'new@x.com', role: 'member' });
    expect(res.isError).toBeFalsy();
    expect(c.members.invite).toHaveBeenCalledWith('new@x.com', 'member');
  });

  it('set_member_role forwards userId + role to client.members.setRole', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('set_member_role').handler({ userId: 'u1', role: 'admin' });
    expect(c.members.setRole).toHaveBeenCalledWith('u1', 'admin');
  });

  it('remove_member forwards userId to client.members.remove', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('remove_member').handler({ userId: 'u1' });
    expect(c.members.remove).toHaveBeenCalledWith('u1');
  });

  it('create_brand_kit forwards name + theme to client.brandKits.create', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('create_brand_kit').handler({ name: 'Kit', theme: { bg: '#fff' } });
    expect(c.brandKits.create).toHaveBeenCalledWith({ name: 'Kit', theme: { bg: '#fff' } });
  });

  it('delete_brand_kit forwards id to client.brandKits.delete', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('delete_brand_kit').handler({ id: 'bk1' });
    expect(c.brandKits.delete).toHaveBeenCalledWith('bk1');
  });

  it('save_preference forwards subjectId + purposes to client.preferences.save', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('save_preference').handler({ subjectId: 'u1', purposes: { newsletter: true } });
    expect(c.preferences.save).toHaveBeenCalledWith('u1', { newsletter: true });
  });

  it('issue_api_key calls client.keys.issue', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('issue_api_key').handler({});
    expect(c.keys.issue).toHaveBeenCalledOnce();
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.text).toContain('fck_secret');
  });
});

// =============================================================================
// Task 7 — consent erasure: erase_subject_data tool
// =============================================================================
describe('Task 7 tools', () => {
  it('erase_subject_data calls consent.eraseSubject with cbid + stamp', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('erase_subject_data').handler({ cbid: 'cb', stamp: 'st' });
    expect(c.consent.eraseSubject).toHaveBeenCalledWith('cb', 'st');
  });
});

// =============================================================================
// Task 2 — subject data export: export_subject_data tool
// =============================================================================
describe('Task 2 tools', () => {
  it('export_subject_data calls consent.exportSubject with cbid + stamp', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('export_subject_data').handler({ cbid: 'cb', stamp: 'st' });
    expect(c.consent.exportSubject).toHaveBeenCalledWith('cb', 'st');
    expect(res.isError).toBeFalsy();
  });
});

// =============================================================================
// Task 7 — account-level banner library: MCP tools wrapping client.banners.*
// =============================================================================
describe('Task 7: banner library tools', () => {
  it('list_banners calls client.banners.list', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('list_banners').handler({});
    expect(c.banners.list).toHaveBeenCalledOnce();
    expect(res.isError).toBeFalsy();
  });

  it('create_banner forwards name + json to client.banners.create', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('create_banner').handler({ name: 'Design 1', json: { banner: { type: 'multilevel' } } });
    expect(c.banners.create).toHaveBeenCalledWith({ name: 'Design 1', json: { banner: { type: 'multilevel' } } });
  });

  it('get_banner forwards id to client.banners.get', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('get_banner').handler({ id: 'b1' });
    expect(c.banners.get).toHaveBeenCalledWith('b1');
  });

  it('update_banner forwards id + only-provided fields to client.banners.update', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('update_banner').handler({ id: 'b1', name: 'Renamed' });
    expect(c.banners.update).toHaveBeenCalledWith('b1', { name: 'Renamed' });
  });

  it('update_banner forwards both name and json when both provided', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('update_banner').handler({ id: 'b1', name: 'Renamed', json: { banner: {} } });
    expect(c.banners.update).toHaveBeenCalledWith('b1', { name: 'Renamed', json: { banner: {} } });
  });

  it('delete_banner calls client.banners.delete and returns { ok: true }', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('delete_banner').handler({ id: 'b1' });
    expect(c.banners.delete).toHaveBeenCalledWith('b1');
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);
  });

  it('assign_banner forwards id + cbids to client.banners.setAssignments', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('assign_banner').handler({ id: 'b1', cbids: ['a', 'b'] });
    expect(c.banners.setAssignments).toHaveBeenCalledWith('b1', ['a', 'b']);
  });

  it('publish_banner forwards id to client.banners.publish', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    const res = await byName('publish_banner').handler({ id: 'b1' });
    expect(c.banners.publish).toHaveBeenCalledWith('b1');
    expect(res.isError).toBeFalsy();
  });
});
