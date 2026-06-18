import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private embeddingsModel: any = null;
  private useMock = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeEmbeddings();
  }

  private initializeEmbeddings() {
    const provider = this.configService.get<string>(
      "LLM_DEFAULT_PROVIDER",
      "openai",
    );
    const openAiKey = this.configService.get<string>("OPENAI_API_KEY");
    const geminiKey = this.configService.get<string>("GEMINI_API_KEY");

    try {
      if (provider === "openai" && openAiKey && openAiKey !== "sk-...") {
        this.embeddingsModel = new OpenAIEmbeddings({
          openAIApiKey: openAiKey,
          modelName: "text-embedding-3-small",
        });
        this.logger.log(
          "Initialized OpenAI Embeddings (text-embedding-3-small).",
        );
      } else if (
        provider === "google" &&
        geminiKey &&
        geminiKey !== "AIza..."
      ) {
        this.embeddingsModel = new GoogleGenerativeAIEmbeddings({
          apiKey: geminiKey,
          modelName: "embedding-001",
        });
        this.logger.log(
          "Initialized Google Gemini Embeddings (embedding-001).",
        );
      } else {
        this.logger.warn(
          "No active embedding API credentials found. Using mock fallback.",
        );
        this.useMock = true;
      }
    } catch (error) {
      this.logger.error(
        "Failed to initialize embedding client. Using mock fallback.",
        error,
      );
      this.useMock = true;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.useMock && this.embeddingsModel) {
      try {
        return await this.embeddingsModel.embedQuery(text);
      } catch (error) {
        this.logger.warn(
          `Embed query failed. Falling back to mock embeddings. Error: ${(error as any).message}`,
        );
      }
    }

    return this.generateMockEmbedding(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!this.useMock && this.embeddingsModel) {
      try {
        return await this.embeddingsModel.embedDocuments(texts);
      } catch (error) {
        this.logger.warn(
          `Embed documents failed. Falling back to mock embeddings. Error: ${(error as any).message}`,
        );
      }
    }

    return texts.map((text) => this.generateMockEmbedding(text));
  }

  /**
   * Deterministically generate a mock 1536-dimensional vector for a given text
   * using a simple hash algorithm, for testing without API keys.
   */
  private generateMockEmbedding(text: string): number[] {
    const vector = new Array(1536).fill(0);

    // Hash function to seed pseudo-random numbers
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Deterministic random numbers
    for (let j = 0; j < 1536; j++) {
      const x = Math.sin(hash + j) * 10000;
      vector[j] = x - Math.floor(x); // Float between 0 and 1
    }

    // Normalize the vector (to unit length for Cosine Similarity)
    let magnitude = 0;
    for (let k = 0; k < 1536; k++) {
      magnitude += vector[k] * vector[k];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let k = 0; k < 1536; k++) {
        vector[k] /= magnitude;
      }
    }

    return vector;
  }
}
