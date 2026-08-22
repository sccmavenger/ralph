export interface ChurnRiskInput {
  lastLoginAt: Date | null;
  stripeCurrentPeriodEnd: Date | null;
  recentUsageCount: number;
  priorUsageCount: number;
  recentLoginDays: number;
  priorLoginDays: number;
  paymentFailures: number;
}

export function calculateChurnRisk(input: ChurnRiskInput, now = new Date()): number {
  let score = 0;
  if (!input.lastLoginAt) score += 30;
  else {
    const days = Math.floor((now.getTime() - input.lastLoginAt.getTime()) / 86_400_000);
    if (days >= 7) score += 30;
    else if (days >= 5) score += 20;
    else if (days >= 3) score += 10;
  }
  if (input.priorLoginDays > 0) {
    const drop = 1 - input.recentLoginDays / input.priorLoginDays;
    if (drop >= 0.75) score += 20;
    else if (drop >= 0.5) score += 10;
  }
  if (input.priorUsageCount > 0) {
    const drop = 1 - input.recentUsageCount / input.priorUsageCount;
    if (drop >= 0.75) score += 20;
    else if (drop >= 0.5) score += 10;
  }
  if (input.stripeCurrentPeriodEnd) {
    const days = Math.floor((input.stripeCurrentPeriodEnd.getTime() - now.getTime()) / 86_400_000);
    if (days <= 7) score += 20;
    else if (days <= 13) score += 10;
  }
  if (input.paymentFailures >= 2) score += 10;
  else if (input.paymentFailures === 1) score += 5;
  return Math.min(score, 100);
}
