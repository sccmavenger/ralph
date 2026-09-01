-- Give each AI remediation action a measurable definition of success and review point.
ALTER TABLE "AiActionItem"
ADD COLUMN "successMeasure" TEXT,
ADD COLUMN "baselineValue" DOUBLE PRECISION,
ADD COLUMN "targetValue" DOUBLE PRECISION,
ADD COLUMN "resultValue" DOUBLE PRECISION,
ADD COLUMN "metricUnit" TEXT,
ADD COLUMN "reviewAt" TIMESTAMP(3);
