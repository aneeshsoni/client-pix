"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreditCard, DoorClosed, Home, Settings, User } from 'lucide-react';
import Link from "next/link";
import { SignOutButton, useUser } from "@clerk/nextjs";

export const navItems = [
    {
        name: 'Home',
        href: '/dashboard',
        icon: Home
    },
    {
        name: 'Billing',
        href: '/dashboard/billing',
        icon: CreditCard
    },
]

export function UserNav() {
    const { user } = useUser();
    const name = user?.fullName || user?.firstName || 'User';
    const email = user?.emailAddresses[0]?.emailAddress || '';
    const image = user?.imageUrl;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10 rounded-full">
                        <AvatarFallback>
                            {name.includes(' ') ?
                                `${name.split(' ')[0][0]}${name.split(' ')[1][0]}` :
                                name.slice(0, 3)
                            }
                        </AvatarFallback>
                        {image && (
                            <AvatarImage src={image} alt={name} />
                        )}
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    {navItems.map((item, index) => (
                        <DropdownMenuItem asChild key={index}>
                            <Link href={item.href} className="w-full flex justify-between items-center">
                                {item.name}
                                <span>
                                    <item.icon className="w-4 h-4" />
                                </span>
                            </Link>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <div className="w-full flex justify-between items-center">
                        <SignOutButton>
                            <span>Logout</span>
                        </SignOutButton>
                        <DoorClosed className="w-4 h-4" />
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}