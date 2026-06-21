-- CreateTable
CREATE TABLE "macro_indicators" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "source_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "raw_payload" JSONB,
    "quality_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "invalid_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "macro_indicators_code_time_idx" ON "macro_indicators"("code", "time" DESC);

-- CreateIndex
CREATE INDEX "macro_indicators_source_id_time_idx" ON "macro_indicators"("source_id", "time" DESC);

-- CreateIndex
CREATE INDEX "macro_indicators_is_valid_time_idx" ON "macro_indicators"("is_valid", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "macro_indicators_source_id_code_time_key" ON "macro_indicators"("source_id", "code", "time");

-- AddForeignKey
ALTER TABLE "macro_indicators" ADD CONSTRAINT "macro_indicators_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
