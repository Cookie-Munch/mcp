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

  tool(
    'create_site',
    'Create a new site. The cbid is auto-generated if you omit it.',
    { domain: z.string().describe('The site domain, e.g. example.com.'), cbid: z.string().optional().describe('Optional explicit cbid.') },
    (a) => client.sites.create({ domain: a.domain as string, ...(typeof a.cbid === 'string' ? { cbid: a.cbid } : {}) }),
  );

  tool('get_site_config', 'Get the banner/consent configuration for a site.', { ...cbid }, (a) => client.sites.getConfig(a.cbid as string));

  tool(
    'update_site_config',
    'Upsert (merge) the banner/consent configuration for a site.',
    { ...cbid, config: z.record(z.unknown()).describe('A partial SiteConfig patch to merge.') },
    (a) => client.sites.putConfig(a.cbid as string, a.config as Record<string, unknown>),
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

  tool('list_dsar', 'List all Data Subject Access Requests for your organization.', {}, () => client.dsar.list());

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
    'issue_api_key',
    'Issue a new API key for your organization. The secret is returned once — store it securely. Subsequent requests cannot retrieve the secret again.',
    {},
    () => client.keys.issue(),
  );

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
    'assign_banner',
    'Set which sites (cbids) use a banner design.',
    { id: z.string(), cbids: z.array(z.string()) },
    (a) => client.banners.setAssignments(a.id as string, a.cbids as string[]),
  );

  tool('publish_banner', 'Publish a design live to all its assigned sites.', { id: z.string() }, (a) =>
    client.banners.publish(a.id as string),
  );
}
