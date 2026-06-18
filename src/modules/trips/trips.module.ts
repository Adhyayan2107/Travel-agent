import { Module, Global } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TripsRepository } from "./trips.repository";

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: "ITripsRepository",
      useClass: TripsRepository,
    },
  ],
  exports: [PrismaService, "ITripsRepository"],
})
export class TripsModule {}
