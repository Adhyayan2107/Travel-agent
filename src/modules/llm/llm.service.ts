import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

export interface ModelConfig {
  provider: "openai" | "google" | "openrouter" | "groq";
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

  private groqKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultProvider = this.configService.get<string>("LLM_DEFAULT_PROVIDER", "groq");
    this.openAiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.geminiKey = this.configService.get<string>("GEMINI_API_KEY");
    this.openRouterKey = this.configService.get<string>("OPENROUTER_API_KEY");
    this.groqKey = this.configService.get<string>("GROQ_API_KEY");
    // Strip surrounding quotes/whitespace — common artifact when editing .env files
    if (this.groqKey) {
      this.groqKey = this.groqKey.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
      if (this.groqKey && this.groqKey.length > 8) {
        this.logger.log(`Groq key: ${this.groqKey.slice(0, 8)}...${this.groqKey.slice(-4)} (${this.groqKey.length} chars)`);
      }
    }

    const hasKeys = (this.openAiKey && this.openAiKey !== "sk-...") ||
                    (this.geminiKey && this.geminiKey !== "AIza...") ||
                    (this.openRouterKey && this.openRouterKey !== "sk-or-...") ||
                    (this.groqKey && this.groqKey !== "gsk_..." && this.groqKey.startsWith("gsk_"));

    if (!hasKeys) {
      this.logger.warn("No LLM API keys detected. Operating in OFFLINE MOCK MODE.");
      this.useMock = true;
    }
  }

  private getModelConfigForNode(nodeName: string): ModelConfig {
    const useGroq = this.groqKey && this.groqKey !== "gsk_...";
    switch (nodeName) {
      case "intent-parser":
        if (useGroq) return { provider: "groq", model: "llama-3.1-8b-instant", temperature: 0.1 };
        return { provider: this.geminiKey ? "google" : "openai", model: this.geminiKey ? "gemini-2.0-flash" : "gpt-4o-mini", temperature: 0.1 };
      case "itinerary-assembler":
        if (useGroq) return { provider: "groq", model: "llama-3.3-70b-versatile", temperature: 0.4, maxTokens: 4096 };
        return { provider: "openai", model: "gpt-4o", temperature: 0.4, maxTokens: 4096 };
      case "conflict-resolver":
        if (useGroq) return { provider: "groq", model: "llama-3.1-8b-instant", temperature: 0.1, maxTokens: 2048 };
        return { provider: "openai", model: "gpt-4o-mini", temperature: 0.1, maxTokens: 2048 };
      case "change-manager":
        if (useGroq) return { provider: "groq", model: "llama-3.3-70b-versatile", temperature: 0.3, maxTokens: 4096 };
        return { provider: this.openRouterKey ? "openrouter" : "openai", model: this.openRouterKey ? "anthropic/claude-3-5-sonnet" : "gpt-4o", temperature: 0.3, maxTokens: 4096 };
      default:
        if (useGroq) return { provider: "groq", model: "llama-3.1-8b-instant", temperature: 0.5 };
        return { provider: this.geminiKey ? "google" : "openai", model: this.geminiKey ? "gemini-2.0-flash" : "gpt-4o-mini", temperature: 0.5 };
    }
  }

  private getChatClient(config: ModelConfig): BaseChatModel {
    if (config.provider === "openai") {
      return new ChatOpenAI({ openAIApiKey: this.openAiKey, modelName: config.model, temperature: config.temperature, maxTokens: config.maxTokens });
    } else if (config.provider === "google") {
      return new ChatGoogleGenerativeAI({ apiKey: this.geminiKey, model: config.model, temperature: config.temperature, maxOutputTokens: config.maxTokens });
    } else if (config.provider === "openrouter") {
      return new ChatOpenAI({
        openAIApiKey: this.openRouterKey,
        modelName: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        configuration: { baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": "https://github.com/ashu273k/Travel-agent", "X-Title": "Agentic Travel Planner" } },
      });
    } else if (config.provider === "groq") {
      return new ChatOpenAI({
        openAIApiKey: this.groqKey,
        modelName: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
      });
    }
    return new ChatOpenAI({ openAIApiKey: this.openAiKey, modelName: "gpt-4o-mini" });
  }

  private mapMessages(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): BaseMessage[] {
    return messages.map((m) => {
      if (m.role === "system") return new SystemMessage(m.content);
      if (m.role === "assistant") return new AIMessage(m.content);
      return new HumanMessage(m.content);
    });
  }

  private extractJson(text: string): string {
    // Strip markdown code fences if present
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) return fenced[1].trim();
    // Find first { or [ and return from there
    const start = text.search(/[{[]/);
    if (start !== -1) return text.slice(start);
    return text;
  }

  private async callGroqDirect(
    model: string,
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens = 4096,
    jsonMode = false,
  ): Promise<string> {
    const body: any = { model, messages, temperature, max_tokens: maxTokens };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(`Groq ${res.status}: ${err?.error?.message ?? res.statusText}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async complete(nodeName: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, schema?: z.ZodType<any>): Promise<string> {
    const config = this.getModelConfigForNode(nodeName);

    // Try Groq via direct fetch first (bypasses LangChain OpenAI auth quirks)
    if (!this.useMock && config.provider === "groq" && this.groqKey) {
      try {
        const needsJson = ["assemble_itinerary", "itinerary-assembler", "intent-parser", "detect_conflicts", "resolve_conflict", "conflict-resolver"].includes(nodeName);
        const raw = await this.callGroqDirect(config.model, messages, config.temperature, config.maxTokens, needsJson);
        this.logger.log(`Groq [${nodeName}] OK — model: ${config.model}`);
        return needsJson ? this.extractJson(raw) : raw;
      } catch (err: any) {
        this.logger.warn(`Groq call failed for [${nodeName}]: ${err.message} — falling back to mock`);
        return this.generateMockResponse(nodeName, messages, schema);
      }
    }

    if (this.useMock) return this.generateMockResponse(nodeName, messages, schema);

    // LangChain path for OpenAI / Gemini / OpenRouter
    try {
      const client = this.getChatClient(config);
      const lcMessages = this.mapMessages(messages);
      if (schema) {
        const structuredClient = client.withStructuredOutput(schema);
        const response = await structuredClient.invoke(lcMessages);
        return JSON.stringify(response);
      }
      const response = await client.invoke(lcMessages);
      return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    } catch (error: any) {
      this.logger.error(`LLM Call failed for ${nodeName}: ${error?.message}`);
      return this.generateMockResponse(nodeName, messages, schema);
    }
  }

  async *stream(nodeName: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): AsyncGenerator<string, void, unknown> {
    const config = this.getModelConfigForNode(nodeName);
    if (this.useMock) {
      const mock = await this.generateMockResponse(nodeName, messages);
      for (const chunk of mock.split(" ")) {
        yield chunk + " ";
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    try {
      const client = this.getChatClient(config);
      const stream = await client.stream(this.mapMessages(messages));
      for await (const chunk of stream) {
        yield typeof chunk.content === "string" ? chunk.content : JSON.stringify(chunk.content);
      }
    } catch (error) {
      this.logger.error(`LLM Stream failed for ${nodeName}.`, error);
      yield await this.generateMockResponse(nodeName, messages);
    }
  }

  // ── Mock helpers ──────────────────────────────────────────────────────────────

  private readonly CITY_MAP: Record<string, { iata: string; name: string }> = {
    bangalore: { iata: "BLR", name: "Bangalore, India" },
    bengaluru: { iata: "BLR", name: "Bangalore, India" },
    goa: { iata: "GOI", name: "Goa, India" },
    mumbai: { iata: "BOM", name: "Mumbai, India" },
    bombay: { iata: "BOM", name: "Mumbai, India" },
    delhi: { iata: "DEL", name: "Delhi, India" },
    "new delhi": { iata: "DEL", name: "Delhi, India" },
    chennai: { iata: "MAA", name: "Chennai, India" },
    kolkata: { iata: "CCU", name: "Kolkata, India" },
    hyderabad: { iata: "HYD", name: "Hyderabad, India" },
    pune: { iata: "PNQ", name: "Pune, India" },
    jaipur: { iata: "JAI", name: "Jaipur, India" },
    kochi: { iata: "COK", name: "Kochi, India" },
    manali: { iata: "KUU", name: "Manali, India" },
    shimla: { iata: "SLV", name: "Shimla, India" },
    kashmir: { iata: "SXR", name: "Srinagar, Kashmir" },
    srinagar: { iata: "SXR", name: "Srinagar, Kashmir" },
    leh: { iata: "IXL", name: "Leh, Ladakh" },
    ladakh: { iata: "IXL", name: "Leh, Ladakh" },
    varanasi: { iata: "VNS", name: "Varanasi, India" },
    agra: { iata: "AGR", name: "Agra, India" },
    udaipur: { iata: "UDR", name: "Udaipur, India" },
    amritsar: { iata: "ATQ", name: "Amritsar, India" },
    calcutta: { iata: "CCU", name: "Kolkata, India" },
    paris: { iata: "CDG", name: "Paris, France" },
    london: { iata: "LHR", name: "London, UK" },
    dubai: { iata: "DXB", name: "Dubai, UAE" },
    singapore: { iata: "SIN", name: "Singapore" },
    bangkok: { iata: "BKK", name: "Bangkok, Thailand" },
    bali: { iata: "DPS", name: "Bali, Indonesia" },
    tokyo: { iata: "NRT", name: "Tokyo, Japan" },
    rome: { iata: "FCO", name: "Rome, Italy" },
    amsterdam: { iata: "AMS", name: "Amsterdam, Netherlands" },
  };

  private parseBriefFromText(text: string): object {
    const lower = text.toLowerCase();
    let origin = { iata: "BOM", name: "Mumbai, India" };
    let destination = { iata: "GOI", name: "Goa, India" };

    // ── City detection ────────────────────────────────────────────────────────
    // Strategy 1: "from X to Y" or "X to Y" — capture the two route segments
    const routeMatch = lower.match(/(?:from\s+)?([a-z][a-z\s]{0,20}?)\s+to\s+([a-z][a-z\s]{0,20}?)(?=\s+for|\s+in|\s+on|\s+with|\s*,|\s*\.|\s*\d|$)/);
    if (routeMatch) {
      const originStr = routeMatch[1].trim();
      const destStr   = routeMatch[2].trim();
      let oFound = false, dFound = false;
      for (const [city, info] of Object.entries(this.CITY_MAP)) {
        if (!oFound && (originStr.includes(city) || city.startsWith(originStr.split(" ")[0]))) {
          origin = info; oFound = true;
        }
        if (!dFound && (destStr.includes(city) || city.startsWith(destStr.split(" ")[0]))) {
          destination = info; dFound = true;
        }
        if (oFound && dFound) break;
      }
      // If we found the destination but not origin, keep default origin (user's home city)
    } else {
      // Strategy 2: find all cities by text position, earliest = origin, next = destination
      const withPos: Array<{ iata: string; name: string; pos: number }> = [];
      for (const [city, info] of Object.entries(this.CITY_MAP)) {
        const pos = lower.indexOf(city);
        if (pos !== -1) withPos.push({ ...info, pos });
      }
      withPos.sort((a, b) => a.pos - b.pos);
      // Deduplicate by IATA (bangalore + bengaluru both → BLR, take first occurrence)
      const seen = new Set<string>();
      const unique = withPos.filter(c => { if (seen.has(c.iata)) return false; seen.add(c.iata); return true; });
      if (unique.length >= 2) { origin = unique[0]; destination = unique[1]; }
      else if (unique.length === 1) { destination = unique[0]; }
    }

    // ── Travellers ────────────────────────────────────────────────────────────
    const travellersMatch = lower.match(/(\d+)\s*(?:people|persons?|adults?|travell?ers?|pax|friends?)/);
    const travellers = travellersMatch ? parseInt(travellersMatch[1]) : 2;

    // ── Dates ─────────────────────────────────────────────────────────────────
    const months: Record<string, number> = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
    let month = (new Date().getMonth() + 2) % 12 || 12;
    let year  = new Date().getFullYear();
    for (const [name, num] of Object.entries(months)) { if (lower.includes(name)) { month = num; break; } }
    const yearMatch = text.match(/20\d\d/);
    if (yearMatch) year = parseInt(yearMatch[0]);
    if (month <= new Date().getMonth() + 1 && year === new Date().getFullYear()) year++;

    const daysMatch = lower.match(/(\d+)\s*(?:days?|nights?)/);
    const tripDays = daysMatch ? Math.max(parseInt(daysMatch[1]), 2) : 5;
    const departureDate = `${year}-${String(month).padStart(2, "0")}-15`;
    const retDate = new Date(new Date(departureDate).getTime() + tripDays * 86400000);
    const returnDate = retDate.toISOString().split("T")[0];

    // ── Budget (handles single values and ranges, ₹/k/L/lakh) ────────────────
    const stripNum = (s: string) => parseFloat(s.replace(/[,₹\s]/g, "")) || 0;
    const applyUnit = (n: number, unit?: string): number => {
      if (!unit) {
        if (lower.match(/\blakh\b/)) return n * 100000;
        if (lower.match(/\bL\b/))    return n * 100000;
      }
      if (unit?.toLowerCase() === "l" || unit?.toLowerCase() === "lakh") return n * 100000;
      if (unit?.toLowerCase() === "k") return n * 1000;
      return n;
    };

    let budgetMin = 0, budgetMax = 0;
    // Range: "25000 to 30000", "25k-30k", "1L-1.5L"
    const rangeMatch = text.match(/(?:₹\s*)?(\d[\d,.]*)\s*(k|K|L|lakh)?\s*(?:to|-)\s*(?:₹\s*)?(\d[\d,.]*)\s*(k|K|L|lakh)?/i);
    if (rangeMatch) {
      budgetMin = Math.round(applyUnit(stripNum(rangeMatch[1]), rangeMatch[2]));
      budgetMax = Math.round(applyUnit(stripNum(rangeMatch[3]), rangeMatch[4]));
    } else {
      // Single value: "budget 25000", "₹25k", "25000 budget"
      const singleMatch = text.match(/(?:budget\s*(?:of\s*)?|₹\s*)(\d[\d,.]*)\s*(k|K|L|lakh)?/i)
                       || text.match(/(\d[\d,.]*)\s*(k|K|L|lakh)?\s*(?:budget|rupees?|rs\.?)/i);
      if (singleMatch) {
        budgetMax = Math.round(applyUnit(stripNum(singleMatch[1]), singleMatch[2]));
        budgetMin = Math.round(budgetMax * 0.75);
      }
    }
    if (budgetMax <= 0) { budgetMin = 40000; budgetMax = 80000; } // safe fallback

    // ── Interests ─────────────────────────────────────────────────────────────
    const interests: string[] = [];
    if (lower.match(/beach|sea|ocean|water/))             interests.push("beach");
    if (lower.match(/food|cuisine|eat|restaurant/))       interests.push("food");
    if (lower.match(/history|heritage|museum|monument/))  interests.push("history");
    if (lower.match(/adventure|trek|hik|sport/))          interests.push("adventure");
    if (lower.match(/nature|wildlife|forest|mountain/))   interests.push("nature");
    if (lower.match(/shop|market|mall/))                  interests.push("shopping");
    if (lower.match(/art|culture|architect/))             interests.push("art");
    if (interests.length === 0) interests.push("sightseeing");

    return { origin: origin.iata, destination: destination.name, departureDate, returnDate, travellers, budgetMin, budgetMax, currency: "INR", accommodationPrefs: ["hotel"], specialRequirements: [], interests };
  }

  private buildMockItinerary(brief: any): object {
    const dest   = (brief.destination || "Goa, India").toLowerCase();
    const origin = (brief.origin || "BOM") as string;
    const dep    = brief.departureDate || "2026-08-15";
    const ret    = brief.returnDate    || "2026-08-20";
    const n      = (brief.travellers as number) || 2;
    const nights = Math.max(Math.round((new Date(ret).getTime() - new Date(dep).getTime()) / 86400000), 1);

    // ── Route category → base flight duration ─────────────────────────────────
    type RouteCategory = "domestic" | "seasia" | "gulf" | "europe" | "fareast";
    const getCategory = (d: string): RouteCategory => {
      if (d.match(/goa|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|kolkata|pune|jaipur|manali|shimla|kochi|srinagar|kashmir|leh|ladakh|varanasi|udaipur|amritsar|agra/)) return "domestic";
      if (d.match(/bangkok|bali|singapore|phuket|kuala lumpur|vietnam|cambodia/))                                                                                                return "seasia";
      if (d.match(/dubai|abu dhabi|doha|riyadh|muscat|bahrain/))                                                                                                                return "gulf";
      if (d.match(/paris|london|rome|barcelona|amsterdam|berlin|madrid|prague|zurich/))                                                                                         return "europe";
      return "fareast";
    };
    const cat = getCategory(dest);

    const FLIGHT_DURATION: Record<RouteCategory, number> = { domestic: 90, seasia: 240, gulf: 210, europe: 480, fareast: 420 };
    const duration = FLIGHT_DURATION[cat];

    // ── Budget-aware pricing ──────────────────────────────────────────────────
    // If user specified a budget, distribute it: 40% flights (round-trip), 40% hotel, 20% activities
    const budgetMax: number = brief.budgetMax || 0;
    const budgetMin: number = brief.budgetMin || 0;
    const targetBudget = budgetMax > 0 ? budgetMax : (budgetMin > 0 ? Math.round(budgetMin * 1.25) : 0);

    // Sensible market-rate floors by category (per person, one-way)
    const DEFAULT_FLOOR: Record<RouteCategory, { fp: number; hp: number; ac: number }> = {
      domestic: { fp: 3500,  hp: 2500,  ac: 800  },
      seasia:   { fp: 15000, hp: 5000,  ac: 1500 },
      gulf:     { fp: 14000, hp: 8000,  ac: 2000 },
      europe:   { fp: 45000, hp: 7000,  ac: 2500 },
      fareast:  { fp: 35000, hp: 7000,  ac: 2000 },
    };
    const floor = DEFAULT_FLOOR[cat];

    let flightPP: number;
    let hotelPPN: number;
    let actCost: number;

    if (targetBudget > 0) {
      // Scale to budget: ensure we don't go below market-rate floors
      const flightBudget = targetBudget * 0.40; // both directions combined
      const hotelBudget  = targetBudget * 0.40;
      const actBudget    = targetBudget * 0.20;

      flightPP = Math.max(Math.round(flightBudget / (2 * n)), floor.fp);
      hotelPPN = Math.max(Math.round(hotelBudget / nights), floor.hp);
      actCost  = Math.max(Math.round(actBudget / Math.max(nights - 1, 1) / n), floor.ac);
    } else {
      flightPP = floor.fp;
      hotelPPN = floor.hp;
      actCost  = floor.ac;
    }

    // ── Destination data ──────────────────────────────────────────────────────
    type DestData = { code: string; hotel: string; airline: string; airlineCode: string; fnBase: string; stars: number; acts: Array<{ name: string; type: string; loc: string; notes: string }> };
    const DESTINATIONS: Record<string, DestData> = {
      goa:       { code: "GOI", hotel: "The Leela Goa", airline: "IndiGo", airlineCode: "6E", fnBase: "456", stars: 4, acts: [{ name: "Baga Beach & Seafood Lunch", type: "restaurant", loc: "Baga Beach, Goa", notes: "Fresh catch at beach shacks" }, { name: "Old Goa Heritage Walk", type: "attraction", loc: "Old Goa", notes: "Basilica of Bom Jesus, Se Cathedral" }, { name: "Water Sports at Calangute", type: "excursion", loc: "Calangute Beach", notes: "Parasailing, jet-ski, banana boat" }, { name: "Anjuna Flea Market", type: "attraction", loc: "Anjuna, Goa", notes: "Local handicrafts and art" }, { name: "Sunset Cruise on Mandovi", type: "excursion", loc: "Panaji Jetty", notes: "Live music and cultural show" }] },
      manali:    { code: "KUU", hotel: "Snow Valley Resorts", airline: "Air India", airlineCode: "AI", fnBase: "234", stars: 4, acts: [{ name: "Rohtang Pass Day Trip", type: "excursion", loc: "Rohtang Pass", notes: "Snow activities, permit required" }, { name: "Hadimba Devi Temple Visit", type: "attraction", loc: "Old Manali", notes: "Ancient wooden temple in deodar forest" }, { name: "Beas River White-Water Rafting", type: "excursion", loc: "Pirdi, Manali", notes: "Grade III rapids" }, { name: "Old Manali Café Crawl", type: "restaurant", loc: "Old Manali", notes: "Israeli food, Tibetan momos, thali" }] },
      kashmir:   { code: "SXR", hotel: "Houseboat — Dal Lake, Srinagar", airline: "Air India", airlineCode: "AI", fnBase: "812", stars: 4, acts: [{ name: "Shikara Ride on Dal Lake", type: "excursion", loc: "Dal Lake, Srinagar", notes: "Early morning golden hour ride" }, { name: "Mughal Gardens Tour", type: "attraction", loc: "Shalimar Bagh, Srinagar", notes: "Nishat, Shalimar, Chashme Shahi" }, { name: "Gulmarg Gondola Ride", type: "excursion", loc: "Gulmarg, Kashmir", notes: "Highest gondola in Asia — book in advance" }, { name: "Pahalgam Valley Day Trip", type: "excursion", loc: "Pahalgam, Kashmir", notes: "Betaab Valley, Aru, Chandanwari" }, { name: "Wazwan Dinner", type: "restaurant", loc: "Old Srinagar", notes: "36-course traditional Kashmiri feast" }] },
      srinagar:  { code: "SXR", hotel: "Houseboat — Dal Lake, Srinagar", airline: "Air India", airlineCode: "AI", fnBase: "812", stars: 4, acts: [{ name: "Shikara Ride on Dal Lake", type: "excursion", loc: "Dal Lake, Srinagar", notes: "Early morning golden hour ride" }, { name: "Mughal Gardens Tour", type: "attraction", loc: "Shalimar Bagh, Srinagar", notes: "Nishat, Shalimar, Chashme Shahi" }, { name: "Gulmarg Gondola Ride", type: "excursion", loc: "Gulmarg, Kashmir", notes: "Highest gondola in Asia" }, { name: "Wazwan Dinner", type: "restaurant", loc: "Old Srinagar", notes: "Traditional Kashmiri multi-course feast" }] },
      leh:       { code: "IXL", hotel: "The Grand Dragon Ladakh", airline: "Air India", airlineCode: "AI", fnBase: "445", stars: 4, acts: [{ name: "Pangong Lake Day Trip", type: "excursion", loc: "Pangong Tso, Ladakh", notes: "Permit required, 5h drive each way" }, { name: "Khardung La Pass", type: "excursion", loc: "Khardung La, Ladakh", notes: "One of the highest motorable passes" }, { name: "Leh Palace & Shanti Stupa", type: "attraction", loc: "Leh City", notes: "17th century royal palace, panoramic views" }, { name: "Nubra Valley Camel Safari", type: "excursion", loc: "Nubra Valley, Ladakh", notes: "Double-humped Bactrian camels" }] },
      ladakh:    { code: "IXL", hotel: "The Grand Dragon Ladakh", airline: "Air India", airlineCode: "AI", fnBase: "445", stars: 4, acts: [{ name: "Pangong Lake Day Trip", type: "excursion", loc: "Pangong Tso, Ladakh", notes: "Permit required" }, { name: "Khardung La Pass", type: "excursion", loc: "Khardung La, Ladakh", notes: "Highest motorable pass" }, { name: "Leh Palace & Shanti Stupa", type: "attraction", loc: "Leh City", notes: "17th century royal palace" }, { name: "Nubra Valley Camel Safari", type: "excursion", loc: "Nubra Valley", notes: "Bactrian camels on sand dunes" }] },
      bangalore: { code: "BLR", hotel: "The Leela Palace Bengaluru", airline: "IndiGo", airlineCode: "6E", fnBase: "301", stars: 5, acts: [{ name: "Lalbagh Botanical Garden", type: "attraction", loc: "Lalbagh, Bengaluru", notes: "200-year-old garden, Glass House" }, { name: "Cubbon Park Morning Walk", type: "attraction", loc: "Cubbon Park, Bengaluru", notes: "300 acres of green in the city" }, { name: "Brewpub Hopping — Indiranagar", type: "restaurant", loc: "Indiranagar, Bengaluru", notes: "Craft beer capital of India" }, { name: "Nandi Hills Sunrise Drive", type: "excursion", loc: "Nandi Hills, 60km", notes: "Best sunrise viewpoint near Bangalore" }] },
      delhi:     { code: "DEL", hotel: "The Imperial New Delhi", airline: "Air India", airlineCode: "AI", fnBase: "101", stars: 5, acts: [{ name: "Red Fort & Chandni Chowk", type: "attraction", loc: "Old Delhi", notes: "Mughal marvel + spice market food walk" }, { name: "Qutub Minar & Humayun's Tomb", type: "attraction", loc: "South Delhi", notes: "UNESCO World Heritage Sites" }, { name: "India Gate Evening Walk", type: "attraction", loc: "Rajpath, New Delhi", notes: "War memorial, best at night" }, { name: "Saket / Khan Market Dining", type: "restaurant", loc: "South Delhi", notes: "Best restaurants in the capital" }] },
      jaipur:    { code: "JAI", hotel: "Rambagh Palace", airline: "IndiGo", airlineCode: "6E", fnBase: "712", stars: 5, acts: [{ name: "Amber Fort Elephant Ride", type: "excursion", loc: "Amber Fort, Jaipur", notes: "16th century hilltop fortress" }, { name: "Hawa Mahal & City Palace", type: "attraction", loc: "Pink City, Jaipur", notes: "Palace of Winds, royal museum" }, { name: "Nahargarh Fort Sunset", type: "attraction", loc: "Nahargarh Fort, Jaipur", notes: "Panoramic view of the Pink City" }, { name: "Chokhi Dhani Village Experience", type: "restaurant", loc: "Chokhi Dhani, Jaipur", notes: "Rajasthani folk culture and dinner" }] },
      udaipur:   { code: "UDR", hotel: "Taj Lake Palace Udaipur", airline: "IndiGo", airlineCode: "6E", fnBase: "822", stars: 5, acts: [{ name: "Lake Pichola Boat Ride", type: "excursion", loc: "Lake Pichola, Udaipur", notes: "Sunset boat tour past City Palace" }, { name: "City Palace Museum", type: "attraction", loc: "City Palace, Udaipur", notes: "Largest palace complex in Rajasthan" }, { name: "Sajjangarh Monsoon Palace", type: "attraction", loc: "Sajjangarh, Udaipur", notes: "Hilltop palace — stunning sunset views" }, { name: "Rooftop Dining on Gangaur Ghat", type: "restaurant", loc: "Gangaur Ghat, Udaipur", notes: "Dal baati churma over lake views" }] },
      kochi:     { code: "COK", hotel: "CGH Earth Brunton Boatyard", airline: "IndiGo", airlineCode: "6E", fnBase: "543", stars: 4, acts: [{ name: "Fort Kochi Heritage Walk", type: "attraction", loc: "Fort Kochi", notes: "Dutch Palace, Jewish Synagogue, Chinese Fishing Nets" }, { name: "Kathakali & Kalaripayattu Show", type: "attraction", loc: "Cultural Centre, Kochi", notes: "Classical dance-drama and martial arts" }, { name: "Alleppey Houseboat Backwaters", type: "excursion", loc: "Alleppey, Kerala", notes: "Overnight houseboat — Kerala's backwaters" }, { name: "Kerala Seafood Thali", type: "restaurant", loc: "Fort Kochi", notes: "Fish curry, appam, toddy — authentic Kerala" }] },
      varanasi:  { code: "VNS", hotel: "Taj Ganges, Varanasi", airline: "Air India", airlineCode: "AI", fnBase: "411", stars: 5, acts: [{ name: "Ganga Aarti at Dashashwamedh Ghat", type: "attraction", loc: "Dashashwamedh Ghat, Varanasi", notes: "Evening fire ritual — deeply spiritual" }, { name: "Sunrise Boat Ride on Ganges", type: "excursion", loc: "River Ganges, Varanasi", notes: "Past 84 ghats at golden hour" }, { name: "Sarnath — Buddha's Birthplace", type: "attraction", loc: "Sarnath, 10km from Varanasi", notes: "Dhamek Stupa, museum" }, { name: "Banarasi Food Walk", type: "restaurant", loc: "Vishwanath Gali, Varanasi", notes: "Chaat, lassi, thandai, baati" }] },
      dubai:     { code: "DXB", hotel: "JW Marriott Marquis Dubai", airline: "Emirates", airlineCode: "EK", fnBase: "502", stars: 5, acts: [{ name: "Burj Khalifa — At The Top", type: "attraction", loc: "Downtown Dubai", notes: "124th floor observatory" }, { name: "Desert Safari with BBQ Dinner", type: "excursion", loc: "Dubai Desert", notes: "Dune bashing, camel ride, henna" }, { name: "Dubai Mall & Dubai Frame", type: "attraction", loc: "Downtown Dubai", notes: "Aquarium, ice rink, Frame viewpoint" }, { name: "Gold & Spice Souk", type: "attraction", loc: "Deira, Dubai", notes: "Old Dubai market experience" }] },
      bangkok:   { code: "BKK", hotel: "Centara Grand at CentralWorld", airline: "Thai Airways", airlineCode: "TG", fnBase: "315", stars: 5, acts: [{ name: "Grand Palace & Wat Phrakaew", type: "attraction", loc: "Ko Ratanakosin, Bangkok", notes: "Royal palace, dress code required" }, { name: "Floating Market Tour", type: "excursion", loc: "Damnoen Saduak", notes: "Traditional waterway market" }, { name: "Yaowarat Street Food Night Tour", type: "restaurant", loc: "Chinatown, Bangkok", notes: "Best street food in Bangkok" }, { name: "Chatuchak Weekend Market", type: "attraction", loc: "Chatuchak, Bangkok", notes: "15,000+ stalls" }] },
      bali:      { code: "DPS", hotel: "Four Seasons Resort Bali at Sayan", airline: "Air Asia", airlineCode: "AK", fnBase: "288", stars: 5, acts: [{ name: "Tanah Lot Temple Sunset", type: "attraction", loc: "Tanah Lot, Bali", notes: "Iconic sea temple at golden hour" }, { name: "Ubud Monkey Forest & Rice Terraces", type: "attraction", loc: "Ubud, Bali", notes: "Sacred monkey sanctuary + Tegalalang" }, { name: "Seminyak Beach Club Day", type: "excursion", loc: "Seminyak, Bali", notes: "Potato Head, Ku De Ta — sunset vibes" }, { name: "Balinese Cooking Class", type: "restaurant", loc: "Ubud, Bali", notes: "Learn to cook nasi goreng and satay" }] },
      paris:     { code: "CDG", hotel: "Hôtel Le Marais — Paris", airline: "Air France", airlineCode: "AF", fnBase: "225", stars: 4, acts: [{ name: "Eiffel Tower — Summit Visit", type: "attraction", loc: "Champ de Mars, 7th Arr.", notes: "Book summit tickets 60 days ahead" }, { name: "Louvre Museum", type: "attraction", loc: "Rue de Rivoli, 1st Arr.", notes: "2–4 hours, book timed entry" }, { name: "Seine River Evening Cruise", type: "excursion", loc: "Port de la Bourdonnais", notes: "1-hour cruise past all landmarks" }, { name: "Lunch at Café de Flore", type: "restaurant", loc: "Boulevard Saint-Germain", notes: "Historic literary café" }] },
      singapore: { code: "SIN", hotel: "Marina Bay Sands", airline: "Singapore Airlines", airlineCode: "SQ", fnBase: "423", stars: 5, acts: [{ name: "Gardens by the Bay Night Show", type: "attraction", loc: "Marina Bay", notes: "Cloud Forest, Supertrees" }, { name: "Universal Studios Singapore", type: "excursion", loc: "Sentosa Island", notes: "Full day, book tickets in advance" }, { name: "Maxwell Hawker Centre Food Tour", type: "restaurant", loc: "Maxwell Road", notes: "Hainanese chicken rice, char kway teow" }, { name: "Little India & Chinatown", type: "attraction", loc: "Central Singapore", notes: "Free entry, vibrant neighbourhoods" }] },
      london:    { code: "LHR", hotel: "The Strand Palace Hotel", airline: "British Airways", airlineCode: "BA", fnBase: "118", stars: 4, acts: [{ name: "Tower of London & Tower Bridge", type: "attraction", loc: "Tower Hill, London", notes: "Crown Jewels, Beefeaters" }, { name: "British Museum", type: "attraction", loc: "Bloomsbury, London", notes: "Free entry, Rosetta Stone" }, { name: "West End Show", type: "excursion", loc: "West End, London", notes: "Book Les Misérables or Lion King" }, { name: "Borough Market Food Tour", type: "restaurant", loc: "Southwark, London", notes: "London's oldest food market" }] },
      tokyo:     { code: "NRT", hotel: "Park Hyatt Tokyo", airline: "Japan Airlines", airlineCode: "JL", fnBase: "793", stars: 5, acts: [{ name: "Shibuya Crossing & Harajuku", type: "attraction", loc: "Shibuya, Tokyo", notes: "World's busiest pedestrian crossing" }, { name: "Tsukiji Outer Market Breakfast", type: "restaurant", loc: "Tsukiji, Tokyo", notes: "Freshest sushi and seafood" }, { name: "Senso-ji Temple, Asakusa", type: "attraction", loc: "Asakusa, Tokyo", notes: "Tokyo's oldest temple, Nakamise Dori" }, { name: "TeamLab Borderless Digital Art", type: "excursion", loc: "Odaiba, Tokyo", notes: "Immersive digital art museum" }] },
    };

    // Find best matching destination (handles aliases: srinagar → kashmir data, leh → ladakh data)
    let destInfo: DestData | undefined;
    for (const [key] of Object.entries(DESTINATIONS)) {
      if (dest.includes(key)) { destInfo = DESTINATIONS[key]; break; }
    }

    // Generic fallback for unknown destinations — uses IATA from CITY_MAP if available
    if (!destInfo) {
      const destName = (brief.destination || "Destination").split(",")[0].trim();
      const destNameCap = destName.charAt(0).toUpperCase() + destName.slice(1);
      // Look up IATA from CITY_MAP
      const cityEntry = Object.entries(this.CITY_MAP).find(([city]) => dest.includes(city));
      const destCode = cityEntry ? cityEntry[1].iata : "XXX";
      destInfo = {
        code: destCode,
        hotel: `${destNameCap} Luxury Hotel`,
        airline: "Air India",
        airlineCode: "AI",
        fnBase: "600",
        stars: 4,
        acts: [
          { name: `${destNameCap} Heritage Walk`, type: "attraction", loc: destNameCap, notes: "Key landmarks and historical sites" },
          { name: "Local Cuisine Experience", type: "restaurant", loc: destNameCap, notes: "Authentic regional food and culture" },
          { name: `${destNameCap} Day Excursion`, type: "excursion", loc: `${destNameCap} surroundings`, notes: "Guided half-day tour of nearby highlights" },
          { name: "Sunset Viewpoint Visit", type: "attraction", loc: destNameCap, notes: "Best panoramic views in the area" },
        ],
      };
    }

    // ── Build flights & hotel ─────────────────────────────────────────────────
    const stops    = cat === "domestic" ? 0 : cat === "europe" ? 1 : 0;
    const arrHour  = cat === "domestic" ? "08:30" : cat === "europe" ? "09:00" : "10:30";
    const retArr   = cat === "domestic" ? "16:30" : cat === "europe" ? "22:00" : "19:00";

    const outF = { id: "f1", airline: destInfo.airline, flightNumber: `${destInfo.airlineCode}${destInfo.fnBase}`, origin, destination: destInfo.code, departTime: `${dep}T06:00:00`, arriveTime: `${dep}T${arrHour}:00`, durationMins: duration, stops, pricePerPerson: flightPP, totalPrice: flightPP * n, bookingRef: `${destInfo.airlineCode}-OUT-001`, status: "scheduled" as const };
    const retF = { id: "f2", airline: destInfo.airline, flightNumber: `${destInfo.airlineCode}${parseInt(destInfo.fnBase) + 1}`, origin: destInfo.code, destination: origin, departTime: `${ret}T14:00:00`, arriveTime: `${ret}T${retArr}:00`, durationMins: duration, stops, pricePerPerson: flightPP, totalPrice: flightPP * n, bookingRef: `${destInfo.airlineCode}-RET-002`, status: "scheduled" as const };
    const hotel = { id: "h1", name: destInfo.hotel, address: brief.destination || destInfo.code, stars: destInfo.stars, checkIn: dep, checkOut: ret, checkInTime: "14:00", checkOutTime: "11:00", pricePerNight: hotelPPN, totalPrice: hotelPPN * nights, amenities: ["Free WiFi", "Breakfast Included", "Swimming Pool", "24h Reception"], bookingRef: `HTL-${Date.now()}` };

    // ── Build days ────────────────────────────────────────────────────────────
    const days: any[] = [];
    let cur = new Date(dep);
    for (let i = 0; i <= nights; i++) {
      const ds = cur.toISOString().split("T")[0];
      const items: any[] = [];
      if (i === 0) { items.push(outF); items.push(hotel); }
      if (i > 0 && i < nights) {
        const a = destInfo.acts[(i - 1) % destInfo.acts.length];
        items.push({ id: `a${i}`, name: a.name, type: a.type, date: ds, startTime: `${ds}T10:00:00`, endTime: `${ds}T13:00:00`, durationMins: 180, cost: actCost * n, location: a.loc, notes: a.notes, bookingRequired: a.type === "excursion" });
      }
      if (i === nights) items.push(retF);
      days.push({ date: ds, items });
      cur = new Date(cur.getTime() + 86400000);
    }

    const actDays  = Math.min(nights - 1, destInfo.acts.length);
    const actTotal = actDays * actCost * n;
    const totalCost = outF.totalPrice + retF.totalPrice + hotel.totalPrice + actTotal;

    return {
      id: `mock-${Date.now()}`,
      brief,
      outboundFlight: outF,
      returnFlight: retF,
      hotel,
      activities: days.flatMap((d: any) => d.items.filter((x: any) => !("flightNumber" in x) && !("checkIn" in x))),
      days,
      totalCost,
      createdAt: new Date().toISOString(),
      status: "ASSEMBLING",
    };
  }

  private async generateMockResponse(nodeName: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, schema?: z.ZodType<any>): Promise<string> {
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    switch (nodeName) {
      case "intent-parser":
        return JSON.stringify(this.parseBriefFromText(userMsg));

      case "itinerary-assembler":
      case "assemble_itinerary": {
        // Robustly extract the brief JSON from the assembler prompt
        let brief: any = {};
        try {
          const briefIdx = userMsg.indexOf("Brief:");
          if (briefIdx !== -1) {
            const fromBrief = userMsg.slice(briefIdx + 6).trimStart();
            const start = fromBrief.indexOf("{");
            if (start !== -1) {
              // Walk through characters to find the matching closing brace
              let depth = 0, end = start;
              for (let i = start; i < fromBrief.length; i++) {
                if (fromBrief[i] === "{") depth++;
                else if (fromBrief[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
              }
              brief = JSON.parse(fromBrief.slice(start, end + 1));
            }
          }
        } catch { /* leave brief as empty — buildMockItinerary has safe defaults */ }
        return JSON.stringify(this.buildMockItinerary(brief));
      }

      case "conflict-resolver":
      case "resolve_conflict":
        return JSON.stringify({ conflictId: "c1", action: "adjust_time", explanation: "Adjusted hotel check-in time to accommodate flight arrival.", updatedSegmentIds: [] });

      case "detect_conflicts":
        return JSON.stringify([]);

      case "handle_flight_change":
      case "propagate_downstream":
      case "patch_segment":
        return JSON.stringify({ success: true, affectedSegmentIds: [], explanation: "Change processed successfully." });

      default:
        return JSON.stringify({ success: true, message: "Operation completed." });
    }
  }
}
