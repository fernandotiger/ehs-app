import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function AppNotFound() {
  return (
    <Empty className="mt-10 rounded-xl border bg-card py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-brand-soft text-brand">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>Not found</EmptyTitle>
        <EmptyDescription>This page doesn&apos;t exist, or you don&apos;t have access to it.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to home</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
