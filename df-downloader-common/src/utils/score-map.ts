export class ScoreMap {
  scoredItems: { [key: string]: number };

  constructor(stringArray: string[]) {
    this.scoredItems = {};
    stringArray.forEach((key, index, array) => {
      this.scoredItems[key.toLowerCase()] = array.length + 1 - index;
    });
  }

  getScore(toScore: string) {
    return this.scoredItems[toScore.toLowerCase()] || 0;
  }

  compare(a: string, b: string) {
    return this.getScore(b) - this.getScore(a);
  }

  sortList<T>(list: T[], scoreParmGetter: (item: T) => string) {
    return list.sort((a, b) => {
      const aScoreParm = scoreParmGetter(a);
      const bScoreParm = scoreParmGetter(b);
      return this.compare(aScoreParm, bScoreParm);
    });
  }

  getTopScoredItem<T>(list: T[], scoreParmGetter: (item: T) => string) {
    return list.length === 0 ? undefined : this.sortList(list, scoreParmGetter)[0];
  }

  toArray() {
    return Object.entries(this.scoredItems)
      .sort(([, a], [, b]) => b - a)
      .map(([val]) => val);
  }
}
