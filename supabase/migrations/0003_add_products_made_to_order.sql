ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "made_to_order" bigint NOT NULL DEFAULT 0;
