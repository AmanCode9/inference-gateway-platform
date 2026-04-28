import { describe, expect, it } from "vitest";
import { cosineSimilarity, meetsSimilarityThreshold } from "../../src/cache/similarity.js";

describe("cosineSimilarity", () => {
  it("returns one for identical finite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns low similarity for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("rejects dimension mismatch, zero vectors, and invalid values", () => {
    expect(cosineSimilarity([1], [1, 2])).toBeUndefined();
    expect(cosineSimilarity([0, 0], [1, 0])).toBeUndefined();
    expect(cosineSimilarity([Number.NaN], [1])).toBeUndefined();
    expect(cosineSimilarity([Number.POSITIVE_INFINITY], [1])).toBeUndefined();
  });
});

describe("meetsSimilarityThreshold", () => {
  it("requires similarity greater than or equal to the configured threshold", () => {
    expect(meetsSimilarityThreshold([1, 0], [1, 0], 1)).toBe(true);
    expect(meetsSimilarityThreshold([1, 0], [0, 1], 0.97)).toBe(false);
  });
});
