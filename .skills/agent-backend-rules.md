# Travel Agent Backend — Agent Coding Guidelines & LLD/SOLID Principles

This document contains rules, design guidelines, and best practices for developing the agentic Travel Planning System backend. Every agent working on this project must strictly adhere to these practices.

---

## 1. Low-Level Design (LLD) & SOLID Principles

To ensure the backend is scalable, maintainable, and easy to extract into microservices later, we follow strict LLD and SOLID principles.

### Single Responsibility Principle (SRP)

- Each class, service, and controller must have exactly one reason to change.
- **Do not mix concerns**: The LLM Orchestrator should not query databases directly, make external API search calls, or check Redis cache. It should delegate these to specialized services.
- **Separation of controllers & services**: Controllers handle HTTP validation, request mapping, and streaming (SSE) serialization. Services handle orchestration and application logic. Repositories handle database operations.

### Open/Closed Principle (OCP)

- Code should be open for extension but closed for modification.
- **Search Providers**: Search providers (Amadeus, Booking.com, Google Places) must implement a common interface. Adding a new flight search engine should only require writing a new provider class that implements `IFlightSearchProvider`, without modifying the search orchestrator.
- **LLM Providers**: Adding support for a new model or LLM vendor must not require modifying the agent graphs. It should be handled by extending the `LLMService` provider factory.

### Liskov Substitution Principle (LSP)

- Subclasses or implementers of interfaces must be substitutable for their base types without altering correctness.
- Mock implementations of databases, caches, and search engines must behave identically to the production clients in tests.

### Interface Segregation Principle (ISP)

- Clients should not be forced to depend on methods they do not use.
- Create small, cohesive interfaces. For example, instead of a giant `SearchService` that searches everything, use separate `IFlightSearch`, `IHotelSearch`, and `IActivitySearch` interfaces.

### Dependency Inversion Principle (DIP)

- High-level modules must not depend on low-level modules. Both must depend on abstractions.
- **Repository Pattern**: Trips and Session services must depend on repository interfaces (e.g., `ITripsRepository`), not the concrete `PrismaService` or `DrizzleDb`.
- **Inversion of Control (IoC)**: Inject all dependencies via constructor parameters. Never use `new` inside a service to instantiate database clients, search providers, or LLMs.

---

## 2. LLM Token Optimization & Latency Guidelines

Token usage is our major operational cost and latency driver. Every LLM interaction must be optimized at multiple layers:

### Layer 1: Prompt Caching (Stable Prefix / Dynamic Tail)

- Separate system instructions and tool definitions (stable) from session states and query contexts (dynamic).
- Structure prompts so the system instructions and tool definitions appear at the beginning of the prompt window. Do not interpolate session-specific IDs, current time, or user details inside the cached prefix.

### Layer 2: API Response Compression

- **Never feed raw API payloads directly to the LLM**. Raw Amadeus or Booking.com responses are verbose JSON objects that bloat context.
- Pipe all API outputs through compression routines to strip nulls, nested boilerplate, and metadata.
- Retain only essential keys: id, airline, times, price, stops, baggage allowance, name, location, and rating.

### Layer 3: Context Sliding Windows

- Do not re-send the entire conversation history on every agent step.
- Keep a task state object (summary of goals, constraints, and current itinerary status) that is sent on every turn.
- Keep only the last 3 conversational turns verbatim. Compress older turns into high-level summaries/decisions.

### Layer 4: Model Routing

- Route tasks to the cheapest capable model:
  - **Haiku / Gemini Flash**: Structuring input constraints, intent parsing, data compression, deterministic scoring/ranking, simple conflict detection.
  - **Sonnet / GPT-4o**: Orchestration decisions, complex multi-leg conflict resolution, change impact propagation.

---

## 3. Directory Structure and Boundaries

Maintain clean modular boundaries inside the `src/` folder:

- `common/`: Global TS types, decorators, custom guards, pipes, and utility functions. No domain-specific logic.
- `modules/`: Clean module domains:
  - `agent/`: Agent state machines, LangGraph definitions, tool executors, and node handlers.
  - `search/`: External flight/hotel/activity search client connectors.
  - `trips/`: Trip database models, CRUD operations, state persistence.
  - `cache/`: Redis wrappers and semantic caching logic.
  - `llm/`: LiteLLM-like unified wrapper and provider managers.

---

## 4. Testing & Error Handling

- **Offline Resilience**: When Qdrant, Redis, or Postgres is down, services must fail gracefully or fallback to mock providers.
- **Strict Zod Validation**: Validate all incoming briefs, external API responses, and LLM structured outputs with strict schemas to eliminate runtime failures.
