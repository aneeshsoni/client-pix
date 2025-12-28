import Link from "next/link";
import { ThemeToggle } from "./Themetoggle";
import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { UserNav } from "./UserNav";

export function Navbar() {
    return (
        <nav className="border-b bg-background h-[10vh] flex items-center">
            <div className="container flex items-center justify-between">
                <Link href="/">
                    <h1 className="font-bold text-3xl">Aneesh
                        <span className="text-primary">
                            SaaS
                        </span>
                    </h1>
                </Link>

                <div className="flex items-center gap-x-5">
                    <SignedIn>
                        <UserNav />
                    </SignedIn>
                    <SignedOut>
                        <div className="flex items-center gap-x-5">
                            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                                Pricing
                            </Link>
                            <SignInButton>
                                <Button>Sign in</Button>
                            </SignInButton>
                            <SignUpButton>
                                <Button variant={"secondary"}>Sign up</Button>
                            </SignUpButton>
                        </div>
                    </SignedOut>
                    <ThemeToggle />
                </div >
            </div >
        </nav >
    )
}