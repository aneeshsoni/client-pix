import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { insightDetails } from '@/components/data/InsightDetail';

interface InsightCardProps {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
}

export function InsightCard({ title, icon: Icon, children }: InsightCardProps) {
    const details = insightDetails[title as keyof typeof insightDetails];

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Card className="p-4 h-full cursor-pointer group hover:shadow-lg transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <div className="relative space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Icon className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold">{title}</h3>
                            </div>
                        </div>

                        {children}

                        <div className="flex items-center justify-end pt-2">
                            <Button
                                variant="ghost"
                                className="text-xs text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300"
                                size="sm"
                            >
                                View Details
                                <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                        </div>
                    </div>
                </Card>
            </DialogTrigger>
            {details && (
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className="h-5 w-5" />
                            {details.title}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <ul className="space-y-3">
                            {details.details.map((detail, index) => (
                                <li key={index} className="flex items-start gap-2">
                                    <span className="h-2 w-2 rounded-full bg-primary mt-2"></span>
                                    <span>{detail}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </DialogContent>
            )}
        </Dialog>
    );
}