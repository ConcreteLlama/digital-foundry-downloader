export class DownloadConnectionProgressInfo {
  private _bytesDownloaded: number = 0;
  totalBytes: number = -1;
  private _startTime: Date = new Date();
  maxSampleAge: number = 1000 * 3;
  samples: {
    bytes: number;
    time: number;
  }[] = [];

  get bytesDownloaded() {
    return this._bytesDownloaded;
  }

  get startTime() {
    return this._startTime;
  }

  reset(totalBytes?: number) {
    this.samples = [];
    this._bytesDownloaded = 0;
    this.totalBytes = totalBytes || this.totalBytes;
    this._startTime = new Date();
  }

  addBytesDownloaded(bytes: number) {
    this._bytesDownloaded += bytes;
    this.samples.push({
      bytes: this.bytesDownloaded,
      time: Date.now(),
    });
    let firstValidIndex = 0;
    const now = Date.now();
    for (let i = 0; i < this.samples.length; i++) {
      if (now - this.samples[i].time < this.maxSampleAge) {
        firstValidIndex = i;
        break;
      }
    }
  }

  getBytesPerSecond() {
    if (this.samples.length < 1) {
      return 0;
    }
    const now = Date.now();
    const firstSample = this.samples.find((s) => now - s.time < this.maxSampleAge);
    if (!firstSample) {
      return 0;
    }
    const lastSample = this.samples[this.samples.length - 1];
    const timeDiff = (lastSample.time - firstSample.time) / 1000 || 1;
    const bytesDiff = lastSample.bytes - firstSample.bytes;
    return bytesDiff / timeDiff;
  }
}
