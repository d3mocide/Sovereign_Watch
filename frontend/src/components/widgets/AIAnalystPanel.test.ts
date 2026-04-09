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

  it('removes stray dash artifacts and demotes consecutive headers', () => {
    const input = [
      '### AIR DOMAIN ASSESSMENT',
      '-',
      '**Risk Score:** 13% -',
      '### NARRATIVE',
      '### CLASSIFICATION',
      '',
      'Low. Benign operational profile.',
    ].join('\n');

    const output = formatAnalysisText(input);

    expect(output).not.toContain('\n-\n');
    expect(output).toContain('**Risk Score:** 13%');
    expect(output).toContain('### NARRATIVE\n**CLASSIFICATION**');
    expect(output).toContain('Low. Benign operational profile.');
  });

  it('heals wrapped bullet labels and collapses extra spacing between bullets', () => {
    const input = [
      '### RISK SIGNALS',
      '- ADS-B',
      'Tracks: Three tracks provide limited positional data.',
      '',
      '- Kp Index: A Kp index of 1.0 suggests normal conditions.',
      '',
      '',
      '- No Alerts: Absence of NWS alerts removes weather-related risks.',
    ].join('\n');

    const output = formatAnalysisText(input);

    expect(output).toContain('- ADS-B Tracks: Three tracks provide limited positional data.');
    expect(output).toContain('- Kp Index: A Kp index of 1.0 suggests normal conditions.\n- No Alerts: Absence of NWS alerts removes weather-related risks.');
  });
});