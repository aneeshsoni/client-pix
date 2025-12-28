import { headers } from 'next/headers';
import { Stripe } from 'stripe';
import { stripe } from '@/lib/stripe';
import prisma from '@/lib/db';

export async function POST(req: Request) {
    const body = await req.text();

    const headersList = await headers();
    const signature = headersList.get("Stripe-Signature") as string;

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
    } catch (error: unknown) {
        return new Response("Webhook error", { status: 400 });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (event.type === "checkout.session.completed") {
        // Handle successful payment
        if (session.mode === 'subscription') {
            // Subscription-related code
            /*
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const customerId = String(session.customer);

            const user = await prisma.user.findUnique({
                where: {
                    stripe_customer_id: customerId
                }
            });

            if (!user) throw new Error("User not found");

            await prisma.subscription.create({
                data: {
                    stripe_subscription_id: subscription.id,
                    user_id: user.user_id,
                    current_period_start: subscription.current_period_start,
                    current_period_end: subscription.current_period_end,
                    status: subscription.status,
                    plan_id: subscription.items.data[0].plan.id,
                    interval: String(subscription.items.data[0].plan.interval),
                }
            });
            */
        } else if (session.mode === 'payment') {
            // One-off payment-related code
            const customerId = String(session.customer);

            const user = await prisma.user.findUnique({
                where: {
                    stripe_customer_id: customerId
                }
            });

            if (!user) throw new Error("User not found");

            await prisma.payment.create({
                data: {
                    stripe_payment_id: session.payment_intent as string,
                    user_id: user.user_id,
                    amount: (session.amount_total ?? 0) / 100,
                    currency: session.currency as string,
                    status: session.payment_status,
                }
            });
        }
    }

    if (event.type === "invoice.payment_succeeded") {
        // Subscription-related code
        /*
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    
        await prisma.subscription.update({
            where: {
                stripe_subscription_id: subscription.id
            },
            data: {
                plan_id: subscription.items.data[0].plan.id,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                status: subscription.status,
            }
        });
        */
    }

    return new Response(null, { status: 200 });
}