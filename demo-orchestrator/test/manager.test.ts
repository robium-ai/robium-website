import { expect, test } from 'vitest';
import { Manager, BudgetError } from '../src/manager.ts';
import type { Driver } from '../src/driver.ts';
import type { Demo, Instance } from '../src/types.ts';

function fakeDriver(): Driver {
  const store: Instance[] = [];
  let n = 0;
  return {
    async start(demo: Demo, session: string) {
      const inst: Instance = {
        id: `c${n++}`, demo: demo.id, session,
        host: `localhost:${9000 + n}`, hostPort: 9000 + n, createdAt: Date.now(),
      };
      store.push(inst);
      return inst;
    },
    async stop(id: string) {
      const i = store.findIndex((x) => x.id === id);
      if (i >= 0) store.splice(i, 1);
    },
    async list() {
      return [...store];
    },
  };
}

test('enforces maxInstances (nav-trial = 3)', async () => {
  const m = new Manager(fakeDriver());
  for (let i = 0; i < 3; i++) await m.create('nav-trial', `s${i}`);
  await expect(m.create('nav-trial', 's4')).rejects.toBeInstanceOf(BudgetError);
});

test('remove frees a slot', async () => {
  const m = new Manager(fakeDriver());
  const a = await m.create('nav-trial', 'a');
  await m.create('nav-trial', 'b');
  await m.create('nav-trial', 'c');
  await m.remove(a.id);
  await expect(m.create('nav-trial', 'd')).resolves.toBeTruthy();
});

test('unknown demo rejects', async () => {
  const m = new Manager(fakeDriver());
  await expect(m.create('nope', 's')).rejects.toThrow();
});
