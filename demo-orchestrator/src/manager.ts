import type { Driver } from './driver.ts';
import type { Instance } from './types.ts';
import { getDemo } from './registry.ts';

export class BudgetError extends Error {}

export class Manager {
  #driver: Driver;
  #sweeper?: ReturnType<typeof setInterval>;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  async create(demoId: string, session: string): Promise<Instance> {
    const demo = getDemo(demoId);
    if (!demo) throw new Error(`unknown demo: ${demoId}`);
    const running = (await this.#driver.list()).filter((i) => i.demo === demoId);
    if (running.length >= demo.maxInstances) {
      throw new BudgetError(`demo ${demoId} at capacity (${demo.maxInstances})`);
    }
    return this.#driver.start(demo, session);
  }

  remove(id: string): Promise<void> {
    return this.#driver.stop(id);
  }

  list(): Promise<Instance[]> {
    return this.#driver.list();
  }

  // Reap instances older than their demo's sessionSeconds.
  startReaper(intervalMs = 60_000): void {
    this.#sweeper = setInterval(async () => {
      const now = Date.now();
      for (const inst of await this.#driver.list()) {
        const demo = getDemo(inst.demo);
        if (demo && now - inst.createdAt > demo.sessionSeconds * 1000) {
          await this.#driver.stop(inst.id).catch(() => {});
        }
      }
    }, intervalMs);
  }

  stopReaper(): void {
    if (this.#sweeper) clearInterval(this.#sweeper);
  }
}
