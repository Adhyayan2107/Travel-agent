# Agentic Travel Planning System — Enterprise Architecture Plan

> **Assignment #14 · Agentic AI · TypeScript · Enterprise Grade**  
> Version 1.0 — Token-optimised, low-latency, Qdrant-backed multi-agent system

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Pattern](#2-architecture-pattern)
3. [Tech Stack](#3-tech-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Agent Definitions](#5-agent-definitions)
6. [Tool Catalogue](#6-tool-catalogue)
7. [Qdrant Vector DB Design](#7-qdrant-vector-db-design)
8. [Token Optimisation Strategy](#8-token-optimisation-strategy)
9. [Latency Reduction Strategy](#9-latency-reduction-strategy)
10. [Data Flow — End to End](#10-data-flow--end-to-end)
11. [API Design](#11-api-design)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Observability & Evals](#13-observability--evals)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)
15. [Implementation Checklist](#15-implementation-checklist)

---

## 1. System Overview

The Travel Agent is a **multi-agent AI system** that takes a single natural-language travel brief and autonomously executes parallel search, assembles a conflict-free itinerary, and handles post-booking changes. The system is designed around one core principle borrowed from the token optimisation guide:

> _"The boundary is the bill."_  
> Every unnecessary byte that crosses the prompt boundary is wasted compute and latency. Fix the transport before blaming the model.

The three "expensive leaks" from the token guide map directly to travel:

| Guide Hotspot   | Travel Equivalent                                       | Fix                                           |
| --------------- | ------------------------------------------------------- | --------------------------------------------- |
| Repeated prefix | System prompt + tool schemas sent on every LLM call     | Prompt caching                                |
| Raw tool output | Raw Amadeus / Booking.com API JSON (50 KB per response) | API Response Compressor (RTK/LeanCTX pattern) |
| Growing history | Full conversation re-sent on every agent step           | Sliding session window + task state object    |

---

## 2. Architecture Pattern

### Pattern: Supervisor + Parallel Specialist Swarm

```
User Brief
    │
    ▼
┌─────────────────────┐
│   Orchestrator      │  ← Main brain. Routes tasks, holds plan state.
│   Agent             │    Uses claude-sonnet-4-6
└─────────────────────┘
    │       │       │       │       │
    ▼       ▼       ▼       ▼       ▼
[Intent] [Flight] [Hotel] [Activity] [Change]
[Parser] [Search] [Search] [Search]  [Manager]
Agent    Agent    Agent    Agent     Agent
Haiku    Haiku    Haiku    Haiku     claude-sonnet-4-6
    │       │       │       │       │
    └───────┴───────┴───────┘       │
                │                   │
                ▼                   ▼
        [Conflict Resolver]   [Re-search + Patch]
              Agent            claude-sonnet-4-6
                │
                ▼
        [Itinerary Assembler]
              Agent
              Haiku
                │
                ▼
        [Context Compression Layer]  ← Sits before every LLM call
                │
                ▼
            LLM (Model)
```

### Why This Pattern

- **Orchestrator** holds the global plan and delegates to specialists. It never does raw API calls itself.
- **Specialist agents** are cheap, focused, and run in parallel via `Promise.allSettled`.
- **Context Compression Layer** (LeanCTX pattern) intercepts all raw API responses and compresses them to compact signal before they touch the prompt boundary.
- **Model Routing**: intent parsing and log compression use Haiku. Architecture, conflict resolution, and multi-leg change impact use claude-sonnet-4-6.

---

## 3. Tech Stack

### Core

| Layer           | Technology                                   | Reason                                          |
| --------------- | -------------------------------------------- | ----------------------------------------------- |
| Runtime         | Node.js 22 LTS                               | Native `fetch`, top-level `await`, perf         |
| Language        | TypeScript 5.x strict mode                   | Type safety across the entire agent boundary    |
| Agent framework | Mastra.ai or custom runner                   | Lightweight, TS-native, MCP compatible          |
| LLM Primary     | Claude claude-sonnet-4-6                     | Best tool-use, prompt caching, 200K ctx         |
| LLM Fast        | Claude Haiku 4.5                             | Compression, classification, cheap summaries    |
| Vector DB       | Qdrant                                       | Rust-based, gRPC, payload filtering, clustering |
| Relational DB   | PostgreSQL 16 + Drizzle ORM                  | Bookings, users, itineraries, audit log         |
| Cache           | Redis 7 (ioredis)                            | Semantic query cache, session state, BullMQ     |
| Queue           | BullMQ (Redis-backed)                        | Parallel search jobs, retries, webhooks         |
| API             | Fastify 5 + tRPC                             | Type-safe end-to-end from agent to UI           |
| Frontend        | Next.js 15 App Router                        | SSR, streaming, real-time via SSE               |
| Embeddings      | Voyage AI travel-2 or text-embedding-3-small | Semantic hotel/activity search                  |
| Observability   | LangFuse                                     | Token accounting by category, latency           |
| Infra           | Docker + Helm + Kubernetes                   | Horizontal scaling of worker pool               |

### External Travel APIs

| API                     | Purpose                          | Raw Output Size |
| ----------------------- | -------------------------------- | --------------- |
| Amadeus Flight Search   | Real-time flight data            | 80–200 KB JSON  |
| Booking.com Partner API | Hotels + availability            | 50–150 KB JSON  |
| Google Places API       | Activities, restaurants          | 20–80 KB JSON   |
| Skyscanner API          | Flight price comparison          | 40–100 KB JSON  |
| OpenWeather API         | Weather forecast per destination | 5–10 KB JSON    |
| Mapbox Directions API   | Local transport routing          | 10–30 KB JSON   |

> All raw API output passes through the **API Response Compressor** before reaching any agent. This is the RTK/LeanCTX equivalent for the travel domain.

---

## 4. Monorepo Structure

```
travel-agent/
├── apps/
│   ├── api/                          # Fastify backend — tRPC routers, webhooks
│   │   ├── src/
│   │   │   ├── routers/              # tRPC: brief, itinerary, changes, bookings
│   │   │   ├── orchestrator/         # Main agent loop runner
│   │   │   ├── middleware/           # Auth, rate-limit, request-id
│   │   │   └── server.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── web/                          # Next.js 15 — traveller dashboard
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── brief/            # Brief intake form
│   │   │   │   ├── itinerary/[id]/   # Day-by-day timeline view
│   │   │   │   └── changes/          # Change request chat UI
│   │   │   └── api/                  # Route handlers, SSE stream
│   │   ├── components/
│   │   │   ├── timeline/             # Day timeline component
│   │   │   ├── map/                  # Mapbox itinerary map
│   │   │   ├── chat/                 # Change request chat
│   │   │   └── status/               # Booking status cards
│   │   └── package.json
│   │
│   └── worker/                       # BullMQ workers — parallel search jobs
│       ├── src/
│       │   ├── workers/
│       │   │   ├── flight-search.worker.ts
│       │   │   ├── hotel-search.worker.ts
│       │   │   ├── activity-search.worker.ts
│       │   │   └── change-replan.worker.ts
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── agents/                       # All agent definitions
│   │   ├── src/
│   │   │   ├── orchestrator/
│   │   │   │   ├── orchestrator.agent.ts
│   │   │   │   └── prompts/
│   │   │   │       ├── system.ts     # STABLE PREFIX — cached
│   │   │   │       └── task.ts       # Dynamic tail
│   │   │   ├── intent-parser/
│   │   │   │   ├── intent-parser.agent.ts
│   │   │   │   └── prompts/
│   │   │   ├── flight-search/
│   │   │   ├── hotel-search/
│   │   │   ├── activity-search/
│   │   │   ├── conflict-resolver/
│   │   │   ├── change-manager/
│   │   │   └── itinerary-assembler/
│   │   └── package.json
│   │
│   ├── tools/                        # Tool implementations (called by agents)
│   │   ├── src/
│   │   │   ├── flight/
│   │   │   │   ├── search-flights.tool.ts
│   │   │   │   ├── compare-flights.tool.ts
│   │   │   │   └── get-flight-details.tool.ts
│   │   │   ├── hotel/
│   │   │   │   ├── search-hotels.tool.ts
│   │   │   │   ├── check-availability.tool.ts
│   │   │   │   └── compare-hotels.tool.ts
│   │   │   ├── activity/
│   │   │   │   ├── search-activities.tool.ts
│   │   │   │   ├── search-restaurants.tool.ts
│   │   │   │   └── get-local-transport.tool.ts
│   │   │   ├── itinerary/
│   │   │   │   ├── assemble-itinerary.tool.ts
│   │   │   │   ├── detect-conflicts.tool.ts
│   │   │   │   ├── resolve-conflict.tool.ts
│   │   │   │   └── patch-segment.tool.ts
│   │   │   ├── booking/
│   │   │   │   ├── confirm-booking.tool.ts
│   │   │   │   └── get-booking-status.tool.ts
│   │   │   └── weather/
│   │   │       └── get-forecast.tool.ts
│   │   └── package.json
│   │
│   ├── context/                      # Context compression layer (LeanCTX pattern)
│   │   ├── src/
│   │   │   ├── compressors/
│   │   │   │   ├── flight-response.compressor.ts
│   │   │   │   ├── hotel-response.compressor.ts
│   │   │   │   ├── activity-response.compressor.ts
│   │   │   │   └── session-state.compressor.ts
│   │   │   ├── prefix-builder.ts     # Assembles stable cacheable prefix
│   │   │   ├── tail-builder.ts       # Assembles dynamic tail
│   │   │   ├── session-window.ts     # Sliding window memory manager
│   │   │   └── delta-tracker.ts      # Itinerary delta (only changed segments)
│   │   └── package.json
│   │
│   ├── qdrant/                       # Qdrant client + collection schemas
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── collections/
│   │   │   │   ├── hotels.collection.ts
│   │   │   │   ├── activities.collection.ts
│   │   │   │   ├── restaurants.collection.ts
│   │   │   │   ├── itinerary-templates.collection.ts
│   │   │   │   └── user-preferences.collection.ts
│   │   │   ├── search/
│   │   │   │   ├── hybrid-search.ts  # Dense + sparse (BM25) fusion
│   │   │   │   └── semantic-cache.ts # Query-level semantic caching
│   │   │   └── upsert/
│   │   │       └── batch-upsert.ts
│   │   └── package.json
│   │
│   ├── token-tracker/                # Token accounting by category
│   │   ├── src/
│   │   │   ├── tracker.ts            # Per-call token breakdown
│   │   │   ├── categories.ts         # prefix | tools | logs | files | history | user
│   │   │   ├── cache-reporter.ts     # Cache hit/miss/write rates
│   │   │   └── langfuse-exporter.ts  # Push to LangFuse dashboard
│   │   └── package.json
│   │
│   ├── cache/                        # Redis caching utilities
│   │   ├── src/
│   │   │   ├── redis.client.ts
│   │   │   ├── semantic-cache.ts     # Cosine-similar query cache
│   │   │   ├── api-response-cache.ts # Raw API TTL cache
│   │   │   └── session-store.ts      # Agent session state
│   │   └── package.json
│   │
│   ├── db/                           # PostgreSQL schema + migrations
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── users.ts
│   │   │   │   ├── itineraries.ts
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── segments.ts       # Flight/hotel/activity segments
│   │   │   │   ├── agent-sessions.ts # Raw conversation log
│   │   │   │   └── change-events.ts  # Audit of all changes
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   └── types/                        # Shared TS types
│       ├── src/
│       │   ├── brief.types.ts
│       │   ├── itinerary.types.ts
│       │   ├── segment.types.ts
│       │   ├── agent-state.types.ts
│       │   └── token.types.ts
│       └── package.json
│
├── infra/
│   ├── docker-compose.dev.yml        # Local: Postgres, Redis, Qdrant
│   ├── docker-compose.prod.yml
│   ├── helm/
│   │   ├── api/
│   │   ├── worker/
│   │   ├── qdrant/
│   │   └── redis/
│   └── scripts/
│       ├── seed-qdrant.ts            # Seed hotel/activity vectors
│       └── migrate.ts
│
├── evals/
│   ├── suites/
│   │   ├── constraint-extraction.eval.ts
│   │   ├── conflict-detection.eval.ts
│   │   ├── change-propagation.eval.ts
│   │   └── token-budget.eval.ts      # Assert token spend within budget
│   └── fixtures/
│       ├── sample-briefs.json
│       └── planted-conflicts.json
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 5. Agent Definitions

### 5.1 Orchestrator Agent

**Model**: claude-sonnet-4-6 (only used for judgment calls)  
**Responsibility**: Receives parsed intent, dispatches parallel searches, tracks plan state, routes conflict resolution and change management.

```typescript
// packages/agents/src/orchestrator/orchestrator.agent.ts

interface OrchestratorState {
  sessionId: string;
  goal: string; // "Book 3-night trip BLR→NRT, ₹2L budget"
  constraints: TravelConstraints;
  touchedSegments: string[]; // IDs of assembled segments
  failedAttempts: FailedAttempt[];
  activeConflicts: Conflict[];
  nextStep: OrchestratorStep;
  assembledItinerary: Itinerary | null;
}

// This is the ONLY thing sent to the model on every turn — not full history
const TASK_STATE_TEMPLATE = `
## Current State
Goal: {{goal}}
Constraints: {{constraintsSummary}}
Assembled: {{segmentCount}} segments
Conflicts: {{conflictCount}} detected
Next: {{nextStep}}
`;
```

**Prompt structure (follows stable prefix / dynamic tail split):**

```
[STABLE CACHED PREFIX]
  - System role and capabilities
  - Tool schemas (all 18 tools)
  - Travel domain conventions
  - Conflict resolution rules
  - Output format contracts

[DYNAMIC TAIL — sent fresh every turn]
  - Task state object (50–200 tokens max)
  - Current user request
  - Compressed search results (from compressor)
  - Active conflicts summary
```

### 5.2 Intent Parser Agent

**Model**: Haiku (cheap, deterministic extraction)  
**Responsibility**: Extract structured `TravelConstraints` from natural language brief.

```typescript
interface TravelConstraints {
  origin: string; // "BLR" (IATA or city)
  destination: string; // "Tokyo, Japan"
  departDate: string; // ISO 8601
  returnDate: string;
  travellers: {
    adults: number;
    children?: number;
    infants?: number;
  };
  budgetINR: {
    min?: number;
    max: number;
    currency: string;
  };
  accommodation: {
    type: "hotel" | "hostel" | "villa" | "any";
    starRating?: number;
    preferences: string[]; // ["pool", "city-center", "free-breakfast"]
  };
  flightPreferences: {
    class: "economy" | "business" | "first";
    maxStops?: number;
    preferredAirlines?: string[];
    earliestDeparture?: string;
    latestArrival?: string;
  };
  specialRequirements: string[]; // ["halal food", "wheelchair accessible"]
  interests: string[]; // ["temples", "food", "anime"]
}
```

### 5.3 Flight Search Agent

**Model**: Haiku (search + rank)  
**Parallelism**: Runs simultaneously with Hotel and Activity agents via BullMQ jobs.

```typescript
// Tool sequence per flight search job:
// 1. search_flights(origin, dest, date, constraints)
// 2. compare_flights(results) → ranked top-3
// 3. compress_flight_response(raw) → compact summary

interface CompressedFlightOption {
  id: string;
  airline: string;
  flightNo: string;
  depart: string; // "BLR 22:10"
  arrive: string; // "NRT 09:35+1"
  durationMins: number;
  stops: number;
  stopDetails?: string; // "1h layover ICN"
  priceINR: number;
  class: string;
  baggageKg: number;
  bookingToken: string; // Opaque token for booking
}

// Raw Amadeus response: ~120 KB
// After compression: ~800 bytes — 99.3% reduction
```

### 5.4 Hotel Search Agent

**Model**: Haiku + Qdrant semantic search  
**Responsibility**: Parallel hotel search + semantic similarity against user preferences.

```typescript
interface CompressedHotelOption {
  id: string;
  name: string;
  stars: number;
  locationScore: number; // 0–10
  distanceToCenter: string; // "1.2 km"
  checkIn: string; // ISO date
  checkOut: string;
  pricePerNightINR: number;
  totalPriceINR: number;
  amenities: string[]; // ["pool", "gym", "free-wifi"]
  rating: number; // 4.6
  reviewCount: number;
  qdrantScore?: number; // Semantic similarity score
  bookingToken: string;
}

// Raw Booking.com response: ~80 KB
// After compression: ~600 bytes — 99.3% reduction
```

### 5.5 Conflict Resolver Agent

**Model**: Haiku for detection, claude-sonnet-4-6 for resolution  
**Responsibility**: Detect timing conflicts in assembled itinerary. Resolve automatically. Explain all changes.

```typescript
interface Conflict {
  type: "timing" | "logistics" | "budget" | "capacity";
  severity: "critical" | "warning";
  description: string;
  affectedSegmentIds: string[];
  detectedAt: string;
}

interface ConflictResolution {
  conflictId: string;
  action:
    | "rebook"
    | "reorder"
    | "remove"
    | "adjust_time"
    | "suggest_alternative";
  explanation: string; // Human-readable, shown in UI
  updatedSegments: Segment[];
  deltaOnly: boolean; // true = send only diff, not full itinerary
}

// Planted conflict examples:
// - Hotel check-in at 14:00, flight lands at 17:30 → conflict
// - Activity ends 22:00, dinner reservation at 21:30 → overlap
// - Total budget ₹2L, assembled cost ₹2.4L → budget overrun
```

### 5.6 Change Manager Agent

**Model**: claude-sonnet-4-6  
**Responsibility**: When a flight is delayed, cancelled, or user changes date — identify ALL downstream effects and replan affected legs.

```typescript
interface ChangeEvent {
  type:
    | "delay"
    | "cancellation"
    | "date_change"
    | "budget_change"
    | "traveller_change";
  affectedSegmentId: string;
  newValue: unknown; // new flight time, new date, etc.
  detectedAt: string;
}

interface ChangeImpactAnalysis {
  directlyAffected: string[]; // Segment IDs that must change
  downstreamAffected: string[]; // Hotel check-in, activity, transport
  conflictsCreated: Conflict[];
  rerearchRequired: {
    flights: boolean;
    hotels: boolean;
    activities: boolean;
  };
  estimatedNewCostINR: number;
  explanation: string;
}
```

---

## 6. Tool Catalogue

All tools follow the schema: **typed input → compressed output**. No tool ever returns raw API JSON to an agent.

### 6.1 Flight Tools

```typescript
// Tool: search_flights
{
  name: "search_flights",
  description: "Search for available flights. Returns compressed top options only.",
  inputSchema: z.object({
    origin: z.string(),          // IATA code
    destination: z.string(),
    departDate: z.string(),      // YYYY-MM-DD
    returnDate: z.string().optional(),
    adults: z.number().min(1),
    cabinClass: z.enum(['economy', 'business', 'first']),
    maxResults: z.number().default(5),
    maxStops: z.number().optional(),
  }),
  // Output: CompressedFlightOption[] — never raw API JSON
}

// Tool: compare_flights
{
  name: "compare_flights",
  description: "Compare and rank flight options by score = 0.4*price + 0.3*duration + 0.2*stops + 0.1*airline_rating",
  inputSchema: z.object({
    options: z.array(CompressedFlightOptionSchema),
    constraints: TravelConstraintsSchema,
  }),
}

// Tool: get_flight_details
{
  name: "get_flight_details",
  description: "Get full details for a specific flight by booking token.",
  inputSchema: z.object({ bookingToken: z.string() }),
}
```

### 6.2 Hotel Tools

```typescript
// Tool: search_hotels
{
  name: "search_hotels",
  description: "Search hotels using Qdrant semantic search + Booking.com API. Returns compressed options.",
  inputSchema: z.object({
    destination: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    guests: z.number(),
    budgetPerNightINR: z.number().optional(),
    preferences: z.array(z.string()),  // ["pool", "city-center"]
    useSemanticSearch: z.boolean().default(true),
  }),
}

// Tool: check_availability
{
  name: "check_availability",
  description: "Confirm real-time availability and price for a specific hotel.",
  inputSchema: z.object({
    hotelId: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    guests: z.number(),
  }),
}
```

### 6.3 Itinerary Tools

```typescript
// Tool: assemble_itinerary
{
  name: "assemble_itinerary",
  description: "Assemble selected segments into day-by-day itinerary.",
  inputSchema: z.object({
    flightOptions: z.array(CompressedFlightOptionSchema),
    hotelOptions: z.array(CompressedHotelOptionSchema),
    activities: z.array(CompressedActivitySchema),
    constraints: TravelConstraintsSchema,
  }),
}

// Tool: detect_conflicts
{
  name: "detect_conflicts",
  description: "Run rule-based + LLM conflict detection on assembled itinerary. Deterministic rules run first.",
  inputSchema: z.object({
    itinerary: ItinerarySchema,
    constraints: TravelConstraintsSchema,
  }),
  // Note: Rule-based checks run locally before LLM is called
}

// Tool: patch_segment
{
  name: "patch_segment",
  description: "Update a single segment. Returns delta only — not the full itinerary.",
  inputSchema: z.object({
    itineraryId: z.string(),
    segmentId: z.string(),
    patch: SegmentPatchSchema,
  }),
}
```

### 6.4 Booking Tools

```typescript
// Tool: confirm_booking
{
  name: "confirm_booking",
  description: "HUMAN-IN-THE-LOOP: Creates a hold, then requests user confirmation before final booking.",
  inputSchema: z.object({
    itineraryId: z.string(),
    paymentToken: z.string(),
  }),
  requiresConfirmation: true,  // Never auto-executes
}
```

---

## 7. Qdrant Vector DB Design

### Collections

#### 7.1 `hotels` Collection

```typescript
// Collection config
{
  name: "hotels",
  vectorsConfig: {
    description: { size: 1536, distance: "Cosine" },  // voyage-travel-2
    location: { size: 128, distance: "Euclid" },       // geo embedding
  },
  sparseVectorsConfig: {
    amenities_bm25: {}  // For keyword matching on amenities
  }
}

// Payload schema (filterable metadata)
interface HotelPayload {
  hotelId: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  avgPriceINR: number;
  amenities: string[];
  distanceToCenter: number;
  rating: number;
  reviewCount: number;
  bookingComId: string;
  lastIndexed: string;
}

// Hybrid search query: dense semantic + BM25 + payload filters
const searchQuery = {
  vector: { name: "description", vector: queryEmbedding },
  sparseVector: { name: "amenities_bm25", vector: bm25Vector },
  filter: {
    must: [
      { key: "city", match: { value: destination } },
      { key: "avgPriceINR", range: { lte: maxBudget } },
      { key: "starRating", range: { gte: minStars } },
    ]
  },
  limit: 20,
  withPayload: true,
}
```

#### 7.2 `activities` Collection

```typescript
{
  name: "activities",
  vectorsConfig: {
    description: { size: 1536, distance: "Cosine" },
  },
  // Payload: category, duration_hours, price_inr, city, rating, opening_hours
}
```

#### 7.3 `itinerary_templates` Collection

```typescript
// Store successful past itineraries as templates
// When a similar brief comes in, retrieve the template and use as starting point
// Massive latency win — skip full cold search
{
  name: "itinerary_templates",
  vectorsConfig: {
    brief_embedding: { size: 1536, distance: "Cosine" },
  },
  // Payload: origin, destination, duration_days, budget_range, traveller_count, success_rating
}
```

#### 7.4 `semantic_query_cache` Collection

```typescript
// Store query embeddings + compressed result
// If new query embedding is within cosine distance 0.03 → return cached result
// Avoids LLM call entirely for near-identical queries
{
  name: "semantic_query_cache",
  vectorsConfig: {
    query: { size: 1536, distance: "Cosine" },
  },
  // Payload: compressed_result (JSON string), ttl_expires_at
}
```

### Qdrant Client Setup

```typescript
// packages/qdrant/src/client.ts
import { QdrantClient } from "@qdrant/js-client-rest";

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  // Use gRPC for batch upserts (3x faster than REST)
  port: 6334,
});

// Hybrid search with Reciprocal Rank Fusion
export async function hybridHotelSearch(
  query: string,
  filters: HotelFilters,
  limit = 10,
): Promise<CompressedHotelOption[]> {
  const [denseVec, sparseVec] = await Promise.all([
    embed(query),
    toBM25Vector(query),
  ]);

  const results = await qdrant.query("hotels", {
    prefetch: [
      { query: denseVec, using: "description", limit: 30 },
      { query: sparseVec, using: "amenities_bm25", limit: 30 },
    ],
    query: { fusion: "rrf" }, // Reciprocal Rank Fusion
    filter: buildFilter(filters),
    limit,
    withPayload: true,
  });

  return results.points.map(compressHotelPayload);
}
```

---

## 8. Token Optimisation Strategy

This section directly applies the five-layer stack from the Token Economics guide to the travel domain.

### Layer 0: Measure First

Before any optimisation, instrument every agent call:

```typescript
// packages/token-tracker/src/tracker.ts

interface TokenBreakdown {
  sessionId: string;
  agentName: string;
  taskType: "brief_parse" | "search" | "assembly" | "conflict" | "change";
  input: {
    prefix: number; // Stable cached system prompt + tool schemas
    tools: number; // Tool definitions in prompt
    compressedAPIs: number; // Flight/hotel/activity results (post-compression)
    sessionState: number; // Current task state object
    userRequest: number; // The user's actual message
    historyWindow: number; // Recent turns (sliding window only)
    total: number;
  };
  output: {
    reasoning: number;
    toolCalls: number;
    patches: number;
    total: number;
  };
  cache: {
    writes: number;
    reads: number; // Cache read = ~90% cheaper
    hitRate: number;
  };
  latencyMs: number;
  model: string;
}

// Track per task type — shows which layer needs pressure
// Brief parse → mostly prefix
// Parallel search → mostly compressed API output
// Long session → mostly history drag
```

### Layer 1: Prompt Caching — Stable Prefix

The stable prefix is assembled once per session and cached.

```typescript
// packages/context/src/prefix-builder.ts

// STABLE PREFIX — never changes mid-session, always cached
const STABLE_PREFIX_PARTS = [
  SYSTEM_ROLE, // ~500 tokens
  TOOL_SCHEMAS, // All 18 tools: ~2,000 tokens
  TRAVEL_CONVENTIONS, // Domain rules: ~800 tokens
  CONFLICT_RULES, // Timing conflict detection logic: ~600 tokens
  OUTPUT_CONTRACTS, // Response format expectations: ~400 tokens
];
// Total stable prefix: ~4,300 tokens
// After first call: ~90% cheaper on every subsequent call

// DO NOT put in the stable prefix:
// - Current date/time (moves to dynamic tail as: "Today: {{date}}")
// - User name or session ID
// - Live search results
// - Current itinerary state
```

### Layer 2: API Response Compression — The RTK Pattern for Travel

This is the most impactful layer. Raw API responses are 50–200 KB. The compressor reduces them to 500–2,000 bytes before they touch any prompt.

```typescript
// packages/context/src/compressors/flight-response.compressor.ts

export function compressFlightResponse(
  raw: AmadeusFlightResponse,
): CompressedFlightOption[] {
  return raw.data
    .slice(0, 5) // Top 5 only, never dump all 50 results
    .map((offer) => ({
      id: offer.id,
      airline: offer.validatingAirlineCodes[0],
      flightNo: offer.itineraries[0].segments[0].number,
      depart: `${offer.itineraries[0].segments[0].departure.iataCode} ${formatTime(offer.itineraries[0].segments[0].departure.at)}`,
      arrive: `${getLastSegment(offer).arrival.iataCode} ${formatTime(getLastSegment(offer).arrival.at)}`,
      durationMins: parseDuration(offer.itineraries[0].duration),
      stops: offer.itineraries[0].segments.length - 1,
      stopDetails: getStopSummary(offer),
      priceINR: Math.round(parseFloat(offer.price.grandTotal) * 84),
      class: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
      baggageKg: getCheckedBagKg(offer),
      bookingToken: offer.id, // Opaque reference for booking API
    }));
}

// Before: 120,000 bytes (Amadeus JSON)
// After:  800 bytes (5 CompressedFlightOption objects)
// Reduction: 99.3%
// Signal retained: airline, times, price, stops, baggage

// Hotel compressor: 80,000 → 600 bytes (99.3%)
// Activity compressor: 40,000 → 400 bytes (99.0%)
// Weather: 8,000 → 100 bytes (98.8%)
```

### Layer 3: Itinerary Deltas

Never re-send the full itinerary on every agent step. Use `patch_segment` to send only what changed.

```typescript
// packages/context/src/delta-tracker.ts

interface ItineraryDelta {
  itineraryId: string;
  changedSegments: SegmentPatch[]; // Only the modified parts
  removedSegmentIds: string[];
  addedSegments: Segment[];
  totalSegmentsUnchanged: number; // Just a count, not the full data
}

// Full itinerary: ~5,000 tokens (all days, all segments)
// Delta on a single segment change: ~150 tokens
// Reduction: 97%
```

### Layer 4: Session State — Sliding Window Memory

Long multi-turn change management sessions do not re-send full history.

```typescript
// packages/context/src/session-window.ts

interface SessionState {
  // What the orchestrator ALWAYS gets (50–200 tokens)
  goal: string;
  constraints: string; // Compressed summary of constraints
  segmentCount: number;
  totalCostINR: number;
  openConflicts: number;
  lastAction: string;
  nextStep: string;

  // What the orchestrator SOMETIMES gets (last 3 turns only)
  recentTurns: Turn[]; // Sliding window: last 3 only

  // What stays in Postgres (never sent to model unless explicitly fetched)
  rawHistory: ConversationTurn[];
}

// Compression of older turns (agora-code pattern):
// Turn 1–N-3 → compressed into goal/constraints/decisions above
// Turn N-2 to N → kept verbatim in recentTurns
// Everything in rawHistory → available if Change Manager needs to look back
```

### Layer 5: Model Routing — Cheapest Capable Path

```typescript
// packages/agents/src/orchestrator/router.ts

const ROUTING_RULES: RoutingRule[] = [
  {
    task: "intent_parsing",
    model: "claude-haiku-4-5", // Deterministic extraction, cheap
    rationale: "JSON extraction, no reasoning required",
  },
  {
    task: "api_response_compression",
    model: "claude-haiku-4-5", // Summarisation, cheap
    rationale: "Template-based compression, high throughput",
  },
  {
    task: "flight_ranking",
    model: "claude-haiku-4-5", // Scoring formula, cheap
    rationale: "Mathematical ranking, deterministic",
  },
  {
    task: "hotel_ranking",
    model: "qdrant_semantic_search", // No LLM call at all
    rationale: "Vector similarity replaces LLM reasoning",
  },
  {
    task: "conflict_detection",
    model: "rule_based_first", // Rule engine before LLM
    rationale: "Timing conflicts are deterministic",
  },
  {
    task: "conflict_resolution",
    model: "claude-haiku-4-5", // Simple conflicts
    escalateTo: "claude-sonnet-4-6", // Complex multi-leg conflicts
    rationale: "Escalate only when cheap path fails",
  },
  {
    task: "change_impact_analysis",
    model: "claude-sonnet-4-6", // Multi-leg, high reasoning
    rationale: "Downstream cascade analysis needs full intelligence",
  },
  {
    task: "itinerary_assembly",
    model: "claude-haiku-4-5", // Template-based assembly
    rationale: "Structured assembly from compressed inputs",
  },
];

// Before routing: all calls go to claude-sonnet-4-6
// After routing:  80% of calls go to Haiku or local tools
// Cost reduction: ~75%
```

### Token Budget Targets Per Task Type

| Task                      | Before (est.)   | After Target   | Primary Lever              |
| ------------------------- | --------------- | -------------- | -------------------------- |
| Intent parsing            | 8,000 tokens    | 1,500 tokens   | Haiku + structured output  |
| Parallel search (per leg) | 60,000 tokens   | 2,500 tokens   | API compression + caching  |
| Conflict detection        | 20,000 tokens   | 800 tokens     | Rule-based first + delta   |
| Itinerary assembly        | 15,000 tokens   | 3,000 tokens   | Prefix cache + compression |
| Change management         | 40,000 tokens   | 5,000 tokens   | Sliding window + delta     |
| Total per booking         | ~143,000 tokens | ~13,300 tokens | **~91% reduction**         |

---

## 9. Latency Reduction Strategy

### 9.1 Parallel Search Execution

The single biggest latency win. Never search flights, hotels, and activities sequentially.

```typescript
// apps/worker/src/workers/parallel-search.ts

async function executeParallelSearch(
  constraints: TravelConstraints,
  sessionId: string,
): Promise<SearchResults> {
  // Check semantic query cache first (Qdrant)
  const cached = await semanticQueryCache.get(constraints);
  if (cached) {
    metrics.cacheHit("parallel_search");
    return cached; // Skip all API calls entirely
  }

  // Speculative: start Qdrant semantic search while API calls are in flight
  const [flightResults, hotelResults, activityResults, weatherResult] =
    await Promise.allSettled([
      // API calls (external, slow)
      flightSearchTool.execute(constraints),
      hotelSearchTool.execute(constraints), // Also hits Qdrant in parallel
      activitySearchTool.execute(constraints),
      weatherTool.execute(constraints),
    ]);

  // API calls: serial = 12–18 seconds total
  // Parallel: max(individualCalls) = 4–6 seconds (3x faster)

  const results = gatherResults(
    flightResults,
    hotelResults,
    activityResults,
    weatherResult,
  );

  // Store in semantic cache (TTL: 4 hours)
  await semanticQueryCache.set(constraints, results);

  return results;
}
```

### 9.2 Streaming Responses to UI

Never wait for full itinerary before showing anything. Stream segments as they are assembled.

```typescript
// apps/api/src/routers/itinerary.router.ts

// Server-Sent Events: push each assembled day as it completes
itineraryRouter.get("/stream/:sessionId", async (req, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const agent = orchestratorAgent.getSession(req.params.sessionId);

  // Push events as orchestrator completes each day
  agent.on("dayAssembled", (day: ItineraryDay) => {
    reply.raw.write(
      `data: ${JSON.stringify({ type: "day", payload: day })}\n\n`,
    );
  });

  agent.on("conflictDetected", (conflict: Conflict) => {
    reply.raw.write(
      `data: ${JSON.stringify({ type: "conflict", payload: conflict })}\n\n`,
    );
  });

  agent.on("conflictResolved", (resolution: ConflictResolution) => {
    reply.raw.write(
      `data: ${JSON.stringify({ type: "resolution", payload: resolution })}\n\n`,
    );
  });

  agent.on("complete", () => {
    reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    reply.raw.end();
  });
});
```

### 9.3 Itinerary Template Fast-Path

If a similar brief exists in Qdrant's `itinerary_templates` collection, start from the template and patch rather than cold-searching.

```typescript
async function checkTemplateFastPath(
  constraints: TravelConstraints,
): Promise<Itinerary | null> {
  const briefEmbedding = await embed(constraintsToString(constraints));

  const similar = await qdrant.search("itinerary_templates", {
    vector: briefEmbedding,
    filter: {
      must: [
        { key: "origin", match: { value: constraints.origin } },
        { key: "destination", match: { value: constraints.destination } },
        {
          key: "duration_days",
          range: { gte: tripDays - 1, lte: tripDays + 1 },
        },
      ],
    },
    scoreThreshold: 0.92, // Only use template if very similar
    limit: 1,
  });

  if (similar.length > 0) {
    metrics.templateHit();
    // Re-validate prices, update dates, return to assembler
    return await patchTemplate(
      similar[0].payload as ItineraryTemplate,
      constraints,
    );
  }

  return null; // Fall through to cold search
}

// Template hit: ~1–2 seconds total
// Cold search: ~4–6 seconds
// Win when hit rate > 20%: significant overall latency reduction
```

### 9.4 Redis Semantic Cache

```typescript
// packages/cache/src/semantic-cache.ts

// Cache at multiple levels:
// L1: Exact Redis key cache (API responses, TTL 4hr)
// L2: Qdrant semantic cache (similar queries, cosine distance < 0.03)
// L3: Itinerary template cache (similar briefs, score > 0.92)

// L1: For identical queries (same origin, destination, dates, budget)
const cacheKey = sha256(JSON.stringify(normalise(constraints)));
const cached = await redis.get(`search:${cacheKey}`);

// L2: For similar queries ("Tokyo 5 nights under ₹2L" vs "Tokyo 4 nights under ₹2.2L")
const semanticCached = await qdrant.search("semantic_query_cache", {
  vector: queryEmbedding,
  scoreThreshold: 0.97,
  limit: 1,
});
```

### 9.5 Latency Budget Targets

| Operation                  | Current Baseline   | Target      | Method                                       |
| -------------------------- | ------------------ | ----------- | -------------------------------------------- |
| Intent parsing             | 2–3 sec            | 0.8 sec     | Haiku + structured output                    |
| Parallel search (all legs) | 12–18 sec (serial) | 4–6 sec     | Promise.allSettled                           |
| Semantic cache hit         | —                  | 0.1–0.3 sec | Qdrant query                                 |
| Template fast-path         | —                  | 1–2 sec     | Qdrant + patch                               |
| Conflict detection         | 3–5 sec            | 0.5 sec     | Rule-based first                             |
| Conflict resolution        | 5–8 sec            | 2–3 sec     | Haiku (simple) / claude-sonnet-4-6 (complex) |
| Change impact analysis     | 6–10 sec           | 3–4 sec     | Session state + delta                        |
| First segment streamed     | —                  | <2 sec      | SSE streaming                                |
| Full itinerary ready       | 30–45 sec          | 8–12 sec    | All levers combined                          |

---

## 10. Data Flow — End to End

### 10.1 Happy Path: New Booking

```
User submits brief
    │
    ▼ (< 0.5s)
[Check Qdrant template fast-path]
    │ Miss                Hit (rare, < 2s total)
    ▼                      ▼
[Intent Parser Agent]   [Patch template]
  Haiku, ~0.8s              │
    │                       │
    ▼                       │
[TravelConstraints]         │
    │                       │
    ▼ (parallel, 4–6s)      │
┌───────────────────────────┐
│ Flight Worker (BullMQ)    │ → Amadeus → Compress (99%) → CompressedFlights
│ Hotel Worker (BullMQ)     │ → Booking.com + Qdrant → Compress (99%) → CompressedHotels
│ Activity Worker (BullMQ)  │ → Google Places + Qdrant → Compress (99%) → CompressedActivities
│ Weather Worker (BullMQ)   │ → OpenWeather → Compress (98%) → WeatherSummary
└───────────────────────────┘
    │
    ▼ (< 1s)
[Itinerary Assembler Agent]
  Haiku, compressed inputs
    │
    ▼ (< 0.5s — rule-based first)
[Conflict Detector]
  Timing rules → budget check → LLM only if needed
    │
    ▼ (only if conflicts exist)
[Conflict Resolver Agent]
  Haiku or claude-sonnet-4-6 depending on complexity
    │
    ▼
[Assembled Itinerary]
  Streamed to UI via SSE as each day completes
    │
    ▼
[Store in Postgres + index template in Qdrant]
    │
    ▼
[User confirms → Booking confirmed]
```

### 10.2 Change Management Flow

```
Flight delay notification / user date change
    │
    ▼
[Change Manager Agent] — claude-sonnet-4-6
  Input: task state object (NOT full history)
        + change event
        + delta of affected segments only
    │
    ▼
[ChangeImpactAnalysis]
  Direct: [flight] affected
  Downstream: [hotel check-in], [day 1 activity], [airport transfer]
    │
    ▼ (parallel where possible)
[Re-search affected legs]
  Reuses existing compressors — same 99% compression
    │
    ▼
[Conflict detection on new arrangement]
    │
    ▼
[Patch itinerary] — delta only, not full reassembly
    │
    ▼
[Streamed diff to UI]
    │
    ▼
[User confirms revised plan]
```

---

## 11. API Design

### tRPC Router Structure

```typescript
// apps/api/src/routers/index.ts
export const appRouter = router({
  brief: briefRouter, // POST /brief.submit, GET /brief.parse
  itinerary: itineraryRouter, // GET /itinerary.get, GET /itinerary.stream
  changes: changesRouter, // POST /changes.request, GET /changes.impact
  bookings: bookingsRouter, // POST /bookings.confirm, GET /bookings.status
  sessions: sessionsRouter, // POST /sessions.create, GET /sessions.state
});

// Key routes:
// POST /brief.submit → { sessionId } — starts async orchestrator
// GET  /itinerary.stream/:sessionId → SSE stream of assembly events
// GET  /itinerary.get/:id → Full assembled itinerary
// POST /changes.request → { sessionId, changeRequest: string } → ChangeImpactAnalysis
// POST /bookings.confirm → { itineraryId } → BookingConfirmation
```

### Auth & Security

```typescript
// Middleware stack
app.register(fastifyCors);
app.register(fastifyHelmet);
app.register(fastifyRateLimit, {
  max: 10, // 10 requests per minute per IP (search is expensive)
  timeWindow: "1 minute",
});

// JWT auth on all routes
// PII scrubbing on all logs (traveller names, passport numbers, payment tokens)
// All booking tokens are opaque — never expose provider IDs to frontend
```

---

## 12. Frontend Architecture

### Dashboard Components

```
apps/web/
  app/(dashboard)/
    brief/
      page.tsx              # Multi-step brief intake form
        Step 1: Origin, destination, dates
        Step 2: Traveller count, budget
        Step 3: Accommodation + flight preferences
        Step 4: Interests and special requirements

    itinerary/[id]/
      page.tsx              # Main itinerary view
        <TimelineView />    # Day-by-day timeline (streamed in)
        <MapView />         # Mapbox with all stops pinned
        <BookingCards />    # Per-segment booking status
        <ConflictBanner />  # Real-time conflict alerts
        <CostSummary />     # Running total vs budget

    changes/
      page.tsx              # Change request UI
        <ChangeChat />      # Natural language change input
        <ImpactPreview />   # Before/after comparison
        <ConfirmChanges />  # Accept revised plan
```

### Real-time Updates

```typescript
// components/itinerary/StreamReceiver.tsx

export function StreamReceiver({ sessionId }: { sessionId: string }) {
  const { itinerary, conflicts, status } = useSSE(
    `/api/itinerary/stream/${sessionId}`,
    {
      onDay: (day) => appendDay(day),
      onConflict: (conflict) => showConflictBanner(conflict),
      onResolution: (res) => updateSegments(res.updatedSegments),
      onDone: () => setStatus("complete"),
    },
  );
}
```

---

## 13. Observability & Evals

### LangFuse Token Dashboard

Track the six categories from the token guide on every call:

```
Agent: OrchestratorAgent | Task: itinerary_assembly | Model: claude-haiku-4-5
─────────────────────────────────────────────────────────────────────────────
INPUT TOKENS
  ├─ Prefix (cached):    4,280  [cache read - 90% cheaper]
  ├─ Tool schemas:           0  [included in cached prefix]
  ├─ Compressed APIs:      650  [5 flights + 5 hotels + 5 activities]
  ├─ Session state:        180  [task state object]
  ├─ User request:          45
  └─ History window:       210  [last 3 turns only]
  TOTAL INPUT:           5,365

OUTPUT TOKENS
  ├─ Reasoning:            320
  ├─ Tool calls:           180
  └─ Itinerary patch:      240
  TOTAL OUTPUT:            740

CACHE: write=0, read=4280, miss=0, hit_rate=100%
LATENCY: 1.2s  |  COST: ₹0.08  |  SAVINGS VS UNCACHED: ₹0.73
```

### Eval Suite

```typescript
// evals/suites/constraint-extraction.eval.ts
// Test: Intent parser extracts all constraints from complex brief
briefs.forEach((brief) => {
  const result = await intentParserAgent.parse(brief.input);
  expect(result.origin).toBe(brief.expected.origin);
  expect(result.budgetINR.max).toBe(brief.expected.budget);
  // ... all constraints
});

// evals/suites/conflict-detection.eval.ts
// Test: Conflict resolver finds all planted conflicts
plantedConflicts.forEach((scenario) => {
  const conflicts = await conflictDetector.detect(scenario.itinerary);
  expect(conflicts.length).toBeGreaterThanOrEqual(
    scenario.expectedConflicts.length,
  );
  scenario.expectedConflicts.forEach((ec) => {
    expect(conflicts.some((c) => c.type === ec.type)).toBe(true);
  });
});

// evals/suites/token-budget.eval.ts
// Test: Token spend per task type stays within budget
tasks.forEach((task) => {
  const tokens = await runTaskWithTracking(task);
  expect(tokens.input.total).toBeLessThan(TOKEN_BUDGETS[task.type]);
});

// evals/suites/change-propagation.eval.ts
// Test: Cancel outbound flight → all downstream effects identified
const impact = await changeManager.analyse(flightCancellationEvent);
expect(impact.downstreamAffected).toContain("hotel_checkin_segment");
expect(impact.downstreamAffected).toContain("airport_transfer_segment");
expect(impact.rerearchRequired.flights).toBe(true);
```

---

## 14. Infrastructure & Deployment

### Docker Compose (Local Dev)

```yaml
# infra/docker-compose.dev.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: travel_agent
      POSTGRES_PASSWORD: dev

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333" # REST API
      - "6334:6334" # gRPC (for batch upserts)
    volumes:
      - qdrant_data:/qdrant/storage

  api:
    build: ./apps/api
    depends_on: [postgres, redis, qdrant]
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DATABASE_URL: postgresql://postgres:dev@postgres/travel_agent
      REDIS_URL: redis://redis:6379
      QDRANT_URL: http://qdrant:6333

  worker:
    build: ./apps/worker
    depends_on: [redis, qdrant]
    deploy:
      replicas: 4 # 4 parallel search workers
```

### Kubernetes Scaling

```yaml
# Worker HPA — scale based on BullMQ queue depth
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    name: travel-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: bullmq_waiting_jobs
        target:
          type: AverageValue
          averageValue: "5" # Scale up when > 5 jobs waiting per pod
```

---

## 15. Implementation Checklist

### Week 1 — Foundation

- [ ] Initialise pnpm workspace + Turbo monorepo
- [ ] Set up PostgreSQL schema + Drizzle migrations
- [ ] Set up Redis + BullMQ queue infrastructure
- [ ] Deploy Qdrant + create `hotels`, `activities`, `itinerary_templates`, `semantic_query_cache` collections
- [ ] Implement `token-tracker` package — **measure before any optimisation**
- [ ] Implement shared TypeScript types (`packages/types`)
- [ ] Wire LangFuse for token observability

### Week 2 — Context Compression Layer

- [ ] Implement `flight-response.compressor.ts`
- [ ] Implement `hotel-response.compressor.ts`
- [ ] Implement `activity-response.compressor.ts`
- [ ] Implement `session-window.ts` (sliding window + task state)
- [ ] Implement `delta-tracker.ts` (segment-level diffs)
- [ ] Implement `prefix-builder.ts` + `tail-builder.ts` (stable/dynamic split)
- [ ] Validate compression ratios in unit tests

### Week 3 — Agents & Tools

- [ ] Intent Parser Agent (Haiku)
- [ ] Flight Search Agent + `search_flights` / `compare_flights` tools
- [ ] Hotel Search Agent + Qdrant hybrid search integration
- [ ] Activity Search Agent + Qdrant semantic search
- [ ] `detect_conflicts` tool — rule-based engine first, LLM second
- [ ] Conflict Resolver Agent (Haiku → claude-sonnet-4-6 escalation)
- [ ] Itinerary Assembler Agent
- [ ] Orchestrator Agent with model routing rules

### Week 4 — Latency & Change Management

- [ ] BullMQ parallel search workers (`Promise.allSettled`)
- [ ] Qdrant semantic query cache (L2 cache)
- [ ] Itinerary template fast-path (L3 cache)
- [ ] Redis TTL cache for raw API responses (L1 cache)
- [ ] Change Manager Agent
- [ ] `patch_segment` tool with delta-only output
- [ ] SSE streaming endpoint for itinerary assembly

### Week 5 — API & Frontend

- [ ] Fastify server + tRPC routers (brief, itinerary, changes, bookings)
- [ ] JWT auth + rate limiting + PII scrubbing middleware
- [ ] Next.js dashboard — brief intake multi-step form
- [ ] Timeline view + Mapbox map (receives SSE stream)
- [ ] Change request chat UI + impact preview
- [ ] Booking confirmation flow (human-in-the-loop)

### Week 6 — Evals, Hardening & Deployment

- [ ] Constraint extraction eval suite
- [ ] Conflict detection eval suite (planted conflicts)
- [ ] Change propagation eval suite
- [ ] Token budget assertion evals
- [ ] Helm charts for API + Worker + Qdrant + Redis
- [ ] HPA for BullMQ worker scaling
- [ ] Load test: 50 concurrent booking sessions
- [ ] LangFuse dashboard configured with token breakdown alerts

---

## Appendix A: RTK Decision for Travel

The PDF recommends **RTK** as the first trial for shell/terminal output compression. In the travel domain, the direct analogue of "shell output noise" is raw external API JSON. RTK itself is a shell wrapper and does not apply here, but the **exact same principle** applies:

> _"Log-heavy commands often shrink by 89–99% because passing test noise, repeated warnings, and setup chatter are removed."_

The travel equivalent:

- Raw Amadeus JSON = test log noise
- Our `flightResponseCompressor` = RTK shell hook
- 99.3% reduction = same order of magnitude

Build the compressors in `packages/context/src/compressors/` first. They are the highest-ROI optimisation in the stack before any prompt tuning.

## Appendix B: Token Optimisation Priority Order

Following the guide's "boring leaks first" principle:

1. **API response compression** — largest absolute token count, 99% reduction (builds your RTK equivalent)
2. **Prompt caching** — stable prefix is ~4,300 tokens, up to 90% cheaper after first call
3. **Parallel search** — doesn't reduce tokens but reduces latency 3x
4. **Session sliding window** — critical for change management sessions (prevents history drag)
5. **Model routing** — 80% of calls go to Haiku, ~75% cost reduction
6. **Semantic query cache** — eliminates LLM calls entirely for repeated/similar queries
7. **Template fast-path** — reduces both tokens AND latency for common routes

> _"Token economics is a stack: measure, cache, compress, index, remember, and route. Different tools help at different layers."_  
> — Token Economics for Coding Agents

This plan maps every layer of that stack to the travel domain concretely.
