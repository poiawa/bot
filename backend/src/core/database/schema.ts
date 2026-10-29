// Core database schema for VPN Subscription Sales Platform
import { pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core';

// Enums
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'banned']);
export const roleEnum = pgEnum('role', ['system_owner', 'super_admin', 'finance_admin', 'support_admin', 'server_admin', 'operator', 'reseller', 'customer']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'processing', 'completed', 'failed', 'refunded', 'requires_review']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'processing', 'completed', 'failed', 'expired', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['wallet', 'zarinpal', 'aqayepardakht', 'card_to_card', 'telegram_stars', 'crypto']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'expired', 'disabled', 'pending', 'failed', 'suspended']);
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'pending', 'answered', 'closed']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'urgent']);
export const transactionTypeEnum = pgEnum('transaction_type', ['deposit', 'purchase', 'renewal', 'refund', 'transfer', 'gift', 'referral_reward', 'adjustment', 'commission', 'fee', 'settlement']);
export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', ['credit', 'debit']);
export const panelTypeEnum = pgEnum('panel_type', ['marzban', 'marzneshin', 'remnawave', 'pasarguard', '3x_ui', 'hiddify', 'other']);
export const serverStatusEnum = pgEnum('server_status', ['online', 'offline', 'degraded', 'maintenance']);

// Users and Authentication
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  role: roleEnum('role').notNull().default('customer'),
  status: userStatusEnum('status').notNull().default('active'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  avatarUrl: text('avatar_url'),
  /** Customers registered by a reseller — scope isolation anchor */
  resellerOwnerId: uuid('reseller_owner_id').references((): AnyPgColumn => resellers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});

export const telegramIdentities = pgTable('telegram_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  telegramId: text('telegram_id').notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  deviceInfo: jsonb('device_info'),
  ipAddress: text('ip_address'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  permissions: jsonb('permissions').notNull().default([]),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  category: text('category').notNull(),
});

// VPN Panel Connections
export const panelConnections = pgTable('panel_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: panelTypeEnum('type').notNull(),
  apiUrl: text('api_url').notNull(),
  username: text('username'),
  passwordHash: text('password_hash'),
  apiKeyHash: text('api_key_hash'),
  version: text('version'),
  capabilities: jsonb('capabilities').default({}),
  isEnabled: boolean('is_enabled').notNull().default(true),
  lastTestAt: timestamp('last_test_at'),
  lastTestResult: jsonb('last_test_result'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const serverNodes = pgTable('server_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  panelId: uuid('panel_id').notNull().references(() => panelConnections.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  location: text('location'),
  country: text('country'),
  ipAddress: text('ip_address'),
  hostname: text('hostname'),
  status: serverStatusEnum('status').notNull().default('online'),
  priority: integer('priority').notNull().default(100),
  capacity: integer('capacity'),
  currentUsage: integer('current_usage').default(0),
  isEnabled: boolean('is_enabled').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Product Catalog
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  descriptionFa: text('description_fa'),
  imageUrl: text('image_url'),
  categoryId: uuid('category_id').references(() => productCategories.id),
  type: text('type').notNull(), // 'time', 'data', 'combined', 'device_limit', 'trial'
  durationDays: integer('duration_days'),
  dataLimitGb: integer('data_limit_gb'),
  deviceLimit: integer('device_limit'),
  isVisible: boolean('is_visible').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').default(0),
  labels: jsonb('labels').default([]), // ['popular', 'economy', 'featured']
  allowedPanels: jsonb('allowed_panels').default([]),
  allowedServers: jsonb('allowed_servers').default([]),
  supportedProtocols: jsonb('supported_protocols').default([]),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nameFa: text('name_fa'),
  description: text('description'),
  parentId: uuid('parent_id'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const productPrices = pgTable('product_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull().default('IRT'),
  basePrice: integer('base_price').notNull(), // In smallest unit (Toman)
  finalPrice: integer('final_price').notNull(),
  resellerPrice: integer('reseller_price'),
  wholesalePrice: integer('wholesale_price'),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Configuration Inventory
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  serverId: uuid('server_id').references(() => serverNodes.id),
  type: text('type').notNull(), // 'wireguard', 'openvpn', 'vmess', 'vless', 'trojan', etc.
  name: text('name'),
  configData: text('config_data').notNull(), // Encrypted
  username: text('username'),
  password: text('password'), // Encrypted
  port: integer('port'),
  protocol: text('protocol'),
  inboundId: text('inbound_id'),
  status: text('status').notNull().default('available'), // 'available', 'reserved', 'sold', 'expired', 'revoked'
  reservedBy: uuid('reserved_by').references(() => users.id),
  reservedAt: timestamp('reserved_at'),
  soldTo: uuid('sold_to').references(() => users.id),
  soldAt: timestamp('sold_at'),
  expiresAt: timestamp('expires_at'),
  importBatch: text('import_batch'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Orders and Payments
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: text('order_number').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  resellerId: uuid('reseller_id').references(() => users.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalAmount: integer('total_amount').notNull(),
  currency: text('currency').notNull().default('IRT'),
  discountAmount: integer('discount_amount').default(0),
  items: jsonb('items').notNull().default([]),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentNumber: text('payment_number').notNull().unique(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('IRT'),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  provider: text('provider'), // 'zarinpal', 'aqayepardakht', etc.
  providerRef: text('provider_ref'), // External reference from payment provider
  providerCallbackUrl: text('provider_callback_url'),
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  data: jsonb('data'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Wallets and Financial Ledger
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  balance: integer('balance').notNull().default(0), // In smallest unit
  currency: text('currency').notNull().default('IRT'),
  creditLimit: integer('credit_limit').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionNumber: text('transaction_number').notNull().unique(),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  type: transactionTypeEnum('type').notNull(),
  entryType: ledgerEntryTypeEnum('entry_type').notNull(),
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  currency: text('currency').notNull().default('IRT'),
  reference: text('reference'), // Order ID, Payment ID, etc.
  referenceType: text('reference_type'), // 'order', 'payment', 'subscription', etc.
  description: text('description'),
  metadata: jsonb('metadata'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionNumber: text('subscription_number').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  orderId: uuid('order_id').references(() => orders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  serverId: uuid('server_id').references(() => serverNodes.id),
  panelId: uuid('panel_id').references(() => panelConnections.id),
  providerSubscriptionId: text('provider_subscription_id'),
  name: text('name'),
  username: text('username'),
  status: subscriptionStatusEnum('status').notNull().default('pending'),
  dataLimitGb: integer('data_limit_gb'),
  usedDataGb: integer('used_data_gb').default(0),
  deviceLimit: integer('device_limit'),
  protocol: text('protocol'),
  configData: text('config_data'), // Encrypted subscription URL/config
  qrCode: text('qr_code'),
  expiresAt: timestamp('expires_at'),
  autoRenew: boolean('auto_renew').default(false),
  renewalPolicy: text('renewal_policy'), // 'extend', 'start_new', 'reset'
  metadata: jsonb('metadata'),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const subscriptionEvents = pgTable('subscription_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  data: jsonb('data'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscriptionReservations = pgTable('subscription_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  currentSubscriptionId: uuid('current_subscription_id').references(() => subscriptions.id),
  newProductId: uuid('new_product_id').notNull().references(() => products.id),
  newServerId: uuid('new_server_id').references(() => serverNodes.id),
  status: text('status').notNull().default('pending'), // 'pending', 'activating', 'active', 'cancelled', 'failed'
  activateAt: timestamp('activate_at'),
  activatedAt: timestamp('activated_at'),
  newSubscriptionId: uuid('new_subscription_id').references(() => subscriptions.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Resellers
export const resellers = pgTable('resellers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  businessName: text('business_name'),
  commission: integer('commission').default(0), // Percentage
  creditLimit: integer('credit_limit').default(0),
  isActive: boolean('is_active').notNull().default(true),
  botToken: text('bot_token'), // Encrypted
  customBranding: jsonb('custom_branding'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementNumber: text('settlement_number').notNull().unique(),
  resellerId: uuid('reseller_id').notNull().references(() => resellers.id),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('IRT'),
  status: text('status').notNull().default('pending'), // 'pending', 'approved', 'paid', 'cancelled'
  bankAccount: text('bank_account'),
  approvedBy: uuid('approved_by').references(() => users.id),
  paidAt: timestamp('paid_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Discounts and Promotions
export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(), // 'percentage', 'fixed'
  value: integer('value').notNull(),
  minOrderAmount: integer('min_order_amount'),
  maxDiscountAmount: integer('max_discount_amount'),
  currency: text('currency').default('IRT'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').default(0),
  perUserLimit: integer('per_user_limit').default(1),
  applicableProducts: jsonb('applicable_products').default([]),
  applicableServers: jsonb('applicable_servers').default([]),
  applicableResellers: jsonb('applicable_resellers').default([]),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const giftCodes = pgTable('gift_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('IRT'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').default(0),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const referralPrograms = pgTable('referral_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rewardType: text('reward_type').notNull(), // 'wallet', 'subscription'
  rewardAmount: integer('reward_amount').notNull(),
  rewardCondition: text('reward_condition').notNull(), // 'first_purchase', 'each_purchase'
  minPurchaseAmount: integer('min_purchase_amount'),
  isActive: boolean('is_active').notNull().default(true),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  referredId: uuid('referred_id').notNull().references(() => users.id),
  programId: uuid('program_id').references(() => referralPrograms.id),
  rewardAmount: integer('reward_amount'),
  rewardClaimed: boolean('reward_claimed').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Support Tickets
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketNumber: text('ticket_number').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  department: text('department'),
  subject: text('subject').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('medium'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  closedAt: timestamp('closed_at'),
  rating: integer('rating'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  message: text('message').notNull(),
  attachments: jsonb('attachments').default([]),
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Notifications
export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  channel: text('channel').notNull(), // 'telegram', 'email', 'sms', 'webhook'
  subject: text('subject'),
  body: text('body').notNull(),
  variables: jsonb('variables').default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: text('channel').notNull(),
  templateId: uuid('template_id').references(() => notificationTemplates.id),
  subject: text('subject'),
  body: text('body').notNull(),
  data: jsonb('data'),
  status: text('status').notNull().default('pending'), // 'pending', 'sent', 'failed'
  sentAt: timestamp('sent_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// System
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id'),
  oldData: jsonb('old_data'),
  newData: jsonb('new_data'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  description: text('description'),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const backgroundJobs = pgTable('background_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  data: jsonb('data'),
  status: text('status').notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  runAt: timestamp('run_at').notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  failedAt: timestamp('failed_at'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const backups = pgTable('backups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'full', 'database', 'files'
  path: text('path').notNull(),
  size: integer('size'),
  checksum: text('checksum'),
  status: text('status').notNull().default('completed'), // 'pending', 'running', 'completed', 'failed'
  createdBy: uuid('created_by').references(() => users.id),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type PanelConnection = typeof panelConnections.$inferSelect;
export type ServerNode = typeof serverNodes.$inferSelect;
export type Reseller = typeof resellers.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
