import { describe, expect, it } from 'vitest';
import { apiDocsEnabled } from '../src/common/utils/api-docs.util.js';

describe('Trang tài liệu API /api/docs', () => {
  it('dev thì bật, image Docker (NODE_ENV=production) thì tắt', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(apiDocsEnabled({})).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: '' })).toBe(false);
  });

  it('API_DOCS ghi đè mặc định', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: ' TRUE ' })).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'development', API_DOCS: 'false' })).toBe(false);
  });
});
