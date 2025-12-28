"use client";

import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useState } from "react";
import { ResearchGrid } from "./ResearchGrid";

export function ResearchResults() {
    const [showResults, setShowResults] = useState(false);

    const handleResearch = () => {
        setShowResults(true);
    };

    return (
        <div>
            <div className="flex justify-center">
                <Button size="lg" onClick={handleResearch} className="gap-2">
                    <Search className="h-4 w-4" />
                    Research Company
                </Button>
            </div>

            {showResults && (
                <ResearchGrid />
            )}
        </div>
    );
}