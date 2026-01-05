"use client";

import * as React from "react";
import { Home, CreditCard, User, Settings2, Images } from "lucide-react";
import { useUser } from "@clerk/nextjs";

import { NavMain } from "@/components/nav-main";
import UserSection from "@/components/UserSection";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// Navigation items for the main application
const navItems = [
  {
    title: "Home",
    url: "/dashboard",
    icon: Home,
    isActive: false,
  },
  {
    title: "Gallery",
    url: "/dashboard/gallery",
    icon: Images,
    isActive: false,
  },
  {
    title: "Billing",
    url: "/dashboard/billing",
    icon: CreditCard,
    isActive: false,
  },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings2,
    isActive: false,
  },
];

// This is sample data for teams - you can customize this
const data = {
  teams: [
    {
      name: "Personal",
      logo: User,
      plan: "Free",
    },
    {
      name: "Pro Team",
      logo: CreditCard,
      plan: "Pro",
    },
    {
      name: "Enterprise",
      logo: Settings2,
      plan: "Enterprise",
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, isLoaded } = useUser();

  // Don't render if Clerk is not loaded or user is not authenticated
  if (!isLoaded) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <UserSection
          user={
            user
              ? {
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.emailAddresses[0]?.emailAddress,
                }
              : undefined
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
