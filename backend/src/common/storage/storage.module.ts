import { Global, Module } from "@nestjs/common";
import { MagicBytesValidator } from "../security/magic-bytes.service";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [StorageService, MagicBytesValidator],
  exports: [StorageService, MagicBytesValidator],
})
export class StorageModule {}
