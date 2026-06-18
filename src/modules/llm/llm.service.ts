import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";

export interface ModelConfig {
  provider: "openai" | "google" | "openrouter";
  model: string;
  temperature: number;
  maxTokens?: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private defaultProvider: string;
  private openAiKey?: string;
  private geminiKey?: string;
  private openRouterKey?: string;
  private useMock = false;

  constructor(private readonly configService: ConfigService) {
    this.defaultProvider = this.configService.get<string>(
      "LLM_DEFAULT_PROVIDER",
      "openai",
    );
    this.openAiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.geminiKey = this.configService.get<string>("GEMINI_API_KEY");
    this.openRouterKey = this.configService.get<string>("OPENROUTER_API_KEY");

    // If no keys are provided, we default to mock mode to prevent crash and support offline testing
    const hasKeys =
      (this.openAiKey && this.openAiKey !== "sk-...") ||
      (this.geminiKey && this.geminiKey !== "AIza...") ||
      (this.openRouterKey && this.openRouterKey !== "sk-or-...");

    if (!hasKeys) {
      this.logger.warn(
        "No LLM API keys detected. Operating in OFFLINE MOCK MODE.",
      );
      this.useMock = true;
    }
  }

  /**
   * Routes a node task to the appropriate LLM model configuration
   */
  private getModelConfigForNode(nodeName: string): ModelConfig {
    // LLM routing rules to balance speed, cost, and intelligence (SOLID/LLD)
    switch (nodeName) {
      case "intent-parser":
        return {
          provider: this.geminiKey ? "google" : "openai",
          model: this.geminiKey ? "gemini-2.0-flash" : "gpt-4o-mini",
          temperature: 0.1,
        };
      case "itinerary-assembler":
        return {
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.4,
          maxTokens: 4096,
        };
      case "conflict-resolver":
        return {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 2048,
        };
      case "change-manager":
        return {
          provider: this.openRouterKey ? "openrouter" : "openai",
          model: this.openRouterKey ? "anthropic/claude-3-5-sonnet" : "gpt-4o",
          temperature: 0.3,
          maxTokens: 4096,
        };
      case "responder":
      default:
        return {
          provider: this.geminiKey ? "google" : "openai",
          model: this.geminiKey ? "gemini-2.0-flash" : "gpt-4o-mini",
          temperature: 0.5,
        };
    }
  }

  /**
   * Instantiate the LangChain chat client based on the target configuration
   */
  private getChatClient(config: ModelConfig): BaseChatModel {
    if (config.provider === "openai") {
      return new ChatOpenAI({
        openAIApiKey: this.openAiKey,
        modelName: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    } else if (config.provider === "google") {
      return new ChatGoogleGenerativeAI({
        apiKey: this.geminiKey,
        model: config.model,
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      });
    } else if (config.provider === "openrouter") {
      // OpenRouter uses the OpenAI client wrapper with a custom base url
      return new ChatOpenAI({
        openAIApiKey: this.openRouterKey,
        modelName: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": "https://github.com/ashu273k/Travel-agent",
            "X-Title": "Agentic Travel Planner",
          },
        },
      });
    }

    // Default fallback
    return new ChatOpenAI({
      openAIApiKey: this.openAiKey,
      modelName: "gpt-4o-mini",
    });
  }

  /**
   * Converts generic message structure to LangChain BaseMessage class list
   */
  private mapMessages(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): BaseMessage[] {
    return messages.map((m) => {
      if (m.role === "system") return new SystemMessage(m.content);
      if (m.role === "assistant") return new AIMessage(m.content);
      return new HumanMessage(m.content);
    });
  }

  /**
   * Execute chat completion
   */
  async complete(
    nodeName: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    schema?: z.ZodType<any>,
  ): Promise<string> {
    const config = this.getModelConfigForNode(nodeName);
    this.logger.log(
      `LLM Request [Node: ${nodeName}] using [Provider: ${config.provider}, Model: ${config.model}]`,
    );

    if (this.useMock) {
      return this.generateMockResponse(nodeName, messages, schema);
    }

    try {
      const client = this.getChatClient(config);
      const lcMessages = this.mapMessages(messages);

      if (schema) {
        // Use structured output if schema is provided
        const structuredClient = client.withStructuredOutput(schema);
        const response = await structuredClient.invoke(lcMessages);
        return JSON.stringify(response);
      } else {
        const response = await client.invoke(lcMessages);
        return typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      }
    } catch (error) {
      this.logger.error(
        `LLM Call failed for node: ${nodeName}. Falling back to mock response.`,
        error,
      );
      return this.generateMockResponse(nodeName, messages, schema);
    }
  }

  /**
   * Streaming completion helper (returns Async Generator for SSE)
   */
  async *stream(
    nodeName: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): AsyncGenerator<string, void, unknown> {
    const config = this.getModelConfigForNode(nodeName);
    this.logger.log(
      `LLM Stream [Node: ${nodeName}] using [Provider: ${config.provider}, Model: ${config.model}]`,
    );

    if (this.useMock) {
      const mockResponse = await this.generateMockResponse(nodeName, messages);
      // Simulate streaming chunks
      const chunks = mockResponse.split(" ");
      for (const chunk of chunks) {
        yield chunk + " ";
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    try {
      const client = this.getChatClient(config);
      const lcMessages = this.mapMessages(messages);
      const stream = await client.stream(lcMessages);

      for await (const chunk of stream) {
        const text =
          typeof chunk.content === "string"
            ? chunk.content
            : JSON.stringify(chunk.content);
        yield text;
      }
    } catch (error) {
      this.logger.error(
        `LLM Stream failed for node: ${nodeName}. Falling back to simulated stream.`,
        error,
      );
      const mockResponse = await this.generateMockResponse(nodeName, messages);
      yield mockResponse;
    }
  }

  /**
   * Offline / Fallback Mock generator to ensure tests run smoothly without API keys
   */
  private async generateMockResponse(
    nodeName: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    schema?: z.ZodType<any>,
  ): Promise<string> {
    const userPrompt = messages.find((m) => m.role === "user")?.content || "";

    this.logger.warn(`Generating Offline Mock Response for Node: ${nodeName}`);

    switch (nodeName) {
      case "intent-parser": {
        const isParis = userPrompt.toLowerCase().includes("paris");
        return JSON.stringify({
          origin: "BOM",
          destination: isParis ? "Paris, France" : "Tokyo, Japan",
          departureDate: "2026-08-15",
          returnDate: "2026-08-20",
          travellers: 2,
          budgetMin: 150000,
          budgetMax: 200000,
          currency: "INR",
          accommodationPrefs: ["hotel", "4-star", "near Eiffel Tower"],
          specialRequirements: ["no hostels"],
          interests: ["food", "history"],
        });
      }

      case "itinerary-assembler":
        return JSON.stringify({
          id: "mock-itinerary-id",
          totalCost: 185000,
          days: [
            {
              date: "2026-08-15",
              items: [
                {
                  id: "f-out",
                  type: "flight",
                  airline: "Air India",
                  flightNumber: "AI-143",
                  origin: "BOM",
                  destination: "CDG",
                  departTime: "2026-08-15T08:00:00Z",
                  arriveTime: "2026-08-15T14:30:00Z",
                  pricePerPerson: 45000,
                  totalPrice: 90000,
                  bookingRef: "REF-AI-OUT",
                  status: "scheduled",
                },
                {
                  id: "h-stay",
                  type: "hotel",
                  name: "Hotel Eiffel Seine",
                  stars: 4,
                  checkIn: "2026-08-15",
                  checkOut: "2026-08-20",
                  checkInTime: "10:00",
                  checkOutTime: "11:00",
                  pricePerNight: 18000,
                  totalPrice: 90000,
                  bookingRef: "REF-HOTEL-EIFFEL",
                },
              ],
            },
          ],
        });

      case "conflict-resolver":
        return JSON.stringify({
          conflictId: "c1",
          action: "adjust_time",
          explanation:
            "Adjusted Day 1 activities to occur after flight lands at 14:30.",
          updatedSegmentIds: ["h-stay"],
        });

      case "change-manager":
        return JSON.stringify({
          directlyAffected: ["f-out"],
          downstreamAffected: ["h-stay"],
          conflictsCreated: [],
          rerearchRequired: { flights: true, hotels: false, activities: false },
          estimatedNewCostINR: 195000,
          explanation: "Re-routed to next available flight arriving at 17:30.",
        });

      default:
        return "Mock reply: Connection successful, running in offline sandbox environment.";
    }
  }
}
