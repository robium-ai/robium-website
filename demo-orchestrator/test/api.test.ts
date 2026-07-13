import { expect, test } from 'vitest';
import { buildServer } from '../src/server.ts';
import { Manager } from '../src/manager.ts';
import type { Driver } from '../src/driver.ts';

const fake: Driver = {
  async start(demo, session) {
    return { id: 'cX', demo: demo.id, session, host: 'localhost:9999', hostPort: 9999, createdAt: Date.now() };
  },
  async stop() {},
  async list() {
    return [];
  },
};

test('GET /api/demos lists nav-trial', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({ method: 'GET', url: '/api/demos' });
  expect(r.statusCode).toBe(200);
  expect(JSON.parse(r.body).some((d: { id: string }) => d.id === 'nav-trial')).toBe(true);
});

test('POST /api/instances creates and returns host', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({
    method: 'POST', url: '/api/instances',
    payload: { demo: 'nav-trial', session: 's1' },
  });
  expect(r.statusCode).toBe(201);
  expect(JSON.parse(r.body).host).toBe('localhost:9999');
});

test('POST unknown demo → 404', async () => {
  const app = buildServer(new Manager(fake));
  const r = await app.inject({
    method: 'POST', url: '/api/instances',
    payload: { demo: 'nope', session: 's' },
  });
  expect(r.statusCode).toBe(404);
});
