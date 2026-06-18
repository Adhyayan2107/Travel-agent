import { TripStatus } from "@prisma/client";

export interface TravelBrief {
  origin: string; // IATA code or city name
  destination: string; // City/Country name
  departureDate: string; // ISO date YYYY-MM-DD
  returnDate?: string; // ISO date YYYY-MM-DD
  travellers: number;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  accommodationPrefs: string[]; // e.g., ["pool", "city-center"]
  specialRequirements: string[]; // e.g., ["halal food", "wheelchair accessible"]
  interests: string[]; // e.g., ["food", "history", "nature"]
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departTime: string; // ISO datetime
  arriveTime: string; // ISO datetime
  durationMins: number;
  stops: number;
  pricePerPerson: number;
  totalPrice: number;
  bookingRef: string;
  status: "scheduled" | "delayed" | "cancelled";
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  stars: number;
  checkIn: string; // ISO date YYYY-MM-DD
  checkOut: string; // ISO date YYYY-MM-DD
  checkInTime: string; // e.g., "15:00"
  checkOutTime: string; // e.g., "11:00"
  pricePerNight: number;
  totalPrice: number;
  amenities: string[];
  bookingRef: string;
}

export interface Activity {
  id: string;
  name: string;
  type: "attraction" | "restaurant" | "transport" | "excursion" | "free_time";
  date: string; // ISO date YYYY-MM-DD
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  durationMins: number;
  cost: number;
  location: string;
  coordinates?: { lat: number; lng: number };
  notes: string;
  bookingRequired: boolean;
  bookingRef?: string;
}

export interface DayPlan {
  date: string; // ISO date YYYY-MM-DD
  items: (Flight | Hotel | Activity)[];
}

export interface Itinerary {
  id: string;
  brief: TravelBrief;
  outboundFlight?: Flight;
  returnFlight?: Flight;
  hotel?: Hotel;
  activities: Activity[];
  days: DayPlan[];
  totalCost: number;
  createdAt: string;
  status: TripStatus;
}

export interface Conflict {
  id: string;
  conflictType:
    | "CHECK_IN_BEFORE_LANDING"
    | "TIGHT_CONNECTION"
    | "ACTIVITY_OVERLAP"
    | "HOTEL_GAP"
    | "CHECKOUT_BEFORE_FLIGHT"
    | "TRANSPORT_TIME_INSUFFICIENT"
    | "BUDGET_EXCEEDED";
  severity: "critical" | "warning";
  affectedItems: string[]; // IDs of affected flights/hotels/activities
  description: string;
  suggestedFix: string;
}

export interface ChangeImpactReport {
  changeType: string;
  affectedItems: string[];
  conflictsIntroduced: Conflict[];
  proposedAlternatives: (Flight | Hotel | Activity)[];
  revisedItinerary: Itinerary;
  explanation: string;
}
