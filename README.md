# tesco-grocery-mcp

An [MCP](https://modelcontextprotocol.io) server that wraps Tesco's grocery APIs, letting AI assistants like Claude search products, manage your basket, and book delivery slots.

## Tools

### Authentication

| Tool | Description |
|------|-------------|
| `set_auth_token` | Set bearer token and customer UUID from your browser session |

### Search & Browse

| Tool | Description |
|------|-------------|
| `search_products` | Search for grocery products (supports batched multi-query) |
| `get_product_details` | Get detailed info for a specific product |
| `get_offers` | Find products on promotion or Clubcard price |
| `get_substitutions` | Find alternatives for unavailable products |
| `browse_categories` | Get the department/aisle/shelf taxonomy tree |
| `get_favourites` | Get your favourite products |
| `get_order_history` | Get previous orders |

### Basket

| Tool | Description |
|------|-------------|
| `get_basket` | View current basket contents |
| `add_to_basket` | Add products or change quantities |
| `remove_from_basket` | Remove products from basket |

### Ingredient Preparation

| Tool | Description |
|------|-------------|
| `prepare_ingredient_list` | Validate and combine supplied ingredients with a weekly budget target |
| `calculate_ingredient_packs` | Calculate whole packs from a required quantity and confirmed pack size |

Paste your ingredient list and ideal weekly budget into your assistant. The
assistant converts the list into structured input for `prepare_ingredient_list`:

```json
{
  "idealBudget": 60,
  "ingredients": [
    { "name": "chicken breast", "quantity": 600, "unit": "g" },
    { "name": "onion", "quantity": 3, "unit": "each" }
  ]
}
```

Supported units are `g`, `kg`, `ml`, `l`, and `each`. Names are trimmed and
matching names (ignoring case and extra whitespace) with compatible units are
combined. Fresh/dried variants and weight/count measurements remain separate.
Quantities must be positive; `each` requires a whole number. Ask about missing
quantities or unsupported units rather than guessing. Pantry deductions should
be reflected in the list before submission.

Clubcard is always enabled for this personal workflow. The budget is a positive
GBP target for the **whole grocery basket**, including existing items and
excluding delivery charges. Preparation returns these settings; comparing the
priced basket against the target is a later shopping step.

For `calculate_ingredient_packs`, supply `required` and an optional `packSize`,
each containing `quantity` and `unit`. For example, 600 g required with a 400 g
pack returns two packs and 800 g purchased. Use the confirmed total quantity per
pack (including multipacks); unit price is not pack size. Unknown or incompatible
sizes return `resolved: false`. Existing basket quantities must be accounted for
by the shopping workflow before calculating additional packs.

These preparation tools do not contact Tesco, select products, or change your
basket. They do not persist lists between calls. Existing shopping tools remain
available separately.

### Delivery Slots

| Tool | Description |
|------|-------------|
| `get_delivery_slots` | View available delivery slots for a date range |
| `get_available_weeks` | See which weeks have delivery slots |
| `get_current_slot` | Check if you have a slot booked |
| `book_delivery_slot` | Book or unbook a delivery slot |

## Prerequisites

- Node.js >= 18
- A Tesco.com account with an active grocery session

## Installation

### Via npx (recommended)

No installation needed — just configure your MCP client (see below).

### Global install

```bash
npm install -g tesco-grocery-mcp
```

### From source

```bash
git clone https://github.com/GavinAttard/tesco-grocery-mcp.git
cd tesco-grocery-mcp
npm install
npm run build
```

To use changes from this checkout, configure your MCP client to run `node` with
the absolute path to `dist/src/index.js` in this repository. The `npx` examples
below run the published package, which may not include these changes.

Run the ingredient and MCP integration tests with `npm test`.

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tesco-grocery": {
      "command": "npx",
      "args": ["-y", "tesco-grocery-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add tesco-grocery -- npx -y tesco-grocery-mcp
```

### Other MCP clients

Run the server on stdio:

```bash
npx -y tesco-grocery-mcp
```

Or if installed globally:

```bash
tesco-grocery
```

## Authentication

The server requires a bearer token from an active Tesco.com session:

1. Log in to [tesco.com/groceries](https://www.tesco.com/groceries/) in your browser
2. Open DevTools (F12) → Network tab
3. Find any request to `xapi.tesco.com` and copy the `Authorization` header value and `x-customer-uuid` header value OR copy values from the oAUTH.ACCESSTOKEN and UUID cookies
4. Use the `set_auth_token` tool to provide these credentials

Credentials are persisted locally so you only need to do this when your session expires.

See [`.env.example`](.env.example) for the credential format.

## Shopping Skill

The [`skills/SKILL.md`](skills/SKILL.md) file contains an optimised execution guide that teaches AI assistants how to efficiently handle a full weekly grocery shop — from searching to basket management to delivery slot booking. You can use it as a system prompt or reference for your own workflows.

## License

[MIT](LICENSE)
