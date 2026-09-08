import { validateHeaderValue } from 'node:http';
import { describe, expect, it } from 'vitest';
import { downloadDisposition } from './download-filename.js';

describe('download response header', () => {
  it.each(['喀山客户研究.zip', '中文"\r\nInjected: true/../客户\\档案.zip', '客户(待审核).zip'])('encodes %s without changing the Mission name', filename => {
    const header = downloadDisposition(filename);
    expect(() => validateHeaderValue('Content-Disposition', header)).not.toThrow();
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toMatch(/[\r\n]/);
    const encoded = header.split("filename*=UTF-8''")[1]!;
    expect(decodeURIComponent(encoded)).toContain('客户');
    expect(decodeURIComponent(encoded)).not.toMatch(/[\r\n"\\/]/);
  });
});
