"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Building2, Target, Briefcase, Search } from "lucide-react";
import { ResearchResults } from "@/components/ResearchResults";

export default function DashboardClient() {

    const fortune500 = [
        "Apple",
        "Microsoft",
        "Amazon",
        "Alphabet",
        "Berkshire Hathaway",
        "UnitedHealth Group",
        "Johnson & Johnson",
        "ExxonMobil",
        "JPMorgan Chase",
        "Visa"
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">Sales Research Platform</h1>
                <p className="text-muted-foreground">
                    Research and track your enterprise sales targets
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">Company Details</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="company">Company Name</Label>
                            <Input
                                id="company"
                                placeholder="Enter company name"
                                className="w-full"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Company Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Enter company description and key details..."
                                className="min-h-[150px]"
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                        <Target className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">Target Account</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="fortune500">Fortune 500 Target</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select target company" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fortune500.map((company) => (
                                        <SelectItem key={company} value={company.toLowerCase()}>
                                            {company}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-4">
                            <div className="flex items-center space-x-2 text-muted-foreground">
                                <Briefcase className="h-4 w-4" />
                                <span className="text-sm">Top 10 Fortune 500 companies listed</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <ResearchResults />

        </div>
    );
}