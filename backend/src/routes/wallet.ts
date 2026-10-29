/**
 * Wallet routes: balance, transaction history, transfers, gift redemption.
 * All balance changes go through the ledger service (row-locked).
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { wallets, ledgerTransactions } from '../core/database/schema.js';
import { eq, desc } from 'drizzle-orm';
import { ensureWallet, recordLedgerEntry, transferBetweenWallets, LedgerError } from '../modules/wallet/service.js';
import { audit } from '../modules/audit/index.js';

export default async function walletRoutes(app: FastifyInstance) {
  app.get('/balance', { preHandler: [app.authenticate] }, async (request: any) => {
    const wallet = await ensureWalletFor(request.user.id);
    return { success: true, data: { balance: wallet.balance, currency: wallet.currency, creditLimit: wallet.creditLimit } };
  });

  app.get('/transactions', { preHandler: [app.authenticate] }, async (request: any) => {
    const q = request.query as { page?: string; limit?: string; type?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const wallet = await ensureWalletFor(request.user.id);
    const rows = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.walletId, wallet.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const totalRows = await db.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.walletId, wallet.id));
    return {
      success: true,
      data: { items: rows, total: rows.length < limit && page === 1 ? rows.length : rows.length, page, limit },
    };
  });

  // Transfer to another user (atomic, locked)
  app.post('/transfer', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const parsed = z
      .object({
        toUserId: z.string().uuid(),
        amount: z.number().int().positive().max(1_000_000_000),
        description: z.string().max(300).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input' });
    }
    const { toUserId, amount, description } = parsed.data;
    if (toUserId === request.user.id) {
      return reply.status(400).send({ success: false, error: 'Cannot transfer to yourself' });
    }
    try {
      const fromWallet = await ensureWalletFor(request.user.id);
      const toWallet = await ensureWalletFor(toUserId);
      const result = await transferBetweenWallets({
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount,
        description,
        createdBy: request.user.id,
      });
      await audit({
        userId: request.user.id,
        action: 'wallet.transfer',
        entity: 'wallet',
        entityId: fromWallet.id,
        newData: { toUserId, amount, description },
      });
      return { success: true, data: { debitTx: result.debitTx, creditTx: result.creditTx } };
    } catch (err) {
      if (err instanceof LedgerError) {
        return reply.status(409).send({ success: false, error: err.message });
      }
      throw err;
    }
  });

  // Gift code redemption: implemented in Phase 9 (promotions module).
  // Not registered yet to avoid a placeholder pretending to work.
}

function ensureWalletFor(userId: string) {
  return ensureWallet(userId);
}
