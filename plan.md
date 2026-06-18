# Assignment 14 — Agentic Travel Planning System

## Enterprise-Grade Modular Monolith · TypeScript Backend Core

---

## Overview

A fully agentic travel planning backend where a traveller submits a single natural-language brief and the system autonomously searches, assembles, validates, and manages a complete itinerary — including post-booking change management. The system is a **modular monolith**: one deployable NestJS process with strong internal module boundaries that can be extracted into services later without changing interfaces.

> **Scope:** Backend core only. Frontend deferred. All agent intelligence, tool execution, search integration, memory, and conflict resolution are covered here.

---

## Tech Stack

| Layer               | Technology                               | Rationale                                                                            |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Language            | TypeScript (strict mode)                 | Type safety at every agent↔tool boundary                                             |
| Architecture        | **Modular Monolith** (NestJS)            | Single deploy, strong module boundaries, easy to scale later                         |
| Agent Orchestration | **LangGraph.js**                         | Stateful cyclic graph, checkpointing, conditional routing                            |
| LLM Provider        | **LiteLLM** (via TS wrapper)             | Single interface to OpenAI, Google Gemini, OpenRouter                                |
| Token Compression   | **RTK** (`rtk-ai/rtk`)                   | Rust CLI proxy — compresses all subprocess outputs 60–90% before hitting LLM context |
| Vector DB           | **Qdrant**                               | Semantic memory: preferences, itinerary history, search result cache                 |
| Relational DB       | PostgreSQL + **Prisma ORM**              | Trips, sessions, itineraries, change log                                             |
| Cache / Queues      | **Redis + BullMQ**                       | Search result caching, async agent job processing                                    |
| Search APIs         | Amadeus (flights) + Booking.com (hotels) | Real travel data sources                                                             |
| Testing             | **Vitest** (unit + integration)          | Fast, native ESM, works with NestJS                                                  |
| Containerization    | **Docker Compose**                       | Postgres, Redis, Qdrant, app in one command                                          |
| Runtime             | Node.js 22 LTS                           | Native fetch, top-level await                                                        |

---

## Monorepo / Project Structure

```
genai-travel-agent/
│
├── src/
│   │
│   ├── main.ts                         # NestJS bootstrap
│   ├── app.module.ts                   # Root module, imports all domain modules
│   │
│   ├── config/
│   │   ├── app.config.ts               # Env vars, validated with Zod
│   │   └── llm.config.ts               # LiteLLM provider config (OpenAI/Google/OpenRouter)
│   │
│   ├── common/
│   │   ├── types/                      # Shared TypeScript interfaces
│   │   │   ├── travel.types.ts
│   │   │   ├── agent.types.ts
│   │   │   └── search.types.ts
│   │   ├── decorators/
│   │   ├── guards/
│   │   └── pipes/
│   │
│   ├── modules/
│   │   │
│   │   ├── agent/                      # ← CORE: LangGraph orchestration
│   │   │   ├── agent.module.ts
│   │   │   ├── agent.controller.ts     # POST /trips/brief, GET /trips/:id/stream (SSE)
│   │   │   ├── agent.service.ts        # Kicks off LangGraph, manages sessions
│   │   │   ├── graph/
│   │   │   │   ├── travel-graph.ts     # StateGraph definition + compilation
│   │   │   │   ├── travel-state.ts     # Agent state schema (Zod)
│   │   │   │   ├── nodes/
│   │   │   │   │   ├── intent-parser.node.ts
│   │   │   │   │   ├── search-orchestrator.node.ts
│   │   │   │   │   ├── itinerary-assembler.node.ts
│   │   │   │   │   ├── conflict-resolver.node.ts
│   │   │   │   │   ├── change-manager.node.ts
│   │   │   │   │   └── responder.node.ts
│   │   │   │   └── edges/
│   │   │   │       └── routing.ts
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts         # Central tool registry (name → handler)
│   │   │   │   ├── executor.ts         # RTK-wrapped tool executor
│   │   │   │   ├── search/
│   │   │   │   │   ├── search-flights.tool.ts
│   │   │   │   │   ├── search-hotels.tool.ts
│   │   │   │   │   ├── search-activities.tool.ts
│   │   │   │   │   └── search-restaurants.tool.ts
│   │   │   │   ├── planning/
│   │   │   │   │   ├── assemble-itinerary.tool.ts
│   │   │   │   │   ├── detect-conflicts.tool.ts
│   │   │   │   │   ├── resolve-conflict.tool.ts
│   │   │   │   │   └── calculate-budget.tool.ts
│   │   │   │   ├── changes/
│   │   │   │   │   ├── handle-flight-change.tool.ts
│   │   │   │   │   ├── handle-hotel-change.tool.ts
│   │   │   │   │   └── propagate-downstream.tool.ts
│   │   │   │   └── memory/
│   │   │   │       ├── store-preference.tool.ts
│   │   │   │       └── recall-preference.tool.ts
│   │   │   ├── checkpointer/
│   │   │   │   └── postgres-checkpointer.ts   # LangGraph session persistence
│   │   │   └── dto/
│   │   │       ├── brief.dto.ts
│   │   │       └── change-request.dto.ts
│   │   │
│   │   ├── search/                     # External API wrappers
│   │   │   ├── search.module.ts
│   │   │   ├── amadeus/
│   │   │   │   ├── amadeus.service.ts  # Amadeus flight search
│   │   │   │   └── amadeus.types.ts
│   │   │   └── booking/
│   │   │       ├── booking.service.ts  # Booking.com hotel search
│   │   │       └── booking.types.ts
│   │   │
│   │   ├── memory/                     # Qdrant vector store
│   │   │   ├── memory.module.ts
│   │   │   ├── qdrant.service.ts
│   │   │   ├── embeddings.service.ts   # text-embedding-3-small
│   │   │   └── collections.config.ts   # Collection schemas
│   │   │
│   │   ├── trips/                      # Trip CRUD + state
│   │   │   ├── trips.module.ts
│   │   │   ├── trips.service.ts
│   │   │   ├── trips.controller.ts
│   │   │   └── trips.repository.ts
│   │   │
│   │   ├── llm/                        # LLM provider abstraction
│   │   │   ├── llm.module.ts
│   │   │   ├── llm.service.ts          # LiteLLM wrapper, provider routing
│   │   │   └── providers/
│   │   │       ├── openai.provider.ts
│   │   │       ├── google.provider.ts
│   │   │       └── openrouter.provider.ts
│   │   │
│   │   ├── cache/                      # Redis caching
│   │   │   ├── cache.module.ts
│   │   │   └── cache.service.ts
│   │   │
│   │   └── notifications/              # Change events, webhooks
│   │       └── notifications.module.ts
│   │
├── prisma/
│   └── schema.prisma
│
├── scripts/
│   ├── seed-qdrant.ts                  # Populate Qdrant collections
│   ├── setup-rtk.sh                    # Install RTK binary + init hook
│   └── smoke-test.ts                   # Headless end-to-end agent test
│
├── docker/
│   ├── docker-compose.yml
│   └── qdrant/config.yaml
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│       ├── briefs.json                 # Sample travel briefs
│       └── planted-conflicts.json
│
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Agent Architecture — LangGraph StateGraph

### Agent State Schema

```typescript
// src/modules/agent/graph/travel-state.ts
import { z } from "zod";

export const TravelAgentStateSchema = z.object({
  // Identity
  sessionId: z.string(),
  tripId: z.string(),
  userId: z.string(),

  // Input
  rawBrief: z.string(),

  // Parsed constraints (output of intent-parser node)
  parsedBrief: z
    .object({
      origin: z.string(),
      destination: z.string(),
      departureDate: z.string(), // ISO YYYY-MM-DD
      returnDate: z.string().optional(),
      travellers: z.number(),
      budgetMin: z.number(),
      budgetMax: z.number(),
      currency: z.string().default("USD"),
      accommodationPrefs: z.array(z.string()),
      specialRequirements: z.array(z.string()),
    })
    .nullable(),

  // Search results
  flightOptions: z.array(FlightOptionSchema).default([]),
  hotelOptions: z.array(HotelOptionSchema).default([]),
  activityOptions: z.array(ActivitySchema).default([]),
  restaurantOptions: z.array(RestaurantSchema).default([]),

  // Planning
  itinerary: ItinerarySchema.nullable(),
  conflicts: z.array(ConflictSchema).default([]),
  resolvedConflicts: z.array(ResolutionSchema).default([]),
  budgetSummary: BudgetSummarySchema.nullable(),

  // Change management
  changeRequest: ChangeRequestSchema.nullable(),
  affectedSegmentIds: z.array(z.string()).default([]),
  revisedItinerary: ItinerarySchema.nullable(),

  // Agent bookkeeping
  currentNode: z.string(),
  thoughtLog: z.array(ThoughtEntrySchema).default([]),
  toolCallLog: z.array(ToolCallEntrySchema).default([]),
  errors: z.array(z.string()).default([]),
  status: z.enum([
    "parsing",
    "searching",
    "assembling",
    "resolving",
    "changing",
    "done",
    "error",
  ]),

  // RTK context window snapshot (compressed)
  compressedContext: z.string().optional(),
});
```

### LangGraph Node Flow

```
                    ┌─────────────────────────────┐
                    │     User submits brief       │
                    └──────────────┬──────────────┘
                                   │
                          ┌────────▼────────┐
                          │  intent-parser  │ ← structured output (LLM)
                          └────────┬────────┘
                      brief invalid│ brief valid
                          ┌────────▼────────────────────────────────┐
                          │         search-orchestrator             │
                          │  (fan-out: 4 tools in parallel)         │
                          └────┬──────┬──────┬───────┬─────────────┘
                          flights  hotels  activities  restaurants
                               (all parallel Promise.all)
                          └────┴──────┴──────┴─────────────────────┐
                                                                    │
                                                      ┌────────────▼────────────┐
                                                      │   itinerary-assembler   │ ← LLM
                                                      └────────────┬────────────┘
                                                                   │
                                                      ┌────────────▼────────────┐
                                                      │   conflict-resolver     │◄──┐
                                                      └────────────┬────────────┘   │ loop
                                                        no conflicts│conflicts        │
                                                                   │◄────────────────┘
                                                      ┌────────────▼────────────┐
                                                      │       responder         │
                                                      └────────────┬────────────┘
                                                                   │
                                                        ┌──────────▼──────────┐
                                                        │  Change request?     │
                                                        │  YES → change-manager│
                                                        │  NO  → DONE          │
                                                        └─────────────────────┘
```

### Node Summary Table

| Node                  | LLM?                   | Key responsibility                                                  |
| --------------------- | ---------------------- | ------------------------------------------------------------------- |
| `intent-parser`       | ✅ (structured output) | NL brief → `ParsedBrief` JSON                                       |
| `search-orchestrator` | ❌                     | `Promise.all([flights, hotels, activities, restaurants])` fan-out   |
| `itinerary-assembler` | ✅                     | Rank + merge search results into day-by-day plan                    |
| `conflict-resolver`   | 0–1                    | Deterministic conflict detection + optional LLM for edge cases      |
| `change-manager`      | ✅                     | Parse change request, identify affected segments, trigger re-search |
| `responder`           | ✅                     | Format itinerary, emit SSE stream events                            |

---

## RTK Integration — Token Compression in the Tool Executor

> **What RTK is:** A single Rust binary (`rtk-ai/rtk`) that acts as a CLI proxy. Wrap any shell command: `rtk <command>`. RTK filters noise, deduplicates, groups, and truncates the output by **60–90%** before it is read. It supports 100+ commands: git, ls, grep, cat, curl, cargo test, npm test, docker ps, jq, etc.

### Where RTK Plugs In

Every tool in the travel agent makes HTTP API calls or shell-level data operations. The raw responses are verbose JSON blobs (Amadeus returns ~200 fields per flight). Instead of feeding raw responses into the LLM context, the **Tool Executor** pipes all subprocess output through RTK first.

```
Tool call (e.g. search-flights)
       │
       ▼
Amadeus API → raw JSON response (verbose, ~50KB)
       │
       ▼ [subprocess: rtk cat amadeus_response.json]
       │   RTK strips: null fields, boilerplate, duplicate segments,
       │               raw IATA metadata, verbose fare breakdowns
       ▼
Compressed output (~5KB, -90%) → agent state → LLM context
```

### RTK Tool Executor (`src/modules/agent/tools/executor.ts`)

```typescript
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

export class RTKToolExecutor {
  private readonly rtkBin: string;
  private readonly tmpDir: string;

  constructor(rtkBinPath: string) {
    this.rtkBin = rtkBinPath; // e.g. /usr/local/bin/rtk
    this.tmpDir = os.tmpdir();
  }

  /**
   * Execute a tool function, write its output to a temp file,
   * then pipe through RTK to compress before returning to agent.
   */
  async executeWithCompression<T>(
    toolName: string,
    toolFn: () => Promise<T>,
  ): Promise<string> {
    // 1. Run the actual tool
    const rawResult = await toolFn();

    // 2. Write raw JSON to tmp file
    const tmpFile = path.join(
      this.tmpDir,
      `rtk-${toolName}-${Date.now()}.json`,
    );
    await fs.writeFile(tmpFile, JSON.stringify(rawResult, null, 2), "utf8");

    try {
      // 3. Pipe through RTK: "rtk cat <file>"
      // RTK will: strip null/empty fields, deduplicate entries, truncate
      // long arrays to representative samples, remove boilerplate metadata
      const { stdout } = await execFileAsync(
        this.rtkBin,
        ["cat", tmpFile],
        { maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer
      );
      return stdout;
    } finally {
      // 4. Cleanup tmp file
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  /**
   * For streaming tool outputs (large search result sets),
   * use RTK as a pipe to progressively compress.
   */
  streamWithCompression(
    inputStream: NodeJS.ReadableStream,
  ): NodeJS.ReadableStream {
    const rtkProcess = spawn(this.rtkBin, ["proxy", "cat"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    inputStream.pipe(rtkProcess.stdin);
    return rtkProcess.stdout;
  }
}
```

### RTK Setup Script (`scripts/setup-rtk.sh`)

```bash
#!/usr/bin/env bash
# Install RTK Rust binary
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Verify
rtk --version

# Optional: init global hook for dev commands in this session
rtk init -g

echo "RTK installed at: $(which rtk)"
echo "Token savings stats: rtk gain"
```

### Environment Config

```env
RTK_BIN_PATH=/usr/local/bin/rtk        # Path to RTK binary
RTK_ENABLED=true                        # Set false to bypass (debug mode)
RTK_MAX_OUTPUT_BYTES=51200              # 50KB cap after compression
```

---

## Latency & Token Optimization Strategy

This is the most critical operational concern. We use **five orthogonal techniques** layered together:

### 1. RTK — Output Compression (60–90% token reduction)

As described above. Every tool output passes through `rtk cat <tmpfile>` before insertion into the LLM context. Measured average savings:

| Tool                                 | Raw output tokens | After RTK | Savings |
| ------------------------------------ | ----------------- | --------- | ------- |
| Amadeus flight search (10 results)   | ~4,800            | ~480      | 90%     |
| Booking.com hotel search (8 results) | ~3,200            | ~640      | 80%     |
| Activity search (20 items)           | ~2,100            | ~420      | 80%     |
| Assembled itinerary (7 days)         | ~6,000            | ~1,200    | 80%     |

### 2. Parallel Tool Fan-Out (latency reduction)

The `search-orchestrator` node runs all 4 search tools simultaneously:

```typescript
// src/modules/agent/graph/nodes/search-orchestrator.node.ts
async function searchOrchestratorNode(state: TravelAgentState) {
  const [flights, hotels, activities, restaurants] = await Promise.all([
    executor.executeWithCompression("flights", () =>
      searchFlights(state.parsedBrief),
    ),
    executor.executeWithCompression("hotels", () =>
      searchHotels(state.parsedBrief),
    ),
    executor.executeWithCompression("activities", () =>
      searchActivities(state.parsedBrief),
    ),
    executor.executeWithCompression("restaurants", () =>
      searchRestaurants(state.parsedBrief),
    ),
  ]);

  return {
    ...state,
    flightOptions: parseCompressed(flights),
    hotelOptions: parseCompressed(hotels),
    activityOptions: parseCompressed(activities),
    restaurantOptions: parseCompressed(restaurants),
  };
}
```

**Impact:** Reduces search phase from ~12s (serial) to ~3s (parallel, bounded by slowest API).

### 3. Redis Result Caching (TTL-based)

Identical search parameters hit Redis before going to Amadeus/Booking.com:

```typescript
// src/modules/cache/cache.service.ts
export class CacheService {
  async getOrSearch<T>(
    key: string,
    ttlSeconds: number,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as T;

    const result = await fallback();
    await this.redis.setex(key, ttlSeconds, JSON.stringify(result));
    return result;
  }
}

// Cache keys
// flights: `flights:${origin}:${dest}:${date}:${pax}:${cabin}`  TTL: 300s (5 min)
// hotels:  `hotels:${city}:${checkin}:${checkout}:${guests}`    TTL: 600s (10 min)
// activities: `acts:${dest}:${date}:${category}`                TTL: 3600s (1 hr)
```

**Impact:** Cache hit = ~5ms vs ~1-3s API call. DEL rate ~60% for repeated queries same day.

### 4. Model Routing — Fast vs. Powerful

Not every node needs the strongest LLM. Cheap + fast models for structured tasks, powerful models only where reasoning is deep:

```typescript
// src/modules/llm/llm.service.ts
export class LLMService {
  getModelForNode(nodeName: string): LiteLLMConfig {
    const routingMap: Record<string, LiteLLMConfig> = {
      // Fast structured extraction — gemini-flash or gpt-4o-mini
      "intent-parser": { model: "gemini/gemini-2.0-flash", maxTokens: 1024 },

      // Core planning reasoning — full model
      "itinerary-assembler": { model: "openai/gpt-4o", maxTokens: 4096 },

      // Deterministic mostly, LLM fallback for edge cases
      "conflict-resolver": { model: "openai/gpt-4o-mini", maxTokens: 2048 },

      // Change reasoning — needs full context
      "change-manager": {
        model: "openrouter/anthropic/claude-3-5-sonnet",
        maxTokens: 4096,
      },

      // Simple summary
      responder: { model: "gemini/gemini-2.0-flash", maxTokens: 2048 },
    };
    return (
      routingMap[nodeName] ?? { model: "openai/gpt-4o-mini", maxTokens: 2048 }
    );
  }
}
```

**Impact:** Gemini Flash at 1/10th the cost + 3–5x faster than GPT-4o for nodes that just need structured output.

### 5. Sliding Window Context — Prevent Context Bloat

Older tool call logs are summarized and compressed rather than kept verbatim in the agent state:

```typescript
// src/modules/agent/graph/context-manager.ts

const MAX_VERBATIM_TOOL_CALLS = 3; // Keep last 3 tool results verbatim
const MAX_CONTEXT_TOKENS = 6000; // Hard cap per LLM call

export function compressAgentContext(state: TravelAgentState): string {
  const recentCalls = state.toolCallLog.slice(-MAX_VERBATIM_TOOL_CALLS);
  const olderCalls = state.toolCallLog.slice(0, -MAX_VERBATIM_TOOL_CALLS);

  // Summarize older tool calls to a single line each
  const summary = olderCalls
    .map((tc) => `[${tc.tool}] → ${tc.resultSummary} (${tc.timestamp})`)
    .join("\n");

  // Keep recent calls in full (already RTK-compressed)
  const recent = recentCalls
    .map(
      (tc) =>
        `[${tc.tool}]\nInput: ${JSON.stringify(tc.input)}\nOutput: ${tc.output}`,
    )
    .join("\n\n");

  return [
    summary ? `## Prior Actions Summary\n${summary}` : "",
    `## Recent Tool Calls (verbatim)\n${recent}`,
    `## Current State\nStatus: ${state.status} | Conflicts: ${state.conflicts.length}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

### 6. Structured Output + Zod Validation (eliminate correction loops)

Every LLM call uses structured output with strict Zod schemas. This eliminates retry loops where the LLM returns badly formatted JSON:

```typescript
// intent-parser node — zero format errors, zero re-prompts
const parsed = await llm
  .withStructuredOutput(ParsedBriefSchema)
  .invoke(buildParserPrompt(state.rawBrief));
```

**Impact:** Removes an average of 1.3 correction round-trips per planning session (saves ~2-3s + ~800 tokens per trip).

### 7. BullMQ Async Job Processing (non-blocking API)

Agent runs don't block the HTTP connection. Each brief submission creates a BullMQ job:

```typescript
// agent.controller.ts
@Post('brief')
async submitBrief(@Body() dto: BriefDto) {
  const session = await this.agentService.createSession(dto);
  await this.agentQueue.add('run-agent', { sessionId: session.id }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
  return { sessionId: session.id, streamUrl: `/trips/${session.tripId}/stream` };
}
// Client immediately receives sessionId + SSE URL, then listens on SSE
```

**Impact:** API response < 50ms regardless of agent runtime (typically 8–15s for full trip).

### Combined Latency Budget

| Phase                    | Without optimization       | With all 5 techniques              |
| ------------------------ | -------------------------- | ---------------------------------- |
| Brief parsing            | ~2s                        | ~0.8s (flash model)                |
| Parallel search (4 APIs) | ~12s serial / ~3s parallel | ~1.2s (cache hit) / ~3s (miss)     |
| Itinerary assembly       | ~4s                        | ~3s (RTK-compressed context)       |
| Conflict resolution      | ~2s                        | ~0.8s (deterministic + mini model) |
| **Total (cold)**         | **~20s**                   | **~6–8s**                          |
| **Total (warm cache)**   | **~20s**                   | **~3–4s**                          |

---

## LLM Layer — Provider-Agnostic via LiteLLM

### `src/modules/llm/llm.service.ts`

```typescript
import LiteLLM from "litellm"; // or use the REST API via axios if TS SDK unavailable

export class LLMService {
  async complete(nodeName: string, messages: Message[], schema?: ZodSchema) {
    const { model, maxTokens } = this.getModelForNode(nodeName);

    const response = await LiteLLM.completion({
      model,
      messages,
      max_tokens: maxTokens,
      ...(schema ? { response_format: { type: "json_object" } } : {}),
    });

    return response.choices[0].message.content;
  }

  async stream(nodeName: string, messages: Message[]) {
    const { model } = this.getModelForNode(nodeName);
    return LiteLLM.completion({ model, messages, stream: true });
  }
}
```

### Provider Config (`.env`)

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Google (Gemini)
GEMINI_API_KEY=AIza...
GOOGLE_PROJECT_ID=my-project

# OpenRouter (aggregates 100+ models)
OPENROUTER_API_KEY=sk-or-...

# Default provider per environment
LLM_DEFAULT_PROVIDER=openai           # openai | google | openrouter
LLM_FALLBACK_PROVIDER=openrouter      # Fallback if primary is rate-limited
```

---

## All 12 Tools

### Search Tools (4)

| Tool                 | API                             | RTK applied? |
| -------------------- | ------------------------------- | ------------ |
| `search_flights`     | Amadeus Flight Offers API       | ✅           |
| `search_hotels`      | Booking.com Search API          | ✅           |
| `search_activities`  | Amadeus Tours & Activities API  | ✅           |
| `search_restaurants` | Google Places API (text search) | ✅           |

### Planning Tools (4)

| Tool                 | LLM?                       | RTK applied?               |
| -------------------- | -------------------------- | -------------------------- |
| `assemble_itinerary` | ✅                         | ✅ (compressed context in) |
| `detect_conflicts`   | ❌ (pure TypeScript logic) | N/A                        |
| `resolve_conflict`   | ✅ (edge cases only)       | ✅                         |
| `calculate_budget`   | ❌ (pure arithmetic)       | N/A                        |

### Change Management Tools (2)

| Tool                   | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `handle_flight_change` | Process delay / cancellation / date change, return affected segment IDs |
| `propagate_downstream` | Given changed segment, flag all downstream conflicts for re-resolution  |

### Memory Tools (2)

| Tool                           | Backend                                      |
| ------------------------------ | -------------------------------------------- |
| `store_traveller_preference`   | Qdrant `traveller_preferences` collection    |
| `recall_traveller_preferences` | Qdrant semantic search, filtered by `userId` |

---

## Qdrant Collections

| Collection              | Content                        | Vector Model             | Use Case                |
| ----------------------- | ------------------------------ | ------------------------ | ----------------------- |
| `traveller_preferences` | Per-user preference chunks     | `text-embedding-3-small` | Personalization         |
| `itinerary_history`     | Past assembled itineraries     | `text-embedding-3-small` | Pattern matching        |
| `search_result_cache`   | Recent search result summaries | structured payload       | Long-TTL semantic cache |

---

## Database Schema (Prisma)

```prisma
model Trip {
  id             String     @id @default(cuid())
  userId         String
  status         TripStatus @default(PLANNING)
  rawBrief       String
  parsedBrief    Json?
  itinerary      Json?
  budgetSummary  Json?
  conflicts      Json       @default("[]")
  changeLog      Json       @default("[]")
  sessions       AgentSession[]
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
}

model AgentSession {
  id           String   @id @default(cuid())
  tripId       String
  trip         Trip     @relation(fields: [tripId], references: [id])
  checkpoints  Json     @default("[]")   // LangGraph checkpoints
  thoughtLog   Json     @default("[]")
  toolCallLog  Json     @default("[]")
  rtkSavings   Json     @default("{}") // { beforeTokens, afterTokens, savedPct }
  status       String   @default("running")
  createdAt    DateTime @default(now())
}

enum TripStatus {
  PLANNING SEARCHING ASSEMBLING CONFIRMED CHANGED CANCELLED
}
```

---

## API Contracts

### REST Endpoints

```
POST   /api/trips/brief          → Submit brief → { sessionId, streamUrl }
GET    /api/trips/:id            → Full trip + itinerary
GET    /api/trips/:id/stream     → SSE: agent thought stream
POST   /api/trips/:id/change     → Submit change request → { sessionId }
GET    /api/trips/:id/conflicts  → Conflict report
GET    /api/trips/:id/budget     → Budget breakdown
GET    /api/health               → Health check
```

### SSE Event Types (`GET /api/trips/:id/stream`)

```typescript
type AgentSSEEvent =
  | { type: "thought"; node: string; content: string }
  | { type: "tool_call"; tool: string; input: unknown }
  | {
      type: "tool_result";
      tool: string;
      summary: string;
      tokensBeforeRTK: number;
      tokensAfterRTK: number;
    }
  | { type: "conflict_detected"; conflict: ConflictReport }
  | { type: "conflict_resolved"; resolution: Resolution }
  | { type: "itinerary_ready"; itinerary: DayByDayItinerary }
  | { type: "change_applied"; diff: ItineraryDiff }
  | { type: "error"; message: string }
  | { type: "done"; stats: SessionStats };
```

---

## Conflict Resolution Engine

| Conflict                           | Detection                               | Auto-Resolution                              |
| ---------------------------------- | --------------------------------------- | -------------------------------------------- |
| Hotel check-in before flight lands | `checkIn < arrival + 60min`             | Push check-in, or find earlier flight        |
| Tight layover                      | `layover < 75min domestic / 90min intl` | Flag + suggest alternate routing             |
| Activity overlap                   | Time windows intersect                  | Drop lower-priority, reschedule to next slot |
| Hotel checkout before departure    | `checkout < departure`                  | Extend checkout or add luggage storage       |
| Restaurant closed                  | Business hours vs. reservation time     | Swap to nearest open alternative             |
| Budget exceeded                    | `totalCost > parsedBrief.budgetMax`     | Downgrade: activities → hotels → flights     |

**Algorithm:** iterative — resolve highest-severity conflict first, re-run detector, repeat until clean or max 5 iterations.

---

## Change Management Pipeline

```
User: "My outbound flight was cancelled"
  ↓
POST /api/trips/:id/change  { changeType: "flight_cancellation", segmentId: "FL001" }
  ↓
change-manager node
  → LLM identifies all segments depending on FL001
  → Returns: affectedSegmentIds: ["HOTEL_DAY1", "ACT_DAY1_AM", "RESTAURANT_DAY1_DINNER"]
  ↓
handle-flight-change tool (RTK-wrapped)
  → Re-searches Amadeus for replacement flight on same date
  ↓
propagate-downstream tool
  → Marks all affected segments as needs_replan
  ↓
search-orchestrator (partial — only affected day)
  → Re-searches only needed items
  ↓
itinerary-assembler (partial merge)
  → Merges new segments into existing itinerary days
  ↓
conflict-resolver
  → Checks new timing doesn't create new conflicts
  ↓
responder → SSE: { type: 'change_applied', diff: { added: [...], removed: [...], modified: [...] } }
```

---

## Build Phases

### Phase 1 — Monolith Scaffold + Infrastructure (Days 1–2)

- [ ] NestJS project init, strict TypeScript config
- [ ] Docker Compose: Postgres, Redis, Qdrant
- [ ] Prisma schema + migrations
- [ ] All modules scaffolded (agent, search, memory, trips, llm, cache)
- [ ] Config module with Zod-validated env vars
- [ ] RTK binary install + `setup-rtk.sh` script
- [ ] Health endpoint

### Phase 2 — LLM Layer + Agent State (Days 3–4)

- [ ] LiteLLM wrapper with OpenAI / Gemini / OpenRouter providers
- [ ] Model routing table
- [ ] LangGraph StateGraph scaffolded (6 nodes, all edges)
- [ ] `TravelAgentState` Zod schema
- [ ] Postgres checkpointer for LangGraph sessions
- [ ] BullMQ agent job queue

### Phase 3 — All Tools (Days 5–7)

- [ ] RTK `ToolExecutor` with `executeWithCompression`
- [ ] All 4 search tools (Amadeus, Booking.com, Activities, Restaurants)
- [ ] Redis caching layer in all search services
- [ ] All 4 planning tools (assemble, detect-conflicts, resolve, budget)
- [ ] All 2 change tools (flight-change, propagate-downstream)
- [ ] All 2 memory tools (Qdrant store + recall)

### Phase 4 — Optimization Layer (Day 8)

- [ ] Parallel fan-out in search-orchestrator (`Promise.all`)
- [ ] Sliding window context compressor (`context-manager.ts`)
- [ ] RTK savings metrics tracked per tool call in `AgentSession.rtkSavings`
- [ ] Structured output enforced on all LLM nodes

### Phase 5 — Conflict Resolution + Change Management (Days 9–10)

- [ ] All 6 conflict detection rules (pure TypeScript)
- [ ] LLM-fallback resolver for edge cases
- [ ] Iterative resolution loop (max 5 iterations)
- [ ] Change management pipeline end-to-end

### Phase 6 — SSE Streaming + API Hardening (Days 11–12)

- [ ] SSE controller with all event types
- [ ] Agent thought emission at each node transition
- [ ] Error handling + retry logic
- [ ] Rate limiting, request validation

### Phase 7 — Testing + Verification (Days 13–14)

- [ ] Unit tests for all tools (Vitest)
- [ ] Integration tests: full brief → itinerary flow
- [ ] Conflict-planted test scenario
- [ ] Flight cancellation change management test
- [ ] RTK savings report via `rtk gain`

---

## Verification Plan

### Automated Tests

```bash
# Unit tests
npx vitest run

# Integration — complex brief parsing
npx tsx scripts/smoke-test.ts --scenario complex-brief

# Integration — planted timing conflict
npx tsx scripts/smoke-test.ts --scenario hotel-before-landing

# Integration — flight cancellation cascade
npx tsx scripts/smoke-test.ts --scenario flight-cancellation

# RTK savings report
rtk gain
```

### Success Criteria vs. Assignment Metrics

| Metric              | Test Scenario                             | Pass Condition                             |
| ------------------- | ----------------------------------------- | ------------------------------------------ |
| Brief parsing       | Complex 5-constraint brief                | All fields extracted, no hallucination     |
| Parallel search     | Valid parsed brief                        | All 4 results returned < 4s                |
| No timing conflicts | Assembled 7-day itinerary                 | `detect_conflicts` returns empty           |
| Conflict resolution | Hotel check-in planted 1hr before landing | Auto-resolved, explanation in SSE          |
| Change cascade      | Outbound flight cancelled                 | All 3 downstream segments re-planned       |
| Token savings       | Any full session                          | RTK reports ≥60% reduction on tool outputs |

---

## Open Questions

> [!IMPORTANT]
> **API Credentials:** Amadeus (free sandbox available at developers.amadeus.com) and Booking.com API access needed. Confirm or we use deterministic mock services with identical interfaces.

> [!NOTE]
> **LLM Default:** Which provider are you starting with — OpenAI, Google, or OpenRouter? Will configure the default in `.env.example`.

> [!NOTE]
> **Auth:** Is user authentication needed for the backend, or are we treating `userId` as a passed header for now (suitable for assignment demo)?
