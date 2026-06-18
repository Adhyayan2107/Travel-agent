import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { AppConfigSchema } from './config/app.config';
import { AgentModule } from './modules/agent/agent.module';
import { SearchModule } from './modules/search/search.module';
import { MemoryModule } from './modules/memory/memory.module';
import { TripsModule } from './modules/trips/trips.module';
import { LlmModule } from './modules/llm/llm.module';
import { CacheModule } from './modules/cache/cache.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        return AppConfigSchema.parse(config);
      },
    }),
    TerminusModule,
    HttpModule,
    AgentModule,
    SearchModule,
    MemoryModule,
    TripsModule,
    LlmModule,
    CacheModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
