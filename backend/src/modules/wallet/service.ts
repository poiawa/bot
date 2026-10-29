/**
 * Wallet & Financial Ledger service.
 *
 * Rules:
 * - Balances are ONLY changed through ledger transactions.
 * - Integer amounts in the smallest currency unit (Toman for IRT).
 * - Row-level locking (SELECT ... FOR UPDATE) prevents lost updates and
 *   concurrent overdraft.
 * - Finalized transactions are immutable; corrections are compensating
 *   transactions.
 * - Duplicate payment handling: external reference must be unique.
 */
import { db, pool } from '../../core/database/index.js';
import { wallets, ledgerTransactions } from '../../core/database/schema.js';
import { logger } from '../../core/logger/index.js';
import { eq, sql } from 'drizzle-orm';

const log = logger.child({ module: 'wallet' });

export type LedgerEntryType = 'credit' | 'debit';

export type LedgerTxType =
  | 'deposit'
  | 'purchase'
  | 'renewal'
  | 'refund'
  | 'transfer'
  | 'gift'
  | 'referral_reward'
  | 'adjustment'
  | 'commission'
  | 'fee'
  | 'settlement';

export interface LedgerEntryInput {
  walletId: string;
  type: LedgerTxType;
  entryType: LedgerEntryType;
  amount: number; // integer, smallest unit
  reference?: string;
  referenceType?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface LedgerEntryResult {
  transactionNumber: string;
  balanceBefore: number;
  balanceAfter: number;
}

/** Errors */
export class LedgerError extends Error {
  constructor(message: string, public readonly code: 'WALLET_NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'NEGATIVE_NOT_ALLOWED' | 'DUPLICATE' | 'LOCK_TIMEOUT') {
    super(message);
    this.name = 'LedgerError';
  }
}

/** Get or create a wallet for a user (idempotent) */
export async function ensureWallet(userId: string) {
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing.length) return existing[0];
  const created = await db.insert(wallets).values({ userId }).returning();
  return created[0];
}

/**
 * Record a ledger entry atomically.
 * - Locks the wallet row FOR UPDATE
 * - Validates resulting balance >= 0 (unless policy allows otherwise)
 * - Generates unique transaction number
 * - All inside a single DB transaction
 */
export async function recordLedgerEntry(input: LedgerEntryInput): Promise<LedgerEntryResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock wallet row
    const walletRes = await client.query(
      `SELECT id, balance, currency FROM wallets WHERE id = $1 FOR UPDATE`,
      [input.walletId]
    );
    if (!walletRes.rows.length) {
      throw new LedgerError('Wallet not found', 'WALLET_NOT_FOUND');
    }
    const wallet = walletRes.rows[0];
    const balanceBefore = wallet.balance;

    const delta = input.entryType === 'credit' ? input.amount : -input.amount;
    const balanceAfter = balanceBefore + delta;

    if (balanceAfter < 0) {
      throw new LedgerError(
        `Insufficient balance: ${balanceBefore} ${wallet.currency}, attempted ${delta}`,
        'INSUFFICIENT_BALANCE'
      );
    }

    // Update balance
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [balanceAfter, input.walletId]
    );

    // Insert ledger transaction
    const txNumber = `TX-${Date.now()}-${input.walletId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
    const insertRes = await client.query(
      `INSERT INTO ledger_transactions
        (transaction_number, wallet_id, type, entry_type, amount, balance_before, balance_after, currency, reference, reference_type, description, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        txNumber,
        input.walletId,
        input.type,
        input.entryType,
        input.amount,
        balanceBefore,
        balanceAfter,
        'IRT',
        input.reference ?? null,
        input.referenceType ?? null,
        input.description ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdBy ?? null,
      ]
    );

    await client.query('COMMIT');
    log.info({ txNumber, walletId: input.walletId, type: input.type, amount: input.amount, balanceAfter }, 'ledger entry recorded');

    return {
      transactionNumber: txNumber,
      balanceBefore,
      balanceAfter,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transfer between two wallets atomically.
 * Both legs are recorded in one DB transaction with consistent locks
 * (ordered by wallet ID to avoid deadlocks).
 */
export async function transferBetweenWallets(params: {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  description?: string;
  createdBy?: string;
}): Promise<{ debitTx: string; creditTx: string }> {
  if (params.amount <= 0) {
    throw new LedgerError('Transfer amount must be positive', 'INSUFFICIENT_BALANCE');
  }
  if (params.fromWalletId === params.toWalletId) {
    throw new LedgerError('Cannot transfer to the same wallet', 'NEGATIVE_NOT_ALLOWED');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock both wallets in deterministic order (by ID) to avoid deadlock
    const ids = [params.fromWalletId, params.toWalletId].sort();
    const locked = new Map<string, { balance: number; currency: string }>();
    for (const id of ids) {
      const res = await client.query(
        `SELECT id, balance, currency FROM wallets WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!res.rows.length) throw new LedgerError('Wallet not found', 'WALLET_NOT_FOUND');
      locked.set(res.rows[0].id, { balance: res.rows[0].balance, currency: res.rows[0].currency });
    }

    const from = locked.get(params.fromWalletId)!;
    if (from.balance < params.amount) {
      throw new LedgerError('Insufficient balance for transfer', 'INSUFFICIENT_BALANCE');
    }

    const now = Date.now();
    const debitTx = `TX-${now}-${params.fromWalletId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
    const creditTx = `TX-${now}-${params.toWalletId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;

    const newFromBalance = from.balance - params.amount;
    const to = locked.get(params.toWalletId)!;
    const newToBalance = to.balance + params.amount;

    await client.query(`UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`, [newFromBalance, params.fromWalletId]);
    await client.query(`UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`, [newToBalance, params.toWalletId]);

    await client.query(
      `INSERT INTO ledger_transactions
        (transaction_number, wallet_id, type, entry_type, amount, balance_before, balance_after, currency, description, created_by)
       VALUES ($1,$2,'transfer','debit',$3,$4,$5,$6,$7,$8)`,
      [debitTx, params.fromWalletId, params.amount, from.balance, newFromBalance, from.currency, params.description ?? null, params.createdBy ?? null]
    );
    await client.query(
      `INSERT INTO ledger_transactions
        (transaction_number, wallet_id, type, entry_type, amount, balance_before, balance_after, currency, description, created_by)
       VALUES ($1,$2,'transfer','credit',$3,$4,$5,$6,$7,$8)`,
      [creditTx, params.toWalletId, params.amount, to.balance, newToBalance, to.currency, params.description ?? null, params.createdBy ?? null]
    );

    await client.query('COMMIT');
    log.info({ debitTx, creditTx, amount: params.amount }, 'wallet transfer completed');
    return { debitTx, creditTx };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Idempotent duplicate-payment check: an external reference may only be
 *  marked completed once. */
export async function isProviderRefAlreadyUsed(providerRef: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM payments WHERE provider_ref = $1 AND status = 'completed' LIMIT 1`,
    [providerRef]
  );
  return res.rowCount != null && res.rowCount > 0;
}
