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

  const provisionSchema = z.object({
    product: z.string().describe('A slug naming the product.'),
    domain: z.string().describe('The product’s domain (bare hostname).'),
    name: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    cbid: z.string().optional().describe('Update this site instead of matching by domain.'),
    atlas: z.object({ secretKey: z.string(), cookieConsent: z.boolean().optional(), dsrWebhook: z.boolean().optional(), frontendApiHost: z.string().optional().describe('Your Atlas frontend API host (auth.example.com): declares the Atlas sign-in cookies on the site.') }).optional()
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
    'Which partner platforms (Forumulate, Atlas) receive this site’s consent events, each with its status, and which partners are on offer. Read-only.',
    { cbid: z.string() },
    (a) => client.sites.listPartners(a.cbid as string),
  );

  const linkSchema = z.object({
    cbid: z.string(),
    partner: z.enum(['forumulate', 'atlas']),
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
