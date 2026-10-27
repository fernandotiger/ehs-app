import { NextResponse } from "next/server";
import type { HandleUploadBody } from "@vercel/blob/client";
import { apiHandler } from "@/server/http/api-handler";
import { uploadService } from "@/server/modules/uploads/upload.service";

/** POST /api/uploads/:id/blob-token – Vercel Blob client-upload token exchange. */
export const POST = apiHandler({}, async ({ req, params, user }) => {
  const body = (await req.json()) as HandleUploadBody;
  const result = await uploadService.handleBlobToken(params.id!, user, req, body);
  return NextResponse.json(result);
});
