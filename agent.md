# Agent.md — Agentic Travel Planning System

## Project Overview

Build a multi-tool agentic travel planner that takes a natural language travel brief and produces a complete, conflict-free itinerary — then handles post-booking changes automatically. The agent must parse intent, run parallel searches, assemble a coherent day-by-day plan, detect and resolve scheduling conflicts, and re-plan when disruptions occur.

---

## Architecture

```
src/
├── agent/
│   ├── orchestrator.ts        # Master agent loop — plans, dispatches tools, resolves conflicts
│   ├── intent_parser.ts       # Extracts structured constraints from natural language brief
│   ├── conflict_resolver.ts   # Detects and auto-fixes scheduling conflicts
│   └── change_manager.ts      # Handles post-booking changes and downstream replanning
├── tools/
│   ├── flight_search.ts       # Searches and ranks flight options
│   ├── hotel_search.ts        # Searches and ranks accommodation options
│   ├── activity_search.ts     # Suggests activities, restaurants, local transport
│   └── maps_tool.ts           # Distance, travel time, location data
├── ui/
│   ├── Dashboard.tsx          # Main traveller UI — timeline, confirmations, day plan
│   ├── BriefIntake.tsx        # Natural language brief input
│   ├── ItineraryView.tsx      # Day-by-day itinerary with maps
│   ├── ChatPanel.tsx          # Conversational change requests
│   └── ConflictBanner.tsx     # Conflict alerts and resolution explanations
├── types/
│   └── travel.ts              # Shared types: TravelBrief, Itinerary, Flight, Hotel, Conflict
└── lib/
    ├── claude_client.ts       # Anthropic API wrapper with tool-use loop
    └── mock_data.ts           # Mock flight/hotel/activity data for demo
```

---

## Core Agent Flow

```
User Brief (natural language)
        │
        ▼
  [Intent Parser]
  Extract: origin, destination, dates, traveller count,
           budget, accommodation prefs, special requirements
        │
        ▼
  [Orchestrator] ──── Plans tool calls needed
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
  [Flight Search]                   [Hotel Search]
  Parallel execution                Parallel execution
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
              [Activity Search]
              Based on destination + dates
                       │
                       ▼
            [Itinerary Assembly]
            Merge all results into
            chronological day-by-day plan
                       │
                       ▼
          [Conflict Resolver]
          Check: check-in before landing?
                 activity overruns?
                 tight connections?
                 hotel gaps?
          Auto-fix + explain changes
                       │
                       ▼
          [Traveller Dashboard]
          Display timeline + day plan
                       │
                  (post-booking)
                       │
                       ▼
          [Change Manager]
          User reports: flight delay / cancellation / date change
          Re-search affected legs → find downstream conflicts → propose revised plan
```

---

## Tool Definitions

The orchestrator calls these tools via the Anthropic API tool-use interface:

### `parse_travel_brief`
```json
{
  "name": "parse_travel_brief",
  "description": "Extract structured travel constraints from a natural language brief.",
  "input_schema": {
    "type": "object",
    "properties": {
      "brief": { "type": "string", "description": "Raw user input describing the trip" }
    },
    "required": ["brief"]
  }
}
```
**Returns:** `TravelBrief` — origin, destination, depart_date, return_date, travellers, budget_min, budget_max, accommodation_type, special_requirements[]

---

### `search_flights`
```json
{
  "name": "search_flights",
  "description": "Search for available flights matching the given constraints.",
  "input_schema": {
    "type": "object",
    "properties": {
      "origin": { "type": "string" },
      "destination": { "type": "string" },
      "date": { "type": "string", "description": "ISO date YYYY-MM-DD" },
      "travellers": { "type": "number" },
      "max_budget_per_person": { "type": "number" },
      "preferred_class": { "type": "string", "enum": ["economy", "premium_economy", "business"] }
    },
    "required": ["origin", "destination", "date", "travellers"]
  }
}
```
**Returns:** `Flight[]` — airline, flight_number, depart_time, arrive_time, duration, price, stops, booking_ref

---

### `search_hotels`
```json
{
  "name": "search_hotels",
  "description": "Search for available accommodation matching the given constraints.",
  "input_schema": {
    "type": "object",
    "properties": {
      "destination": { "type": "string" },
      "check_in": { "type": "string", "description": "ISO date YYYY-MM-DD" },
      "check_out": { "type": "string", "description": "ISO date YYYY-MM-DD" },
      "guests": { "type": "number" },
      "max_budget_per_night": { "type": "number" },
      "accommodation_type": { "type": "string", "enum": ["hotel", "hostel", "apartment", "resort", "any"] }
    },
    "required": ["destination", "check_in", "check_out", "guests"]
  }
}
```
**Returns:** `Hotel[]` — name, address, stars, check_in_time, check_out_time, price_per_night, amenities[], booking_ref

---

### `search_activities`
```json
{
  "name": "search_activities",
  "description": "Get activity suggestions, restaurant recommendations, and local transport options for a destination and date range.",
  "input_schema": {
    "type": "object",
    "properties": {
      "destination": { "type": "string" },
      "start_date": { "type": "string" },
      "end_date": { "type": "string" },
      "interests": {
        "type": "array",
        "items": { "type": "string" },
        "description": "e.g. ['culture', 'food', 'adventure', 'relaxation']"
      },
      "budget_level": { "type": "string", "enum": ["budget", "mid", "luxury"] }
    },
    "required": ["destination", "start_date", "end_date"]
  }
}
```
**Returns:** `Activity[]` — name, type, date, start_time, end_time, duration_mins, cost, location, notes

---

### `detect_conflicts`
```json
{
  "name": "detect_conflicts",
  "description": "Analyse a draft itinerary and return all detected scheduling conflicts.",
  "input_schema": {
    "type": "object",
    "properties": {
      "itinerary": {
        "type": "object",
        "description": "Full Itinerary object to validate"
      }
    },
    "required": ["itinerary"]
  }
}
```
**Returns:** `Conflict[]` — conflict_type, affected_items[], description, suggested_fix

Conflict types: `CHECK_IN_BEFORE_LANDING`, `TIGHT_CONNECTION`, `ACTIVITY_OVERLAP`, `HOTEL_GAP`, `CHECKOUT_BEFORE_FLIGHT`, `TRANSPORT_TIME_INSUFFICIENT`

---

### `resolve_conflict`
```json
{
  "name": "resolve_conflict",
  "description": "Apply a fix for a detected conflict and return an updated itinerary segment.",
  "input_schema": {
    "type": "object",
    "properties": {
      "conflict": { "type": "object", "description": "Conflict object to resolve" },
      "itinerary": { "type": "object", "description": "Current full itinerary" },
      "resolution_strategy": {
        "type": "string",
        "enum": ["adjust_times", "replace_flight", "replace_hotel", "remove_activity", "add_buffer"]
      }
    },
    "required": ["conflict", "itinerary"]
  }
}
```
**Returns:** Updated `Itinerary` segment + `resolution_explanation` string

---

### `handle_change`
```json
{
  "name": "handle_change",
  "description": "Process a post-booking change event and identify all downstream impacts.",
  "input_schema": {
    "type": "object",
    "properties": {
      "change_type": {
        "type": "string",
        "enum": ["flight_delay", "flight_cancellation", "date_change", "hotel_cancellation"]
      },
      "affected_booking_ref": { "type": "string" },
      "new_details": {
        "type": "object",
        "description": "New flight/hotel details after change (for delay or reschedule)"
      },
      "current_itinerary": { "type": "object" }
    },
    "required": ["change_type", "affected_booking_ref", "current_itinerary"]
  }
}
```
**Returns:** `ChangeImpactReport` — affected_items[], conflicts_introduced[], proposed_alternatives[], revised_itinerary

---

## Shared Types (`src/types/travel.ts`)

```typescript
export interface TravelBrief {
  origin: string;
  destination: string;
  depart_date: string;           // ISO date
  return_date: string;           // ISO date
  travellers: number;
  budget_min: number;
  budget_max: number;
  currency: string;
  accommodation_type: 'hotel' | 'hostel' | 'apartment' | 'resort' | 'any';
  special_requirements: string[];
  interests: string[];
}

export interface Flight {
  id: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_time: string;           // ISO datetime
  arrive_time: string;           // ISO datetime
  duration_mins: number;
  stops: number;
  price_per_person: number;
  total_price: number;
  booking_ref: string;
  status: 'scheduled' | 'delayed' | 'cancelled';
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  stars: number;
  check_in: string;              // ISO date
  check_out: string;             // ISO date
  check_in_time: string;         // e.g. "15:00"
  check_out_time: string;        // e.g. "11:00"
  price_per_night: number;
  total_price: number;
  amenities: string[];
  booking_ref: string;
}

export interface Activity {
  id: string;
  name: string;
  type: 'attraction' | 'restaurant' | 'transport' | 'excursion' | 'free_time';
  date: string;                  // ISO date
  start_time: string;            // ISO datetime
  end_time: string;              // ISO datetime
  duration_mins: number;
  cost: number;
  location: string;
  coordinates?: { lat: number; lng: number };
  notes: string;
  booking_required: boolean;
}

export interface DayPlan {
  date: string;
  items: (Flight | Hotel | Activity)[];
}

export interface Itinerary {
  id: string;
  brief: TravelBrief;
  outbound_flight: Flight;
  return_flight: Flight;
  hotel: Hotel;
  activities: Activity[];
  days: DayPlan[];
  total_cost: number;
  created_at: string;
  status: 'draft' | 'confirmed' | 'modified';
}

export interface Conflict {
  id: string;
  conflict_type:
    | 'CHECK_IN_BEFORE_LANDING'
    | 'TIGHT_CONNECTION'
    | 'ACTIVITY_OVERLAP'
    | 'HOTEL_GAP'
    | 'CHECKOUT_BEFORE_FLIGHT'
    | 'TRANSPORT_TIME_INSUFFICIENT';
  severity: 'critical' | 'warning';
  affected_items: string[];      // IDs of affected flights/hotels/activities
  description: string;
  suggested_fix: string;
}

export interface ChangeImpactReport {
  change_type: string;
  affected_items: string[];
  conflicts_introduced: Conflict[];
  proposed_alternatives: (Flight | Hotel)[];
  revised_itinerary: Itinerary;
  explanation: string;
}
```

---

## Orchestrator Logic (`src/agent/orchestrator.ts`)

The orchestrator runs a **tool-use loop** using the Anthropic API:

```
1. Receive user brief (string)
2. Call parse_travel_brief → TravelBrief
3. In parallel, call:
     search_flights (outbound)
     search_flights (return)
     search_hotels
4. Select best flight+hotel combo within budget
5. Call search_activities with destination + date range
6. Assemble draft Itinerary object
7. Call detect_conflicts on draft
8. For each conflict (sorted by severity):
     Call resolve_conflict → update itinerary
9. Return final Itinerary to UI
```

For change management:
```
1. Receive change event from user (via chat panel)
2. Call handle_change → ChangeImpactReport
3. Call detect_conflicts on revised_itinerary
4. Resolve any new conflicts
5. Return revised itinerary + explanation to UI
```

The orchestrator uses **agentic loop** — it keeps calling tools until no unresolved conflicts remain or it determines a conflict cannot be auto-resolved (then surfaces it to the user for a decision).

---

## UI Components

### `Dashboard.tsx`
- Top bar: trip title, dates, total cost, status badge
- Left panel: `ChatPanel` — conversational interface for change requests
- Centre: `ItineraryView` — tabbed between Timeline and Day-by-Day views
- Right panel: Map with all locations pinned

### `BriefIntake.tsx`
- Full-width text area: "Describe your trip in plain English…"
- Example prompt shown as placeholder
- Submit triggers orchestrator; shows animated progress states:
  - "Parsing your brief…"
  - "Searching flights…"
  - "Finding hotels…"
  - "Building your itinerary…"
  - "Checking for conflicts…"

### `ItineraryView.tsx`
- **Timeline tab**: Vertical timeline from departure to return; each item (flight/hotel/activity) is a card with icon, time, cost
- **Day-by-Day tab**: Accordion per day; each day lists all items in order
- Conflict badges appear inline on affected items

### `ChatPanel.tsx`
- Persistent chat interface
- User can type: "My flight got cancelled", "Can we add a day trip to Versailles?", "Change hotel to something cheaper"
- Each message triggers the change manager or orchestrator
- Agent responses explain what changed and why

### `ConflictBanner.tsx`
- Shown when conflicts are detected before resolution
- Lists each conflict with severity colour (red = critical, amber = warning)
- Shows "Auto-resolved" badge after fix, with explanation tooltip

---

## Conflict Resolution Rules

The conflict resolver must enforce these rules automatically:

| Conflict | Rule | Auto-fix |
|---|---|---|
| `CHECK_IN_BEFORE_LANDING` | Hotel check-in must be ≥ 2 hours after flight arrives | Push hotel check-in to next available date or find later flight |
| `TIGHT_CONNECTION` | Layover < 60 min domestic, < 90 min international | Replace with flight with longer connection |
| `ACTIVITY_OVERLAP` | Two activities with overlapping time windows | Reschedule second activity to next available slot |
| `HOTEL_GAP` | Night with no accommodation | Search for 1-night hotel or extend existing booking |
| `CHECKOUT_BEFORE_FLIGHT` | Hotel checkout before return flight departs | Extend checkout (late checkout) or store luggage note |
| `TRANSPORT_TIME_INSUFFICIENT` | Activity location → airport with < 90 min buffer | Reschedule activity earlier or flag to traveller |

---

## Change Management Scenarios

Implement handlers for these exact scenarios (used in evaluation):

### Flight Cancellation
1. Mark outbound/return flight as `cancelled`
2. Re-run `search_flights` for same route and date
3. Check if new flight arrival changes hotel check-in validity
4. Check if any Day 1 activities are now unreachable
5. Propose revised itinerary with new flight selected

### Flight Delay
1. Update flight `depart_time` and `arrive_time`
2. Detect `CHECK_IN_BEFORE_LANDING` if delay pushes arrival past check-in
3. Detect `TRANSPORT_TIME_INSUFFICIENT` if delay causes missed Day 1 activity
4. Propose: keep hotel (late check-in) + drop/reschedule conflicting activity

### Date Change
1. Re-search all legs for new dates
2. Rebuild full itinerary
3. Surface price differences
4. Highlight any activities unavailable on new dates

---

## Implementation Notes

- **Mock data**: Use realistic mock flight/hotel/activity data in `lib/mock_data.ts`. Include planted conflicts for demo purposes (e.g., a hotel with check-in at 14:00 when the inbound flight lands at 15:30).
- **Parallel search**: Use `Promise.all()` to run outbound flight, return flight, and hotel search simultaneously.
- **Tool loop**: Implement the orchestrator as a `while (hasUnresolvedConflicts)` loop with a max iteration guard of 5 to prevent infinite loops.
- **State**: Keep the current `Itinerary` in React state at the Dashboard level; pass update functions down to the orchestrator and chat panel.
- **API model**: Use `claude-sonnet-4-6` for all Anthropic API calls.
- **Streaming**: Stream orchestrator responses to the chat panel using the Anthropic streaming API so the user sees progress in real time.

---

## Demo Script (for evaluation)

### Step 1 — Initial Brief
Paste this brief into the intake:
> "I need a 5-day trip for 2 people from Mumbai to Paris, leaving 15th August, returning 20th August. Budget around ₹2,00,000 total. We want a 4-star hotel near the Eiffel Tower, we love food and history, no budget hostels please."

**Expected:** Agent extracts all constraints, runs parallel search, assembles 5-day itinerary with flights + hotel + daily activities.

### Step 2 — Planted Conflict
In mock data, set the Paris hotel `check_in_time` to `"10:00"` but the inbound flight `arrive_time` to `"14:30"`.

**Expected:** Agent detects `CHECK_IN_BEFORE_LANDING`, auto-resolves by pushing Day 1 hotel check-in note and rescheduling Day 1 morning activity to the afternoon. ConflictBanner shows resolution.

### Step 3 — Change Management
In the chat panel, type:
> "My outbound flight just got cancelled. What do we do?"

**Expected:** Agent searches alternate flights, identifies that the new flight arrives 3 hours later, checks for downstream conflicts, proposes a revised Day 1 plan with a new flight and adjusted activity schedule.

---

## Evaluation Checklist

- [ ] Intent parser correctly extracts all 8+ constraint fields from the demo brief
- [ ] Parallel search returns ≥ 3 flight options and ≥ 3 hotel options within budget
- [ ] Assembled itinerary has no unresolved timing conflicts
- [ ] Planted `CHECK_IN_BEFORE_LANDING` conflict is detected and resolved automatically
- [ ] Resolution explanation is shown in the UI
- [ ] Flight cancellation triggers full downstream re-evaluation
- [ ] Revised itinerary after cancellation is logically valid
- [ ] Chat panel accepts change requests in natural language
- [ ] All conflict types from the type definition are handled

---

## Bonus Features (+3 marks)

1. **Real-time flight status** — Poll a mock status endpoint every 30 seconds; surface delay alerts in the dashboard automatically without user input.
2. **Cost optimiser** — After initial assembly, run a secondary search pass to find if swapping one element (e.g., a different return flight) saves >10% without introducing conflicts.
3. **PDF itinerary export** — Export the full itinerary as a formatted PDF the traveller can share.
