import axios from "axios";
import type { EmailStatus } from "@prisma/client";
import { getValidToken } from "./token-refresh";

const API_BASE_URL = "https://api.aurinko.io/v1";

interface SyncEmailOrganizationOptions {
  accountId: string;
  emailProviderId: string;
  status?: EmailStatus | null;
  customLabels?: string[];
}

/**
 * Ensure email organization changes (status, labels) are reflected in the provider mailbox.
 * Currently leverages Aurinko's email PATCH endpoint to add/remove system labels and keywords.
 */
export async function syncEmailOrganizationToProvider({
  accountId,
  emailProviderId,
  status,
  customLabels,
}: SyncEmailOrganizationOptions): Promise<void> {
  const token = await getValidToken(accountId);

  if (!token) {
    throw new Error("No valid provider token available");
  }

  const payload: Record<string, unknown> = {};
  const labelsToAdd = new Set<string>();
  const labelsToRemove = new Set<string>();

  if (status) {
    switch (status) {
      case "read":
        labelsToRemove.add("unread");
        break;
      case "unread":
        labelsToAdd.add("unread");
        break;
      case "archived":
        labelsToRemove.add("inbox");
        break;
      case "flagged":
        labelsToAdd.add("flagged");
        break;
      case "snoozed":
        labelsToAdd.add("snoozed");
        break;
    }

    if (status !== "flagged") {
      labelsToRemove.add("flagged");
    }

    if (status !== "snoozed") {
      labelsToRemove.add("snoozed");
    }

    if (status !== "unread") {
      labelsToRemove.add("unread");
    }
  }

  if (customLabels) {
    payload.keywords = customLabels;
  }

  const sysLabelsPayload: Record<string, string[]> = {};
  if (labelsToAdd.size > 0) {
    sysLabelsPayload.add = Array.from(labelsToAdd);
  }
  if (labelsToRemove.size > 0) {
    sysLabelsPayload.remove = Array.from(labelsToRemove);
  }

  if (Object.keys(sysLabelsPayload).length > 0) {
    payload.sysLabels = sysLabelsPayload;
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  try {
    await axios.patch(
      `${API_BASE_URL}/email/messages/${emailProviderId}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (error: any) {
    // Provide more descriptive error messages
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new Error(`Email not found in provider (ID: ${emailProviderId})`);
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("No valid provider token available");
      } else {
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error || 
                           `Request failed with status code ${error.response?.status}`;
        throw new Error(errorMessage);
      }
    }
    throw error;
  }
}

