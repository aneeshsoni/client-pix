"use client";

import Image from "next/image";
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
            <div className="relative flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
              <Image
                src="/client_pix_logo.png"
                alt="Client Pix"
                fill
                className="object-cover scale-[1.15]"
                priority
              />
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
