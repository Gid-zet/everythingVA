import { NextResponse } from "next/server";
import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";
import { db } from "@/server/db";

// The Kinde issuer URL should already be in your `.env` file
// from when you initially set up Kinde. This will fetch your
// public JSON web keys file
const client = jwksClient({
  jwksUri: `${process.env.KINDE_ISSUER_URL}/.well-known/jwks.json`,
});

interface KindeWebhookEvent {
  type: string;
  data: {
    user: {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      avatar?: string;
    };
  };
}

export async function POST(req: Request) {
  try {
    console.log("🔔 Kinde webhook received at:", new Date().toISOString());

    // Get the token from the request
    const token = await req.text();

    // Decode the token
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string") {
      throw new Error("Invalid token format");
    }

    const { header } = decoded;
    const { kid } = header as { kid: string };

    // Verify the token
    const key = await client.getSigningKey(kid);
    const signingKey = key.getPublicKey();
    // Pin the algorithm and issuer so only Kinde-signed RS256 tokens pass.
    const event = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      ...(process.env.KINDE_ISSUER_URL ? { issuer: process.env.KINDE_ISSUER_URL } : {}),
    }) as KindeWebhookEvent;

    console.log("Webhook event received:", event.type);

    // Handle various events
    try {
      switch (event?.type) {
        case "user.updated":
          // handle user updated event
          // e.g update database with event.data
          // console.log("User updated event:", event.data);
          await handleUserEvent(event.data, "update");
          break;
        case "user.created":
          // handle user created event
          // e.g add user to database with event.data
          // console.log("User created event:", event.data);
          await handleUserEvent(event.data, "create");
          break;
        case "user.deleted":
          // handle user deleted event
          // console.log("User deleted event:", event.data);
          await handleUserEvent(event.data, "delete");
          break;
        default:
          // other events that we don't handle
          // console.log("Unhandled event type:", event?.type);
          break;
      }
    } catch (error) {
      console.error("Error handling webhook event:", error);
      // Don't throw the error to prevent webhook failure
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error("Kinde webhook error:", err.message);
      return NextResponse.json({ message: err.message }, { status: 400 });
    }
  }
  return NextResponse.json({ status: 200, statusText: "success" });
}

async function handleUserEvent(
  userData: any,
  action: "create" | "update" | "delete",
) {
  try {
    console.log(
      `Handling ${action} event with data:`,
      JSON.stringify(userData, null, 2),
    );

    // The user data is nested under userData.user
    const user = userData.user;
    if (!user || !user.id) {
      console.log("No user data or ID found in webhook");
      return;
    }

    const emailAddress = user.email;
    const firstName = user.first_name || user.given_name;
    const lastName = user.last_name || user.family_name;
    const imageUrl = user.picture || user.avatar;
    const id = user.id;

    console.log(
      `Processing user: ${id}, email: ${emailAddress}, name: ${firstName} ${lastName}`,
    );

    switch (action) {
      case "create":
      case "update":
        await db.user.upsert({
          where: { emailAddress },
          update: {
            id,
            firstName,
            lastName,
            imageUrl,
          },
          create: {
            id,
            emailAddress,
            firstName,
            lastName,
            imageUrl,
          },
        });
        console.log(`User ${action}d in database:`, id);
        break;
      case "delete":
        // Use deleteMany to handle cases where user might not exist
        const deleteResult = await db.user.deleteMany({
          where: { id },
        });
        if (deleteResult.count > 0) {
          console.log("User deleted from database:", id);
        } else {
          console.log("User not found in database for deletion:", id);
        }
        break;
    }
  } catch (error) {
    console.error(`Error handling user ${action} event:`, error);
  }
}
