import { prisma } from "@/lib/prisma";

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  return flag?.enabled ?? false;
}
