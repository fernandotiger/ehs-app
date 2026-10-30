import { redirect } from "next/navigation";
import { responseFormsLibraryHref } from "@/features/documents/survey-format";

/**
 * The Survey Library (shown as "Induction Library" from 28 Oct 2026) became the Document Library's Response forms tab
 * on 30 Oct 2026. Old links and favourites land there with their filters; the Document Library checks access itself.
 */
export default async function SurveyLibraryPage(props: PageProps<"/documents/surveys/library">) {
  redirect(responseFormsLibraryHref(await props.searchParams));
}
