import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QdrantClient } from "@qdrant/js-client-rest";

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient | null = null;
  private useFallback = false;

  // Simple in-memory fallback database
  private inMemoryDb = new Map<
    string,
    Array<{ id: string | number; vector: number[]; payload: any }>
  >();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>(
      "QDRANT_URL",
      "http://localhost:6333",
    );
    this.logger.log(`Initializing Qdrant client with URL: ${url}`);

    try {
      this.client = new QdrantClient({ url });
      // Verify connection by fetching collections list with a short timeout
      await Promise.race([
        this.client.getCollections(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Qdrant connection timeout")),
            3000,
          ),
        ),
      ]);

      this.logger.log("Successfully connected to Qdrant.");
      this.useFallback = false;

      // Initialize default collections
      await this.initializeCollections();
    } catch (error) {
      this.logger.error(
        "Failed to connect to Qdrant. Using in-memory mock fallback.",
        error,
      );
      this.useFallback = true;
    }
  }

  /**
   * Automatically create default collections if they do not exist
   */
  async initializeCollections() {
    if (this.useFallback || !this.client) {
      this.logger.log(
        "Skipping collection initialization (running in fallback mock mode).",
      );
      return;
    }

    const collections = [
      "traveller_preferences",
      "itinerary_history",
      "search_result_cache",
      "hotels",
      "activities",
      "itinerary_templates",
      "semantic_query_cache",
    ];

    try {
      const response = await this.client.getCollections();
      const existingNames = response.collections.map((c) => c.name);

      for (const name of collections) {
        if (!existingNames.includes(name)) {
          this.logger.log(`Creating Qdrant collection: ${name}...`);
          await this.client.createCollection(name, {
            vectors: {
              size: 1536, // Voyage-travel-2 or text-embedding-3-small dimension
              distance: "Cosine",
            },
          });
          this.logger.log(`Created Qdrant collection: ${name}.`);
        }
      }
    } catch (error) {
      this.logger.error(
        "Error initializing Qdrant collections. Falling back to in-memory.",
        error,
      );
      this.useFallback = true;
    }
  }

  /**
   * Upsert points into a collection
   */
  async upsert(
    collectionName: string,
    points: Array<{ id: string | number; vector: number[]; payload: any }>,
  ): Promise<void> {
    if (!this.useFallback && this.client) {
      try {
        await this.client.upsert(collectionName, {
          wait: true,
          points,
        });
        return;
      } catch (error) {
        this.logger.warn(
          `Qdrant upsert failed. Falling back to in-memory.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // In-memory fallback
    if (!this.inMemoryDb.has(collectionName)) {
      this.inMemoryDb.set(collectionName, []);
    }
    const store = this.inMemoryDb.get(collectionName)!;

    // Add or replace
    for (const point of points) {
      const idx = store.findIndex((p) => p.id === point.id);
      if (idx >= 0) {
        store[idx] = point;
      } else {
        store.push(point);
      }
    }
    this.logger.log(
      `Mock upserted ${points.length} points to in-memory collection "${collectionName}".`,
    );
  }

  /**
   * Search for similar points in a collection using Cosine Similarity
   */
  async search(
    collectionName: string,
    queryVector: number[],
    limit = 5,
  ): Promise<Array<{ id: string | number; score: number; payload: any }>> {
    if (!this.useFallback && this.client) {
      try {
        const results = await this.client.search(collectionName, {
          vector: queryVector,
          limit,
          with_payload: true,
        });
        return results.map((r) => ({
          id: r.id,
          score: r.score,
          payload: r.payload,
        }));
      } catch (error) {
        this.logger.warn(
          `Qdrant search failed. Falling back to in-memory.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // In-memory Cosine Similarity search fallback
    const store = this.inMemoryDb.get(collectionName) || [];
    if (store.length === 0) {
      return [];
    }

    const scored = store.map((point) => {
      const score = this.cosineSimilarity(queryVector, point.vector);
      return { id: point.id, score, payload: point.payload };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Simple helper to calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
