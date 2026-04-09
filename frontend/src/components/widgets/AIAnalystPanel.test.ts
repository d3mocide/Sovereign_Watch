import { describe, expect, it } from 'vitest';
import { formatAnalysisText } from './aiAnalystFormatting.ts';

describe('formatAnalysisText', () => {
  it('heals short hard-wrapped trailing word fragments in headers', () => {
    const input = [
      'NARRATIV',
      'E',
      'CLASSIFICATION',
      'CONTEXT SNAPSHO',
      'T',
      'domain: air',
    ].join('\n');

    expect(formatAnalysisText(input)).toContain('NARRATIVE\nCLASSIFICATION');
    expect(formatAnalysisText(input)).toContain('CONTEXT SNAPSHOT\ndomain: air');
  });

  it('heals split bold fences emitted during streaming', () => {
    const input = '**Risk Score:* * 7%\n**Region:* * 8728f00a5ffffff';

    expect(formatAnalysisText(input)).toContain('**Risk Score:** 7%');
    expect(formatAnalysisText(input)).toContain('**Region:** 8728f00a5ffffff');
  });
});