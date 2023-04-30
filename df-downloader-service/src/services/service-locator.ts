import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _subtitleGenerator?: SubtitleGenerator;

  set subtitleGenerator(subtitleGenerator: SubtitleGenerator | undefined) {
    this._subtitleGenerator = subtitleGenerator;
  }

  get subtitleGenerator() {
    return this._subtitleGenerator;
  }
}

export const serviceLocator = ServiceLocator.instance;
