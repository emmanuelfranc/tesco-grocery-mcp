import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { calculateIngredientPacks, prepareIngredientList } from "../src/ingredients.js";
import { registerIngredientTools } from "../src/tools/ingredients.js";

test("normalises and combines matching ingredients while retaining distinct forms and units", () => {
  const result = prepareIngredientList({
    idealBudget: 60,
    ingredients: [
      { name: " Chicken   breast ", quantity: 0.5, unit: "kg" },
      { name: "chicken breast", quantity: 100, unit: "g" },
      { name: "milk", quantity: 1, unit: "l" },
      { name: "Milk", quantity: 250, unit: "ml" },
      { name: "onion", quantity: 2, unit: "each" },
      { name: "Onion", quantity: 1, unit: "each" },
      { name: "onion", quantity: 100, unit: "g" },
      { name: "fresh basil", quantity: 10, unit: "g" },
      { name: "dried basil", quantity: 10, unit: "g" },
    ],
  });
  assert.deepEqual(result.ingredients, [
    { name: "Chicken breast", quantity: 600, unit: "g" },
    { name: "milk", quantity: 1250, unit: "ml" },
    { name: "onion", quantity: 3, unit: "each" },
    { name: "onion", quantity: 100, unit: "g" },
    { name: "fresh basil", quantity: 10, unit: "g" },
    { name: "dried basil", quantity: 10, unit: "g" },
  ]);
  assert.equal(result.clubcard, true);
  assert.deepEqual(result.budget, {
    idealBudget: 60, currency: "GBP", scope: "whole_basket", includesDelivery: false, isTarget: true,
  });
});

test("rejects invalid budgets, ingredients, quantities, and unsupported units", () => {
  const valid = { idealBudget: 60, ingredients: [{ name: "rice", quantity: 500, unit: "g" as const }] };
  for (const budget of [0, -1, Infinity, NaN]) {
    assert.throws(() => prepareIngredientList({ ...valid, idealBudget: budget }));
  }
  for (const quantity of [0, -1, Infinity, NaN]) {
    assert.throws(() => prepareIngredientList({ ...valid, ingredients: [{ ...valid.ingredients[0], quantity }] }));
  }
  assert.throws(() => prepareIngredientList({ ...valid, ingredients: [] }));
  assert.throws(() => prepareIngredientList({ ...valid, ingredients: [{ name: " ", quantity: 1, unit: "g" }] }));
  assert.throws(() => prepareIngredientList({ ...valid, ingredients: [{ name: "onion", quantity: 0.5, unit: "each" }] }));
  for (const ingredient of [{ name: "rice", quantity: 1, unit: "cup" }, { name: "rice", unit: "g" }]) {
    assert.throws(() => prepareIngredientList({ ...valid, ingredients: [ingredient] } as never));
  }
});

test("calculates whole packs across compatible units and count multipacks", () => {
  assert.deepEqual(calculateIngredientPacks({ quantity: 600, unit: "g" }, { quantity: 0.4, unit: "kg" }), {
    resolved: true, packs: 2, purchasedQuantity: 800, unit: "g",
  });
  assert.equal(calculateIngredientPacks({ quantity: 1, unit: "l" }, { quantity: 500, unit: "ml" }).packs, 2);
  assert.equal(calculateIngredientPacks({ quantity: 7, unit: "each" }, { quantity: 6, unit: "each" }).packs, 2);
  assert.equal(calculateIngredientPacks({ quantity: 100, unit: "g" }, { quantity: 500, unit: "g" }).packs, 1);
});

test("decimal totals and pack boundaries do not cause an unnecessary extra pack", () => {
  const result = prepareIngredientList({ idealBudget: 60, ingredients: [
    { name: "spice", quantity: 0.1, unit: "g" },
    { name: "spice", quantity: 0.2, unit: "g" },
  ] });
  assert.equal(result.ingredients[0].quantity, 0.3);
  assert.equal(calculateIngredientPacks(result.ingredients[0], { quantity: 0.3, unit: "g" }).packs, 1);
  assert.equal(calculateIngredientPacks({ quantity: 0.07, unit: "kg" }, { quantity: 70, unit: "g" }).packs, 1);
  assert.equal(calculateIngredientPacks({ quantity: 0.300001, unit: "g" }, { quantity: 0.3, unit: "g" }).packs, 2);
});

test("reports unknown or incompatible pack sizes without guessing", () => {
  assert.deepEqual(calculateIngredientPacks({ quantity: 600, unit: "g" }), {
    resolved: false, reason: "UNKNOWN_PACK_SIZE",
  });
  assert.deepEqual(calculateIngredientPacks({ quantity: 600, unit: "g" }, { quantity: 2, unit: "each" }), {
    resolved: false, reason: "INCOMPATIBLE_UNITS",
  });
  assert.deepEqual(calculateIngredientPacks({ quantity: 600, unit: "g" }, { quantity: 1, unit: "l" }), {
    resolved: false, reason: "INCOMPATIBLE_UNITS",
  });
  assert.throws(() => calculateIngredientPacks({ quantity: 1, unit: "g" }, { quantity: 0, unit: "g" }));
  assert.throws(() => calculateIngredientPacks({ quantity: 1e20, unit: "g" }, { quantity: 1, unit: "g" }));
});

test("ingredient tools are discoverable and callable over MCP without Tesco credentials", async () => {
  const server = new McpServer({ name: "ingredient-test", version: "1.0.0" });
  registerIngredientTools(server);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), ["calculate_ingredient_packs", "prepare_ingredient_list"]);
    const result = await client.callTool({ name: "prepare_ingredient_list", arguments: {
      idealBudget: 45, ingredients: [{ name: "rice", quantity: 0.5, unit: "kg" }],
    } });
    assert.ok(!result.isError);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.deepEqual(JSON.parse(content[0].text).ingredients, [{ name: "rice", quantity: 500, unit: "g" }]);
    const unknown = await client.callTool({ name: "calculate_ingredient_packs", arguments: {
      required: { quantity: 600, unit: "g" },
    } });
    assert.ok(!unknown.isError);
    assert.equal(JSON.parse((unknown.content as Array<{ text: string }>)[0].text).reason, "UNKNOWN_PACK_SIZE");
    const packs = await client.callTool({ name: "calculate_ingredient_packs", arguments: {
      required: { quantity: 600, unit: "g" }, packSize: { quantity: 400, unit: "g" },
    } });
    assert.equal(JSON.parse((packs.content as Array<{ text: string }>)[0].text).packs, 2);
    const invalid = await client.callTool({ name: "prepare_ingredient_list", arguments: {
      idealBudget: 45, ingredients: [{ name: "rice", unit: "g" }],
    } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
