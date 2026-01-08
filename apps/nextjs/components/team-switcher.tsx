"use client";

import { Camera } from "lucide-react";
import Link from "next/link";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="/dashboard">
            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <Camera className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Client Pix</span>
              <span className="truncate text-xs text-muted-foreground">
                Photo Gallery
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
