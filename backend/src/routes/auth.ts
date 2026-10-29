/**
 * Authentication routes: register, login, Telegram Mini App initData
 * validation, logout. Generic error reasons prevent user enumeration.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loginWithPassword, registerUser } from '../modules/identity/password.js';
import { validateTelegramInitData } from '../modules/identity/telegram.js';
import { audit } from '../modules/audit/index.js';
import { db } from '../core/database/index.js';
import { telegramIdentities, users } from '../core/database/schema.js';
import { eq } from 'drizzle-orm';

const registerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  password: z.string().min(8).max(128),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
});

const loginSchema = z.object({
  email: z.string().max(191),
  password: z.string().min(1).max(128),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input', details: parsed.error.flatten() });
    }
    const p = parsed.data;
    if (!p.email && !p.phone) {
      return reply.status(400).send({ success: false, error: 'Email or phone required' });
    }
    const result = await registerUser(p);
    if (!result.ok) {
      return reply.status(409).send({ success: false, error: 'An account with these details already exists' });
    }
    await audit({ userId: result.userId, action: 'user.register', entity: 'user', entityId: result.userId, ipAddress: request.ip });
    const token = app.jwt.sign({ id: result.userId, role: 'customer' });
    return { success: true, data: { token, userId: result.userId } };
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input' });
    }
    const result = await loginWithPassword(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      // Same message for both reasons — no account enumeration
      await audit({ action: 'auth.login_failed', entity: 'user', newData: { identifier: parsed.data.email }, ipAddress: request.ip });
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }
    const token = app.jwt.sign({ id: result.userId, role: result.role });
    return { success: true, data: { token, role: result.role } };
  });

  app.post('/telegram-login', async (request, reply) => {
    const { initData } = request.body as { initData?: string };
    if (!initData || typeof initData !== 'string') {
      return reply.status(400).send({ success: false, error: 'initData required' });
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return reply.status(503).send({ success: false, error: 'Telegram login is not configured' });
    }
    const check = validateTelegramInitData(initData, botToken);
    if (!check.valid || !check.user) {
      return reply.status(401).send({ success: false, error: 'Invalid Telegram initData signature' });
    }
    const tg = check.user as { id: number; username?: string; first_name?: string; last_name?: string };

    const identity = await db
      .select()
      .from(telegramIdentities)
      .where(eq(telegramIdentities.telegramId, String(tg.id)))
      .limit(1);

    let userId: string;
    let role: string;
    if (identity.length) {
      userId = identity[0].userId;
      const u = await db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
      if (!u.length || u[0].status !== 'active') {
        return reply.status(403).send({ success: false, error: 'Account is suspended' });
      }
      role = u[0].role;
    } else {
      const created = await db
        .insert(users)
        .values({ firstName: tg.first_name, lastName: tg.last_name })
        .returning({ id: users.id, role: users.role });
      userId = created[0].id;
      role = created[0].role;
      await db.insert(telegramIdentities).values({
        userId,
        telegramId: String(tg.id),
        username: tg.username,
        firstName: tg.first_name,
        lastName: tg.last_name,
      });
    }
    const token = app.jwt.sign({ id: userId, role });
    return {
      success: true,
      data: { token, user: { id: userId, role, telegramId: String(tg.id), username: tg.username } },
    };
  });

  app.post('/logout', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    await audit({ userId: request.user.id, action: 'auth.logout', entity: 'user', entityId: request.user.id });
    return { success: true, message: 'Logged out' };
  });
}
