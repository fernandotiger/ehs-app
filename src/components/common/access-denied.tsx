import { ShieldX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function AccessDenied({ message = "You don't have permission to view this page." }: { message?: string }) {
  return (
    <Empty className="mt-10 rounded-xl border bg-card py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <ShieldX />
        </EmptyMedia>
        <EmptyTitle>Access restricted</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to home</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
