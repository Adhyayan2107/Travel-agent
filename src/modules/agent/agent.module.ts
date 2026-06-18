import { Module, Global } from "@nestjs/common";
import { ContextCompressorService } from "./tools/context-compressor.service";
import { ContextManagerService } from "./graph/context-manager.service";
import { DeltaTrackerService } from "./graph/delta-tracker.service";

@Global()
@Module({
  providers: [
    ContextCompressorService,
    ContextManagerService,
    DeltaTrackerService,
  ],
  exports: [
    ContextCompressorService,
    ContextManagerService,
    DeltaTrackerService,
  ],
})
export class AgentModule {}
