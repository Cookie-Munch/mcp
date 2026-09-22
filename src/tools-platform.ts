/**
 * MCP tools for the platform surfaces beyond the CMP: identity resolution, the Permission
 * Vault, profiles, subscriptions, assessments, data discovery, DSR fulfillment and AI
 * governance.
 *
 * Registered through the same ToolRegistrar as the core tools, so error wrapping and ordering
 * stay consistent. Descriptions spell out the CONSEQUENCE of each call (what it mutates, what
 * it gates) — an agent picking a tool from a one-line summary needs to know that `link` merges
 * two people permanently and that `activate` is consent-gated.
 */

import { z } from 'zod';
import type { CookieMunchClient, FulfillmentOp, Identifier } from '@cookiemunch/sdk';
import type { ToolRegistrar } from './tools.js';

const identifierSchema = z
  .array(z.object({ space: z.string(), value: z.string() }))
  .describe("A person's identifiers, e.g. [{space:'email_sha256', value:'<sha256 of the lowercased email>'}].");

const ids = (a: Record<string, unknown>): Identifier[] => a.identifiers as Identifier[];

export function registerPlatformTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  // ---- identity ----
  tool(
    'resolve_identity',
    'Resolve identifiers to the canonical subject id for one person, or null if unknown. Read-only.',
    { identifiers: identifierSchema },
    (a) => client.identity.resolve(ids(a)),
  );

  tool(
    'get_identity_cluster',
    'Every identifier currently stitched to one subject — what resolve_identity and link_identity have merged. Read-only.',
    { subjectId: z.string() },
    (a) => client.identity.cluster(a.subjectId as string),
  );

  tool(
    'link_identity',
    'Stitch identifiers together as ONE person and return the canonical subject id. This is a durable merge: if the identifiers already belong to different subjects, those subjects are combined and their consent and profile data are carried onto the survivor. Use resolve_identity if you only need to look someone up.',
    { identifiers: identifierSchema },
    (a) => client.identity.link(ids(a)),
  );

  // ---- permission vault ----
  tool(
    'record_consent_decision',
    'Record consent decisions against the resolved person in the Permission Vault. The latest decision per purpose wins, so this is how a withdrawal is registered too (allowed:false).',
    {
      identifiers: identifierSchema,
      decisions: z
        .array(z.object({
          purpose: z.string(),
          allowed: z.boolean(),
          legalBasis: z.string().optional(),
          jurisdiction: z.string().optional(),
          provenance: z.string().optional().describe('Where the decision came from, e.g. banner_accept_all, gpc, preference_center.'),
          collectedAt: z.number().optional().describe('Unix ms; latest per purpose wins.'),
        }))
        .describe('One entry per purpose.'),
    },
    (a) => client.vault.record(ids(a), a.decisions as never),
  );

  tool(
    'get_consent_state',
    "A person's current allow/deny per purpose, resolved across ALL their identifiers. Read-only.",
    { identifiers: identifierSchema },
    (a) => client.vault.current(ids(a)),
  );

  tool(
    'list_permits',
    "A person's consent decisions in full: per purpose, allowed or not, with the legal basis, jurisdiction, where it was collected and when. The audit-grade view behind get_consent_state. Read-only.",
    { identifiers: identifierSchema },
    (a) => client.vault.permits(ids(a)),
  );

  // ---- profile ----
  tool(
    'get_profile',
    'The unified profile for a person: their identifiers, current permits and first-party attributes. Read-only.',
    { identifiers: identifierSchema },
    (a) => client.profile.get(ids(a)),
  );

  tool(
    'set_profile_attributes',
    'Set first-party profile attributes for a person. A newer collectedAt wins over an older value.',
    {
      identifiers: identifierSchema,
      attributes: z
        .record(z.object({ value: z.string(), purpose: z.string().optional(), collectedAt: z.number().optional() }))
        .describe('Attribute name to value, e.g. { plan: { value: "pro" } }.'),
    },
    (a) => client.profile.setAttributes(ids(a), a.attributes as never),
  );

  tool(
    'activate_profile',
    'Get the attribute values usable for a purpose. CONSENT-GATED: returns {} when the person has not consented to that purpose, so it is safe to call before sending data to a marketing or AI destination.',
    { identifiers: identifierSchema, purpose: z.string().describe('The activation purpose, e.g. marketing.') },
    (a) => client.profile.activate(ids(a), a.purpose as string),
  );

  // ---- subscriptions ----
  tool(
    'get_subscriptions',
    "A subject's marketing subscription state (topics x channels). Read-only.",
    { subjectId: z.string() },
    (a) => client.subscriptions.get(a.subjectId as string),
  );

  tool(
    'set_subscription',
    'Opt a subject in or out of one topic on one channel.',
    {
      subjectId: z.string(),
      topic: z.string(),
      channel: z.string().describe('email | sms | push | mail | phone, or a custom channel.'),
      optedIn: z.boolean(),
    },
    (a) => client.subscriptions.set(a.subjectId as string, a.topic as string, a.channel as string, a.optedIn as boolean),
  );

  tool(
    'global_unsubscribe',
    'Suppress every topic and channel for a subject WITHOUT erasing their per-topic choices, so a later resubscribe restores them.',
    { subjectId: z.string() },
    (a) => client.subscriptions.unsubscribeAll(a.subjectId as string),
  );

  tool(
    'resubscribe',
    'Lift a global unsubscribe. Restores the per-topic choices the subject had before it — it does not opt them in to anything they had not chosen.',
    { subjectId: z.string() },
    (a) => client.subscriptions.resubscribe(a.subjectId as string),
  );

  tool(
    'get_subscription_activation',
    "What to send downstream for a subject: per topic and channel, whether they are subscribed and which mapped downstream group (e.g. an ESP list id) that is. Honours a global unsubscribe. Read-only.",
    {
      subjectId: z.string(),
      topics: z
        .array(
          z.object({
            code: z.string(),
            name: z.string().optional(),
            channels: z.array(z.string()),
            downstream: z.record(z.string(), z.string()).optional(),
          }),
        )
        .describe('The topics to resolve, usually the catalog from get_subscription_topics.'),
    },
    (a) => client.subscriptions.activation(a.subjectId as string, a.topics as never),
  );

  // ---- assessments ----
  tool(
    'list_assessment_templates',
    'The assessment templates available (DPIA, PIA, LIA, TIA, AI impact, vendor) and the questions each asks.',
    {},
    () => client.assessments.templates(),
  );

  tool(
    'list_assessments',
    'Every assessment in the org with its status: draft, in_review, approved or rejected. Read-only.',
    {},
    () => client.assessments.list(),
  );

  tool(
    'autopopulate_assessment',
    'Prefill an assessment from evidence you supply. Never overwrites a human answer, and stamps every filled answer with `source` so a reviewer can see where it came from. The assessment still needs a human to submit and approve it.',
    { id: z.string(), evidence: z.record(z.string(), z.unknown()).describe('questionId → answer.'), source: z.string().optional() },
    (a) => client.assessments.autoPopulate(a.id as string, a.evidence as Record<string, unknown>, a.source as string | undefined),
  );

  tool(
    'start_assessment',
    'Start an assessment from a template against a subject (a processing activity, system or vendor).',
    {
      template: z.string().describe('dpia | pia | lia | tia | ai_impact | vendor'),
      subject: z.string().describe('What is being assessed.'),
    },
    (a) => client.assessments.start(a.template as string, a.subject as string),
  );

  tool(
    'get_assessment',
    'An assessment with its derived risk score, completeness (what is still missing) and which SME owns each outstanding question.',
    { id: z.string() },
    (a) => client.assessments.get(a.id as string),
  );

  tool(
    'answer_assessment_question',
    'Record one answer on an assessment. Note: answering an APPROVED assessment reopens it to draft, because changing the facts invalidates the sign-off.',
    { id: z.string(), questionId: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) },
    (a) => client.assessments.answer(a.id as string, a.questionId as string, a.value as string | number | boolean),
  );

  tool(
    'autopopulate_assessment_from_data_map',
    'Fill an assessment from the organisation’s latest data-map scan. Only facts the scan can establish are applied, a human’s existing answer is never overwritten, and machine answers are stamped with provenance so a reviewer can tell them apart.',
    { id: z.string() },
    (a) => client.assessments.autoPopulateFromMap(a.id as string),
  );

  tool(
    'submit_assessment',
    'Submit an assessment for review. Refused while any required question is unanswered.',
    { id: z.string() },
    (a) => client.assessments.submit(a.id as string),
  );

  // ---- discovery ----
  tool(
    'get_data_map',
    'The latest data map: which systems hold personal data, and which categories. Read-only.',
    {},
    () => client.discovery.getMap(),
  );

  tool(
    'get_data_drift',
    'What changed in the estate since the previous scan, and where the documented RoPA disagrees with what is actually there (undocumented systems, undeclared data categories, stale records).',
    {},
    () => client.discovery.drift(),
  );

  tool(
    'get_ropa_drafts',
    'Draft processing-activity records generated from the latest data map. These are DRAFTS: the factual fields come from the scan, the legal ones still need a human.',
    {},
    () => client.discovery.ropaDrafts(),
  );

  tool(
    'get_discovery_evidence',
    'The assessment answers the latest data map can actually support — only questions a scan can genuinely answer, never guesses. What autopopulate_assessment_from_data_map would apply. Read-only.',
    {},
    () => client.discovery.evidence(),
  );

  tool(
    'plan_warehouse_enforcement',
    'Plan warehouse-native policy (Snowflake masking / row access, Postgres RLS) from the latest data map. ' +
      'Returns a PLAN and its revert — nothing is applied to the warehouse by calling this. Also reports what ' +
      'it declined to do and why, so gaps are visible rather than silently missing.',
    {
      dialect: z.enum(['postgres', 'mysql', 'snowflake']),
      rules: z
        .array(
          z.object({
            id: z.string(),
            action: z.enum(['mask', 'restrict']),
            minSensitivity: z.enum(['personal', 'sensitive']).optional(),
            categories: z.array(z.string()).optional(),
            allowRoles: z.array(z.string()).optional(),
            purpose: z.string().optional(),
            subjectColumn: z.string().optional(),
          }),
        )
        .describe('A rule with neither minSensitivity nor categories matches nothing, by design.'),
      permitsTable: z.string().optional(),
      policyPrefix: z.string().optional(),
    },
    (a) =>
      client.discovery.planEnforcement(
        a.dialect as 'postgres' | 'mysql' | 'snowflake',
        a.rules as Parameters<typeof client.discovery.planEnforcement>[1],
        {
          ...(typeof a.permitsTable === 'string' ? { permitsTable: a.permitsTable } : {}),
          ...(typeof a.policyPrefix === 'string' ? { policyPrefix: a.policyPrefix } : {}),
        },
      ),
  );

  // ---- subscription topic catalog ----
  tool(
    'get_subscription_topics',
    "The org's marketing topic catalog — what a subject can subscribe to, and on which channels. Read-only.",
    {},
    () => client.subscriptions.topics(),
  );

  tool(
    'set_subscription_topics',
    'Replace the subscription topic catalog. The list is authored whole, so anything omitted is removed.',
    {
      topics: z.array(
        z.object({
          code: z.string(),
          name: z.string().optional(),
          channels: z.array(z.string()),
          downstream: z.record(z.string()).optional(),
        }),
      ),
    },
    (a) => client.subscriptions.setTopics(a.topics as Parameters<typeof client.subscriptions.setTopics>[0]),
  );

  // ---- regulatory intelligence ----
  tool(
    'get_regulatory_feed',
    'The curated privacy-law dataset, optionally narrowed to the jurisdictions you operate in. ' +
      'Carries reviewedAt: this ships with the product and is only as current as its last review. Not legal advice.',
    {
      jurisdictions: z
        .array(z.string())
        .optional()
        .describe("ISO codes, e.g. ['US-CA','BR']. A subdivision also matches its country; an EEA country matches the EU-wide regulations."),
    },
    (a) => client.regulatory.feed(a.jurisdictions as string[] | undefined),
  );

  tool(
    'get_upcoming_regulations',
    'Privacy laws taking effect within a horizon (default 180 days), soonest first. Same caveat as the feed: ' +
      'a shipped dataset with a review date, not live legal research.',
    { days: z.number().int().positive().optional() },
    (a) => client.regulatory.upcoming(a.days as number | undefined),
  );

  // ---- DSR fulfillment ----
  tool(
    'get_dsr_sla',
    'The rights queue at a glance: how many requests are overdue, due today, due soon or on track, plus the overdue ids.',
    {},
    () => client.fulfillment.sla(),
  );

  tool(
    'plan_dsr_fulfillment',
    'Break a data-subject request into one fulfillment task per system. The tasks are then executed by the in-VPC agent inside the customer network — this call only queues the work.',
    {
      requestId: z.string(),
      systems: z
        .array(z.object({ system: z.string(), operation: z.enum(['locate', 'export', 'erase', 'optOut']) }))
        .describe('One entry per system to act on.'),
      includeHistorical: z.boolean().optional().describe('Also reprocess already-collected records, not just future ones.'),
    },
    (a) => client.fulfillment.plan(
      a.requestId as string,
      a.systems as Array<{ system: string; operation: FulfillmentOp }>,
      a.includeHistorical as boolean | undefined,
    ),
  );

  tool(
    'list_dsar_executors',
    'Systems connected to run part of a rights request themselves — today an Atlas instance holding the customer\'s user identities. The in-VPC agent covers systems we cannot reach; these are the ones we can. Never returns credentials. Read-only.',
    {},
    () => client.fulfillment.executors(),
  );

  tool(
    'connect_dsar_executor',
    'Connect a system that executes the identity half of a rights request. The secret key is stored encrypted and never returned; the response carries the webhook URL to configure in that system. Sub-tasks open automatically once a request reaches fulfilment (after identity verification), and completions are picked up by webhook or by polling.',
    {
      kind: z.literal('atlas'),
      baseUrl: z.string().describe("The system's public https origin."),
      secretKey: z.string().describe('Its API key. Needs data_subject_requests:write, data_subject_requests:read and users:read.'),
      webhookSecret: z.string().optional().describe('Signing secret of its webhook endpoint. Optional: polling closes tasks without it.'),
      system: z.string().optional().describe('The name it answers to in a plan. Defaults to the kind.'),
      auto: z.boolean().optional().describe('Open a sub-task automatically when a request reaches fulfilment. Default true.'),
    },
    (a) => client.fulfillment.connectExecutor(a as never),
  );

  tool(
    'disconnect_dsar_executor',
    'Disconnect a system. Its open sub-tasks stop being driven, and the stored credentials are deleted.',
    { id: z.string() },
    async (a) => {
      await client.fulfillment.disconnectExecutor(a.id as string);
      return { disconnected: a.id };
    },
  );

  tool(
    'get_dsar_task_export',
    'The export bundle a connected system produced for one sub-task, fetched from that system on demand. The platform keeps no copy.',
    { requestId: z.string(), taskId: z.string() },
    (a) => client.fulfillment.taskExport(a.requestId as string, a.taskId as string),
  );

  tool(
    'get_dsr_fulfillment_status',
    'Per-system fulfillment status for one request ("n of m systems done"), including which systems failed and why.',
    { requestId: z.string() },
    (a) => client.fulfillment.status(a.requestId as string),
  );

  // ---- AI governance ----
  tool(
    'inspect_ai_prompt',
    'Run a prompt or model response through the AI governance gateway BEFORE it reaches the model or the user. Returns action allow | redact | block plus the text to actually forward (redacted, or empty when blocked). Pass `consent` when the call concerns an identified person: data for a purpose they have not consented to is blocked outright.',
    {
      prompt: z.string(),
      purpose: z.string().describe('What the AI call is for, e.g. support or marketing.'),
      model: z.string().optional(),
      actor: z.string().optional(),
      direction: z.enum(['prompt', 'response']).optional(),
      consent: z.record(z.boolean()).optional().describe("The person's current permits, e.g. { marketing: false }."),
    },
    (a) => client.ai.inspect(a as never),
  );

  tool(
    'get_ai_policy',
    'The AI gateway policy: its rules, and what happens when no rule matches. `configured` is false while the built-in default applies. Read-only.',
    {},
    () => client.ai.getPolicy(),
  );

  tool(
    'set_ai_policy',
    'REPLACE the AI gateway policy. Takes effect on the next inspected prompt: a rule with action `block` stops matching calls, `redact` strips the matched data. `default` decides every call no rule matches — `block` fails closed.',
    {
      rules: z
        .array(
          z.object({
            id: z.string(),
            purposes: z.array(z.string()).optional(),
            categories: z.array(z.string()).optional(),
            minSensitivity: z.string().optional(),
            action: z.enum(['allow', 'redact', 'block']),
            reason: z.string().describe('Recorded on every audit entry this rule decides.'),
          }),
        )
        .describe('Evaluated in order; the first match decides.'),
      default: z.enum(['allow', 'redact', 'block']),
    },
    (a) => client.ai.setPolicy({ rules: a.rules, default: a.default }),
  );

  tool(
    'register_ai_system',
    'Declare an AI system so it appears in the inventory as registered rather than shadow. Idempotent on `id`.',
    { id: z.string(), name: z.string(), provider: z.string().optional(), purpose: z.string().optional() },
    (a) =>
      client.ai.registerSystem({
        id: a.id as string,
        name: a.name as string,
        ...(a.provider ? { provider: a.provider as string } : {}),
        ...(a.purpose ? { purpose: a.purpose as string } : {}),
      }),
  );

  tool('list_ai_systems', 'The AI systems declared with register_ai_system. Read-only.', {}, () => client.ai.systems());

  tool(
    'get_ai_audit_log',
    'Recent AI gateway decisions — what was allowed, redacted or blocked, and which rule decided. Read-only.',
    { limit: z.number().int().positive().max(500).optional() },
    (a) => client.ai.audit(a.limit as number | undefined),
  );

  tool(
    'get_ai_inventory',
    'Every AI system seen or declared, highest risk first, plus the SHADOW subset — models observed handling data that were never registered.',
    {},
    () => client.ai.inventory(),
  );

  tool(
    'get_ai_lineage',
    'Which data categories reach which model. Answers "does anything send SSNs to a vendor model?".',
    {},
    () => client.ai.lineage(),
  );
}
