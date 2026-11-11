import type {
  EmailHeader,
  EmailMessage,
  SyncResponse,
  SyncUpdatedResponse,
} from "@/lib/types";
import { db } from "@/server/db";
import axios from "axios";
import { syncEmailsToDatabase } from "./sync-to-db";
import { getValidToken } from "./token-refresh";
import { decryptSecret } from "@/server/security/crypto";

const API_BASE_URL = "https://api.aurinko.io/v1";

class Account {
  private token: string;
  private accountId: string;

  constructor(token: string, accountId?: string) {
    this.token = token;
    this.accountId = accountId || "";
  }

  /** Load an account by id with its decrypted token. */
  static async forId(accountId: string) {
    const row = await db.account.findUnique({ where: { id: accountId }, select: { id: true, token: true } });
    if (!row) throw new Error("Account not found");
    const token = decryptSecret(row.token);
    if (!token) throw new Error("TOKEN_EXPIRED");
    return new Account(token, row.id);
  }

  private async startSync(daysWithin: number): Promise<SyncResponse> {
    const response = await axios.post<SyncResponse>(
      `${API_BASE_URL}/email/sync`,
      {},
      {
        headers: { Authorization: `Bearer ${this.token}` },
        params: {
          daysWithin,
          bodyType: "html",
        },
      },
    );
    return response.data;
  }

  async createSubscription() {
    // Public base URL Aurinko can reach (use a tunnel such as cloudflared in dev).
    const webhookUrl = process.env.AURINKO_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_URL;
    if (!webhookUrl) throw new Error("Set NEXT_PUBLIC_URL or AURINKO_WEBHOOK_BASE_URL for webhooks");
    const res = await axios.post(
      "https://api.aurinko.io/v1/subscriptions",
      {
        resource: "/email/messages",
        notificationUrl: webhookUrl + "/api/aurinko/webhook",
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return res.data;
  }

  async syncEmails() {
    const account = await db.account.findUnique({
      where: { id: this.accountId },
    });
    if (!account) throw new Error("Account not found");

    // Update accountId if not set
    if (!this.accountId) {
      this.accountId = account.id;
    }

    // If no delta token exists, perform initial sync
    if (!account.nextDeltaToken) {
      console.log("No delta token found, performing initial sync");
      const initialSyncResult = await this.performInitialSync();
      if (!initialSyncResult) {
        throw new Error("Failed to perform initial sync");
      }
      
      // Sync the emails to database
      try {
        await syncEmailsToDatabase(initialSyncResult.emails, account.id);
      } catch (error) {
        console.log("Error syncing emails to database:", error);
      }
      
      // Update the account with the delta token from initial sync
      await db.account.update({
        where: {
          id: account.id,
        },
        data: {
          nextDeltaToken: initialSyncResult.deltaToken,
        },
      });
      
      return;
    }

    try {
      let response = await this.getUpdatedEmails({
        deltaToken: account.nextDeltaToken,
      });
      let allEmails: EmailMessage[] = response.records;
      let storedDeltaToken = account.nextDeltaToken;
      if (response.nextDeltaToken) {
        storedDeltaToken = response.nextDeltaToken;
      }
      while (response.nextPageToken) {
        response = await this.getUpdatedEmails({
          pageToken: response.nextPageToken,
        });
        allEmails = allEmails.concat(response.records);
        if (response.nextDeltaToken) {
          storedDeltaToken = response.nextDeltaToken;
        }
      }

      if (!response) throw new Error("Failed to sync emails");

      try {
        await syncEmailsToDatabase(allEmails, account.id);
      } catch (error) {
        console.log("error", error);
      }

      // Auto-organize newly received mail (no-op unless enabled for this account).
      if (allEmails.length) {
        const { runOnNewMail } = await import("@/server/organizer/run");
        await runOnNewMail(account.id, allEmails.map((e) => e.id)).catch((error) =>
          console.error("Auto-organize after sync failed:", (error as Error).message),
        );
      }

      await db.account.update({
        where: { id: account.id },
        data: {
          nextDeltaToken: storedDeltaToken,
          lastSyncedAt: new Date(),
          ...(account.status === "error" || account.status === "syncing"
            ? { status: "active", statusMessage: null }
            : {}),
        },
      });
    } catch (error: any) {
      // Check if the error is due to an invalid delta token
      // This can happen after re-authorization when the old delta token is no longer valid
      if (
        error?.response?.data?.code === "token.notValid" ||
        error?.response?.data?.message?.includes("Sync token is not valid") ||
        (error?.response?.status === 400 && error?.response?.data?.code === "token.notValid")
      ) {
        console.log("Delta token is invalid, performing initial sync instead");
        
        // Clear the invalid delta token
        await db.account.update({
          where: {
            id: account.id,
          },
          data: {
            nextDeltaToken: null,
          },
        });
        
        // Perform initial sync to get a fresh delta token
        const initialSyncResult = await this.performInitialSync();
        if (!initialSyncResult) {
          throw new Error("Failed to perform initial sync after invalid delta token");
        }
        
        // Sync the emails to database
        try {
          await syncEmailsToDatabase(initialSyncResult.emails, account.id);
        } catch (syncError) {
          console.log("Error syncing emails to database:", syncError);
        }
        
        // Update the account with the new delta token
        await db.account.update({
          where: {
            id: account.id,
          },
          data: {
            nextDeltaToken: initialSyncResult.deltaToken,
          },
        });
        
        return; // Successfully synced with initial sync
      }
      
      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        // Mark account as needing re-authentication
        await db.account.update({
          where: { id: account.id },
          data: {
            status: "needs_reauth",
            statusMessage: "Access was revoked or expired. Reconnect to resume sync.",
          },
        });
        throw new Error("TOKEN_EXPIRED");
      }
      throw error;
    }
  }

  async getUpdatedEmails({
    deltaToken,
    pageToken,
  }: {
    deltaToken?: string;
    pageToken?: string;
  }): Promise<SyncUpdatedResponse> {
    // console.log('getUpdatedEmails', { deltaToken, pageToken });
    let params: Record<string, string> = {};
    if (deltaToken) {
      params.deltaToken = deltaToken;
    }
    if (pageToken) {
      params.pageToken = pageToken;
    }

    try {
      // Try to get a valid token if we have an accountId
      let tokenToUse = this.token;
      if (this.accountId) {
        const validToken = await getValidToken(this.accountId);
        if (validToken) {
          tokenToUse = validToken;
          this.token = validToken; // Update the instance token
        }
      }

      const response = await axios.get<SyncUpdatedResponse>(
        `${API_BASE_URL}/email/sync/updated`,
        {
          params,
          headers: { Authorization: `Bearer ${tokenToUse}` },
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token is expired or invalid
        throw new Error("TOKEN_EXPIRED");
      }
      throw error;
    }
  }

  async performInitialSync() {
    try {
      // Start the sync process
      const daysWithin = Number(process.env.INITIAL_SYNC_DAYS ?? 14);
      let syncResponse = await this.startSync(daysWithin); // Sync emails from the last 7 days

      // Wait until the sync is ready
      while (!syncResponse.ready) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
        syncResponse = await this.startSync(daysWithin);
      }

      // console.log('Sync is ready. Tokens:', syncResponse);

      // Perform initial sync of updated emails
      let storedDeltaToken: string = syncResponse.syncUpdatedToken;
      let updatedResponse = await this.getUpdatedEmails({
        deltaToken: syncResponse.syncUpdatedToken,
      });
      // console.log('updatedResponse', updatedResponse)
      if (updatedResponse.nextDeltaToken) {
        storedDeltaToken = updatedResponse.nextDeltaToken;
      }
      let allEmails: EmailMessage[] = updatedResponse.records;

      // Fetch all pages if there are more
      while (updatedResponse.nextPageToken) {
        updatedResponse = await this.getUpdatedEmails({
          pageToken: updatedResponse.nextPageToken,
        });
        allEmails = allEmails.concat(updatedResponse.records);
        if (updatedResponse.nextDeltaToken) {
          storedDeltaToken = updatedResponse.nextDeltaToken;
        }
      }

      // console.log('Initial sync complete. Total emails:', allEmails.length);

      // Store the nextDeltaToken for future incremental syncs

      // Example of using the stored delta token for an incremental sync
      // await this.performIncrementalSync(storedDeltaToken);
      return {
        emails: allEmails,
        deltaToken: storedDeltaToken,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "Error during sync:",
          JSON.stringify(error.response?.data, null, 2),
        );
      } else {
        console.error("Error during sync:", error);
      }
    }
  }

  async sendEmail({
    from,
    subject,
    body,
    inReplyTo,
    references,
    threadId,
    to,
    cc,
    bcc,
    replyTo,
    attachments,
  }: {
    from: EmailAddress;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    replyTo?: EmailAddress;
    attachments?: Array<{
      id: string;
      name: string;
      size: number;
      type: string;
      content: string; // base64 encoded content
    }>;
  }) {
    try {
      const requestBody: any = {
        from,
        subject,
        body,
        inReplyTo,
        references,
        threadId,
        to,
        cc,
        bcc,
        replyTo: [replyTo],
      };

      // Add attachments if provided
      if (attachments && attachments.length > 0) {
        requestBody.attachments = attachments.map((attachment) => {
          // Ensure content is clean base64 (remove data URI prefix if present)
          let content = attachment.content.trim();
          if (content.includes(',')) {
            // Remove data URI prefix (e.g., "data:image/png;base64,")
            content = content.split(',')[1] || content;
          }
          
          // Validate that content is not empty
          if (!content || content.length === 0) {
            throw new Error(`Attachment ${attachment.name} has empty content`);
          }
          
          // Validate base64 format (basic check)
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(content)) {
            throw new Error(`Attachment ${attachment.name} has invalid base64 content`);
          }
          
          // Determine content type with fallback
          let contentType = attachment.type || 'application/octet-stream';
          if (!contentType || contentType.trim() === '') {
            // Try to infer from file extension
            const extension = attachment.name.split('.').pop()?.toLowerCase();
            const mimeTypes: Record<string, string> = {
              'pdf': 'application/pdf',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'txt': 'text/plain',
              'doc': 'application/msword',
              'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'xls': 'application/vnd.ms-excel',
              'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
            contentType = mimeTypes[extension || ''] || 'application/octet-stream';
          }
          
          return {
            name: attachment.name,
            mimeType: contentType,
            content: content,
          };
        });
      }

      const response = await axios.post(
        `${API_BASE_URL}/email/messages`,
        requestBody,
        {
          params: {
            returnIds: true,
          },
          headers: { 
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log("sendmail", response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorDetails = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        };
        console.error(
          "Error sending email:",
          JSON.stringify(errorDetails, null, 2),
        );
        
        // Create a more descriptive error message
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error || 
                           `Request failed with status code ${error.response?.status}`;
        
        const enhancedError = new Error(errorMessage);
        (enhancedError as any).status = error.response?.status;
        (enhancedError as any).responseData = error.response?.data;
        throw enhancedError;
      } else {
        console.error("Error sending email:", error);
      }
      throw error;
    }
  }

  async getWebhooks() {
    type Response = {
      records: {
        id: number;
        resource: string;
        notificationUrl: string;
        active: boolean;
        failSince: string;
        failDescription: string;
      }[];
      totalSize: number;
      offset: number;
      done: boolean;
    };
    const res = await axios.get<Response>(`${API_BASE_URL}/subscriptions`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
    return res.data;
  }

  async createWebhook(resource: string, notificationUrl: string) {
    const res = await axios.post(
      `${API_BASE_URL}/subscriptions`,
      {
        resource,
        notificationUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return res.data;
  }

  async deleteWebhook(subscriptionId: string) {
    const res = await axios.delete(
      `${API_BASE_URL}/subscriptions/${subscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return res.data;
  }
}
type EmailAddress = {
  name: string;
  address: string;
};

export default Account;
