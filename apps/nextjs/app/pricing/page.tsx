import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignUpButton } from "@clerk/nextjs";
import { CheckCircle2 } from "lucide-react";
import { featureItems } from "@/components/data/FeatureItems";

export default function PricingPage() {
    return (
        <div className="max-w-md mx-auto space-y-4 mt-12">
            <Card className="flex flex-col">
                <CardContent className="py-8">
                    <div>
                        <h3 className="inline-flex px-4 py-1 rounded-full text-sm font-semibold tracking-wide uppercase bg-primary/10 text-primary">
                            One Time Purchase
                        </h3>
                    </div>
                    <div className="mt-4 flex items-baseline text-6xl font-extrabold">
                        $40
                        {/* <span className="ml-1 text-2xl text-muted-foreground">/mo</span> */}
                    </div>
                    <p className="mt-5 text-lg text-muted-foreground">
                        Research your prospective clients quickly
                    </p>
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
                    <div className="w-full">
                        <SignUpButton>
                            <Button className="w-full inline-flex items-center justify-center py-3 px-4 bg-primary text-white rounded-md hover:bg-primary/90">Get Started</Button>
                        </SignUpButton>
                    </div>
                </div>
            </Card>
        </div>
    );
}