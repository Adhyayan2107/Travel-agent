import { Injectable, Logger } from "@nestjs/common";
import {
  TravelAgentState,
  ToolCallEntry,
  ThoughtEntry,
} from "../../../common/types/agent.types";

@Injectable()
export class ContextManagerService {
  private readonly logger = new Logger(ContextManagerService.name);
  private readonly MAX_VERBATIM_TOOL_CALLS = 3;

  /**
   * Separates the state context into a stable prefix and a dynamic tail.
   * This structure enables LLMs like Claude or Gemini to cache the system instructions
   * and tool definitions efficiently.
   */
  buildCachedPayload(
    state: TravelAgentState,
    systemRole: string,
    toolSchemas: any[],
  ): {
    systemPrompt: string; // STABLE PREFIX (cached)
    userPrompt: string; // DYNAMIC TAIL (sent fresh every turn)
  } {
    // 1. Stable Cached Prefix
    const systemPrompt = [
      systemRole,
      "## Tools Available",
      JSON.stringify(toolSchemas, null, 2),
      "## Travel Domain Conventions",
      "- All flight departure/arrival times are localized.",
      "- Layover times must be minimum 90 minutes for international connection and 60 minutes for domestic connection.",
      "- Hotel check-in time is typically 14:00/15:00 and check-out is 11:00/12:00. Watch for gaps between landing and check-in.",
      "- Budget constraints are primary boundaries. Swapping or downgrading elements is preferred over budget overruns.",
    ].join("\n\n");

    // 2. Dynamic Tail (Sent fresh)
    const dynamicTailParts = [
      `Today's Date: ${new Date().toISOString().split("T")[0]}`,
      `Trip Session ID: ${state.sessionId}`,
      `Current User Brief: "${state.rawBrief}"`,
      this.buildTaskStateSummary(state),
      this.buildSlidingWindowContext(state.toolCallLog),
      this.buildRecentThoughtsSummary(state.thoughtLog),
    ];

    if (state.conflicts && state.conflicts.length > 0) {
      dynamicTailParts.push(
        "## Active Conflicts Detected",
        JSON.stringify(state.conflicts, null, 2),
      );
    }

    const userPrompt = dynamicTailParts.join("\n\n");

    return {
      systemPrompt,
      userPrompt,
    };
  }

  /**
   * Compresses the tool execution logs into a sliding window context.
   * Keeps the last N tool calls verbatim, while condensing all older ones to single summary lines.
   */
  buildSlidingWindowContext(toolCallLog: ToolCallEntry[]): string {
    if (!toolCallLog || toolCallLog.length === 0) {
      return "";
    }

    const totalCalls = toolCallLog.length;
    const verbatimCalls = toolCallLog.slice(-this.MAX_VERBATIM_TOOL_CALLS);
    const olderCalls = toolCallLog.slice(0, -this.MAX_VERBATIM_TOOL_CALLS);

    const parts: string[] = [];

    // Older calls -> summarized
    if (olderCalls.length > 0) {
      parts.push("### Prior Action Summary");
      const olderSummary = olderCalls
        .map(
          (tc, idx) =>
            `Step ${idx + 1}: Executed tool [${tc.tool}] successfully at ${tc.timestamp}.`,
        )
        .join("\n");
      parts.push(olderSummary);
    }

    // Recent calls -> verbatim
    parts.push(
      `### Verbatim Recent Tool Outputs (Last ${verbatimCalls.length} calls)`,
    );
    const recentVerbatim = verbatimCalls
      .map((tc, idx) => {
        const stepNum = olderCalls.length + idx + 1;
        return [
          `Step ${stepNum}: Tool [${tc.tool}]`,
          `Input: ${JSON.stringify(tc.input)}`,
          `Output:\n${tc.output}`,
        ].join("\n");
      })
      .join("\n\n");
    parts.push(recentVerbatim);

    return parts.join("\n\n");
  }

  /**
   * Renders the current itinerary state in a compact representation
   */
  private buildTaskStateSummary(state: TravelAgentState): string {
    const brief = state.parsedBrief;
    const itinerary = state.itinerary;

    const briefSummary = brief
      ? `Origin: ${brief.origin} | Dest: ${brief.destination} | Dates: ${brief.departureDate} to ${brief.returnDate || "N/A"} | Budget Max: ${brief.budgetMax} ${brief.currency}`
      : "Unparsed";

    const itinSummary = itinerary
      ? `Assembled segments: Outbound Flight: ${itinerary.outboundFlight ? "Yes" : "No"} | Hotel: ${itinerary.hotel ? "Yes" : "No"} | Activities Count: ${itinerary.activities?.length || 0} | Total Cost: ${itinerary.totalCost}`
      : "No Itinerary Drafted Yet";

    return [
      "## Current Planning State",
      `Constraints: ${briefSummary}`,
      `Itinerary status: ${itinSummary}`,
      `Current Active Node: ${state.currentNode}`,
      `Overall Agent Status: ${state.status}`,
    ].join("\n");
  }

  /**
   * Renders a short summary of the agent's recent thinking steps
   */
  private buildRecentThoughtsSummary(thoughtLog: ThoughtEntry[]): string {
    if (!thoughtLog || thoughtLog.length === 0) {
      return "";
    }

    const recentThoughts = thoughtLog.slice(-3); // Keep last 3 thoughts
    return [
      "## Agent Thinking History (Recent Steps)",
      recentThoughts
        .map((t) => `[${t.nodeName}] at ${t.timestamp}: ${t.thought}`)
        .join("\n"),
    ].join("\n");
  }
}
