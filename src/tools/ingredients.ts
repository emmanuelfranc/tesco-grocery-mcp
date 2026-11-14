import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  calculateIngredientPacks, ingredientListShape, prepareIngredientList, quantitySchema,
} from "../ingredients.js";
import { toolErrorResponse } from "../types.js";

export function registerIngredientTools(server: McpServer): void {
  server.tool(
    "prepare_ingredient_list",
    "Validate and combine the user's ingredient list. Normalises kg/g and l/ml. Budget is a GBP target for the whole grocery basket, excluding delivery; Clubcard is always enabled. Does not search Tesco or change the basket. Ask the user about missing quantities or unsupported units before calling.",
    ingredientListShape,
    async (args) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(prepareIngredientList(args)) }] };
      } catch (error) {
        return toolErrorResponse(error);
      }
    },
  );

  server.tool(
    "calculate_ingredient_packs",
    "Calculate whole packs needed for an ingredient using a confirmed total pack size. Omit packSize if unknown; never infer weight from item count or use unit price as pack size. This calculation does not account for existing basket contents or change the basket.",
    {
      required: quantitySchema.describe("Required ingredient quantity"),
      packSize: quantitySchema.optional().describe("Confirmed total quantity in one purchasable pack"),
    },
    async (args) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(calculateIngredientPacks(args.required, args.packSize)) }] };
      } catch (error) {
        return toolErrorResponse(error);
      }
    },
  );
}
