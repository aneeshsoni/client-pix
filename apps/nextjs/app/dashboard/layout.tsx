import { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { stripe } from '@/lib/stripe';
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"

async function getData({ email, clerkId, firstName, lastName, profileImage }:
    { email: string, clerkId: string, firstName: string | undefined | null, lastName: string | undefined | null, profileImage: string | undefined | null }) {

    let user = await prisma.user.findUnique({
        where: {
            clerk_id: clerkId,  // Look up by Clerk ID
        },
        select: {
            user_id: true,
            stripe_customer_id: true,
        },
    });

    if (!user) {
        const name = `${firstName ?? ""} ${lastName ?? ""}`;

        await prisma.user.create({
            data: {
                clerk_id: clerkId,  // Store Clerk's user ID
                email: email,
                name: name,
            },
        });

        // Refetch the user after creation
        user = await prisma.user.findUnique({
            where: {
                clerk_id: clerkId,
            },
            select: {
                user_id: true,
                stripe_customer_id: true,
            },
        });
    }

    if (!user?.stripe_customer_id) {
        console.log('Creating stripe customer');
        const data = await stripe.customers.create({
            email: email,
        });

        await prisma.user.update({
            where: {
                clerk_id: clerkId,  // Update using Clerk ID
            },
            data: {
                stripe_customer_id: data.id,
            },
        });

        // Update the user variable with the new stripe_customer_id
        user = await prisma.user.findUnique({
            where: {
                clerk_id: clerkId,
            },
            select: {
                user_id: true,
                stripe_customer_id: true,
            },
        });
    }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
        return redirect('/');
    }

    const email = user.emailAddresses[0]?.emailAddress;
    const firstName = user.firstName;
    const lastName = user.lastName;
    const profileImage = user.imageUrl;

    if (!email) {
        return redirect('/');
    }

    await getData({
        email: email,
        firstName: firstName,
        clerkId: userId,  // Pass Clerk's userId as clerkId
        lastName: lastName,
        profileImage: profileImage
    });

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <div className="flex-1">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}