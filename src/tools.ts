/**
 * Tool registration for the Cookie Munch MCP server. registerTools wires the
 * @cookiemunch/sdk client onto an MCP server's registerTool API. It depends only
 * on a minimal ToolServer shape (structurally satisfied by McpServer), so the
 * registration logic is unit-testable against a fake server + mocked SDK client
 * without standing up a stdio transport.
 */

import { z, type ZodRawShape } from 'zod';
import type { CookieMunchClient } from '@cookiemunch/sdk';
import { registerConfigTools } from './tools-config.js';
import { registerPlatformTools } from './tools-platform.js';
// No @cookiemunch/core dependency: the v2 flow engine runs server-side behind the
// /v1/sites/:cbid/flow endpoints, which the SDK client surfaces as getFlow/editFlow/
// setFlow. The MCP server therefore bundles only the SDK.

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  /** MCP's CallToolResult carries an open index signature; included for structural compatibility. */
  [key: string]: unknown;
}

/**
 * The `tool` registrar shape: registers one tool whose handler wraps SDK errors
 * into an isError result. Passed to sibling modules (e.g. tools-config.ts) so they
 * register into the same set while preserving order.
 */
export type ToolRegistrar = (
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  run: (args: Record<string, unknown>) => Promise<unknown>,
) => void;

/** The slice of McpServer.registerTool we depend on (structurally compatible). */
export interface ToolServer {
  registerTool(
    name: string,
    config: { title?: string; description: string; inputSchema?: ZodRawShape },
    handler: (args: Record<string, unknown>) => Promise<ToolResult>,
  ): unknown;
}

function text(value: unknown): ToolResult {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text: body }] };
}

function fail(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function registerTools(server: ToolServer, client: CookieMunchClient): void {
  /** Register a tool whose handler wraps SDK errors into an isError result. */
  const tool: ToolRegistrar = (name, description, inputSchema, run) => {
    server.registerTool(name, { description, inputSchema }, async (args) => {
      try {
        return text(await run(args));
      } catch (err) {
        return fail(err);
      }
    });
  };

  const cbid = { cbid: z.string().describe('Site identifier (cbid). Must belong to your org.') };
  const range = {
    from: z.number().optional().describe('Epoch-ms lower bound.'),
    to: z.number().optional().describe('Epoch-ms upper bound.'),
  };

  tool('whoami', 'Return the identity tied to the API key: orgId, plan, and key prefix.', {}, () => client.me());

  tool('list_sites', 'List all sites (cbids) in your organization.', {}, () => client.sites.list());
  tool('get_site', 'One site: its domain, cbid and verification status. Read-only.', { cbid: z.string() }, (a) =>
    client.sites.get(a.cbid as string),
  );
  tool(
    'get_site_banner',
    'Which banner design a site uses, or bannerId null when none is assigned. Read-only.',
    { cbid: z.string() },
    (a) => client.sites.banner(a.cbid as string),
  );

  tool(
    'get_privacy_policy',
    "Generate the site's privacy and cookie policy as Markdown, naming the org's data controller. Needs a contact email: the one given, else the org controller's, else the owner's. Read-only — nothing is published.",
    { cbid: z.string(), contactEmail: z.string().optional(), effectiveDate: z.string().optional().describe('YYYY-MM-DD; defaults to today.'), jurisdictions: z.array(z.string()).optional() },
    (a) =>
      client.sites.policy(a.cbid as string, {
        ...(a.contactEmail ? { contactEmail: a.contactEmail as string } : {}),
        ...(a.effectiveDate ? { effectiveDate: a.effectiveDate as string } : {}),
        ...(a.jurisdictions ? { jurisdictions: a.jurisdictions as string[] } : {}),
      }),
  );

  tool(
    'set_ad_personalization',
    "Add or remove the separate 'personalised ads' choice on the site's live banner. With it on, accepting marketing no longer implies personalised ads unless `default` is true.",
    { cbid: z.string(), enabled: z.boolean(), default: z.boolean().optional(), label: z.string().optional() },
    (a) =>
      client.sites.setAdPersonalization(a.cbid as string, {
        enabled: a.enabled as boolean,
        ...(a.default !== undefined ? { default: a.default as boolean } : {}),
        ...(a.label ? { label: a.label as string } : {}),
      }),
  );

  tool(
    'analyze_session',
    'Analyse a captured browsing session against the consent it ran under: which trackers fired after the visitor opted out, and what personal data left the page. Read-only.',
    {
      cbid: z.string(),
      har: z.unknown().optional().describe('A HAR export of the session.'),
      requests: z.array(z.unknown()).optional().describe('Or the requests directly.'),
      consent: z.record(z.string(), z.boolean()).optional(),
      gpc: z.boolean().optional(),
    },
    (a) =>
      client.sites.analyzeSession(a.cbid as string, {
        ...(a.har !== undefined ? { har: a.har } : {}),
        ...(a.requests ? { requests: a.requests as unknown[] } : {}),
        ...(a.consent ? { consent: a.consent as Record<string, boolean> } : {}),
        ...(a.gpc !== undefined ? { gpc: a.gpc as boolean } : {}),
      }),
  );

  tool(
    'create_site',
    'Create a new site. The cbid is auto-generated if you omit it.',
    { domain: z.string().describe('The site domain, e.g. example.com.'), cbid: z.string().optional().describe('Optional explicit cbid.') },
    (a) => client.sites.create({ domain: a.domain as string, ...(typeof a.cbid === 'string' ? { cbid: a.cbid } : {}) }),
  );

  tool(
    'create_sites_bulk',
    'Create up to 100 sites in one call. Partial success: each item reports ok or its own error, and a bad or duplicate item fails only itself.',
    {
      sites: z
        .array(z.object({ domain: z.string(), cbid: z.string().optional(), platform: z.string().optional() }))
        .min(1)
        .max(100),
    },
    (a) => client.sites.createBulk(a.sites as Array<{ domain: string; cbid?: string; platform?: string }>),
  );

  tool('get_site_config', 'Get the banner/consent configuration for a site.', { ...cbid }, (a) => client.sites.getConfig(a.cbid as string));

  tool(
    'update_site_config',
    'Replace (overwrite) the banner/consent configuration for a site via PUT. This is destructive, not a merge: any top-level SiteConfig field you omit from `config` reverts to its default rather than keeping its current value. To change one setting, use patch_site_config instead — it merges server-side. Prefer the narrower set_* tools (set_blocking, set_banner_basics, etc.) when they cover your change.',
    { ...cbid, config: z.record(z.unknown()).describe('The full SiteConfig to write, not a patch. Omitted top-level fields are NOT preserved from the current config — fetch get_site_config first and merge client-side.') },
    (a) => client.sites.putConfig(a.cbid as string, a.config as Record<string, unknown>),
  );

  tool(
    'patch_site_config',
    'Change part of a site\'s banner/consent configuration. The patch is deep-merged over the stored config server-side, so any field you omit keeps its current value — this is the safe way to flip one setting, and it needs no read-modify-write. Use update_site_config only when you genuinely mean to replace the whole document.',
    { ...cbid, config: z.record(z.unknown()).describe('The subset of SiteConfig to change, e.g. { "banner": { "showRightsLink": true } }. Everything else is preserved.') },
    (a) => client.sites.patchConfig(a.cbid as string, a.config as Record<string, unknown>),
  );

  tool(
    'verify_consent_log',
    "Verify a site's consent log has not been tampered with. Each record carries the hash of the one before it, so an edited, reordered or deleted record breaks the chain and this returns valid: false. This is the evidence behind a consent log — what you check when someone asks whether the record can be trusted, not just what it says.",
    { ...cbid },
    (a) => client.consent.verify(a.cbid as string),
  );

  tool(
    'get_consent_stats',
    'Get aggregated per-day consent statistics for a site.',
    { ...cbid, ...range },
    (a) => client.consent.stats(a.cbid as string, { from: a.from as number | undefined, to: a.to as number | undefined }),
  );

  tool(
    'get_consent_log',
    'Get recent anonymised consent records for a site.',
    { ...cbid, ...range, limit: z.number().optional().describe('Max records to return (default 200).') },
    (a) =>
      client.consent.log(a.cbid as string, {
        from: a.from as number | undefined,
        to: a.to as number | undefined,
        limit: a.limit as number | undefined,
      }),
  );

  tool(
    'get_subject_consent',
    "One person's consent records across every site in the org — web, mobile and desktop — by the subjectId your apps attach. Consent data: needs the consent:read scope. Read-only.",
    { subjectId: z.string() },
    (a) => client.subjects.consent(a.subjectId as string),
  );

  tool('list_dsar', 'List all Data Subject Access Requests for your organization.', {}, () => client.dsar.list());
  tool(
    'update_dsar_executor',
    'Change a connected system in place — its profile, address, credential or auto flag. Only what you pass changes; the stored credential is kept unless you give a new one.',
    { id: z.string(), patch: z.record(z.unknown()) },
    (a) => client.fulfillment.updateExecutor(a.id as string, a.patch as Record<string, unknown>),
  );
  tool(
    'get_dsar',
    'One rights request by id, including its status and the deadline it must be answered by.',
    { id: z.string() },
    (a) => client.dsar.get(a.id as string),
  );
  tool(
    'erase_dsar_subject',
    'For a deletion request that is past identity verification: erase the person’s consent records on one site, identified by their consent stamp. Irreversible. The erasure is noted on the request. If the response carries a warning, nothing was cryptographically erased — tell the user.',
    { id: z.string(), cbid: z.string(), stamp: z.string() },
    (a) => client.dsar.erase(a.id as string, a.cbid as string, a.stamp as string),
  );
  tool(
    'export_dsar_subject',
    'For an access or portability request that is past identity verification: the person’s consent records on one site, identified by their consent stamp. The export is noted on the request.',
    { id: z.string(), cbid: z.string(), stamp: z.string() },
    (a) => client.dsar.export(a.id as string, a.cbid as string, a.stamp as string),
  );
  tool(
    'get_dsar_response_notice',
    'The subject-facing response notice for a request, as plain text — what to send the person. Read-only; nothing is sent.',
    { id: z.string() },
    (a) => client.dsar.response(a.id as string),
  );

  tool(
    'create_dsar',
    'Open a new Data Subject Access Request.',
    {
      type: z.enum(['access', 'deletion', 'rectification', 'portability', 'opt-out']).describe('DSAR right being exercised.'),
      subjectEmail: z.string().describe('The data subject’s email.'),
      regulation: z.enum(['gdpr', 'ccpa']).describe('Governing regulation.'),
      note: z.string().optional().describe('Optional free-text note.'),
    },
    (a) =>
      client.dsar.create({
        type: a.type as never,
        subjectEmail: a.subjectEmail as string,
        regulation: a.regulation as never,
        ...(typeof a.note === 'string' ? { note: a.note } : {}),
      }),
  );

  tool(
    'advance_dsar',
    'Advance a DSAR to a new status (received → verifying → in_progress → completed, or rejected).',
    {
      id: z.string().describe('The DSAR id.'),
      toStatus: z.enum(['received', 'verifying', 'in_progress', 'completed', 'rejected']).describe('Target status.'),
    },
    (a) => client.dsar.advance(a.id as string, a.toStatus as never),
  );

  tool(
    'export_consent',
    'Export a site’s consent log as raw CSV text.',
    { ...cbid, ...range },
    (a) => client.consent.export(a.cbid as string, { from: a.from as number | undefined, to: a.to as number | undefined }),
  );

  tool(
    'get_receipt',
    'Fetch the signed consent receipt for a single consent record (by stamp).',
    { ...cbid, stamp: z.string().describe('The consent record stamp/id.') },
    (a) => client.consent.receipt(a.cbid as string, a.stamp as string),
  );

  tool('delete_site', 'Delete a site (cbid) and its configuration from your org.', { ...cbid }, async (a) => {
    await client.sites.delete(a.cbid as string);
    return { ok: true };
  });

  tool('list_vendors', 'List vendors (processors) with their computed risk scores.', {}, () => client.vendors.list());

  tool(
    'create_vendor',
    'Register a vendor (processor) and compute its risk score.',
    {
      name: z.string().describe('Vendor name.'),
      category: z.string().describe('Vendor category, e.g. analytics.'),
      dataShared: z.array(z.string()).describe('Categories of data shared with the vendor.'),
      dpaSigned: z.boolean().describe('Whether a Data Processing Agreement is signed.'),
      subprocessors: z.number().describe('Number of subprocessors.'),
      certifications: z.array(z.string()).describe('Compliance certifications, e.g. ISO27001.'),
      region: z.string().describe('Primary processing region, e.g. EU.'),
    },
    (a) =>
      client.vendors.create({
        name: a.name as string,
        category: a.category as string,
        dataShared: a.dataShared as string[],
        dpaSigned: a.dpaSigned as boolean,
        subprocessors: a.subprocessors as number,
        certifications: a.certifications as string[],
        region: a.region as string,
      }),
  );

  tool('list_ropa', 'List Records of Processing Activities (RoPA) for your organization.', {}, () => client.ropa.list());
  tool('export_ropa_csv', 'The org’s RoPA (GDPR Art. 30) as CSV. Read-only.', {}, () => client.ropa.exportCsv());

  tool(
    'create_ropa',
    'Create a Record of Processing Activity (RoPA) entry.',
    {
      name: z.string().describe('Activity name.'),
      purpose: z.string().describe('Purpose of processing.'),
      legalBasis: z
        .enum(['consent', 'contract', 'legal-obligation', 'vital-interests', 'public-task', 'legitimate-interests'])
        .describe('GDPR legal basis.'),
      dataCategories: z.array(z.string()).describe('Categories of personal data.'),
      recipients: z.array(z.string()).describe('Recipients of the data.'),
      retentionDays: z.number().describe('Retention period in days.'),
      crossBorderTransfer: z.boolean().describe('Whether data is transferred across borders.'),
    },
    (a) =>
      client.ropa.create({
        name: a.name as string,
        purpose: a.purpose as string,
        legalBasis: a.legalBasis as never,
        dataCategories: a.dataCategories as string[],
        recipients: a.recipients as string[],
        retentionDays: a.retentionDays as number,
        crossBorderTransfer: a.crossBorderTransfer as boolean,
      }),
  );

  tool('get_site_cookies', 'List the cookies discovered on a site, with their consent categories.', { ...cbid }, (a) =>
    client.sites.cookies(a.cbid as string),
  );

  tool('scan_site', 'Trigger a cookie scan for a site. Returns the scan job state.', { ...cbid }, (a) =>
    client.sites.scan(a.cbid as string),
  );

  tool('get_scan_status', 'Get the status/result of a site’s most recent cookie scan.', { ...cbid }, (a) =>
    client.sites.scanStatus(a.cbid as string),
  );

  tool('get_ab_results', 'Get A/B banner experiment results (per variant) for a site.', { ...cbid }, (a) =>
    client.sites.ab(a.cbid as string),
  );

  tool('list_brand_kits', 'List reusable brand kits (colors/logo/typography) for your org.', {}, () => client.brandKits.list());

  tool('list_preferences', 'List configurable consent preferences/purposes for your org.', {}, () => client.preferences.list());

  tool('list_members', 'List the members of your organization.', {}, () => client.members.list());

  tool('list_api_keys', 'List the API keys for your organization (secrets are not returned).', {}, () => client.keys.list());

  tool('get_usage', 'Get the current usage/quota summary for your organization.', {}, () => client.usage());

  tool('list_webhooks', 'List webhook subscriptions for your organization.', {}, () => client.webhooks.list());

  tool(
    'create_webhook',
    'Create a webhook subscription. The response includes the signing secret (shown once).',
    {
      url: z.string().describe('HTTPS endpoint to deliver events to.'),
      events: z.array(z.string()).describe('Event names to subscribe to, e.g. consent.created.'),
      cbid: z.string().optional().describe('Optional site cbid to scope the subscription to.'),
    },
    (a) =>
      client.webhooks.create({
        url: a.url as string,
        events: a.events as string[],
        ...(typeof a.cbid === 'string' ? { cbid: a.cbid } : {}),
      }),
  );

  tool(
    'roll_webhook_secret',
    'Rotate a webhook subscription’s signing secret. The new secret is returned once; the receiving endpoint must be updated to verify with it.',
    { id: z.string() },
    (a) => client.webhooks.rollSecret(a.id as string),
  );

  tool(
    'test_webhook',
    'Send a signed test event to a webhook subscription now, and report what the endpoint answered.',
    { id: z.string() },
    (a) => client.webhooks.test(a.id as string),
  );

  tool(
    'list_webhook_dead_letters',
    'Webhook deliveries that failed every retry, newest first, with the last status or error. Read-only.',
    {},
    () => client.webhooks.deadLetters(),
  );

  tool(
    'replay_webhook_dead_letter',
    'Deliver a dead-lettered webhook event again, to the subscription as it is now.',
    { id: z.string() },
    (a) => client.webhooks.replayDeadLetter(a.id as string),
  );

  tool(
    'update_webhook',
    'Change a webhook subscription, or pause it with active:false (delivery stops; the subscription is kept). Only the fields given change. cbid: null widens it to every property in the org.',
    {
      id: z.string(),
      url: z.string().optional(),
      events: z.array(z.string()).optional(),
      cbid: z.string().nullable().optional(),
      active: z.boolean().optional(),
    },
    (a) =>
      client.webhooks.update(a.id as string, {
        ...(a.url !== undefined ? { url: a.url as string } : {}),
        ...(a.events !== undefined ? { events: a.events as string[] } : {}),
        ...(a.cbid !== undefined ? { cbid: a.cbid as string | null } : {}),
        ...(a.active !== undefined ? { active: a.active as boolean } : {}),
      }),
  );

  tool('delete_webhook', 'Delete a webhook subscription by id.', { id: z.string().describe('The webhook subscription id.') }, async (a) => {
    await client.webhooks.delete(a.id as string);
    return { ok: true };
  });

  tool(
    'verify_site',
    'Verify that your organization controls a domain by one of three challenge methods (dns / meta / file). Required to unlock consent export and signed receipts.',
    { ...cbid, method: z.enum(['dns', 'meta', 'file']).describe('Challenge method: dns (TXT record), meta (HTML tag), or file (/.well-known/cookiemunch-verify.txt).') },
    (a) => client.sites.verify(a.cbid as string, a.method as 'dns' | 'meta' | 'file'),
  );

  tool(
    'get_verification_challenge',
    'Exactly what to publish to prove control of a site’s domain: the DNS TXT record, the meta tag, the file, or installing the embed. Read-only — publish one, then call verify_site.',
    { cbid: z.string() },
    (a) => client.sites.verifyChallenge(a.cbid as string),
  );

  tool(
    'match_site_brand',
    'Extract theme colors and typography from a site\'s homepage to suggest a matching brand theme for the consent banner.',
    { ...cbid },
    (a) => client.sites.brand(a.cbid as string),
  );

  // ---------------------------------------------------------------------------
  // V2 flow-editing tools
  // ---------------------------------------------------------------------------

  tool(
    'get_flow',
    'Get the v2 banner flow config for a site, including current views, categories, and any lint issues.',
    { cbid: z.string().describe('Site identifier (cbid).') },
    (a) => client.sites.getFlow(a.cbid as string),
  );

  tool(
    'edit_flow',
    'Apply a batch of structured edit operations to a site\'s v2 banner flow. All ops are validated server-side and the final config must be lint-clean before it is saved.',
    {
      cbid: z.string().describe('Site identifier (cbid).'),
      operations: z
        .array(z.record(z.unknown()))
        .describe(
          'Ordered list of ops. Each must have an "op" field: addView | removeView | addElement | setButtonTransition | addCustomCategory.',
        ),
    },
    (a) => client.sites.editFlow(a.cbid as string, a.operations as { op: string }[]),
  );

  tool(
    'set_flow',
    'Wholesale replace a site\'s v2 banner flow with a complete config (e.g. from a template). Validated server-side before it is saved.',
    {
      cbid: z.string().describe('Site identifier (cbid).'),
      config: z.record(z.unknown()).describe('A full v2 FlowConfig object ({ v:2, flow, categories, ... }).'),
    },
    (a) => client.sites.setFlow(a.cbid as string, a.config as Record<string, unknown>),
  );

  // ---------------------------------------------------------------------------
  // Task 3: Structured, validated config tools for non-flow config domains, plus
  // the install-snippet tool. Extracted to tools-config.ts; registered here (in
  // order) via the shared `tool` registrar.
  // ---------------------------------------------------------------------------

  registerConfigTools(tool, client);

  registerPlatformTools(tool, client);

  // ---------------------------------------------------------------------------
  // Task 4: org/member/brand-kit/preference writes + issue_api_key
  //
  // SECURITY: all operations are scoped to the key's org (the SDK and dev-api
  // derive the org from the API key — callers never pass an orgId). The org OWNER
  // is protected from role-change/removal by the dev-api. Roles are runtime-
  // validated on the server to {admin, member, viewer}.
  // ---------------------------------------------------------------------------

  tool(
    'invite_member',
    'Invite a person to your organization by email. role must be admin, member, or viewer. The org is derived from the API key — you cannot invite into a different org.',
    {
      email: z.string().describe('Email address of the person to invite.'),
      role: z.enum(['admin', 'member', 'viewer']).describe('Role to assign: admin, member, or viewer. owner is not assignable via API key.'),
    },
    (a) => client.members.invite(a.email as string, a.role as string),
  );

  tool(
    'set_member_role',
    'Change the role of a member in your organization. The org owner\'s role cannot be changed.',
    {
      userId: z.string().describe('The userId of the member whose role to change.'),
      role: z.enum(['admin', 'member', 'viewer']).describe('New role: admin, member, or viewer.'),
    },
    (a) => client.members.setRole(a.userId as string, a.role as string),
  );

  tool(
    'remove_member',
    'Remove a member from your organization. The org owner cannot be removed.',
    {
      userId: z.string().describe('The userId of the member to remove.'),
    },
    async (a) => {
      await client.members.remove(a.userId as string);
      return { ok: true };
    },
  );

  tool(
    'create_brand_kit',
    'Create a reusable brand kit (colors, logo, typography) for your organization\'s consent banners.',
    {
      name: z.string().describe('Display name for the brand kit.'),
      theme: z.record(z.unknown()).describe('Theme tokens (colors, fonts, etc.) as a JSON object.'),
      content: z.record(z.unknown()).optional().describe('Optional banner copy overrides.'),
      logoUrl: z.string().optional().describe('Optional URL for your org logo.'),
      customCss: z.string().optional().describe('Optional custom CSS string to inject into the banner.'),
    },
    (a) =>
      client.brandKits.create({
        name: a.name as string,
        theme: a.theme as Record<string, unknown>,
        ...(a.content !== undefined ? { content: a.content as Record<string, unknown> } : {}),
        ...(typeof a.logoUrl === 'string' ? { logoUrl: a.logoUrl } : {}),
        ...(typeof a.customCss === 'string' ? { customCss: a.customCss } : {}),
      }),
  );

  tool(
    'delete_brand_kit',
    'Delete a brand kit by id. The kit must belong to your organization (cross-org deletes are rejected).',
    {
      id: z.string().describe('The brand kit id to delete.'),
    },
    async (a) => {
      await client.brandKits.delete(a.id as string);
      return { ok: true };
    },
  );

  tool(
    'save_preference',
    'Save or update the consent preferences for an end-user (by subjectId) within your organization. purposes is a map of purpose-name → boolean.',
    {
      subjectId: z.string().describe('The end-user identifier (e.g. email or internal user id).'),
      purposes: z.record(z.boolean()).describe('Map of purpose names to consent values, e.g. { "newsletter": true, "analytics": false }.'),
    },
    (a) => client.preferences.save(a.subjectId as string, a.purposes as Record<string, boolean>),
  );

  tool(
    'get_preference',
    'One end-user’s saved preferences, by subjectId. Read-only.',
    { subjectId: z.string() },
    (a) => client.preferences.get(a.subjectId as string),
  );

  tool(
    'issue_api_key',
    'Issue a new API key. The secret is returned once and never again. Prefer the least privilege the job needs: `scopes` limits what it can do, `cbids` locks it to specific sites (it then cannot reach anything org-wide), `expiresInDays` retires it. Omitting all three mints a full-access, org-wide, non-expiring key.',
    {
      name: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      cbids: z.array(z.string()).min(1).optional(),
      expiresInDays: z.number().int().min(1).max(3650).optional(),
    },
    (a) =>
      client.keys.issue({
        ...(a.name ? { name: a.name as string } : {}),
        ...(a.scopes ? { scopes: a.scopes as string[] } : {}),
        ...(a.cbids ? { cbids: a.cbids as string[] } : {}),
        ...(a.expiresInDays !== undefined ? { expiresInDays: a.expiresInDays as number } : {}),
      }),
  );

  tool('revoke_api_key', 'Revoke an API key by its prefix. Takes effect immediately; anything using that key stops working.', { prefix: z.string() }, async (a) => {
    await client.keys.revoke(a.prefix as string);
    return { revoked: a.prefix };
  });

  tool(
    'import_cookie_declaration',
    'Read a cookie declaration exported from another CMP (OneTrust, Cookiebot, CookieYes, or any CSV/JSON with the same columns) and translate its categories into ours. Nothing is applied — it comes back for review, with the rows whose category could not be placed listed separately.',
    { cbid: z.string(), data: z.string().describe('The exported file, as text (CSV or JSON).') },
    (a) => client.sites.importDeclaration(a.cbid as string, a.data as string),
  );

  tool(
    'get_blocked_pages',
    'Pages where the embed could not load its banner renderer — the page’s Content Security Policy or Trusted Types policy refused it, so nobody there can be asked for consent. An empty list is healthy. Read-only.',
    { cbid: z.string() },
    (a) => client.sites.blocked(a.cbid as string),
  );

  tool(
    'roll_api_key',
    'Rotate an API key: returns a new secret once, with the same name, scopes, property lock and expiry. The old secret stops working immediately — if it is the key this server runs with, this server stops working too until it is reconfigured.',
    { prefix: z.string() },
    (a) => client.keys.roll(a.prefix as string),
  );

  tool(
    'update_api_key',
    'Rename an API key, or replace its scopes or the properties it is locked to. Only the fields given change; the secret does not.',
    {
      prefix: z.string(),
      name: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      cbids: z.array(z.string()).min(1).optional(),
    },
    (a) =>
      client.keys.update(a.prefix as string, {
        ...(a.name !== undefined ? { name: a.name as string } : {}),
        ...(a.scopes ? { scopes: a.scopes as string[] } : {}),
        ...(a.cbids ? { cbids: a.cbids as string[] } : {}),
      }),
  );

  // ---- organisation ----
  tool('get_org', 'Your organisation: id, name, plan and logo URL. Read-only.', {}, () => client.org.get());

  tool(
    'update_org',
    'Rename your organisation or set its logo. logoUrl: null removes the logo; upload an image with upload_asset to get a URL. Deleting the organisation is not possible here.',
    { name: z.string().min(1).optional(), logoUrl: z.string().nullable().optional() },
    (a) =>
      client.org.update({
        ...(a.name !== undefined ? { name: a.name as string } : {}),
        ...(a.logoUrl !== undefined ? { logoUrl: a.logoUrl as string | null } : {}),
      }),
  );

  tool(
    'get_audit_log',
    'The organisation’s audit log, newest first: administrative changes made in the dashboard or through the API, and who made them. Read-only.',
    { limit: z.number().int().min(1).max(500).optional() },
    (a) => client.audit(a.limit as number | undefined),
  );

  tool(
    'upload_asset',
    'Upload an image — a banner logo — and get its public URL. data is base64 (a data: URL also works); PNG, JPEG, WebP, GIF or SVG, up to 1,000,000 bytes.',
    {
      data: z.string(),
      contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
    },
    (a) => client.assets.upload({ data: a.data as string, contentType: a.contentType as 'image/png' }),
  );

  tool(
    'delete_asset',
    'Delete a stored image by its URL (or file name). Only your own organisation’s images can be named.',
    { url: z.string().describe('The URL upload_asset returned, or just its file name.') },
    async (a) => {
      await client.assets.delete(a.url as string);
      return { deleted: a.url };
    },
  );

  // ---- reseller ----
  tool(
    'list_customers',
    'The child orgs this reseller has provisioned, with pooled usage against the reseller plan’s cap. Read-only.',
    {},
    () => client.reseller.list(),
  );

  tool('get_customer', 'One child org: its controller details and usage. Read-only.', { id: z.string() }, (a) =>
    client.reseller.get(a.id as string),
  );

  tool(
    'provision_customer',
    'Create a new child org under this reseller. With `mintKey`, its first API key is returned once. Counts toward the reseller plan’s pooled limits.',
    {
      name: z.string(),
      ownerEmail: z.string().optional(),
      delegatedAccess: z.boolean().optional().describe('Whether this reseller may act inside the child.'),
      mintKey: z.boolean().optional(),
      keyScopes: z.array(z.string()).optional(),
    },
    (a) =>
      client.reseller.create({
        name: a.name as string,
        ...(a.ownerEmail ? { ownerEmail: a.ownerEmail as string } : {}),
        ...(a.delegatedAccess !== undefined ? { delegatedAccess: a.delegatedAccess as boolean } : {}),
        ...(a.mintKey !== undefined ? { mintKey: a.mintKey as boolean } : {}),
        ...(a.keyScopes ? { keyScopes: a.keyScopes as string[] } : {}),
      }),
  );

  tool(
    'update_customer',
    'Change a child org’s status, delegated access or DSAR routing. `dsarRouting: null` clears the override.',
    {
      id: z.string(),
      status: z.enum(['active', 'suspended']).optional(),
      delegatedAccess: z.boolean().optional(),
      dsarRouting: z.enum(['reseller', 'child']).nullable().optional(),
    },
    (a) =>
      client.reseller.update(a.id as string, {
        ...(a.status ? { status: a.status as 'active' | 'suspended' } : {}),
        ...(a.delegatedAccess !== undefined ? { delegatedAccess: a.delegatedAccess as boolean } : {}),
        ...(a.dsarRouting !== undefined ? { dsarRouting: a.dsarRouting as 'reseller' | 'child' | null } : {}),
      }),
  );

  // Suspend only. The API's purge option hard-deletes a customer org and all of its data;
  // that is not something to leave one agent call away, so this tool cannot pass it.
  tool(
    'suspend_customer',
    'Suspend a child org: it stops ingesting consent and its keys stop working, and it can be reactivated with update_customer. Its data is kept. (Permanent deletion is deliberately not available here.)',
    { id: z.string() },
    async (a) => {
      await client.reseller.deprovision(a.id as string);
      return { suspended: a.id };
    },
  );

  tool('list_customer_keys', "A child org's API key prefixes. Never the secrets. Read-only.", { id: z.string() }, (a) =>
    client.reseller.listKeys(a.id as string),
  );

  tool(
    'issue_customer_key',
    "Mint an API key for a child org. The secret is returned once. Prefer scopes and a property lock over a full-access key.",
    { id: z.string(), name: z.string().optional(), scopes: z.array(z.string()).optional(), cbids: z.array(z.string()).min(1).optional() },
    (a) =>
      client.reseller.mintKey(a.id as string, {
        ...(a.name ? { name: a.name as string } : {}),
        ...(a.scopes ? { scopes: a.scopes as string[] } : {}),
        ...(a.cbids ? { cbids: a.cbids as string[] } : {}),
      }),
  );

  tool('revoke_customer_key', "Revoke a child org's API key by prefix. Takes effect immediately.", { id: z.string(), prefix: z.string() }, async (a) => {
    await client.reseller.revokeKey(a.id as string, a.prefix as string);
    return { revoked: a.prefix };
  });

  tool(
    'erase_subject_data',
    'IRREVERSIBLY crypto-erase a data subject\'s consent records by their consent-receipt stamp (GDPR/CCPA deletion). Destroys the encryption key; the tamper-evident chain stays intact.',
    { cbid: z.string(), stamp: z.string() },
    (a) => client.consent.eraseSubject(a.cbid as string, a.stamp as string),
  );

  tool(
    'export_subject_data',
    'Export a data subject\'s consent records (GDPR access/portability).',
    { cbid: z.string(), stamp: z.string() },
    (a) => client.consent.exportSubject(a.cbid as string, a.stamp as string),
  );

  // ---------------------------------------------------------------------------
  // Task 7: account-level banner library — reusable banner designs assignable
  // to many sites, decoupled from any single site's config.
  // ---------------------------------------------------------------------------

  tool('list_banners', 'List reusable banner designs in your org.', {}, () => client.banners.list());

  tool(
    'create_banner',
    'Create a reusable banner design.',
    { name: z.string(), json: z.record(z.unknown()).describe('A v2 BannerConfig.') },
    (a) => client.banners.create({ name: a.name as string, json: a.json as never }),
  );

  tool('get_banner', 'Get a banner design by id.', { id: z.string() }, (a) => client.banners.get(a.id as string));

  tool(
    'update_banner',
    'Update a banner design (name and/or config).',
    { id: z.string(), name: z.string().optional(), json: z.record(z.unknown()).optional() },
    (a) =>
      client.banners.update(a.id as string, {
        ...(a.name !== undefined ? { name: a.name as string } : {}),
        ...(a.json !== undefined ? { json: a.json as never } : {}),
      }),
  );

  tool('delete_banner', 'Delete a banner design (fails if assigned to sites).', { id: z.string() }, async (a) => {
    await client.banners.delete(a.id as string);
    return { ok: true };
  });

  tool(
    'get_banner_assignments',
    'The sites (cbids) a banner design is currently assigned to. Read-only.',
    { id: z.string() },
    (a) => client.banners.assignments(a.id as string),
  );

  tool(
    'assign_banner',
    'Set which sites (cbids) use a banner design.',
    { id: z.string(), cbids: z.array(z.string()) },
    (a) => client.banners.setAssignments(a.id as string, a.cbids as string[]),
  );

  tool('publish_banner', 'Publish a design live to all its assigned sites.', { id: z.string() }, (a) =>
    client.banners.publish(a.id as string),
  );
}
