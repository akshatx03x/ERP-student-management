"use server";

import { verifyPassword, makeSignature } from "better-auth/crypto";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/server/lib/prisma";
import { safeAction } from "@/server/lib/action-response";
import { Role } from "@prisma/client";

export async function signInWithPinAction(input: { username: string; pin: string }) {
  return safeAction("signInWithPin", async () => {
    const { username, pin } = input;

    // Validate PIN is exactly 4 digits string
    const trimmedPin = String(pin || "").trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      throw new Error("Invalid credentials. PIN must be exactly 4 digits.");
    }

    const trimmedUsername = String(username || "").trim();
    if (!trimmedUsername) {
      throw new Error("Invalid credentials. Username is required.");
    }

    // Find Principal user by username or role
    let user = await prisma.user.findFirst({
      where: {
        username: trimmedUsername,
        isActive: true,
      },
    });

    if (!user && (trimmedUsername.toLowerCase() === "principal" || trimmedUsername.toLowerCase() === "principal@vidyanjali.edu.in")) {
      user = await prisma.user.findFirst({
        where: {
          role: Role.PRINCIPAL,
          isActive: true,
        },
      });
    }

    if (!user) {
      throw new Error("Invalid credentials. Please verify your login details.");
    }

    if (!user.pinHash) {
      throw new Error("PIN authentication is not configured for this account. Please login with Email & Password.");
    }

    // Verify PIN against stored hash
    const isValidPin = await verifyPassword({
      hash: user.pinHash,
      password: trimmedPin,
    });

    if (!isValidPin) {
      throw new Error("Invalid credentials. Please verify your login details.");
    }

    // Create session record and set signed HTTP-only session cookie expected by Better Auth
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-change-me-in-production-32chars";
    const signature = await makeSignature(token, secret);
    const signedToken = `${token}.${signature}`;

    const cookieStore = await cookies();
    cookieStore.set("better-auth.session_token", signedToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      expires: expiresAt,
      secure: process.env.NODE_ENV === "production",
    });

    return {
      success: true,
      userId: user.id,
      role: user.role,
    };
  }, "Invalid credentials. Please verify your login details.");
}
