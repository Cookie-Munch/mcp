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
    me: vi.fn(async () => ({ orgId: 'o1', plan: 'free', planSource: 'org' as const, subscribedPlan: 'free', features: [], keyPrefix: 'fck_abcd' })),
    orgs: {
      list: vi.fn(async () => ({ orgs: [], orgLimit: { max: 1, plan: 'free', used: 1 }, upgradeUrl: 'https://cookiemunch.net/account#account-plans' })),
      create: vi.fn(async () => ({ org: { id: 'o2', name: 'x', role: 'owner' } })),
    },
    sites: {
      list: vi.fn(async () => [{ cbid: 'a', orgId: 'o1', domain: 'a.com' }]),
      create: vi.fn(async () => ({ cbid: 'new', orgId: 'o1', domain: 'x.com' })),
      get: vi.fn(async () => ({ cbid: 'a', orgId: 'o1', domain: 'a.com' })),
      delete: vi.fn(async () => undefined),
      getConfig: vi.fn(async () => ({ cbid: 'a' })),
      putConfig: vi.fn(async () => ({ cbid: 'a', banner: {} })),
      patchConfig: vi.fn(async () => ({ cbid: 'a', banner: {} })),
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
      previewToken: vi.fn(async () => ({ cbid: 'a', token: 't.s', expiresAt: 1, previewUrl: 'https://a.com/?cm_preview=t.s' })),
      brand: vi.fn(async () => ({ suggestion: { highlight: '#ff0000' } })),
      getBrand: vi.fn(async () => ({ cbid: 'a', mapping: [] })),
      setBrand: vi.fn(async () => ({ cbid: 'a', mapping: [] })),
      getFlow: vi.fn(async () => ({ v: 2, flow: { views: [] }, categories: {}, lint: [] })),
      editFlow: vi.fn(async () => ({ ok: true, flow: { views: [] } })),
      setFlow: vi.fn(async () => ({ ok: true, flow: { views: [] } })),
    },
    rightsLinks: {
      create: vi.fn(async () => ({ url: 'https://cookiemunch.net/r/a?t=p.s', expiresAt: 1 })),
    },
    consent: {
      verify: vi.fn(async () => ({ valid: true })),
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
      markTest: vi.fn(async () => ({ request: { id: 'd1', test: true } as never, changed: true })),
    },
    vendors: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ vendor: { id: 'v1' }, risk: { score: 0, band: 'low' } })),
    },
    ropa: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ entry: { id: 'r1' } as never })),
    },
    rightsPage: {
      get: vi.fn(async () => ({})), put: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), dryRun: vi.fn(async () => ({ dryRun: true })),
      getPublished: vi.fn(async () => ({})), publish: vi.fn(async () => ({ version: 1 })), versions: vi.fn(async () => ({ versions: [] })), rollback: vi.fn(async () => ({})),
      listDomains: vi.fn(async () => ({ domains: [], limit: 1, used: 0, target: 'cname.cookiemunch.net' })),
      addDomain: vi.fn(async () => ({ hostname: 'privacy.acme.com', status: 'pending_dns' })),
      verifyDomain: vi.fn(async () => ({ hostname: 'privacy.acme.com', status: 'issuing' })),
      removeDomain: vi.fn(async () => undefined),
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
    preferenceCenter: {
      mintToken: vi.fn(async () => ({ token: 't', expiresAt: '2026-01-01T00:00:00.000Z' })),
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
    entitlements: vi.fn(async () => ({ orgId: 'o1', plan: 'pro', entitlements: [] })),
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
  'lint_banner_config',
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
  'list_dsar_executors',
  'get_dsar_executor',
  'connect_dsar_executor',
  'disconnect_dsar_executor',
  'get_dsar_task_export',
  'get_dsar_task',
  'test_dsar_executor',
  'test_dsar_executor_webhook',
  'get_category_registry',
  'list_dsar_executor_presets',
  'upgrade_dsar_executor_preset',
  'list_dsar_executor_webhook_deliveries',
  'recheck_dsar_executor',
  'list_dsar_executor_health_history',
  'get_dsr_fulfillment_status',
  'inspect_ai_prompt',
  'get_ai_inventory',
  'get_ai_lineage',
  // --- CMP tools ---
  'whoami',
  'list_account_orgs',
  'list_sites',
  'create_site',
  'get_site_config',
  'update_site_config',
  'patch_site_config',
  'preview_site_config',
  'verify_consent_log',
  'get_consent_stats',
  'get_consent_insights',
  'get_consent_log',
  'get_dsar',
  'update_dsar_executor',
  'list_dsar',
  'create_dsar',
  'delete_test_dsar',
  'mark_dsar_test',
  'open_dsar_case',
  'get_dsar_case',
  'cancel_dsar_case',
  'get_dsar_case_receipt',
  'find_dsar_by_trace',
  'get_dsar_settings',
  'set_dsar_settings',
  'get_subject_card',
  'run_executor_conformance',
  'roll_executor_completion_secret',
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
  'get_entitlements',
  'list_webhooks',
  'create_webhook',
  'delete_webhook',
  'get_flow',
  'edit_flow',
  'set_flow',
  'get_install_snippet',
  'preview_banner',
  'update_site',
  'api_key_report',
  'integration_health',
  'list_health_waivers',
  'set_health_waiver',
  'remove_health_waiver',
  'get_embed_manifest',
  'provision_product',
  'list_site_partners',
  'link_site_partner',
  // Key model, tags, partner links, forgedeck env (tools-keys-tags.ts).
  'get_own_key',
  'list_api_keys_standard',
  'vend_api_key',
  'revoke_leaked_key',
  'get_resource_tags',
  'update_resource_tags',
  'list_partner_links',
  'create_partner_link',
  'revoke_partner_link',
  'get_provision_env',
  'unlink_site_partner',
  'create_rights_link',
  'list_rights_page_domains',
  'add_rights_page_domain',
  'verify_rights_page_domain',
  'remove_rights_page_domain',
  'verify_site',
  'match_site_brand',
  'get_site_brand',
  'import_site_brand',
  // Task 3: structured config tools
  'set_blocking',
  'set_geo_rules',
  'list_supported_languages',
  'set_identity_sources',
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
  'get_mail_provider',
  'set_mail_provider',
  'remove_mail_provider',
  'test_mail_provider',
  'get_org_controller',
  'set_org_controller',
  'remove_org_controller',
  'get_consent_sync_secret',
  'rotate_consent_sync_secret',
  'remove_consent_sync_secret',
  'get_rights_captcha',
  'set_rights_captcha',
  'remove_rights_captcha',
  'get_rights_captcha_default',
  'set_rights_captcha_default',
  'remove_rights_captcha_default',
  'get_rights_identity',
  'set_rights_identity',
  'remove_rights_identity',
  'get_rights_identity_default',
  'set_rights_identity_default',
  'remove_rights_identity_default',
  'get_audit_log',
  'get_audit_sink',
  'set_audit_sink',
  'remove_audit_sink',
  'upload_asset',
  'delete_asset',
  'get_blocked_pages',
  'import_cookie_declaration',
  'apply_cookie_import',
  'declare_cookie',
  'declare_cookies',
  'undeclare_cookie',
  'retire_cookie',
  'unretire_cookie',
  'list_cookie_presets',
  'import_cookie_manifest',
  'list_cookie_suggestions',
  'declare_cookie_suggestions',
  'apply_cookie_preset',
  'remove_cookie_preset',
  'delete_observed_cookie',
  'purge_observed_cookies',
  'roll_webhook_secret',
  'test_webhook',
  'list_webhook_dead_letters',
  'replay_webhook_dead_letter',
  'replay_webhook',
  'erase_dsar_subject',
  'export_dsar_subject',
  'get_preference',
  'mint_preference_center_token',
  // --- the hosted rights page ---
  'get_rights_page',
  'update_rights_page',
  'patch_rights_page',
  'preview_rights_page',
  'get_published_rights_page',
  'publish_rights_page',
  'list_rights_page_versions',
  'rollback_rights_page',
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

  /** Numestri F-01: purposes ride along in the body; dryRun reaches the SDK only when set. */
  it('declare_cookie / declare_cookies / undeclare_cookie pass purposes and dryRun', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const one = vi.fn(async () => ({}));
    const many = vi.fn(async () => ({}));
    const un = vi.fn(async () => ({ dryRun: true, declared: [], diff: { added: [], removed: [], changed: [] } }));
    Object.assign(client.sites, { declareCookie: one, declareCookies: many, undeclareCookie: un });
    registerTools(server, client);
    await byName('declare_cookie').handler({ cbid: 's1', name: 'sid', category: 'necessary', purpose: 'p', purposes: { es: 'x' }, dryRun: true });
    expect(one).toHaveBeenCalledWith('s1', 'sid', { category: 'necessary', purpose: 'p', purposes: { es: 'x' } }, { dryRun: true });
    await byName('declare_cookie').handler({ cbid: 's1', name: 'sid', category: 'necessary', purpose: 'p' });
    expect(one).toHaveBeenLastCalledWith('s1', 'sid', { category: 'necessary', purpose: 'p' }, undefined);
    await byName('declare_cookies').handler({ cbid: 's1', cookies: [{ name: 'a', category: 'necessary', purpose: 'A', purposes: { de: 'B' } }], replace: true, dryRun: true });
    expect(many).toHaveBeenCalledWith('s1', [{ name: 'a', category: 'necessary', purpose: 'A', purposes: { de: 'B' } }], { replace: true, dryRun: true });
    const res = await byName('undeclare_cookie').handler({ cbid: 's1', name: 'sid', dryRun: true });
    expect(un).toHaveBeenCalledWith('s1', 'sid', { dryRun: true });
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({ dryRun: true });
    expect(byName('declare_cookie').config.inputSchema).toHaveProperty('purposes');
    expect(byName('undeclare_cookie').config.inputSchema).toHaveProperty('dryRun');
  });

  /** baseUpdatedAt passes through only when given, so an agent can opt into conflict detection. */
  it('update_rights_page / patch_rights_page pass baseUpdatedAt through only when given', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const put = vi.fn(async () => ({}));
    const patch = vi.fn(async () => ({}));
    Object.assign(client.rightsPage, { put, patch });
    registerTools(server, client);
    await byName('update_rights_page').handler({ cbid: 's1', page: { v: 1 }, baseUpdatedAt: 5 });
    expect(put).toHaveBeenCalledWith('s1', { v: 1 }, { baseUpdatedAt: 5 });
    await byName('patch_rights_page').handler({ cbid: 's1', patch: { seo: {} } });
    expect(patch).toHaveBeenCalledWith('s1', { seo: {} }, {});
    expect(byName('update_rights_page').config.description).toMatch(/draft_conflict/);
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

  /** The credential goes in, never comes out; test passes the recipient through. */
  it('org-controller tools call org.controller', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const ctl = { get: vi.fn(async () => ({ set: false, updatedAt: null })), set: vi.fn(async () => ({ set: true })), remove: vi.fn(async () => {}) };
    (client as unknown as { org: { controller: typeof ctl } }).org = { controller: ctl } as never;
    registerTools(server, client);
    await byName('get_org_controller').handler({});
    expect(ctl.get).toHaveBeenCalledOnce();
    await byName('set_org_controller').handler({ legalName: 'Crossly Ltd', contactEmail: 'p@crossly.example' });
    expect(ctl.set).toHaveBeenCalledWith({ legalName: 'Crossly Ltd', contactEmail: 'p@crossly.example' });
    const res = await byName('remove_org_controller').handler({});
    expect(ctl.remove).toHaveBeenCalledOnce();
    expect(res.content[0]!.text).toContain('removed');
    expect((byName('set_org_controller').config as { description?: string }).description).toMatch(/rights:write/);
  });

  it('mail-provider tools call org.mailProvider', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const mp = {
      get: vi.fn(async () => ({ configured: false, sender: 'shared' })),
      set: vi.fn(async () => ({ configured: true, sender: 'shared', secretLast4: 'abcd' })),
      remove: vi.fn(async () => {}),
      test: vi.fn(async () => ({ ok: true, sentTo: 'me@acme.com', mailProvider: {} })),
    };
    (client as unknown as { org: { mailProvider: typeof mp } }).org = { mailProvider: mp } as never;
    registerTools(server, client);
    await byName('get_mail_provider').handler({});
    await byName('set_mail_provider').handler({ provider: 'postmark', fromEmail: 'p@acme.com', secret: 'tok' });
    expect(mp.set).toHaveBeenCalledWith({ provider: 'postmark', fromEmail: 'p@acme.com', secret: 'tok' });
    await byName('test_mail_provider').handler({ to: 'me@acme.com' });
    expect(mp.test).toHaveBeenCalledWith('me@acme.com');
    const res = await byName('remove_mail_provider').handler({});
    expect(mp.remove).toHaveBeenCalledOnce();
    expect(res.content[0]!.text).toContain('removed');
  });

  it('consent-sync secret tools call consentSyncSecret, and warn what a rotation stops', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const s = { get: vi.fn(async () => ({})), rotate: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) };
    (client as unknown as { consentSyncSecret: typeof s }).consentSyncSecret = s;
    registerTools(server, client);
    await byName('get_consent_sync_secret').handler({ cbid: 's1' });
    await byName('rotate_consent_sync_secret').handler({ cbid: 's1' });
    await byName('remove_consent_sync_secret').handler({ cbid: 's1' });
    expect([s.get, s.rotate, s.remove].map((f) => f.mock.calls[0])).toEqual([['s1'], ['s1'], ['s1']]);
    expect((byName('rotate_consent_sync_secret').config as { description?: string }).description).toMatch(/stops the old secret/);
  });

  it('rights-captcha tools call rightsCaptcha and org.rightsCaptcha, and say what off costs', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const site = { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) };
    const org = { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) };
    (client as unknown as { rightsCaptcha: typeof site }).rightsCaptcha = site;
    (client as unknown as { org: { rightsCaptcha: typeof org } }).org = { rightsCaptcha: org } as never;
    registerTools(server, client);
    await byName('get_rights_captcha').handler({ cbid: 's1' });
    expect(site.get).toHaveBeenCalledWith('s1');
    await byName('set_rights_captcha').handler({ cbid: 's1', mode: 'own', provider: 'hcaptcha', siteKey: 'k-12345678', secret: 'x' });
    expect(site.set).toHaveBeenCalledWith('s1', { mode: 'own', provider: 'hcaptcha', siteKey: 'k-12345678', secret: 'x' });
    await byName('remove_rights_captcha').handler({ cbid: 's1' });
    expect(site.remove).toHaveBeenCalledWith('s1');
    await byName('get_rights_captcha_default').handler({});
    await byName('set_rights_captcha_default').handler({ mode: 'off' });
    expect(org.set).toHaveBeenCalledWith({ mode: 'off' });
    await byName('remove_rights_captcha_default').handler({});
    expect(org.get).toHaveBeenCalledOnce();
    expect(org.remove).toHaveBeenCalledOnce();
    for (const name of ['set_rights_captcha', 'set_rights_captcha_default']) expect((byName(name).config as { description?: string }).description).toMatch(/spam/);
  });

  it('rights-identity tools call rightsIdentity and org.rightsIdentity, and say what the token must carry', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const site = { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) };
    const org = { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) };
    (client as unknown as { rightsIdentity: typeof site }).rightsIdentity = site;
    (client as unknown as { org: { rightsIdentity: typeof org } }).org = { rightsIdentity: org } as never;
    registerTools(server, client);
    await byName('get_rights_identity').handler({ cbid: 's1' });
    expect(site.get).toHaveBeenCalledWith('s1');
    await byName('set_rights_identity').handler({ cbid: 's1', type: 'clerk', issuer: 'https://clerk.acme.example', authorizedParties: ['https://www.acme.example'] });
    expect(site.set).toHaveBeenCalledWith('s1', { type: 'clerk', issuer: 'https://clerk.acme.example', authorizedParties: ['https://www.acme.example'] });
    await byName('remove_rights_identity').handler({ cbid: 's1' });
    expect(site.remove).toHaveBeenCalledWith('s1');
    await byName('get_rights_identity_default').handler({});
    await byName('set_rights_identity_default').handler({ type: 'oidc_jwt', issuer: 'https://id.acme.example', jwksUrl: 'https://id.acme.example/keys', sessionCookieName: 'sid' });
    expect(org.set).toHaveBeenCalledWith({ type: 'oidc_jwt', issuer: 'https://id.acme.example', jwksUrl: 'https://id.acme.example/keys', sessionCookieName: 'sid' });
    await byName('remove_rights_identity_default').handler({});
    expect(org.get).toHaveBeenCalledOnce();
    expect(org.remove).toHaveBeenCalledOnce();
    for (const name of ['set_rights_identity', 'set_rights_identity_default']) expect((byName(name).config as { description?: string }).description).toMatch(/email_verified/);
  });

  it('whoami calls client.me and returns its JSON', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('whoami').handler({});
    expect(client.me).toHaveBeenCalledOnce();
    expect(res.content[0]!.text).toContain('fck_abcd');
  });

  it('list_account_orgs calls client.orgs.list and returns the cap + upgrade URL', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('list_account_orgs').handler({});
    expect(client.orgs.list).toHaveBeenCalledOnce();
    expect(res.content[0]!.text).toContain('account-plans');
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

  it('mark_dsar_test forwards the id to dsar.markTest (F-09)', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('mark_dsar_test').handler({ id: 'd1' });
    expect(client.dsar.markTest).toHaveBeenCalledWith('d1');
  });

  it('update_site_config with keepUnspecified sends PUT ?keep=unspecified (F-05)', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('update_site_config').handler({ cbid: 'a', config: { defaultMode: 'opt-in' }, keepUnspecified: true });
    expect(client.sites.putConfig).toHaveBeenCalledWith('a', { defaultMode: 'opt-in' }, { keep: 'unspecified' });
  });

  it('verify_consent_log asks the server to re-walk the hash chain', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('verify_consent_log').handler({ cbid: 'a' });
    expect(client.consent.verify).toHaveBeenCalledWith('a');
  });

  it('patch_site_config merges server-side rather than replacing', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('patch_site_config').handler({ cbid: 'a', config: { banner: { showRightsLink: true } } });
    expect(client.sites.patchConfig).toHaveBeenCalledWith('a', { banner: { showRightsLink: true } });
    expect(client.sites.putConfig).not.toHaveBeenCalled();
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

  it('advance_dsar forwards messageToSubject (CKM-S-04)', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('advance_dsar').handler({ id: 'd1', toStatus: 'rejected', messageToSubject: 'No account matches this address.' });
    expect(client.dsar.advance).toHaveBeenCalledWith('d1', 'rejected', { messageToSubject: 'No account matches this address.' });
  });

  it('scan_site forwards cbid to client.sites.scan', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('scan_site').handler({ cbid: 'a' });
    expect(client.sites.scan).toHaveBeenCalledWith('a');
  });

  it('scan_site with wait: true starts the scan, then waits for it to settle', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const waitForScan = vi.fn(async () => ({ status: 'idle', state: 'done', cookieCount: 3, lastScannedAt: 1 }));
    Object.assign(client.sites, { waitForScan });
    registerTools(server, client);
    const res = await byName('scan_site').handler({ cbid: 'a', wait: true });
    expect(client.sites.scan).toHaveBeenCalledWith('a');
    expect(waitForScan).toHaveBeenCalledWith('a', { timeoutMs: 100_000 });
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({ state: 'done', cookieCount: 3 });
    expect(byName('scan_site').config.inputSchema).toHaveProperty('wait');
  });

  it('scan_site with wait: true waits on a scan that is already running (409) instead of failing', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const busy = Object.assign(new Error('already scanning'), { status: 409 });
    const waitForScan = vi.fn(async () => ({ status: 'idle', state: 'done', lastScannedAt: 1 }));
    Object.assign(client.sites, { scan: vi.fn(async () => { throw busy; }), waitForScan });
    registerTools(server, client);
    const res = await byName('scan_site').handler({ cbid: 'a', wait: true });
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({ state: 'done' });
    await expect(byName('scan_site').handler({ cbid: 'a' })).resolves.toBeDefined();
  });

  it('get_scan_status passes wait (seconds) only when given', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_scan_status').handler({ cbid: 'a' });
    expect(client.sites.scanStatus).toHaveBeenLastCalledWith('a');
    await byName('get_scan_status').handler({ cbid: 'a', wait: 30 });
    expect(client.sites.scanStatus).toHaveBeenLastCalledWith('a', { wait: 30 });
  });

  it('retire_cookie / unretire_cookie pass renamedTo, note and dryRun', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const retire = vi.fn(async () => ({ cookie: { name: 'old', at: 1 }, matched: ['old'] }));
    const unretire = vi.fn(async () => undefined);
    Object.assign(client.sites, { retireCookie: retire, unretireCookie: unretire });
    registerTools(server, client);
    await byName('retire_cookie').handler({ cbid: 's1', name: 'old', renamedTo: 'new', note: 'v2' });
    expect(retire).toHaveBeenCalledWith('s1', 'old', { renamedTo: 'new', note: 'v2' }, undefined);
    await byName('retire_cookie').handler({ cbid: 's1', name: 'atlas_*', dryRun: true });
    expect(retire).toHaveBeenLastCalledWith('s1', 'atlas_*', {}, { dryRun: true });
    const res = await byName('unretire_cookie').handler({ cbid: 's1', name: 'old' });
    expect(unretire).toHaveBeenCalledWith('s1', 'old');
    expect(JSON.parse(res.content[0]!.text)).toEqual({ unretired: 'old' });
    await byName('unretire_cookie').handler({ cbid: 's1', name: 'old', dryRun: true });
    expect(unretire).toHaveBeenLastCalledWith('s1', 'old', { dryRun: true });
  });

  it('cookie presets and observed-row removal pass their arguments (CKM-S-02, S-29)', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const presets = vi.fn(async () => ({ presets: [] }));
    const apply = vi.fn(async () => ({}));
    const remove = vi.fn(async () => ({}));
    const del = vi.fn(async () => undefined);
    const purge = vi.fn(async () => ({ removed: [], count: 0 }));
    Object.assign(client.sites, { cookiePresets: presets, applyCookiePreset: apply, removeCookiePreset: remove, deleteObservedCookie: del, purgeObservedCookies: purge });
    registerTools(server, client);
    await byName('list_cookie_presets').handler({ cbid: 's1' });
    expect(presets).toHaveBeenCalledWith('s1');
    await byName('apply_cookie_preset').handler({ cbid: 's1', vendor: 'chatly', publicId: 'ch_1', dryRun: true });
    expect(apply).toHaveBeenCalledWith('s1', 'chatly', { publicId: 'ch_1' }, { dryRun: true });
    await byName('apply_cookie_preset').handler({ cbid: 's1', vendor: 'atlas', frontendApiHost: 'auth.a.com', crossSubdomainCookies: false });
    expect(apply).toHaveBeenLastCalledWith('s1', 'atlas', { frontendApiHost: 'auth.a.com', crossSubdomainCookies: false }, undefined);
    await byName('remove_cookie_preset').handler({ cbid: 's1', vendor: 'atlas' });
    expect(remove).toHaveBeenCalledWith('s1', 'atlas', undefined);
    const res = await byName('delete_observed_cookie').handler({ cbid: 's1', name: 'CookieConsent' });
    expect(del).toHaveBeenCalledWith('s1', 'CookieConsent');
    expect(JSON.parse(res.content[0]!.text)).toEqual({ deleted: 'CookieConsent' });
    await byName('purge_observed_cookies').handler({ cbid: 's1', since: '2026-10-19T13:21:40Z', dryRun: true });
    expect(purge).toHaveBeenCalledWith('s1', { since: '2026-10-19T13:21:40Z' }, { dryRun: true });
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

  it('get_entitlements calls client.entitlements', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_entitlements').handler({});
    expect(client.entitlements).toHaveBeenCalledOnce();
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

  it('the rights-page domain tools forward cbid and hostname', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('list_rights_page_domains').handler({ cbid: 'a' });
    expect(client.rightsPage.listDomains).toHaveBeenCalledWith('a');
    const added = await byName('add_rights_page_domain').handler({ cbid: 'a', hostname: 'privacy.acme.com' });
    expect(client.rightsPage.addDomain).toHaveBeenCalledWith('a', 'privacy.acme.com');
    expect(added.content[0]!.text).toContain('pending_dns');
    await byName('verify_rights_page_domain').handler({ cbid: 'a', hostname: 'privacy.acme.com' });
    expect(client.rightsPage.verifyDomain).toHaveBeenCalledWith('a', 'privacy.acme.com');
    await byName('remove_rights_page_domain').handler({ cbid: 'a', hostname: 'privacy.acme.com' });
    expect(client.rightsPage.removeDomain).toHaveBeenCalledWith('a', 'privacy.acme.com');
  });

  it('preview_banner mints a token for the region + language asked for', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('preview_banner').handler({ cbid: 'a', region: 'eu', lang: 'de' });
    expect(res.isError).toBeFalsy();
    expect(client.sites.previewToken).toHaveBeenCalledWith('a', { region: 'eu', lang: 'de' });
    expect(res.content[0]!.text).toContain('cm_preview');
  });

  it('create_rights_link mints a link for the signed-in person', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    const res = await byName('create_rights_link').handler({ cbid: 'a', email: 'p@x.com', userId: 'u1', rights: ['access'] });
    expect(res.isError).toBeFalsy();
    expect(client.rightsLinks.create).toHaveBeenCalledWith('a', { subject: { email: 'p@x.com', userId: 'u1' }, rights: ['access'] });
    expect(res.content[0]!.text).toContain('/r/a?t=');
  });

  it('get_site_brand / import_site_brand call sites.getBrand / sites.setBrand', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('get_site_brand').handler({ cbid: 'a' });
    expect(client.sites.getBrand).toHaveBeenCalledWith('a');
    await byName('import_site_brand').handler({ cbid: 'a', url: 'https://acme.com/brand.json' });
    expect(client.sites.setBrand).toHaveBeenCalledWith('a', { url: 'https://acme.com/brand.json' }, { dryRun: false });
    await byName('import_site_brand').handler({ cbid: 'a', document: { color: {} }, dryRun: true });
    expect(client.sites.setBrand).toHaveBeenLastCalledWith('a', { color: {} }, { dryRun: true });
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

  it('set_languages: overrides → written per language to i18n.overrides, other languages kept', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    const base = { ...BASELINE_CONFIG, i18n: { ...BASELINE_CONFIG.i18n, overrides: { fr: { banner: { title: 'Nos cookies' } } } } };
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(base);
    registerTools(server, client);
    const overrides = { de: { banner: { body: 'Wir setzen ein Cookie.' }, categories: { marketing: { label: 'Empfehlungen' } } } };
    await byName('set_languages').handler({ cbid: 'a', overrides });
    const putArg = (client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    const i18n = putArg['i18n'] as { overrides: Record<string, unknown>; defaultCulture: unknown };
    expect(i18n.overrides).toEqual({ fr: { banner: { title: 'Nos cookies' } }, ...overrides });
    expect(i18n.defaultCulture).toBe(BASELINE_CONFIG.i18n.defaultCulture);
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

  it('set_banner_basics: preset + density + secondLayer are written through', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASELINE_CONFIG);
    registerTools(server, client);
    await byName('set_banner_basics').handler({ cbid: 'a', preset: 'bar', density: 'comfortable', content: { preferencesTitle: 'Your choices' } });
    const banner = ((client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>)['banner'] as Record<string, unknown>;
    expect(banner['preset']).toBe('bar');
    expect(banner['density']).toBe('comfortable');
    expect((banner['content'] as Record<string, unknown>)['preferencesTitle']).toBe('Your choices');
  });

  it('set_banner_basics: a hand-set type drops a stored preset that would overwrite it', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    (client.sites.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...BASELINE_CONFIG,
      banner: { ...BASELINE_CONFIG.banner, preset: 'bar' },
    });
    registerTools(server, client);
    await byName('set_banner_basics').handler({ cbid: 'a', type: 'accept-decline' });
    const banner = ((client.sites.putConfig as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>)['banner'] as Record<string, unknown>;
    expect(banner['type']).toBe('accept-decline');
    expect('preset' in banner).toBe(false);
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

  it('preview_rights_page previews a patch by default and a replace on request', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('preview_rights_page').handler({ cbid: 's1', page: { seo: { title: 'x' } } });
    expect(client.rightsPage.dryRun).toHaveBeenCalledWith('s1', { seo: { title: 'x' } }, { mode: 'patch' });
    await byName('preview_rights_page').handler({ cbid: 's1', page: { v: 1 }, mode: 'put' });
    expect(client.rightsPage.dryRun).toHaveBeenLastCalledWith('s1', { v: 1 }, { mode: 'put' });
    await byName('rollback_rights_page').handler({ cbid: 's1', version: 2 });
    expect(client.rightsPage.rollback).toHaveBeenCalledWith('s1', 2, {});
  });

  it('publish_rights_page and rollback_rights_page forward baseUpdatedAt and warn that they go live and replace the draft', async () => {
    const { server, byName } = fakeServer();
    const client = mockClient();
    registerTools(server, client);
    await byName('publish_rights_page').handler({ cbid: 's1', baseUpdatedAt: 7 });
    expect(client.rightsPage.publish).toHaveBeenLastCalledWith('s1', { baseUpdatedAt: 7 });
    await byName('publish_rights_page').handler({ cbid: 's1' });
    expect(client.rightsPage.publish).toHaveBeenLastCalledWith('s1', {});
    await byName('rollback_rights_page').handler({ cbid: 's1', version: 2, baseUpdatedAt: null });
    expect(client.rightsPage.rollback).toHaveBeenLastCalledWith('s1', 2, { baseUpdatedAt: null });
    const pub = byName('publish_rights_page').config.description;
    const rb = byName('rollback_rights_page').config.description;
    expect(pub).toMatch(/live at once/i);
    expect(pub).toMatch(/baseUpdatedAt/);
    expect(rb).toMatch(/live at once/i);
    expect(rb).toMatch(/replaces the current draft/i);
    expect(rb).toMatch(/unpublished edits are lost/i);
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

  it('mint_preference_center_token sends one of email / subjectId, and the ttl only when given', async () => {
    const { server, byName } = fakeServer();
    const c = mockClient();
    registerTools(server, c);
    await byName('mint_preference_center_token').handler({ cbid: 'cb1', email: 'a@x.com' });
    expect(c.preferenceCenter.mintToken).toHaveBeenLastCalledWith({ cbid: 'cb1', email: 'a@x.com' });
    await byName('mint_preference_center_token').handler({ cbid: 'cb1', subjectId: 'u1', ttlSeconds: 60 });
    expect(c.preferenceCenter.mintToken).toHaveBeenLastCalledWith({ cbid: 'cb1', subjectId: 'u1', ttlSeconds: 60 });
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
