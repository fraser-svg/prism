import type { Request, Response } from "express";
import type { UsageGate } from "@prism/workspace";

/**
 * Billing routes — Stripe Checkout, Portal, and Webhook.
 *
 * Separated from UsageGate (pure DB) to keep Stripe API calls
 * in the web app layer only.
 */

let stripe: import("stripe").default | null = null;

function getStripe(): import("stripe").default {
  if (!stripe) {
    // Dynamic import workaround — Stripe is loaded lazily
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require("stripe").default || require("stripe");
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-03-31.basil" as import("stripe").default.LatestApiVersion,
    });
  }
  return stripe!;
}

const STRIPE_ENABLED = process.env.STRIPE_ENABLED !== "false";
const PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export function stripeEnabled(): boolean {
  return STRIPE_ENABLED;
}

/** Middleware: returns 503 if Stripe is disabled */
export function requireStripe(_req: Request, res: Response, next: () => void): void {
  if (!STRIPE_ENABLED) {
    res.status(503).json({ error: "Billing is not enabled" });
    return;
  }
  next();
}

/** POST /api/billing/checkout — create a Stripe Checkout session */
export async function createCheckoutSession(
  req: Request,
  res: Response,
  usageGate: UsageGate,
  getUserId: (req: Request) => Promise<string | null>,
): Promise<void> {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // If already subscribed, redirect to portal instead
  if (usageGate.isSubscribed(userId)) {
    res.status(409).json({ error: "Already subscribed — use the billing portal" });
    return;
  }

  const s = getStripe();

  // Check if user already has a Stripe customer ID from a previous attempt
  const customerId = usageGate.getStripeCustomerId(userId) ?? undefined;

  const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `${origin}/vault?checkout=success`,
    cancel_url: `${origin}/vault?checkout=cancelled`,
    metadata: { userId },
  });

  res.json({ data: { url: session.url } });
}

/** POST /api/billing/portal — create a Stripe Customer Portal session */
export async function createPortalSession(
  req: Request,
  res: Response,
  usageGate: UsageGate,
  getUserId: (req: Request) => Promise<string | null>,
): Promise<void> {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const stripeCustomerId = usageGate.getStripeCustomerId(userId);

  if (!stripeCustomerId) {
    res.status(404).json({ error: "No billing account found" });
    return;
  }

  const s = getStripe();
  const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;

  const session = await s.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/vault`,
  });

  res.json({ data: { url: session.url } });
}

/** POST /api/billing/webhook — handle Stripe webhook events */
export async function handleWebhook(
  req: Request,
  res: Response,
  usageGate: UsageGate,
): Promise<void> {
  const sig = req.headers["stripe-signature"];
  if (!sig || !WEBHOOK_SECRET) {
    res.status(400).json({ error: "Missing signature or webhook secret" });
    return;
  }

  const s = getStripe();
  let event: import("stripe").default.Event;

  try {
    event = s.webhooks.constructEvent(req.body, sig as string, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // Idempotency check
  if (usageGate.isEventProcessed(event.id)) {
    res.json({ received: true });
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as import("stripe").default.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId && session.subscription && session.customer) {
        // Fetch subscription to get period end
        const sub = await s.subscriptions.retrieve(session.subscription as string);
        usageGate.setSubscription(
          userId,
          session.customer as string,
          session.subscription as string,
          new Date(sub.current_period_end * 1000).toISOString(),
        );
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as import("stripe").default.Subscription;
      const customerId = sub.customer as string;
      const userId = usageGate.getUserByStripeCustomer(customerId);
      if (userId) {
        if (sub.status === "active") {
          usageGate.setSubscription(
            userId,
            customerId,
            sub.id,
            new Date(sub.current_period_end * 1000).toISOString(),
          );
        } else if (sub.status === "canceled" || sub.status === "unpaid") {
          usageGate.cancelSubscription(customerId);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as import("stripe").default.Subscription;
      usageGate.cancelSubscription(sub.customer as string);
      break;
    }

    default:
      // Unknown event type — log and acknowledge
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  usageGate.markEventProcessed(event.id);
  res.json({ received: true });
}
