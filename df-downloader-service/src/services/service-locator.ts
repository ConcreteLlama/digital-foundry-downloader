import { ConfigService, NullConfigService } from "../config/config-service.js";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _configService: ConfigService = new NullConfigService();
  private constructor() {}

  set configService(config: ConfigService) {
    this._configService = config;
  }
  get configService() {
    return this._configService;
  }

  get config() {
    return this._configService.getConfig();
  }
}

export const serviceLocator = ServiceLocator.instance;
