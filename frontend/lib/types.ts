export interface TravelBrief {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  travellers: number;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  accommodationPrefs: string[];
  specialRequirements: string[];
  interests: string[];
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departTime: string;
  arriveTime: string;
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
  stars: number;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  pricePerNight: number;
  totalPrice: number;
  amenities: string[];
  bookingRef: string;
}

export interface Activity {
  id: string;
  name: string;
  type: "attraction" | "restaurant" | "transport" | "excursion" | "free_time";
  date: string;
  startTime: string;
  endTime: string;
  durationMins: number;
  cost: number;
  location: string;
  notes: string;
  bookingRequired: boolean;
  bookingRef?: string;
}

export interface DayPlan {
  date: string;
  items: (Flight | Hotel | Activity)[];
}

export interface Itinerary {
  id: string;
  brief?: TravelBrief;
  outboundFlight?: Flight;
  returnFlight?: Flight;
  hotel?: Hotel;
  activities: Activity[];
  days: DayPlan[];
  totalCost: number;
  status: string;
}

export interface Conflict {
  id: string;
  conflictType: string;
  severity: "critical" | "warning";
  description: string;
  suggestedFix: string;
}
