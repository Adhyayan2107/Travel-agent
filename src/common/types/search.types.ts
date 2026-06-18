export interface FlightSearchRequest {
  origin: string;
  destination: string;
  date: string; // ISO date YYYY-MM-DD
  travellers: number;
  maxBudgetPerPerson?: number;
  preferredClass?: "economy" | "premium_economy" | "business";
}

export interface HotelSearchRequest {
  destination: string;
  checkIn: string; // ISO date YYYY-MM-DD
  checkOut: string; // ISO date YYYY-MM-DD
  guests: number;
  maxBudgetPerNight?: number;
  accommodationType?: "hotel" | "hostel" | "apartment" | "resort" | "any";
}

export interface ActivitySearchRequest {
  destination: string;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  interests?: string[];
  budgetLevel?: "budget" | "mid" | "luxury";
}

export interface RestaurantSearchRequest {
  destination: string;
  cuisine?: string[];
  budgetLevel?: "budget" | "mid" | "luxury";
}
