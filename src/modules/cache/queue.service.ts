import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private registeredHandlers = new Map<string, (data: any) => Promise<any>>();

  constructor(private readonly configService: ConfigService) {
    this.logger.log("Queue running in synchronous in-memory mode.");
  }

  registerJobHandler(name: string, handler: (data: any) => Promise<any>) {
    this.registeredHandlers.set(name, handler);
    this.logger.log(`Registered job handler for: ${name}`);
  }

  async addJob<T>(name: string, data: T): Promise<string> {
    const handler = this.registeredHandlers.get(name);
    if (handler) {
      handler(data).catch((err) => {
        this.logger.error(`Job [${name}] failed: ${err.message}`);
      });
      return "sync-executed";
    }
    throw new Error(`No handler registered for job type: ${name}`);
  }
}
