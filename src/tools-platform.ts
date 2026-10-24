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
    'Systems connected to run part of a rights request themselves — an identity platform, a CRM, anything with a rights API. The in-VPC agent covers systems we cannot reach; these are the ones we can. Each carries the profile that describes its API. Never returns credentials. Read-only.',
    {},
    () => client.fulfillment.executors(),
  );

  tool(
    'get_dsar_executor',
    'One connected system with its full profile (never its credentials). Read it before changing the profile: update_dsar_executor replaces the whole profile, so send back the complete one with your change made.',
    { id: z.string().describe('The connection id.') },
    (a) => client.fulfillment.executor(a.id as string),
  );

  tool(
    'connect_dsar_executor',
    'Connect a system that runs part of a rights request — an identity platform, a CRM, anything with a rights API. Cookie Munch is not specific to any platform: the `profile` describes that system\'s API (paths, the words it uses for export/erase, its status vocabulary, how it signs webhooks), so connecting a new one needs no code. The secret key is stored encrypted and never returned; the response carries the webhook URL to configure in that system. Sub-tasks open automatically once a request reaches fulfilment (after identity verification), and completions are picked up by webhook or by polling.',
    {
      preset: z
        .string()
        .optional()
        .describe('Build profile (and, unless the preset takes baseUrl as a param, baseUrl) from a versioned preset instead of sending profile. list_dsar_executor_presets names them, what each needs, and which wait on another platform.'),
      presetVersion: z.number().int().optional().describe('With preset: the version to build. Default the latest.'),
      orgId: z.string().optional().describe("A preset param, when the preset's params list it."),
      atlasIdAppId: z.string().optional().describe("A preset param, when the preset's params list it: the identity platform's app id, kept for revokeAtlasIdGrant."),
      revokeAtlasIdGrant: z.boolean().optional().describe('A preset param, when the preset\'s params list it: default false. True adds an optional step that revokes the person\'s app grant on erasure; a credential without the scope reports skipped: insufficient_scope.'),
      label: z.string().optional().describe('Your name for the credential, shown beside keyPrefix.'),
      system: z.string().optional().describe('The name this connection answers to in a plan, e.g. identity or crm. Required unless the preset has a default.'),
      baseUrl: z.string().optional().describe("The system's public https origin. Required unless the preset sets it."),
      secretKey: z.string().describe('Its API key, with whatever scope that system needs to export and erase a user.'),
      webhookSecret: z.string().optional().describe('Signing secret of its webhook endpoint. Optional: polling closes tasks without it.'),
      auto: z.boolean().optional().describe('Open a sub-task automatically when a request reaches fulfilment. Default true.'),
      orchestrator: z.union([z.literal(1), z.literal(2)]).optional().describe('How it takes part in cases. Default 2 (v2 headers on every call); 1 is the v1 adapter. The answer carries a completionSecret, shown once, that signs its completions.'),
      profile: z
        .record(z.unknown())
        .optional()
        .describe('How to drive that system: { open, poll, statuses } required, plus optional subjectLookup, auth, idempotencyHeader, grantRevoke and webhook. Omit it when using preset.'),
      dryRun: z.boolean().optional().describe('Validate everything and answer the connection that would be created, storing nothing.'),
    },
    (a) => {
      const { dryRun, ...input } = a as Record<string, unknown>;
      return dryRun === true ? client.fulfillment.dryRunConnectExecutor(input as never) : client.fulfillment.connectExecutor(input as never);
    },
  );

  tool(
    'get_category_registry',
    'The reserved consent categories any site can switch on with categories.suite (support_chat, referrals): each one\u2019s stance, the standard category to fall back on, the regulatory basis, its wording in every banner language, and known vendors. Public, read-only.',
    {},
    () => client.consent.categoryRegistry(),
  );

  tool(
    'list_dsar_executor_presets',
    "The versioned executor presets: each one's name, params, latest version, and whether it is usable now or waits on another platform's API (waitingOn names the platform and its spec items). Also this org's canary address for connection tests. Read-only.",
    {},
    () => client.fulfillment.executorPresets(),
  );

  tool(
    'upgrade_dsar_executor_preset',
    "Rebuild a connection's profile and address from its preset's latest version (or presetVersion), keeping its id, credentials, system and scope — or adopt a preset on a hand-written connection by naming it. Your hand edits (profileOverrides) are kept and listed in the diff as kept or conflict; acceptPreset takes the preset's value for a path. A pinned connection (presetPinned) is refused. Use dryRun first: the answer shows exactly what would change and nothing is stored.",
    {
      id: z.string().describe('The connection id.'),
      preset: z.string().optional().describe('Only to adopt a preset on a connection that has none.'),
      presetVersion: z.number().int().optional(),
      orgId: z.string().optional(),
      atlasIdAppId: z.string().optional(),
      revokeAtlasIdGrant: z.boolean().optional(),
      acceptPreset: z.array(z.string()).optional().describe('Overridden paths (profileOverrides) that take the preset\'s value again, e.g. ["profile.grantRevoke"]. Every other override is kept.'),
      dryRun: z.boolean().optional().describe('Answer the diff and change nothing.'),
    },
    (a) => {
      const { id, dryRun, ...input } = a as Record<string, unknown>;
      return dryRun === true
        ? client.fulfillment.dryRunUpgradeExecutorPreset(id as string, input as never)
        : client.fulfillment.upgradeExecutorPreset(id as string, input as never);
    },
  );

  tool(
    'test_dsar_executor_webhook',
    "Would this webhook delivery from a connected system verify? Runs the receiver's exact check (headers, timestamp tolerance, prefix, HMAC) on headers and a raw body you supply, acts on nothing, and returns { verified, stage, reason } naming the stage that failed. `body` must be the raw request body string, byte for byte. Read-only.",
    {
      id: z.string().describe('The connection id.'),
      headers: z.record(z.string()).describe('The delivery headers, e.g. its id, timestamp and signature headers.'),
      body: z.string().describe('The raw body exactly as it was signed.'),
    },
    (a) => client.fulfillment.testExecutorWebhook(a.id as string, { headers: a.headers as Record<string, string>, body: a.body as string }),
  );

  tool(
    'list_dsar_executor_webhook_deliveries',
    "The last 50 deliveries to a connected system's webhook, newest first, each with whether it verified and, if not, the stage and reason. Never includes the secret, the signature or the body (only a short hash and size). Read-only.",
    { id: z.string().describe('The connection id.') },
    (a) => client.fulfillment.executorWebhookDeliveries(a.id as string),
  );

  tool(
    'recheck_dsar_executor',
    "Re-check a connected system now: a canary test (no real person) whose answer is recorded as the connection's health, so a stale failure clears at once. For after deploying that system's rights API.",
    { id: z.string().describe('The connection id.') },
    (a) => client.fulfillment.recheckExecutor(a.id as string),
  );

  tool(
    'list_dsar_executor_health_history',
    "A connected system's last health checks, newest first (each with ok, verdict and lastCheckedAt). Read-only.",
    { id: z.string().describe('The connection id.'), limit: z.number().int().min(1).max(50).optional().describe('Default 50.') },
    (a) => client.fulfillment.executorHealthHistory(a.id as string, typeof a.limit === 'number' ? { limit: a.limit } : {}),
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
    'get_dsar_task',
    'One fulfilment task in detail: its status history, what it means for the person (exported, no record, done without an export…), every request Cookie Munch made to the connected system on its behalf with the answer it got (credentials removed, kept 30 days), and whether that system was redeployed mid-request. Read-only. Use it to explain why a system answered the way it did.',
    { requestId: z.string(), taskId: z.string() },
    (a) => client.fulfillment.task(a.requestId as string, a.taskId as string),
  );

  tool(
    'test_dsar_executor',
    'Try a connected system against one email (or the org canary, canary: true) WITHOUT filing a rights request. Runs its subject lookup and returns the raw upstream answers (credentials removed) and a one-line verdict; code base_url_redirects means its baseUrl redirects and the verdict names where. The open step is rendered but not sent, unless open is true on an export, which opens and polls a real export once. An erasure is never sent by a test.',
    {
      id: z.string().describe('The connection id.'),
      email: z.string().optional().describe('The address to look up. Omit it with canary.'),
      canary: z.boolean().optional().describe("Use this org's canary address — no real person involved. A canary locate also updates the connection's health."),
      operation: z.enum(['locate', 'export', 'erase']).optional().describe('Default locate.'),
      open: z.boolean().optional().describe('For export only: open a real export and poll it once.'),
    },
    (a) =>
      client.fulfillment.testExecutor(a.id as string, {
        ...(typeof a.email === 'string' ? { email: a.email } : {}),
        ...(a.canary === true ? { canary: true } : {}),
        ...(a.operation ? { operation: a.operation as 'locate' | 'export' | 'erase' } : {}),
        ...(typeof a.open === 'boolean' ? { open: a.open } : {}),
      }),
  );

  tool(
    'run_executor_conformance',
    'Run the cm-standard-v2 conformance kit against a connected system: every rule of the open executor contract (lookup by email and identity, no email match across identities, executeAfter honoured, idempotency, cancel keeps data, 404s, X-Version), on this org\'s canary subject only — no real person. Each rule passes, fails or is skipped by name. Only for a cm-standard-v2 connection.',
    { id: z.string().describe('The connection id.') },
    (a) => client.fulfillment.executorConformance(a.id as string),
  );

  tool(
    'roll_executor_completion_secret',
    'Mint a new completion secret for a connected system\'s signed completions. The new secret is in the answer, once — hand it to that system. The old one keeps verifying for 24 hours.',
    { id: z.string().describe('The connection id.') },
    (a) => client.fulfillment.rollExecutorCompletionSecret(a.id as string),
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
