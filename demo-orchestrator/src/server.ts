import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { Manager, BudgetError } from './manager.ts';
import { LocalDockerDriver } from './localDocker.ts';
import { loadDemos } from './registry.ts';
import type { CreateInstanceReq } from './types.ts';

export function buildServer(manager: Manager): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin ?? '';
    if (
      origin === 'https://robium.ai' ||
      origin === 'https://robium.org' ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      reply.header('access-control-allow-headers', 'content-type');
    }
  });
  app.options('/*', async (_req, reply) => reply.code(204).send());

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/demos', async () =>
    loadDemos().map((d) => ({ id: d.id, title: d.title, maxInstances: d.maxInstances })),
  );

  app.get('/api/instances', async () => manager.list());

  app.post('/api/instances', async (req, reply) => {
    const { demo, session } = (req.body ?? {}) as CreateInstanceReq;
    if (!demo || !session) return reply.code(400).send({ error: 'demo and session required' });
    try {
      const inst = await manager.create(demo, session);
      return reply.code(201).send({ id: inst.id, host: inst.host, session: inst.session });
    } catch (e) {
      const msg = String((e as Error).message);
      if (e instanceof BudgetError) return reply.code(429).send({ error: msg });
      if (msg.startsWith('unknown demo')) return reply.code(404).send({ error: msg });
      return reply.code(500).send({ error: msg });
    }
  });

  app.delete('/api/instances/:id', async (req, reply) => {
    await manager.remove((req.params as { id: string }).id);
    return reply.code(204).send();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manager = new Manager(new LocalDockerDriver());
  manager.startReaper();
  const app = buildServer(manager);
  app
    .listen({ port: 8080, host: '0.0.0.0' })
    .then(() => console.log('demo-orchestrator on :8080'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
