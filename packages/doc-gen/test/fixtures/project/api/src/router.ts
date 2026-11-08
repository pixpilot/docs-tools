import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const posts = t.router({
  /**
   * Lists a user's posts, newest first.
   * More detail that stays out of the list.
   */
  list: t.procedure
    .input(z.object({ userId: z.string(), limit: z.number().optional() }))
    .query(() => []),
  create: t.procedure
    .input(z.object({ title: z.string() }))
    .mutation(() => ({ id: '1' })),
});

export const appRouter = t.router({
  health: t.procedure.query(() => 'ok'),
  byId: t.procedure.input(z.string()).query(() => null),
  posts,
  admin: { stats: t.procedure.query(() => 0) },
});

export type AppRouter = typeof appRouter;
