import type { Metadata } from "next";
import { MySurveys } from "@/features/documents/components/survey/my-surveys";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My Surveys" };

export default async function MySurveysPage() {
  await guardModulePage("documents");
  return <MySurveys />;
}
