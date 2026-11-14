import { z } from "zod";
import { TescoError } from "./types.js";

export const quantitySchema = z.object({
  quantity: z.number().finite().positive(),
  unit: z.enum(["g", "kg", "ml", "l", "each"]),
}).superRefine((value, ctx) => {
  if (value.unit === "each" && !Number.isInteger(value.quantity)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Individual items require a whole quantity" });
  }
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unit: z.enum(["g", "kg", "ml", "l", "each"]),
}).superRefine((value, ctx) => {
  if (value.unit === "each" && !Number.isInteger(value.quantity)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Individual items require a whole quantity" });
  }
});

export const ingredientListShape = {
  idealBudget: z.number().finite().positive().describe("Ideal weekly grocery budget in GBP, excluding delivery"),
  ingredients: z.array(ingredientSchema).min(1).describe("Only the ingredients supplied by the user"),
};

export const ingredientListSchema = z.object(ingredientListShape);
export type IngredientQuantity = z.infer<typeof quantitySchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type IngredientList = z.infer<typeof ingredientListSchema>;
type BaseUnit = "g" | "ml" | "each";

// Decimal arithmetic avoids rounding a valid fractional measurement up by a pack.
function decimal(value: number): { coefficient: bigint; scale: number } {
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  const coefficient = BigInt(whole + fraction);
  return scale < 0
    ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 }
    : { coefficient, scale };
}

function toBase(value: IngredientQuantity) {
  const amount = decimal(value.quantity);
  const factor = value.unit === "kg" || value.unit === "l" ? 1000n : 1n;
  const unit: BaseUnit = value.unit === "kg" ? "g" : value.unit === "l" ? "ml" : value.unit;
  return { coefficient: amount.coefficient * factor, scale: amount.scale, unit };
}

function asNumber(coefficient: bigint, scale: number): number {
  const value = Number(`${coefficient}e-${scale}`);
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TescoError("INVALID_REQUEST", "Quantity exceeds the supported range");
  }
  return value;
}

export function prepareIngredientList(input: IngredientList) {
  const parsed = ingredientListSchema.parse(input);
  const totals = new Map<string, ReturnType<typeof toBase> & { name: string }>();
  for (const ingredient of parsed.ingredients) {
    const name = ingredient.name.replace(/\s+/g, " ");
    const amount = toBase(ingredient);
    // Keep different forms and measurement dimensions separate; no fuzzy matching.
    const key = JSON.stringify([name.toLowerCase(), amount.unit]);
    const existing = totals.get(key);
    if (existing) {
      const scale = Math.max(existing.scale, amount.scale);
      existing.coefficient = existing.coefficient * 10n ** BigInt(scale - existing.scale)
        + amount.coefficient * 10n ** BigInt(scale - amount.scale);
      existing.scale = scale;
    } else {
      totals.set(key, { ...amount, name });
    }
  }
  return {
    ingredients: [...totals.values()].map(({ name, coefficient, scale, unit }) => ({
      name, quantity: asNumber(coefficient, scale), unit,
    })),
    budget: { idealBudget: parsed.idealBudget, currency: "GBP", scope: "whole_basket", includesDelivery: false, isTarget: true },
    clubcard: true,
  };
}

export function calculateIngredientPacks(requiredInput: IngredientQuantity, packInput?: IngredientQuantity) {
  const required = toBase(quantitySchema.parse(requiredInput));
  if (!packInput) return { resolved: false as const, reason: "UNKNOWN_PACK_SIZE" as const };
  const pack = toBase(quantitySchema.parse(packInput));
  if (required.unit !== pack.unit) {
    return { resolved: false as const, reason: "INCOMPATIBLE_UNITS" as const };
  }
  const scale = Math.max(required.scale, pack.scale);
  const needed = required.coefficient * 10n ** BigInt(scale - required.scale);
  const size = pack.coefficient * 10n ** BigInt(scale - pack.scale);
  const packs = (needed + size - 1n) / size;
  return {
    resolved: true as const,
    packs: asNumber(packs, 0),
    purchasedQuantity: asNumber(packs * size, scale),
    unit: required.unit,
  };
}
