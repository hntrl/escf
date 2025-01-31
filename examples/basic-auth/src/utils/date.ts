export type DurationUnit = "ms" | "s" | "m" | "h" | "d" | "w";

export class Duration {
  constructor(value: number, unit: DurationUnit) {
    this.value = value;
    this.unit = unit;
  }

  public value: number;
  public unit: DurationUnit;

  public milliseconds(): number {
    if (this.unit === "ms") {
      return this.value;
    }
    if (this.unit === "s") {
      return this.value * 1000;
    }
    if (this.unit === "m") {
      return this.value * 1000 * 60;
    }
    if (this.unit === "h") {
      return this.value * 1000 * 60 * 60;
    }
    if (this.unit === "d") {
      return this.value * 1000 * 60 * 60 * 24;
    }
    return this.value * 1000 * 60 * 60 * 24 * 7;
  }

  public seconds(): number {
    return this.milliseconds() / 1000;
  }

  public transform(x: number): Duration {
    return new Duration(Math.round(this.milliseconds() * x), "ms");
  }
}

export function isWithinDuration(
  ms: Date | number,
  duration: Duration
): boolean {
  if (typeof ms === "number") {
    return ms + duration.milliseconds() > Date.now();
  }
  return ms.getTime() + duration.milliseconds() > Date.now();
}
