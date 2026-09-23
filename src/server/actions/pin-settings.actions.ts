"use server";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import { safeAction } from "@/server/lib/action-response";
import { getCurrentUser } from "@/server/auth/session";

export async function changePrincipalPinAction(input: {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}) {
  return safeAction("changePrincipalPin", async () => {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized. Please log in.");
    }

    const { currentPin, newPin, confirmPin } = input;

    const trimmedCurrent = String(currentPin || "").trim();
    const trimmedNew = String(newPin || "").trim();
    const trimmedConfirm = String(confirmPin || "").trim();

    if (!/^\d{4}$/.test(trimmedNew)) {
      throw new Error("New PIN must contain exactly 4 digits.");
    }

    if (trimmedNew !== trimmedConfirm) {
      throw new Error("New PIN and confirmation PIN do not match.");
    }

    // Verify current PIN if set
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      throw new Error("User account not found.");
    }

    if (dbUser.pinHash) {
      const isCurrentValid = await verifyPassword({
        hash: dbUser.pinHash,
        password: trimmedCurrent,
      });

      if (!isCurrentValid) {
        throw new Error("Current PIN is incorrect.");
      }
    }

    // Hash and update new PIN
    const newPinHash = await hashPassword(trimmedNew);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        pinHash: newPinHash,
        username: dbUser.username || "Principal",
      },
    });

    revalidatePath("/settings");
    return {
      success: true,
      message: "PIN updated successfully.",
    };
  }, "Failed to update PIN. Please check your current PIN and try again.");
}
