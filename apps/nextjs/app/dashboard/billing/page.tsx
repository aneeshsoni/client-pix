import prisma from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { getStripeSession, stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { StripePortal, StripeSubscriptionCreationButton } from "@/components/Submitbuttons";
import { featureItems } from "@/components/data/FeatureItems";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

// CODE BELOW IS FOR SUBSCRIPTIONS
// async function getData(userId: string) {
//     const data = await prisma.subscription.findUnique({
//         where: {
//             user_id: userId,
//         },
//         select: {
//             status: true,
//             user: {
//                 select: {
//                     stripe_customer_id: true,
//                 }
//             }
//         }
//     })

//     return data;
// }

// CODE BELOW IS FOR ONE TIME PURCHASE
async function getData(clerkId: string) {
    const data = await prisma.payment.findFirst({
        where: {
            user: {
                clerk_id: clerkId
            }
        },
        select: {
            status: true,
            user: {
                select: {
                    stripe_customer_id: true,
                }
            }
        }
    })

    return data;
}

export default async function BillingPage() {
    const { userId } = await auth();
    const clerkId = userId; // userId from Clerk is actually the clerkId in our database

    if (!clerkId) {
        return redirect('/');
    }

    const data = await getData(clerkId);

    async function createSubscription() {
        'use server';

        const dbUser = await prisma.user.findUnique({
            where: {
                clerk_id: clerkId as string,
            },
            select: {
                stripe_customer_id: true,
            }
        });

        console.log('User found:', dbUser);
        console.log('Stripe customer ID:', dbUser?.stripe_customer_id);

        if (!dbUser?.stripe_customer_id) {
            throw new Error('No stripe customer id found. Please refresh the page and try again.');
        }

        const subscriptionUrl = await getStripeSession({
            customerId: dbUser.stripe_customer_id,
            domainUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
            priceId: process.env.STRIPE_PRICE_ID as string,
        });

        return redirect(subscriptionUrl);
    }

    async function createCustomerPortal() {
        'use server';

        const session = await stripe.billingPortal.sessions.create({
            customer: data?.user.stripe_customer_id as string,
            return_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/billing`,
        });

        return redirect(session.url);
    }

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                <div className="flex items-center gap-2 px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem className="hidden md:block">
                                <BreadcrumbLink href="/dashboard">
                                    Dashboard
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden md:block" />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Billing</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                {data?.status === 'paid' ? (
                    <div className="rounded-xl bg-muted/50 p-6">
                        <div className="grid items-start gap-8">
                            <div className="flex items-center justify-between">
                                <div className="grid gap-1">
                                    <h2 className="text-2xl font-bold mb-4">Subscription</h2>
                                    <p className="text-muted-foreground">Settings regarding your subscription</p>
                                </div>
                            </div>
                            <Card className="w-full lg:w-2/3">
                                <CardHeader>
                                    <CardTitle>Edit Subscription</CardTitle>
                                    <CardDescription>
                                        Click on the button below, this will give you the opportunity to
                                        change your payment details and view your statement at the same time.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form action={createCustomerPortal}>
                                        <StripePortal />
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl bg-muted/50 p-6">
                        <div className="max-w-md mx-auto space-y-4">
                            <Card className="flex flex-col">
                                <CardContent className="py-8">
                                    <div>
                                        <h3 className="inline-flex px-4 py-1 rounded-full text-sm font-semibold tracking-wide uppercase bg-primary/10 text-primary">
                                            One Time Purchase
                                        </h3>
                                    </div>
                                    <div className="mt-4 flex items-baseline text-6xl font-extrabold">
                                        $40 <span className="ml-1 text-2xl text-muted-foreground">/mo</span>
                                    </div>
                                    <p className="mt-5 text-muted-foreground">Research your prospective clients quickly</p>
                                </CardContent>
                                <div className="flex-1 flex flex-col justify-between px-6 pt-6 pb-8 bg-secondary rounded-lg m-1 space-y-6 sm:p-10 sm:pt-6">
                                    <ul className="space-y-4">
                                        {featureItems.map((item, index) => (
                                            <li key={index} className="flex items-center">
                                                <div className="flex-shrink-0">
                                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                                </div>
                                                <p className="ml-3 text-base">{item.name}</p>
                                            </li>
                                        ))}
                                    </ul>
                                    <form className="w-full" action={createSubscription}>
                                        <StripeSubscriptionCreationButton />
                                    </form>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}