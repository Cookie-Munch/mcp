/**
 * Consent-button parity findings, worded for an AI agent. A tool result that carries
 * `designWarnings` opens with them, before any JSON, because an agent acts on what it reads
 * first: it should come away knowing the Accept button is pushed harder than Reject, that
 * regulators call that a dark pattern, and exactly which reject style values fix it.
 */

import type { ButtonParityFinding, SuggestedRejectStyle } from '@cookiemunch/sdk';

function whereText(f: ButtonParityFinding): string {
  const w = f.where ?? {};
  const bits = [
    f.layer === 'banner' ? 'first layer' : `${f.layer} layer`,
    w.view ? `view "${w.view}"` : '',
    w.variant && w.variant !== 'base' ? `variant ${w.variant}` : '',
    w.theme === 'dark' ? 'dark theme' : '',
    w.breakpoint === 'mobile' ? 'mobile' : '',
    w.language ? `language ${w.language}` : '',
    w.url ? w.url : '',
  ].filter(Boolean);
  return bits.join(', ');
}

function styleText(s: Partial<SuggestedRejectStyle>): string {
  const parts = [
    s.background ? `background ${s.background}` : '',
    s.color ? `text ${s.color}` : '',
    s.borderColor ? `border ${s.borderWidth ?? 1}px ${s.borderColor}` : '',
    s.fontSize ? `font ${s.fontSize}px` : '',
    s.fontWeight ? `weight ${s.fontWeight}` : '',
    s.width && s.height ? `${Math.round(s.width)}×${Math.round(s.height)}px` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * What the tool did, so the header can say it truthfully: an agent that reads "saved" after
 * a lint may skip the real write, or tell the user a change is live.
 */
export type DesignContext = 'saved' | 'preview' | 'lint' | 'read' | 'scan';

const CONTEXT_TEXT: Record<DesignContext, string> = {
  saved: 'The config was saved as sent; this is a warning, not an error.',
  preview: 'Nothing was saved: this is a preview of the write.',
  lint: 'Nothing was saved: this is a lint of a proposed config.',
  read: 'This describes the config as it is stored now; nothing was changed.',
  scan: 'This was measured on the live site by the last cookie scan; fix the banner, then scan again.',
};

/** The context of a tool's result: from the result itself where it says, else from the tool's name. */
export function designContext(tool: string, value: unknown): DesignContext {
  const v = (value && typeof value === 'object' ? value : {}) as { dryRun?: unknown; buttonParity?: unknown };
  if (tool === 'lint_banner_config') return 'lint';
  if (v.dryRun === true || tool.startsWith('preview_')) return 'preview';
  if (v.buttonParity && typeof v.buttonParity === 'object') return 'scan';
  if (/^(update|patch|set|edit|create|assign|apply)_/.test(tool)) return 'saved';
  return 'read';
}

/** The plain-words block that goes on top of a tool result. Empty string when there is nothing to say. */
export function designWarningText(findings: ButtonParityFinding[], suggested?: SuggestedRejectStyle[], context: DesignContext = 'read'): string {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  const warnings = findings.filter((f) => f.severity === 'warning');
  const notices = findings.filter((f) => f.severity !== 'warning');
  const lines: string[] = [];
  if (warnings.length) {
    lines.push(
      `Design warning: the Accept button is more prominent than Reject (${warnings.length} issue${warnings.length === 1 ? '' : 's'}). ` +
        'Regulators treat this as a dark pattern (EDPB Guidelines 03/2022, the EDPB cookie banner taskforce, CNIL). ' +
        `Make both buttons the same style. ${CONTEXT_TEXT[context]}`,
    );
    for (const f of warnings) lines.push(`- [${f.code}] (${whereText(f)}) ${f.detail} Fix: ${f.fix}`);
  }
  if (notices.length) {
    lines.push(
      `Design notice: ${notices.length} thing${notices.length === 1 ? '' : 's'} to check about how Reject compares with Accept.` +
        (warnings.length ? '' : ` ${CONTEXT_TEXT[context]}`),
    );
    for (const f of notices) lines.push(`- [${f.code}] (${whereText(f)}) ${f.detail} Fix: ${f.fix}`);
  }
  const fixes: Array<Partial<SuggestedRejectStyle>> =
    suggested && suggested.length
      ? suggested
      : findings.filter((f) => f.accept && f.reject).slice(0, 1).map((f) => ({ ...f.accept!, layer: f.layer, view: f.where?.view }));
  for (const s of fixes) {
    const style = styleText(s);
    if (style) {
      lines.push(
        `Suggested fix: style Reject all${s.view ? ` in view "${s.view}"` : ''} with ${style} — the same as Accept all. ` +
          'In a flow design, give the Reject button the same `variant` and size as the Accept button.',
      );
    }
  }
  return lines.join('\n');
}

/** Lead a tool result's text with its design warnings, when it has any. `tool` names what ran. */
export function withDesignWarnings(value: unknown, body: string, tool = ''): string {
  if (!value || typeof value !== 'object') return body;
  // A scan status carries them one level down, on what it measured of the live banner.
  const nested = (value as { buttonParity?: unknown }).buttonParity;
  const v = (nested && typeof nested === 'object' ? nested : value) as { designWarnings?: unknown; suggestedReject?: unknown };
  if (!Array.isArray(v.designWarnings) || v.designWarnings.length === 0) return body;
  const head = designWarningText(
    v.designWarnings as ButtonParityFinding[],
    Array.isArray(v.suggestedReject) ? (v.suggestedReject as SuggestedRejectStyle[]) : undefined,
    designContext(tool, value),
  );
  return head ? `${head}\n\n${body}` : body;
}
