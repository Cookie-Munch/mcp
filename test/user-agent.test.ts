import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCookieMunchMcp, MCP_VERSION } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

async function whoamiUserAgent(opts: { userAgent?: string } = {}): Promise<string | undefined> {
  let ua: string | undefined;
  vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
    ua = (init?.headers as Record<string, string>)['User-Agent'];
    return new Response('{"orgId":"o"}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const server = createCookieMunchMcp({ apiKey: 'fck_x', baseUrl: 'https://api.test', ...opts });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  await client.callTool({ name: 'whoami', arguments: {} });
  await client.close();
  return ua;
}

describe('User-Agent', () => {
  it('names the MCP server and its version by default', async () => {
    expect(await whoamiUserAgent()).toBe(`cookiemunch-mcp/${MCP_VERSION}`);
  });
  it('the version is the package version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(MCP_VERSION).toBe(pkg.version);
  });
  it('the caller can set their own', async () => {
    expect(await whoamiUserAgent({ userAgent: 'acme-agent/1' })).toBe('acme-agent/1');
  });
});
