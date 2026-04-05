import type Database from "better-sqlite3";

export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
  isPaid: boolean;
}

const FREE_LIMIT = 50;
const PAID_DAILY_CAP = 500;

export class UsageGate {
  constructor(private db: Database.Database) {}

  /** Record one billable action. Returns true if allowed, false if at limit. Atomic — no TOCTOU race. */
  recordAction(userId: string): boolean {
    this.ensureUsageRow(userId);
    this.resetIfNewDay(userId);

    const paid = this.isSubscribed(userId);
    const limit = paid ? PAID_DAILY_CAP : FREE_LIMIT;

    const result = this.db
      .prepare(
        `UPDATE user_usage SET actions_used = actions_used + 1, updated_at = datetime('now')
         WHERE user_id = ? AND actions_used < ?`,
      )
      .run(userId, limit);

    return result.changes > 0;
  }

  /** Get current usage status for a user. Auto-creates row and resets daily cap. */
  getUsage(userId: string): UsageStatus {
    this.ensureUsageRow(userId);
    this.resetIfNewDay(userId);

    const row = this.db
      .prepare("SELECT actions_used, period_start FROM user_usage WHERE user_id = ?")
      .get(userId) as { actions_used: number; period_start: string };

    const paid = this.isSubscribed(userId);
    const limit = paid ? PAID_DAILY_CAP : FREE_LIMIT;
    const used = row.actions_used;

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      isPaid: paid,
    };
  }

  /** Check if user has an active paid subscription. */
  isSubscribed(userId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT plan, status FROM user_subscriptions WHERE user_id = ?",
      )
      .get(userId) as { plan: string; status: string } | undefined;

    return !!row && row.plan !== "free" && row.status === "active";
  }

  /** Activate a subscription for a user. */
  setSubscription(
    userId: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    currentPeriodEnd: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO user_subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, updated_at)
         VALUES (?, ?, ?, 'pro', 'active', ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           stripe_customer_id = excluded.stripe_customer_id,
           stripe_subscription_id = excluded.stripe_subscription_id,
           plan = 'pro',
           status = 'active',
           current_period_end = excluded.current_period_end,
           updated_at = datetime('now')`,
      )
      .run(userId, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd);
  }

  /** Cancel a subscription (mark as cancelled). */
  cancelSubscription(stripeCustomerId: string): void {
    this.db
      .prepare(
        `UPDATE user_subscriptions SET status = 'cancelled', plan = 'free', updated_at = datetime('now')
         WHERE stripe_customer_id = ?`,
      )
      .run(stripeCustomerId);
  }

  /** Get the Stripe customer ID for a user, if one exists. */
  getStripeCustomerId(userId: string): string | null {
    const row = this.db
      .prepare("SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?")
      .get(userId) as { stripe_customer_id: string | null } | undefined;
    return row?.stripe_customer_id ?? null;
  }

  /** Look up user_id by Stripe customer ID. */
  getUserByStripeCustomer(stripeCustomerId: string): string | null {
    const row = this.db
      .prepare("SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = ?")
      .get(stripeCustomerId) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  /** Check if a Stripe event has already been processed (idempotency). */
  isEventProcessed(eventId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM processed_stripe_events WHERE event_id = ?")
      .get(eventId);
    return !!row;
  }

  /** Mark a Stripe event as processed. */
  markEventProcessed(eventId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO processed_stripe_events (event_id) VALUES (?)")
      .run(eventId);
  }

  /** Auto-create usage row if it doesn't exist. */
  private ensureUsageRow(userId: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO user_usage (user_id) VALUES (?)",
      )
      .run(userId);
  }

  /** Check-on-access daily reset: if period_start is before today, reset counter. */
  private resetIfNewDay(userId: string): void {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const result = this.db
      .prepare(
        `UPDATE user_usage SET actions_used = 0, period_start = ?, updated_at = datetime('now')
         WHERE user_id = ? AND period_start < ?`,
      )
      .run(today, userId, today);
    // result.changes > 0 means we reset
  }
}
