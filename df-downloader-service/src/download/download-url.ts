export type UrlResolverOpts = {
  resolveOnRetry?: boolean;
  resolveOnResume?: boolean;
};
export type UrlResolverFn = () => Promise<string | undefined>;

export type DownloadUrlOpt = string | UrlResolverFn;

export type ResolveUrlMode = "initial" | "retry" | "resume";

type UrlResolverOptsInternal = {
  resolveInitial: boolean;
} & UrlResolverOpts;

export class DownloadUrl {
  resolvedUrl: string | undefined;
  constructor(private url: DownloadUrlOpt, private resolverOpts: UrlResolverOptsInternal, initialResolvedUrl?: string) {
    this.resolvedUrl = initialResolvedUrl;
  }
  async resolve(mode: ResolveUrlMode): Promise<string> {
    if (typeof this.url === "string") {
      this.resolvedUrl = this.url;
    } else if (mode === "initial" && this.resolverOpts.resolveInitial) {
      this.resolvedUrl = await this.url();
    } else if (mode === "retry" && this.resolverOpts?.resolveOnRetry) {
      this.resolvedUrl = await this.url();
    } else if (mode === "resume" && this.resolverOpts?.resolveOnResume) {
      this.resolvedUrl = await this.url();
    }
    if (!this.resolvedUrl) {
      throw new Error("Failed to resolve URL");
    }
    return this.resolvedUrl;
  }
  clone(updatedOpts: Partial<UrlResolverOptsInternal> = {}): DownloadUrl {
    return new DownloadUrl(
      this.url,
      {
        ...(this.resolverOpts || {}),
        ...updatedOpts,
      },
      this.resolvedUrl
    );
  }
}
