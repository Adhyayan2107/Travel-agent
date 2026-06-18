import { Module, Global } from "@nestjs/common";
import { QdrantService } from "./qdrant.service";
import { EmbeddingsService } from "./embeddings.service";

@Global()
@Module({
  providers: [QdrantService, EmbeddingsService],
  exports: [QdrantService, EmbeddingsService],
})
export class MemoryModule {}
