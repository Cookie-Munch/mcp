/**
 * MCP tools for a site's identity and its integrations as a whole: rename/move a site, the
 * integration-health report, one-call provisioning, and partner trust links.
 */

import { z } from 'zod';
import type { CookieMunchClient } from '@cookiemunch/sdk';
import type { ToolRegistrar } from './tools.js';

export function registerIntegrationTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  const updateSiteSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    domain: z.string().optional().describe('New domain, a bare hostname. A move clears verification: verify the new domain afterwards.'),
    name: z.string().nullable().optional().describe('Display name data subjects see on the rights page and in notices; null clears it.'),
    aliases: z.array(z.string()).optional().describe('Other hosts serving the site (replaces the list; [] clears it). Accepted consent origins, never verified claims.'),
    dryRun: z.boolean().optional().describe('Answer with the diff and its effects, storing nothing.'),
  });
  tool(
    'update_site',
    'Rename or move a site: its domain, display name and aliases. The cbid and the consent ledger stay. Moving the domain clears verification; the scanner and preview links follow the new domain. Use dryRun first to see the diff and every effect.',
    updateSiteSchema.shape,
    (a) => {
      const { cbid, dryRun, ...patch } = updateSiteSchema.parse(a);
      return client.sites.update(cbid, patch, { dryRun });
    },
  );

  tool(
    'integration_health',
    'Check every link a site’s privacy wiring depends on: the domain, the snippet and CSP on the live page, connected systems (base URL redirects, a test lookup), webhooks, partner links, Atlas cookie_consent, cookies needing review, the rights page, the mail provider and the request SLA. Each row has ok (null = could not check) and a fix hint. Read-only.',
    { cbid: z.string().optional().describe('Site identifier; optional when the org has one site.') },
    (a) => client.integrationHealth(a.cbid as string | undefined),
  );

  tool(
    'list_health_waivers',
    'The site’s integration-health waivers: checks the organisation chose not to meet, each with its reason, who set it and until when. Read-only.',
    { cbid: z.string().optional().describe('Site identifier; optional when the org has one site.') },
    (a) => client.healthWaivers.list(a.cbid as string | undefined),
  );

  const waiverSchema = z.object({
    cbid: z.string().optional().describe('Site identifier; optional when the org has one site.'),
    check: z.string().describe('A row’s check or kind, e.g. atlas.cookie_consent.'),
    subject: z.string().optional().describe('A row’s subject; omitted: every subject of the check.'),
    reason: z.string().describe('Why this is deliberate (shown on the row and in the audit log).'),
    until: z.union([z.string(), z.number()]).nullable().optional().describe('When the waiver ends (ISO date or epoch ms, within a year); omitted: never.'),
  });
  tool(
    'set_health_waiver',
    'Waive an integration-health check the organisation deliberately does not meet: the row then reports ok:null with waived {reason, by, until} instead of failing. Audited. Use only for real, deliberate choices; fix the rest.',
    waiverSchema.shape,
    (a) => client.healthWaivers.set(waiverSchema.parse(a)),
  );

  tool(
    'remove_health_waiver',
    'Remove an integration-health waiver, so the check reports its real state again. Audited.',
    { check: z.string(), cbid: z.string().optional(), subject: z.string().optional().describe('Default: every subject (*).') },
    (a) => client.healthWaivers.remove(a.check as string, { ...(a.cbid ? { cbid: a.cbid as string } : {}), ...(a.subject ? { subject: a.subject as string } : {}) }),
  );

  tool(
    'get_embed_manifest',
    'A site’s embed manifest (the tenant variant of /.well-known/cookiemunch-embed.json): every origin the Cookie Munch embed touches on that site, by CSP directive (non-origin sources such as \'unsafe-inline\' under requires), every cookie and browser-storage key it writes with category and lifetime, the checkers’ User-Agent, and the hosts of the site’s rights page and preference centre. Use it to build a Content-Security-Policy. Read-only.',
    { cbid: z.string() },
    (a) => client.embedManifest(a.cbid as string),
  );

  const provisionSchema = z.object({
    product: z.string().describe('A slug naming the product.'),
    domain: z.string().describe('The product’s domain (bare hostname).'),
    name: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    cbid: z.string().optional().describe('Update this site instead of matching by domain.'),
    atlas: z.object({ secretKey: z.string(), cookieConsent: z.boolean().optional(), dsrWebhook: z.boolean().optional(), rightsIdentity: z.boolean().optional().describe('Default true: make Atlas the site\'s rights sign-in, so signed-in requests are verified. A provider already in use is kept.'), frontendApiHost: z.string().optional().describe('Your Atlas frontend API host (auth.example.com): declares the Atlas sign-in cookies on the site.') }).optional()
      .describe('Atlas secret key (sk_…) — used for this call only, never stored or returned.'),
    forumulate: z.object({ token: z.string(), orgId: z.string(), consent: z.boolean().optional(), executorKey: z.boolean().optional(), label: z.string().optional() }).optional()
      .describe('Forumulate org token — used for this call only, never stored or returned.'),
    rightsApi: z.object({ baseUrl: z.string(), secretKey: z.string(), profilePreset: z.string().optional() }).optional(),
    dryRun: z.boolean().optional().describe('Report what each step would do; write nothing on any platform. Run this first.'),
  });
  tool(
    'provision_product',
    'Wire a product’s privacy in one call: create or update the site, connected systems, the Atlas request-completion webhook and hosted-page consent banner, and Forumulate consent and executor key. Writes across three platforms; run with dryRun first. Idempotent: a re-run answers every step unchanged. No secret appears in the result.',
    provisionSchema.shape,
    (a) => {
      const { dryRun, ...input } = provisionSchema.parse(a);
      return client.provision(input, { dryRun });
    },
  );

  tool(
    'list_site_partners',
    'Which partner platforms receive this site’s consent events, each with its status, and which partners are on offer. Read-only.',
    { cbid: z.string() },
    (a) => client.sites.listPartners(a.cbid as string),
  );

  const linkSchema = z.object({
    cbid: z.string(),
    partner: z.string().describe('A partner this deployment knows: forumulate, atlas, chatly, referalli, or any other registered on it (list_site_partners shows them).'),
    externalId: z.string().describe('The partner’s id for the receiving account, e.g. a Forumulate organisation id.'),
    label: z.string().optional().describe('Shown with the partner name, e.g. "docs".'),
    events: z.array(z.enum(['consent.recorded', 'consent.withdrawn'])).optional(),
    dryRun: z.boolean().optional(),
  });
  tool(
    'link_site_partner',
    'Grant a partner platform this site’s consent events (they start flowing out to it). No secret is created: deliveries are signed with Cookie Munch’s own key. Idempotent.',
    linkSchema.shape,
    (a) => {
      const { cbid, dryRun, ...input } = linkSchema.parse(a);
      return client.sites.linkPartner(cbid, input, { dryRun });
    },
  );

  tool(
    'unlink_site_partner',
    'Revoke a partner link: no further consent events go to that partner.',
    { cbid: z.string(), linkId: z.string() },
    (a) => client.sites.unlinkPartner(a.cbid as string, a.linkId as string),
  );
}
