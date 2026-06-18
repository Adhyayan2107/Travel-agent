import { Module, Global } from "@nestjs/common";
import { LlmService } from "./llm.service";
import { TokenTrackerService } from "./token-tracker.service";
import { TripsModule } from "../trips/trips.module";

@Global()
@Module({
  imports: [TripsModule],
  providers: [LlmService, TokenTrackerService],
  exports: [LlmService, TokenTrackerService],
})
export class LlmModule {}
