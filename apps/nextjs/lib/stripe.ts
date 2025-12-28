import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
});

export const getStripeSession = async ({ priceId, domainUrl, customerId }: { priceId: string, domainUrl: string, customerId: string }) => {
    const session = await stripe.checkout.sessions.create({
        mode: 'payment', // or 'subscription' if you're setting it up as a recurring payment
        payment_method_types: ["card"],
        billing_address_collection: 'auto',
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        customer: customerId,
        customer_update: {
            address: 'auto',
            name: 'auto',
        },
        success_url: `${domainUrl}/payment/success`,
        cancel_url: `${domainUrl}/payment/cancelled`,
    });
    return session.url as string;
}