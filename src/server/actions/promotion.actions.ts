"use server";

import { revalidatePath } from "next/cache";
import { executeBulkPromotion, getPromotionPreview, undoPromotion } from "@/server/services/promotion.service";
import type { ExecutePromotionInput, GetPromotionPreviewInput, UndoPromotionInput } from "@/server/validators/promotion.validator";

export async function getPromotionPreviewAction(input: GetPromotionPreviewInput) {
  try {
    const result = await getPromotionPreview(input);
    return { success: true, data: result, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to get promotion preview",
    };
  }
}

export async function executeBulkPromotionAction(input: ExecutePromotionInput) {
  try {
    const result = await executeBulkPromotion(input);
    revalidatePath("/promotion");
    revalidatePath("/students");
    revalidatePath("/academics");
    return { success: true, data: JSON.parse(JSON.stringify(result)), error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to execute promotion",
    };
  }
}

export async function undoPromotionAction(input: UndoPromotionInput) {
  try {
    const result = await undoPromotion(input);
    revalidatePath("/promotion");
    revalidatePath("/students");
    revalidatePath("/academics");
    return { success: true, data: result, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to undo promotion",
    };
  }
}
