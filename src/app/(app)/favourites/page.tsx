import type { Metadata } from "next";
import { FavouritesPage } from "@/features/favourites/components/favourites-page";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Favourites" };

export default async function Page() {
  await guardPage();
  return <FavouritesPage />;
}
