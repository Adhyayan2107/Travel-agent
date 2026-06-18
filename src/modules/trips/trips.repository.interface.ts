import { Trip, AgentSession, TripStatus } from "@prisma/client";

export interface ITripsRepository {
  createTrip(userId: string, rawBrief: string): Promise<Trip>;
  getTrip(id: string): Promise<Trip | null>;
  updateTrip(
    id: string,
    data: {
      status?: TripStatus;
      parsedBrief?: any;
      itinerary?: any;
      budgetSummary?: any;
      conflicts?: any;
      changeLog?: any;
    },
  ): Promise<Trip>;

  createSession(tripId: string): Promise<AgentSession>;
  getSession(id: string): Promise<AgentSession | null>;
  updateSession(
    id: string,
    data: {
      checkpoints?: any;
      thoughtLog?: any;
      toolCallLog?: any;
      rtkSavings?: any;
      status?: string;
    },
  ): Promise<AgentSession>;
}
