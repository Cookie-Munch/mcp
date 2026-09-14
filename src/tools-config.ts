/**
 * Structured, validated config tools for non-flow config domains (Task 3), plus
 * the install-snippet tool. Extracted from tools.ts as a cohesive group. Each tool
 * fetches the current SiteConfig, patches only its own domain, and PUTs it back.
 *
 * registerConfigTools is handed the same `tool` registrar that registerTools uses,
 * so registration order is preserved when it is called at the right point in the
 * sequence.
 */

import { z } from 'zod';
import type { CookieMunchClient } from '@cookiemunch/sdk';
import type { ToolRegistrar } from './tools.js';

export function registerConfigTools(tool: ToolRegistrar, client: CookieMunchClient): void {
  // Reusable zod schemas mirroring config.ts enums exactly
  const blockingModeEnum = z.enum(['auto', 'manual'] as const);
  const bannerModeEnum = z.enum(['opt-in', 'opt-out', 'off'] as const);
  const bannerTypeEnum = z.enum(['multilevel', 'inline', 'accept-decline', 'accept-only', 'do-not-sell'] as const);
  const bannerLayoutEnum = z.enum(['top', 'bottom', 'push-down', 'popup', 'overlay'] as const);
  const consentModeModeEnum = z.enum(['basic', 'advanced'] as const);

  const geoRuleSchema = z.object({
    match: z.object({
      countries: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
    }),
    mode: bannerModeEnum,
  });

  const setBlockingSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    mode: blockingModeEnum.describe('Blocking mode. auto = block non-consented scripts; manual = never block.'),
    ignoreSelectors: z.array(z.string()).optional().describe('CSS selectors for elements that should never be blocked.'),
  });

  tool(
    'set_blocking',
    'Configure the script-blocking mode for a site. Fetches the current config, patches only the blocking domain, and PUTs.',
    setBlockingSchema.shape,
    async (a) => {
      const { cbid: siteId, mode, ignoreSelectors } = setBlockingSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingBlocking = (cfg['blocking'] ?? {}) as Record<string, unknown>;
      const blocking: Record<string, unknown> = {
        ...existingBlocking,
        mode,
        ...(ignoreSelectors !== undefined ? { ignoreSelectors } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, blocking });
    },
  );

  const setGeoRulesSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    geoRules: z.array(geoRuleSchema).describe('Ordered list of geo rules. First match wins.'),
    defaultMode: bannerModeEnum.optional().describe('Banner mode when no geo rule matches. Default: opt-in.'),
  });

  tool(
    'set_geo_rules',
    'Set geo-targeting rules for a site (which banner mode to show per country/region). Fetches the current config, patches only geoRules + defaultMode, and PUTs.',
    setGeoRulesSchema.shape,
    async (a) => {
      const { cbid: siteId, geoRules, defaultMode } = setGeoRulesSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      return client.sites.putConfig(siteId, {
        ...cfg,
        geoRules,
        ...(defaultMode !== undefined ? { defaultMode } : {}),
      });
    },
  );

  const setLanguagesSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    defaultCulture: z.string().optional().describe('Default locale/culture code, e.g. "en", "fr". Stored in i18n.defaultCulture.'),
    autoDetect: z.boolean().optional().describe('Auto-detect visitor language from browser locale. Stored in i18n.autoDetect.'),
    translations: z.record(z.record(z.unknown())).optional().describe('Per-locale banner copy overrides. Merged onto banner.i18n (locale keys preserved).'),
  });

  tool(
    'set_languages',
    'Configure language/i18n settings for a site: default culture, auto-detect, and per-locale banner copy. Fetches the current config, patches only i18n + banner.i18n, and PUTs.',
    setLanguagesSchema.shape,
    async (a) => {
      const { cbid: siteId, defaultCulture, autoDetect, translations } = setLanguagesSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingI18n = (cfg['i18n'] ?? {}) as Record<string, unknown>;
      const existingBanner = (cfg['banner'] ?? {}) as Record<string, unknown>;
      const existingBannerI18n = (existingBanner['i18n'] ?? {}) as Record<string, unknown>;
      const i18n: Record<string, unknown> = {
        ...existingI18n,
        ...(defaultCulture !== undefined ? { defaultCulture } : {}),
        ...(autoDetect !== undefined ? { autoDetect } : {}),
      };
      const banner: Record<string, unknown> = {
        ...existingBanner,
        ...(translations !== undefined ? { i18n: { ...existingBannerI18n, ...translations } } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, i18n, banner });
    },
  );

  const setConsentModeSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    enabled: z.boolean().describe('Whether Google Consent Mode signals are emitted.'),
    mode: consentModeModeEnum.describe('basic = gtag consent commands only; advanced = also passes redacted pings before consent.'),
    waitForUpdate: z.number().optional().describe('Milliseconds to wait for consent before gtag proceeds. Default 500.'),
  });

  tool(
    'set_consent_mode',
    'Configure Google Consent Mode for a site (enabled, basic/advanced, waitForUpdate). Fetches the current config, patches only consentMode, and PUTs.',
    setConsentModeSchema.shape,
    async (a) => {
      const { cbid: siteId, enabled, mode, waitForUpdate } = setConsentModeSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingCm = (cfg['consentMode'] ?? {}) as Record<string, unknown>;
      const consentMode: Record<string, unknown> = {
        ...existingCm,
        enabled,
        mode,
        ...(waitForUpdate !== undefined ? { waitForUpdate } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, consentMode });
    },
  );

  const setAbExperimentSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    enabled: z.boolean().describe('Whether the A/B experiment is active.'),
    splitB: z.number().min(0).max(100).describe('Percentage of visitors (0–100) who see variant B.'),
    variantB: z.record(z.unknown()).optional().describe('Partial BannerConfig override for variant B visitors. Deep-merged over the base banner.'),
  });

  tool(
    'set_ab_experiment',
    'Configure the A/B banner experiment for a site (enabled, split percentage, variant B overrides). Fetches the current config, patches only experiment, and PUTs.',
    setAbExperimentSchema.shape,
    async (a) => {
      const { cbid: siteId, enabled, splitB, variantB } = setAbExperimentSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingExperiment = (cfg['experiment'] ?? {}) as Record<string, unknown>;
      const experiment: Record<string, unknown> = {
        ...existingExperiment,
        enabled,
        splitB,
        ...(variantB !== undefined ? { variantB } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, experiment });
    },
  );

  const setConsentPolicySchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    expiryDays: z.number().optional().describe('Re-prompt visitors after this many days. Omit to disable time-based expiry.'),
    version: z.number().optional().describe('Bump this integer to force a re-prompt (e.g. when your cookie usage changes).'),
  });

  tool(
    'set_consent_policy',
    'Configure consent persistence policy for a site (expiry days, version bump). Fetches the current config, patches only consent, and PUTs.',
    setConsentPolicySchema.shape,
    async (a) => {
      const { cbid: siteId, expiryDays, version } = setConsentPolicySchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingConsent = (cfg['consent'] ?? {}) as Record<string, unknown>;
      const consent: Record<string, unknown> = {
        ...existingConsent,
        ...(expiryDays !== undefined ? { expiryDays } : {}),
        ...(version !== undefined ? { version } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, consent });
    },
  );

  const setBannerBasicsSchema = z.object({
    cbid: z.string().describe('Site identifier (cbid).'),
    type: bannerTypeEnum.optional().describe('Banner type. multilevel | inline | accept-decline | accept-only | do-not-sell.'),
    layout: bannerLayoutEnum.optional().describe('Banner layout. top | bottom | push-down | popup | overlay.'),
    theme: z.record(z.unknown()).optional().describe('Partial ThemeTokens — deep-merged onto the existing banner theme.'),
    content: z.record(z.unknown()).optional().describe('Partial BannerContent — banner copy overrides (title, body, button labels, policyUrl, etc.).'),
  });

  tool(
    'set_banner_basics',
    'Configure v1 banner appearance for a site: type, layout, theme tokens, and copy. Fetches the current config, patches only banner.{type,layout,theme,content}, and PUTs.',
    setBannerBasicsSchema.shape,
    async (a) => {
      const { cbid: siteId, type, layout, theme, content } = setBannerBasicsSchema.parse(a);
      const cfg = await client.sites.getConfig(siteId) as Record<string, unknown>;
      const existingBanner = (cfg['banner'] ?? {}) as Record<string, unknown>;
      const existingTheme = (existingBanner['theme'] ?? {}) as Record<string, unknown>;
      const existingContent = (existingBanner['content'] ?? {}) as Record<string, unknown>;
      const banner: Record<string, unknown> = {
        ...existingBanner,
        ...(type !== undefined ? { type } : {}),
        ...(layout !== undefined ? { layout } : {}),
        ...(theme !== undefined ? { theme: { ...existingTheme, ...theme } } : {}),
        ...(content !== undefined ? { content: { ...existingContent, ...content } } : {}),
      };
      return client.sites.putConfig(siteId, { ...cfg, banner });
    },
  );

  tool(
    'get_install_snippet',
    'Get the exact <script> tag to install Cookie Munch on a site. Copy and paste this into the <head> of every page on the site.',
    {
      cbid: z.string().describe('Site identifier (cbid). Must belong to your org.'),
      blockingMode: z
        .enum(['auto', 'manual', 'checklist'])
        .optional()
        .describe('Banner blocking mode. "auto" (default) blocks third-party scripts until consent is given; "manual" never blocks; "checklist" blocks per category.'),
      culture: z.string().optional().describe('Language culture override, e.g. "en", "fr", "de".'),
    },
    (a) =>
      client.sites.snippet(a.cbid as string, {
        blockingMode: a.blockingMode as 'auto' | 'manual' | 'checklist' | undefined,
        culture: a.culture as string | undefined,
      }),
  );
}
