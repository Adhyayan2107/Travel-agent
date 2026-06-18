import { describe, it, expect, beforeEach } from "vitest";
import { ContextCompressorService } from "../../src/modules/agent/tools/context-compressor.service";
import { ConfigService } from "@nestjs/config";

// Mock Config Service
class MockConfigService {
  private config: Record<string, any> = {
    RTK_ENABLED: false, // Turn off RTK CLI execution in test sandbox
    RTK_BIN_PATH: "/usr/local/bin/rtk",
    RTK_MAX_OUTPUT_BYTES: 51200,
  };
  get(key: string, defaultValue?: any) {
    return this.config[key] ?? defaultValue;
  }
}

describe("ContextCompressorService", () => {
  let compressorService: ContextCompressorService;

  beforeEach(() => {
    const mockConfig = new MockConfigService() as any;
    compressorService = new ContextCompressorService(mockConfig);
  });

  describe("compressFlightResponse", () => {
    it("should compress a raw Amadeus flight response to essential fields only", () => {
      const rawAmadeusResponse = {
        data: [
          {
            id: "1",
            validatingAirlineCodes: ["AI"],
            itineraries: [
              {
                duration: "PT10H30M",
                segments: [
                  {
                    number: "143",
                    departure: { iataCode: "BOM", at: "2026-08-15T08:00:00" },
                    arrival: { iataCode: "DEL", at: "2026-08-15T10:15:00" },
                  },
                  {
                    number: "201",
                    departure: { iataCode: "DEL", at: "2026-08-15T12:00:00" },
                    arrival: { iataCode: "CDG", at: "2026-08-15T18:30:00" },
                  },
                ],
              },
            ],
            price: { grandTotal: "500.00" },
            travelerPricings: [
              {
                fareDetailsBySegment: [{ cabin: "BUSINESS" }],
              },
            ],
          },
        ],
      };

      const compressed =
        compressorService.compressFlightResponse(rawAmadeusResponse);
      expect(compressed).toHaveLength(1);
      expect(compressed[0]).toEqual({
        id: "1",
        airline: "AI",
        flightNo: "143",
        depart: "BOM 08:00",
        arrive: "CDG 18:30",
        durationMins: 630, // 10h 30m = 630m
        stops: 1,
        priceINR: 42000, // 500 * 84 = 42000
        class: "BUSINESS",
        bookingToken: "1",
      });
    });

    it("should slice and keep at most 5 flight options", () => {
      const rawOptions = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        validatingAirlineCodes: ["LH"],
        price: { grandTotal: "100" },
      }));
      const compressed = compressorService.compressFlightResponse({
        data: rawOptions,
      });
      expect(compressed).toHaveLength(5);
    });
  });

  describe("compressHotelResponse", () => {
    it("should compress a raw hotel search result", () => {
      const rawHotels = [
        {
          id: "hotel-1",
          name: "Grand Central Plaza",
          starRating: 4.5,
          addressString: "123 Main St",
          latitude: 48.8566,
          longitude: 2.3522,
          avgPriceINR: 15000,
          totalPrice: 75000,
          amenities: ["wifi", "breakfast", "gym", "pool", "lounge", "spa"],
          bookingComId: "bc-1",
        },
      ];

      const compressed = compressorService.compressHotelResponse(rawHotels);
      expect(compressed).toHaveLength(1);
      expect(compressed[0]).toEqual({
        id: "hotel-1",
        name: "Grand Central Plaza",
        stars: 4.5,
        address: "123 Main St",
        coordinates: { lat: 48.8566, lng: 2.3522 },
        pricePerNight: 15000,
        totalPrice: 75000,
        amenities: ["wifi", "breakfast", "gym", "pool", "lounge"], // Slices to max 5 amenities
        bookingRef: "bc-1",
      });
    });
  });

  describe("compressToolResult Integration", () => {
    it("should compress output using fallback TS code and reduce byte size significantly", async () => {
      const rawFlights = {
        data: Array.from({ length: 5 }, (_, i) => ({
          id: `${i}`,
          validatingAirlineCodes: ["AI"],
          itineraries: [
            {
              duration: "PT5H",
              segments: [
                {
                  number: `F${i}`,
                  departure: { iataCode: "BOM", at: "2026-08-15T08:00:00" },
                  arrival: { iataCode: "CDG", at: "2026-08-15T13:00:00" },
                },
              ],
            },
          ],
          price: { grandTotal: "600" },
          travelerPricings: [{ fareDetailsBySegment: [{ cabin: "ECONOMY" }] }],
        })),
      };

      const result = await compressorService.compressToolResult(
        "search_flights",
        rawFlights,
      );
      expect(result.rtkUsed).toBe(false);
      expect(result.beforeBytes).toBeGreaterThan(result.afterBytes);

      const parsed = JSON.parse(result.compressed);
      expect(parsed).toHaveLength(5);
      expect(parsed[0].flightNo).toBe("F0");
    });
  });
});
