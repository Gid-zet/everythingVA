import "server-only";
import axios from "axios";
import type { EmailMessage } from "./types";
import { AURINKO_API } from "@/server/providers/aurinko/http";

/**
 * Server-only Aurinko helpers. (This file used to be a "use server" module,
 * which exposed token exchange and message fetches as server actions any
 * browser could call. Account connection now lives in
 * src/server/services/accounts.ts and /api/accounts/connect.)
 */
export const getEmailDetails = async (accessToken: string, emailId: string) => {
  const response = await axios.get<EmailMessage>(`${AURINKO_API}/email/messages/${encodeURIComponent(emailId)}`, {
    params: { loadInlines: true },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
};
