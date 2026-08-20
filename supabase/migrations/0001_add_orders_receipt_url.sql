ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "receipt_url" text;
