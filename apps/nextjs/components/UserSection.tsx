'use client';

import { UserButton } from "@clerk/nextjs";
import { useSidebar } from "@/components/ui/sidebar";

interface User {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}

const UserSection = ({ user }: { user?: User }) => {
    const { state } = useSidebar();

    if (!user) {
        return null;
    }

    return (
        <div className="flex items-center gap-x-2">
            <UserButton />
            {state === 'expanded' && (
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-sidebar-foreground truncate">
                        {user.firstName} {user.lastName}
                    </span>
                    <span className="text-xs text-sidebar-muted-foreground truncate">
                        {user.email}
                    </span>
                </div>
            )}
        </div>
    )
}

export default UserSection;