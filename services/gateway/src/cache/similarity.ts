export function cosineSimilarity(left: readonly number[], right: readonly number[]): number | undefined {
  if (left.length === 0 || left.length !== right.length) {
    return undefined;
  }

  let dotProduct = 0;
  let leftNormSquared = 0;
  let rightNormSquared = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;

    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return undefined;
    }

    dotProduct += leftValue * rightValue;
    leftNormSquared += leftValue * leftValue;
    rightNormSquared += rightValue * rightValue;
  }

  if (leftNormSquared === 0 || rightNormSquared === 0) {
    return undefined;
  }

  return dotProduct / (Math.sqrt(leftNormSquared) * Math.sqrt(rightNormSquared));
}

export function meetsSimilarityThreshold(
  left: readonly number[],
  right: readonly number[],
  threshold: number
): boolean {
  const similarity = cosineSimilarity(left, right);
  return similarity !== undefined && similarity >= threshold;
}
