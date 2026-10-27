import type { Metadata } from "next";
import { MyWork } from "@/features/my-work/components/my-work";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My work" };

export default async function MyWorkPage() {
  await guardPage();
  return <MyWork />;
}
