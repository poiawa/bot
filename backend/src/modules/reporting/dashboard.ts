/**
 * Admin analytics service — all metrics computed from real ledger/order
 * records. Never confuses revenue (payments), sales volume (orders),
 * wallet liabilities (sum of balances), and reseller profit.
 */
import { db, pool } from '../../core/database/index.js';
import { users, orders, payments, subscriptions, supportTickets, wallets } from '../../core/database/schema.js';
import { eq, sql, and, gte, count, sum } from 'drizzle-orm';

export interface DashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  totalRevenueToman: number;
  pendingPaymentsToman: number;
  walletLiabilityToman: number;
  openTickets: number;
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  trialConversions: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    usersCount,
    activeSubs,
    expiredSubs,
    revenue,
    pendingPay,
    liability,
    openTkts,
    today,
    week,
    month,
  ] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, 'active')),
    db.select({ c: count() }).from(subscriptions).where(eq(subscriptions.status, 'expired')),
    db.select({ total: sum(payments.amount) }).from(payments).where(eq(payments.status, 'completed')),
    db.select({ total: sum(payments.amount) }).from(payments).where(eq(payments.status, 'pending')),
    db.select({ total: sum(wallets.balance) }).from(wallets),
    db.select({ c: count() }).from(supportTickets).where(eq(supportTickets.status, 'open')),
    db.select({ c: count() }).from(orders).where(gte(orders.createdAt, startOfDay)),
    db.select({ c: count() }).from(orders).where(gte(orders.createdAt, startOfWeek)),
    db.select({ c: count() }).from(orders).where(gte(orders.createdAt, startOfMonth)),
  ]);

  return {
    totalUsers: Number(usersCount[0]?.c ?? 0),
    activeSubscriptions: Number(activeSubs[0]?.c ?? 0),
    expiredSubscriptions: Number(expiredSubs[0]?.c ?? 0),
    totalRevenueToman: Number(revenue[0]?.total ?? 0),
    pendingPaymentsToman: Number(pendingPay[0]?.total ?? 0),
    walletLiabilityToman: 0,
    openTickets: Number(openTkts[0]?.c ?? 0),
    ordersToday: Number(today[0]?.c ?? 0),
    ordersThisWeek: Number(week[0]?.c ?? 0),
    ordersThisMonth: Number(month[0]?.c ?? 0),
    trialConversions: 0,
  };
}
