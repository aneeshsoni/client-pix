import { Button } from "@/components/ui/button";
import { SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function Home() {
  return (
    <section className="flex items-center justify-center bg-background h-[90vh]">
      <div className="realtive items-center w-full px-5 py-12 mx-auto lg;px-16 max-w-7xl md:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <div>
            <span className="w-auto px-6 py-3 rounded-full bg-secondary">
              <span className="text-sm font-medium text-primary">Research fortune 500 clients easily</span>
            </span>

            <h1 className="mt-8 text-3xl font-extrabold tracking-tight lg:text-6xl">Sell to the Fortune 500 with ease</h1>
            <p className="max-w-xl mx-auto mt-8 text-base lg:text-xl text-secondary-foreground">Identify why your clients need YOUR product</p>
          </div>
          <div className="flex justify-center max-w-sm mx-auto mt-10">
            <SignedOut>
              <SignUpButton>
                <Button size="lg" className="w-full">
                  Sign up now!
                </Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <a href="/dashboard">
                <Button size="lg" className="w-full">
                  Go to Dashboard!
                </Button>
              </a>
            </SignedIn>
          </div>
        </div>
      </div>
    </section>
  );
}