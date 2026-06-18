import { Injectable, Logger, Inject } from "@nestjs/common";
import { ITripsRepository } from "../trips/trips.repository.interface";

export interface TokenTelemetry {
  sessionId: string;
  nodeName: string;
  model: string;
  inputTokens: {
    prefix: number; // Stable system prompt + tool schemas
    compressedAPIs: number; // External search responses after RTK
    sessionState: number; // Task state summary
    userRequest: number; // Current user input
    historyWindow: number; // Recalling recent conversation turns
    total: number;
  };
  outputTokens: {
    reasoning?: number;
    toolCalls?: number;
    total: number;
  };
  latencyMs: number;
  rtkSavedTokens?: number; // Est. token count saved by RTK compression
}

@Injectable()
export class TokenTrackerService {
  private readonly logger = new Logger(TokenTrackerService.name);

  constructor(
    @Inject("ITripsRepository")
    private readonly tripsRepository: ITripsRepository,
  ) {}

  /**
   * Tracks and records token metrics for a specific agent node execution
   */
  async trackCall(telemetry: TokenTelemetry): Promise<void> {
    const {
      sessionId,
      nodeName,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      rtkSavedTokens = 0,
    } = telemetry;

    // 1. Calculate savings metrics
    const totalWithCompression = inputTokens.total + outputTokens.total;
    const totalWithoutCompression = totalWithCompression + rtkSavedTokens;
    const savedPct =
      totalWithoutCompression > 0
        ? Math.round((rtkSavedTokens / totalWithoutCompression) * 100)
        : 0;

    // 2. Beautiful structured console logging (as required in observability plan)
    this.logger.log(`
┌──────────────────────────────────────────────────────────────┐
│  TOKEN TRACKER OBSERVABILITY REPORT                          │
├──────────────────────────────────────────────────────────────┤
│  Session:  ${sessionId.padEnd(50)}│
│  Node:     ${nodeName.padEnd(50)}│
│  Model:    ${model.padEnd(50)}│
├──────────────────────────────────────────────────────────────┤
│  INPUT TOKENS:                                               │
│    ├─ Stable Prefix (cached):   ${inputTokens.prefix.toString().padEnd(30)}│
│    ├─ Compressed APIs (RTK):    ${inputTokens.compressedAPIs.toString().padEnd(30)}│
│    ├─ Session State:            ${inputTokens.sessionState.toString().padEnd(30)}│
│    ├─ User Request:             ${inputTokens.userRequest.toString().padEnd(30)}│
│    └─ History Window:           ${inputTokens.historyWindow.toString().padEnd(30)}│
│  TOTAL INPUT:                   ${inputTokens.total.toString().padEnd(30)}│
├──────────────────────────────────────────────────────────────┤
│  OUTPUT TOKENS:                                              │
│    ├─ Reasoning/Text:           ${(outputTokens.reasoning ?? 0).toString().padEnd(30)}│
│    ├─ Tool Calls:               ${(outputTokens.toolCalls ?? 0).toString().padEnd(30)}│
│  TOTAL OUTPUT:                  ${outputTokens.total.toString().padEnd(30)}│
├──────────────────────────────────────────────────────────────┤
│  PERFORMANCE & RTK SAVINGS:                                 │
│    ├─ Latency (ms):             ${latencyMs.toString().padEnd(30)}│
│    ├─ Est. Tokens Saved:        ${rtkSavedTokens.toString().padEnd(30)}│
│    └─ Savings Rate (%):         ${(savedPct + "%").padEnd(30)}│
└──────────────────────────────────────────────────────────────┘
    `);

    // 3. Persist savings telemetry to Postgres via TripsRepository
    try {
      const session = await this.tripsRepository.getSession(sessionId);
      if (session) {
        // Read previous savings
        const prevSavings = (session.rtkSavings as any) || {};
        const totalBefore =
          (prevSavings.beforeTokens || 0) + totalWithoutCompression;
        const totalAfter =
          (prevSavings.afterTokens || 0) + totalWithCompression;
        const accumulatedSavedPct =
          totalBefore > 0
            ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100)
            : 0;

        await this.tripsRepository.updateSession(sessionId, {
          rtkSavings: {
            beforeTokens: totalBefore,
            afterTokens: totalAfter,
            savedPct: accumulatedSavedPct,
          },
        });
      }
    } catch (dbError) {
      this.logger.error(
        `Failed to update RTK savings in database for session: ${sessionId}`,
        (dbError as any).message,
      );
    }
  }
}
