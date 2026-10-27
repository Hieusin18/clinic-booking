import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './helpers.js';

describe('GET /api/health', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await createTestApp()));
  afterAll(async () => app.close());

  it('trả ok khi kết nối được CSDL', async () => {
    const res = await api(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});
