/**
 * MCP tools for the hosted rights page: read and write the draft, preview a write, publish,
 * list versions and roll back. Registered through the shared ToolRegistrar.
 *
 * Also the custom-hostname tools: every call is scoped to the key's org by the API; a hostname
 * is only ever routed after its owner proves it in DNS, so adding one cannot take over traffic.
 */
import { z } from 'zod';
import type { CookieMunchClient, RightsPageDocument } from '@cookiemunch/sdk';
import type { ToolRegistrar } from './tools.js';

/** The hosted rights page as a document. */
export function registerRightsTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  const cbid = { cbid: z.string().describe('Site identifier (cbid). Must belong to your org.') };
  const base = {
    baseUpdatedAt: z.union([z.number().int(), z.string(), z.null()]).optional()
      .describe('The draft’s updatedAt from your last read (null if it had none). If someone saved since, the write is refused with 409 draft_conflict and the current draft; omit to overwrite regardless.'),
  };
  const baseOpt = (a: Record<string, unknown>) => (a.baseUpdatedAt !== undefined ? { baseUpdatedAt: a.baseUpdatedAt as number | string | null } : {});
  tool('get_rights_page', 'Read the site’s rights page DRAFT (the default page until first saved), with warnings that would block publishing.', cbid, (a) => client.rightsPage.get(a.cbid as string));
  tool(
    'update_rights_page',
    'Replace the rights page draft with a full document (theme, sections, form, i18n, seo, customCss). Nothing goes live until publish_rights_page. Prefer patch_rights_page for small changes and preview_rights_page when unsure. Pass baseUpdatedAt (from get_rights_page) to avoid overwriting someone else’s save: a mismatch is 409 draft_conflict with the current draft.',
    { ...cbid, page: z.record(z.unknown()).describe('The whole RightsPage document (v: 1).'), ...base },
    (a) => client.rightsPage.put(a.cbid as string, a.page as unknown as RightsPageDocument, baseOpt(a)),
  );
  tool(
    'patch_rights_page',
    'Change part of the rights page draft: objects merge, arrays (sections, request types, fields) replace whole, null removes a field. baseUpdatedAt works as on update_rights_page (409 draft_conflict).',
    { ...cbid, patch: z.record(z.unknown()), ...base },
    (a) => client.rightsPage.patch(a.cbid as string, a.patch as Record<string, unknown>, baseOpt(a)),
  );
  tool(
    'preview_rights_page',
    'Validate a rights-page write WITHOUT saving: returns the document as it would be stored and any publish warnings. mode "patch" (default) or "put".',
    { ...cbid, page: z.record(z.unknown()), mode: z.enum(['patch', 'put']).optional() },
    (a) => client.rightsPage.dryRun(a.cbid as string, a.page as Record<string, unknown>, { mode: (a.mode as 'patch' | 'put' | undefined) ?? 'patch' }),
  );
  tool('get_published_rights_page', 'Read the LIVE rights page document (404 not_published while the site shows the default page).', cbid, (a) => client.rightsPage.getPublished(a.cbid as string));
  tool(
    'publish_rights_page',
    'Publish the draft as the next version: it goes live at once, to every visitor. Refused unless the page has exactly one form section and an enabled request type. Pass baseUpdatedAt (from get_rights_page) so only the draft you read goes live; without it, whatever the draft holds now is published, including someone else’s later edits. A mismatch is 409 draft_conflict with the current draft.',
    { ...cbid, ...base },
    (a) => client.rightsPage.publish(a.cbid as string, baseOpt(a)),
  );
  tool('list_rights_page_versions', 'Published versions of the rights page, newest first, each with publishedBy, publishedByEmail (null for an API key) and publishedVia.', cbid, (a) => client.rightsPage.versions(a.cbid as string));
  tool(
    'rollback_rights_page',
    'Publish an earlier version of the rights page again (as a new version): it goes live at once and REPLACES the current draft, so unpublished edits are lost and cannot be recovered (versions hold only published documents). Pass baseUpdatedAt (from get_rights_page) to refuse with 409 draft_conflict if anyone saved the draft since you read it.',
    { ...cbid, version: z.number().int().min(1), ...base },
    (a) => client.rightsPage.rollback(a.cbid as string, a.version as number, baseOpt(a)),
  );
}

/** Custom hostnames for a site's hosted rights page. */
export function registerRightsPageTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  const site = z.object({ cbid: z.string().describe('Site identifier (cbid). Must belong to your org.') });
  const host = site.extend({
    hostname: z.string().describe('The custom hostname, e.g. privacy.example.com (unicode or punycode).'),
  });

  tool(
    'list_rights_page_domains',
    "List the custom hostnames serving a site's rights page, each with its status (pending_dns, verifying, issuing, active, error), the exact DNS records to create, and the plan's allowance.",
    site.shape,
    (a) => client.rightsPage.listDomains(site.parse(a).cbid),
  );

  tool(
    'add_rights_page_domain',
    "Add a custom hostname for a site's rights page (e.g. privacy.example.com). Returns the DNS records the owner must create: a CNAME to this domain's own <token>.cname.cookiemunch.net (a CNAME to anything else never verifies it), or for an apex / flattened / proxied record the _cookiemunch TXT. Then call verify_rights_page_domain. Plans include Free 0, Starter 1, Pro 5, Scale unlimited.",
    host.shape,
    (a) => {
      const { cbid, hostname } = host.parse(a);
      return client.rightsPage.addDomain(cbid, hostname);
    },
  );

  tool(
    'verify_rights_page_domain',
    'Check a custom hostname now: DNS while it is pending or in error, the HTTPS answer once it is routed. Returns the domain as it now stands; lastError and dnsSeen say what is missing.',
    host.shape,
    (a) => {
      const { cbid, hostname } = host.parse(a);
      return client.rightsPage.verifyDomain(cbid, hostname);
    },
  );

  tool(
    'remove_rights_page_domain',
    'Remove a custom hostname from a site\'s rights page. It stops being served at once and its certificate is no longer renewed.',
    host.shape,
    async (a) => {
      const { cbid, hostname } = host.parse(a);
      await client.rightsPage.removeDomain(cbid, hostname);
      return { removed: hostname };
    },
  );
}
