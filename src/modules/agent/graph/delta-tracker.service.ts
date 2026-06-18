import { Injectable, Logger } from "@nestjs/common";
import {
  Itinerary,
  Flight,
  Hotel,
  Activity,
} from "../../../common/types/travel.types";

export interface ItineraryDelta {
  itineraryId: string;
  hasOutboundFlightChanged: boolean;
  hasReturnFlightChanged: boolean;
  hasHotelChanged: boolean;
  addedActivities: Activity[];
  removedActivityIds: string[];
  updatedActivities: Activity[];
  totalSegmentsUnchanged: number;
}

@Injectable()
export class DeltaTrackerService {
  private readonly logger = new Logger(DeltaTrackerService.name);

  /**
   * Compares a baseline itinerary with a revised itinerary to calculate the segment delta.
   * This is crucial to keep prompt payloads minimal during change replanning cycles.
   */
  calculateDelta(
    oldItinerary: Itinerary | null,
    newItinerary: Itinerary | null,
  ): ItineraryDelta | null {
    if (!oldItinerary || !newItinerary) {
      return null;
    }

    let totalSegmentsUnchanged = 0;

    // 1. Check outbound flight change
    const outboundChanged = this.hasFlightChanged(
      oldItinerary.outboundFlight,
      newItinerary.outboundFlight,
    );
    if (!outboundChanged && oldItinerary.outboundFlight) {
      totalSegmentsUnchanged++;
    }

    // 2. Check return flight change
    const returnChanged = this.hasFlightChanged(
      oldItinerary.returnFlight,
      newItinerary.returnFlight,
    );
    if (!returnChanged && oldItinerary.returnFlight) {
      totalSegmentsUnchanged++;
    }

    // 3. Check hotel change
    const hotelChanged = this.hasHotelChanged(
      oldItinerary.hotel,
      newItinerary.hotel,
    );
    if (!hotelChanged && oldItinerary.hotel) {
      totalSegmentsUnchanged++;
    }

    // 4. Compare activities lists
    const oldActivities = oldItinerary.activities || [];
    const newActivities = newItinerary.activities || [];

    const oldActMap = new Map(oldActivities.map((a) => [a.id, a]));
    const newActMap = new Map(newActivities.map((a) => [a.id, a]));

    const addedActivities: Activity[] = [];
    const updatedActivities: Activity[] = [];
    const removedActivityIds: string[] = [];

    // Check for added & updated activities
    for (const newAct of newActivities) {
      const oldAct = oldActMap.get(newAct.id);
      if (!oldAct) {
        addedActivities.push(newAct);
      } else if (this.hasActivityChanged(oldAct, newAct)) {
        updatedActivities.push(newAct);
      } else {
        totalSegmentsUnchanged++;
      }
    }

    // Check for removed activities
    for (const oldAct of oldActivities) {
      if (!newActMap.has(oldAct.id)) {
        removedActivityIds.push(oldAct.id);
      }
    }

    return {
      itineraryId: newItinerary.id,
      hasOutboundFlightChanged: outboundChanged,
      hasReturnFlightChanged: returnChanged,
      hasHotelChanged: hotelChanged,
      addedActivities,
      removedActivityIds,
      updatedActivities,
      totalSegmentsUnchanged,
    };
  }

  private hasFlightChanged(fA?: Flight, fB?: Flight): boolean {
    if (!fA && !fB) return false;
    if (!fA || !fB) return true; // One exists and other doesn't -> changed
    return (
      fA.id !== fB.id ||
      fA.flightNumber !== fB.flightNumber ||
      fA.departTime !== fB.departTime ||
      fA.arriveTime !== fB.arriveTime ||
      fA.pricePerPerson !== fB.pricePerPerson ||
      fA.status !== fB.status
    );
  }

  private hasHotelChanged(hA?: Hotel, hB?: Hotel): boolean {
    if (!hA && !hB) return false;
    if (!hA || !hB) return true;
    return (
      hA.id !== hB.id ||
      hA.name !== hB.name ||
      hA.checkIn !== hB.checkIn ||
      hA.checkOut !== hB.checkOut ||
      hA.totalPrice !== hB.totalPrice
    );
  }

  private hasActivityChanged(aA: Activity, aB: Activity): boolean {
    return (
      aA.id !== aB.id ||
      aA.name !== aB.name ||
      aA.date !== aB.date ||
      aA.startTime !== aB.startTime ||
      aA.endTime !== aB.endTime ||
      aA.cost !== aB.cost ||
      aA.location !== aB.location
    );
  }
}
