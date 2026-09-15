ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bot_paused_at" bigint;
ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "bot_paused_at" bigint;
