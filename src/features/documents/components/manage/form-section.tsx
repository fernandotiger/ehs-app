import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** White card section used by the upload and edit forms. */
export function FormSection({ step, title, description, children }: { step?: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {step !== undefined && <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{step}</span>}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
