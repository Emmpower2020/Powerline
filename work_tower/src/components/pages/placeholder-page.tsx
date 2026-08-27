"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Construction className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
            <p className="text-sm text-slate-500 max-w-md">{description}</p>
            <p className="text-xs text-slate-400 mt-4">این بخش در نسخه‌های بعدی تکمیل می‌شود</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
