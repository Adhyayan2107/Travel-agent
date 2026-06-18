import { describe, it, expect } from "vitest";
import { ContextManagerService } from "../../src/modules/agent/graph/context-manager.service";
import { DeltaTrackerService } from "../../src/modules/agent/graph/delta-tracker.service";
import {
  TravelAgentState,
  ToolCallEntry,
} from "../../src/common/types/agent.types";
import { Itinerary, Activity } from "../../src/common/types/travel.types";
import { TripStatus } from "@prisma/client";

describe("ContextManagerService", () => {
  const contextManager = new ContextManagerService();

  describe("buildSlidingWindowContext", () => {
    it("should keep recent tool calls verbatim and summarize older ones", () => {
      const logs: ToolCallEntry[] = [
        {
          tool: "search_flights",
          input: { from: "BOM" },
          output: "Raw flights...",
          timestamp: "10:00",
        },
        {
          tool: "search_hotels",
          input: { stars: 4 },
          output: "Raw hotels...",
          timestamp: "10:01",
        },
        {
          tool: "search_activities",
          input: { category: "food" },
          output: "Raw acts...",
          timestamp: "10:02",
        },
        {
          tool: "detect_conflicts",
          input: { days: 5 },
          output: "Raw conflicts...",
          timestamp: "10:03",
        },
        {
          tool: "resolve_conflict",
          input: { id: "c1" },
          output: "Raw fixed...",
          timestamp: "10:04",
        },
      ];

      const result = contextManager.buildSlidingWindowContext(logs);

      // Verbatim calls should include the last 3 logs
      expect(result).toContain("Step 4: Tool [detect_conflicts]");
      expect(result).toContain("Step 5: Tool [resolve_conflict]");
      expect(result).toContain("Raw fixed...");
      expect(result).toContain("Raw conflicts...");
      expect(result).toContain("Raw acts...");

      // Older calls (first 2 logs) should be summarized in high-level sentences
      expect(result).toContain(
        "Step 1: Executed tool [search_flights] successfully",
      );
      expect(result).toContain(
        "Step 2: Executed tool [search_hotels] successfully",
      );
      expect(result).not.toContain("Raw flights...");
      expect(result).not.toContain("Raw hotels...");
    });

    it("should return empty string if log history is empty", () => {
      expect(contextManager.buildSlidingWindowContext([])).toBe("");
    });
  });
});

describe("DeltaTrackerService", () => {
  const deltaTracker = new DeltaTrackerService();

  const mockItinerary: Itinerary = {
    id: "itin-1",
    status: TripStatus.PLANNING,
    totalCost: 150000,
    createdAt: "2026-06-18",
    brief: {
      origin: "BOM",
      destination: "Paris",
      departureDate: "2026-08-15",
      travellers: 2,
      budgetMin: 100000,
      budgetMax: 200000,
      currency: "INR",
      accommodationPrefs: [],
      specialRequirements: [],
      interests: [],
    },
    outboundFlight: {
      id: "f-out-1",
      airline: "Air India",
      flightNumber: "AI-101",
      origin: "BOM",
      destination: "CDG",
      departTime: "2026-08-15T08:00:00Z",
      arriveTime: "2026-08-15T14:30:00Z",
      durationMins: 630,
      stops: 0,
      pricePerPerson: 40000,
      totalPrice: 80000,
      bookingRef: "REF-OUT-1",
      status: "scheduled",
    },
    hotel: {
      id: "h-1",
      name: "Pullman Eiffel",
      address: "18 Ave Suffren",
      stars: 4,
      checkIn: "2026-08-15",
      checkOut: "2026-08-20",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      pricePerNight: 14000,
      totalPrice: 70000,
      bookingRef: "REF-HOTEL-1",
      coordinates: { lat: 48.8, lng: 2.2 },
      amenities: [],
    },
    activities: [
      {
        id: "act-1",
        name: "Louvre Tour",
        type: "excursion",
        date: "2026-08-16",
        startTime: "10:00",
        endTime: "12:00",
        durationMins: 120,
        cost: 4000,
        location: "Louvre",
        bookingRequired: true,
        notes: "",
      },
      {
        id: "act-2",
        name: "Seine Cruise",
        type: "attraction",
        date: "2026-08-17",
        startTime: "20:00",
        endTime: "21:00",
        durationMins: 60,
        cost: 2000,
        location: "Seine",
        bookingRequired: false,
        notes: "",
      },
    ],
    days: [],
  };

  it("should detect no changes for identical itineraries", () => {
    const delta = deltaTracker.calculateDelta(mockItinerary, mockItinerary);
    expect(delta).not.toBeNull();
    expect(delta?.hasOutboundFlightChanged).toBe(false);
    expect(delta?.hasHotelChanged).toBe(false);
    expect(delta?.addedActivities).toHaveLength(0);
    expect(delta?.removedActivityIds).toHaveLength(0);
    expect(delta?.updatedActivities).toHaveLength(0);
  });

  it("should detect changes when hotel is updated or activity is added/removed", () => {
    const updatedItinerary: Itinerary = {
      ...mockItinerary,
      hotel: {
        ...mockItinerary.hotel!,
        id: "h-2", // Changed hotel
        name: "Novotel Tower Eiffel",
      },
      activities: [
        // act-1 kept unchanged
        mockItinerary.activities[0],
        // act-2 removed
        // act-3 added
        {
          id: "act-3",
          name: "Versailles Tour",
          type: "excursion",
          date: "2026-08-18",
          startTime: "09:00",
          endTime: "13:00",
          durationMins: 240,
          cost: 6000,
          location: "Versailles",
          bookingRequired: true,
          notes: "",
        },
      ],
    };

    const delta = deltaTracker.calculateDelta(mockItinerary, updatedItinerary);
    expect(delta).not.toBeNull();
    expect(delta?.hasHotelChanged).toBe(true);
    expect(delta?.hasOutboundFlightChanged).toBe(false);

    expect(delta?.addedActivities).toHaveLength(1);
    expect(delta?.addedActivities[0].id).toBe("act-3");

    expect(delta?.removedActivityIds).toHaveLength(1);
    expect(delta?.removedActivityIds[0]).toBe("act-2");

    expect(delta?.updatedActivities).toHaveLength(0);
  });
});
