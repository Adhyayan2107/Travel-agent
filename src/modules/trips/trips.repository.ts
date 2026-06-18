import { Injectable, Logger } from "@nestjs/common";
import { Trip, AgentSession, TripStatus } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { ITripsRepository } from "./trips.repository.interface";

@Injectable()
export class TripsRepository implements ITripsRepository {
  private readonly logger = new Logger(TripsRepository.name);

  // In-memory fallback stores
  private readonly memoryTrips = new Map<string, Trip>();
  private readonly memorySessions = new Map<string, AgentSession>();
  private useFallback = false;

  constructor(private readonly prisma: PrismaService) {}

  private checkDbConnection(): boolean {
    // If the database fails to respond or is not connected, we switch to fallback
    return !this.useFallback;
  }

  async createTrip(userId: string, rawBrief: string): Promise<Trip> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.trip.create({
          data: {
            userId,
            rawBrief,
            status: TripStatus.PLANNING,
            conflicts: [],
            changeLog: [],
          },
        });
      } catch (error) {
        this.logger.error(
          "PostgreSQL error on createTrip. Activating in-memory fallback.",
          error,
        );
        this.useFallback = true;
      }
    }

    // Fallback implementation
    const fallbackTrip: Trip = {
      id: `fallback-trip-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      status: TripStatus.PLANNING,
      rawBrief,
      parsedBrief: null,
      itinerary: null,
      budgetSummary: null,
      conflicts: [],
      changeLog: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memoryTrips.set(fallbackTrip.id, fallbackTrip);
    return fallbackTrip;
  }

  async getTrip(id: string): Promise<Trip | null> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.trip.findUnique({
          where: { id },
        });
      } catch (error) {
        this.logger.error(
          `PostgreSQL error on getTrip(${id}). Activating in-memory fallback.`,
          error,
        );
        this.useFallback = true;
      }
    }

    return this.memoryTrips.get(id) || null;
  }

  async updateTrip(
    id: string,
    data: {
      status?: TripStatus;
      parsedBrief?: any;
      itinerary?: any;
      budgetSummary?: any;
      conflicts?: any;
      changeLog?: any;
    },
  ): Promise<Trip> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.trip.update({
          where: { id },
          data,
        });
      } catch (error) {
        this.logger.error(
          `PostgreSQL error on updateTrip(${id}). Activating in-memory fallback.`,
          error,
        );
        this.useFallback = true;
      }
    }

    const trip = this.memoryTrips.get(id);
    if (!trip) {
      throw new Error(`Trip with ID ${id} not found in-memory`);
    }

    const updatedTrip: Trip = {
      ...trip,
      ...data,
      updatedAt: new Date(),
    };
    this.memoryTrips.set(id, updatedTrip);
    return updatedTrip;
  }

  async createSession(tripId: string): Promise<AgentSession> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.agentSession.create({
          data: {
            tripId,
            status: "running",
            checkpoints: [],
            thoughtLog: [],
            toolCallLog: [],
            rtkSavings: {},
          },
        });
      } catch (error) {
        this.logger.error(
          `PostgreSQL error on createSession for trip ${tripId}. Activating in-memory fallback.`,
          error,
        );
        this.useFallback = true;
      }
    }

    const fallbackSession: AgentSession = {
      id: `fallback-session-${Math.random().toString(36).substr(2, 9)}`,
      tripId,
      status: "running",
      checkpoints: [],
      thoughtLog: [],
      toolCallLog: [],
      rtkSavings: {},
      createdAt: new Date(),
    };
    this.memorySessions.set(fallbackSession.id, fallbackSession);
    return fallbackSession;
  }

  async getSession(id: string): Promise<AgentSession | null> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.agentSession.findUnique({
          where: { id },
        });
      } catch (error) {
        this.logger.error(
          `PostgreSQL error on getSession(${id}). Activating in-memory fallback.`,
          error,
        );
        this.useFallback = true;
      }
    }

    return this.memorySessions.get(id) || null;
  }

  async updateSession(
    id: string,
    data: {
      checkpoints?: any;
      thoughtLog?: any;
      toolCallLog?: any;
      rtkSavings?: any;
      status?: string;
    },
  ): Promise<AgentSession> {
    if (this.checkDbConnection()) {
      try {
        return await this.prisma.agentSession.update({
          where: { id },
          data,
        });
      } catch (error) {
        this.logger.error(
          `PostgreSQL error on updateSession(${id}). Activating in-memory fallback.`,
          error,
        );
        this.useFallback = true;
      }
    }

    const session = this.memorySessions.get(id);
    if (!session) {
      throw new Error(`Session with ID ${id} not found in-memory`);
    }

    const updatedSession: AgentSession = {
      ...session,
      ...data,
    };
    this.memorySessions.set(id, updatedSession);
    return updatedSession;
  }
}
