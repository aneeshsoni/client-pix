import { Card } from "@/components/ui/card";
import {
    Target,
    Cpu,
    TrendingUp,
    Banknote,
    AlertTriangle,
    UserCog,
    Building,
    Laptop
} from "lucide-react";
import { InsightCard } from "./ui/InsightCard";

export function ResearchGrid() {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Research Insights</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Financial Metrics - Prominent placement */}
                <Card className="p-4 col-span-full bg-primary/5 group hover:shadow-lg transition-all duration-300">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">Financial Performance</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-3 bg-background rounded-lg">
                            <div className="text-sm text-muted-foreground">Revenue Growth</div>
                            <div className="text-2xl font-semibold">+15.3%</div>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                            <div className="text-sm text-muted-foreground">Operating Margin</div>
                            <div className="text-2xl font-semibold">28.4%</div>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                            <div className="text-sm text-muted-foreground">Market Share</div>
                            <div className="text-2xl font-semibold">12.7%</div>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                            <div className="text-sm text-muted-foreground">YoY Growth</div>
                            <div className="text-2xl font-semibold">+22%</div>
                        </div>
                    </div>
                </Card>

                <InsightCard title="Strategic Initiatives" icon={Target}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Global market expansion in APAC region
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Digital infrastructure modernization
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Sustainable operations transformation
                        </li>
                    </ul>
                </InsightCard>

                <InsightCard title="Technology Investments" icon={Cpu}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Cloud infrastructure and edge computing
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            AI/ML capabilities for customer insights
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Cybersecurity enhancement programs
                        </li>
                    </ul>
                </InsightCard>

                <InsightCard title="Investment Focus" icon={Banknote}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            R&D and Product Innovation
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Digital Transformation
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Market Expansion
                        </li>
                    </ul>
                </InsightCard>

                <InsightCard title="Risk Factors" icon={AlertTriangle}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                            Cybersecurity threats
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                            Supply chain disruptions
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                            Regulatory compliance challenges
                        </li>
                    </ul>
                </InsightCard>

                <InsightCard title="Digital Transformation" icon={Laptop}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Cloud-first infrastructure adoption
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            AI-powered customer experience platform
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Digital workplace transformation
                        </li>
                    </ul>
                </InsightCard>

                <InsightCard title="Business Units" icon={Building}>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 bg-muted rounded">
                            Enterprise Solutions
                        </div>
                        <div className="p-2 bg-muted rounded">
                            Cloud Services
                        </div>
                        <div className="p-2 bg-muted rounded">
                            Consumer Products
                        </div>
                        <div className="p-2 bg-muted rounded">
                            Innovation Lab
                        </div>
                    </div>
                </InsightCard>

                <InsightCard title="Executive Metrics" icon={UserCog}>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Digital transformation milestones
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Innovation pipeline metrics
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                            Operational efficiency KPIs
                        </li>
                    </ul>
                </InsightCard>
            </div>
        </div>
    );
}