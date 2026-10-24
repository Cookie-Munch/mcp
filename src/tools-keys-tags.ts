/**
 * MCP tools for the key model and resource tags (CMU-D09, S02, X29, X31, X34, X35): the calling key itself,
 * vended short-lived keys, leak revocation, the standard key listing, tags on resources, suite-standard
 * partner links, and the forgedeck env of a provisioned product.
 */

import { z } from 'zod';
import type { CookieMunchClient } from '@cookiemunch/sdk';
import type { ToolRegistrar } from './tools.js';

const TAGGED = ['org', 'site', 'webhook', 'executor', 'dsar', 'partner_link'] as const;

export function registerKeyAndTagTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  tool(
    'get_own_key',
    'The API key this server runs with: its prefix, name, scopes, properties, expiry, owner and last use. Works with any key, however narrow. Use it to check how long the key has left. Read-only.',
    {},
    () => client.keys.self(),
  );

  tool(
    'list_api_keys_standard',
    'The organisation’s keys in the suite-standard shape (id, owner, kind, env, scopes, resources, created_at, expires_at, last_used_at, last_used_ip, status). Needs a full-access key. Read-only.',
    {},
    () => client.keys.listStandard(),
  );

  const vendSchema = z.object({
    scopes: z.array(z.string()).min(1).describe('A subset of this key’s own scopes.'),
    ttlSeconds: z.number().int().min(60).max(43200).describe('How long the key works, at most 12 hours.'),
    cbids: z.array(z.string()).min(1).optional().describe('Lock it to these sites (within this key’s own lock).'),
    name: z.string().max(100).optional(),
  });
  tool(
    'vend_api_key',
    'Mint a short-lived key (at most 12 hours) for a sub-task, with a subset of this key’s own scopes and properties; never a key that can vend. The secret is returned once. Needs keys:write or a full-access key.',
    vendSchema.shape,
    (a) => client.keys.vend(vendSchema.parse(a)),
  );

  tool(
    'revoke_leaked_key',
    'Revoke an API key whose secret has been published (pasted in a chat, a gist, a log). Pass the whole secret. It only ever revokes, and always answers { received } whether or not the key was live. The owner is mailed.',
    { key: z.string().describe('The leaked secret, whole.'), source: z.string().optional().describe('Where it was found (a URL).') },
    (a) => client.keys.revokeLeaked({ key: a.key as string, ...(a.source ? { source: a.source as string } : {}) }),
  );

  tool(
    'get_resource_tags',
    'A resource’s tags (metadata), its externalRef and whether it is a sandbox. Read-only.',
    { type: z.enum(TAGGED), id: z.string() },
    (a) => client.metadata.get(a.type as (typeof TAGGED)[number], a.id as string),
  );

  const tagsSchema = z.object({
    type: z.enum(TAGGED),
    id: z.string(),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).describe('Keys to set; null removes one. forgedeck_sandbox cannot be set here.'),
    dryRun: z.boolean().optional().describe('Answer with the diff, storing nothing. Do this first.'),
  });
  tool(
    'update_resource_tags',
    'Change a resource’s tags (merge). For adopting resources created before tags existed, e.g. forgedeck_product and forgedeck_env. A resource can never be made a sandbox after it was created.',
    tagsSchema.shape,
    (a) => {
      const { type, id, metadata, dryRun } = tagsSchema.parse(a);
      return client.metadata.update(type, id, metadata, { dryRun });
    },
  );

  tool(
    'list_partner_links',
    'Every partner link of the organisation (site and org links), with scopes, expiry, last use and calls in the last 30 days. Read-only.',
    { metadata: z.record(z.string()).optional().describe('Keep only links with these tags.') },
    (a) => client.partnerLinks.list(a.metadata ? { metadata: a.metadata as Record<string, string> } : undefined),
  );

  const linkSchema = z.object({
    partner: z.string().describe('A partner this deployment knows (built in or registered).'),
    resource: z.string().describe('site:<cbid> or org:<this org id>.'),
    scopes: z.array(z.enum(['consent:read', 'receipt:read', 'dsar:read', 'dsar:write', 'dsar:rights-links', 'sites:read'])).min(1),
    expires_at: z.string().optional().describe('ISO 8601, in the future.'),
    externalId: z.string().optional(),
    label: z.string().max(60).optional(),
  });
  tool(
    'create_partner_link',
    'Let a partner platform act on a site or on the organisation within these scopes (it calls the API with its own token and the link id), and, with consent:read on a site, receive that site’s consent events. No secret is created. Never grants more than this key holds.',
    linkSchema.shape,
    (a) => client.partnerLinks.create(linkSchema.parse(a)),
  );

  tool(
    'revoke_partner_link',
    'Revoke a partner link: the partner’s calls under it and its deliveries stop at once.',
    { id: z.string() },
    (a) => client.partnerLinks.revoke(a.id as string),
  );

  tool(
    'get_provision_env',
    'What `forgedeck env` writes for a product provisioned with this forgedeck ref: variable names, non-secret values (cbid, script URL, API base) and references for secrets, never a secret. Read-only.',
    { ref: z.string() },
    (a) => client.provisionEnv(a.ref as string),
  );
}
