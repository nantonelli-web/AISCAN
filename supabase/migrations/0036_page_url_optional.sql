-- =====================================================================
-- MAIT — Make page_url optional on mait_competitors
-- =====================================================================
-- The platform was born Meta-only and `page_url` was the Facebook
-- page link of the brand — required because the Meta scraper used
-- it. Now that AISCAN is multi-channel a brand can be tracked
-- entirely on Instagram / TikTok / YouTube / SERP without ever
-- needing a Facebook page. Drop the NOT NULL.
--
-- Existing rows already have page_url populated — no backfill or
-- default needed. New brands without a Facebook URL just save NULL
-- and the Meta scan path refuses with a clear error message.
-- =====================================================================

alter table mait_competitors
  alter column page_url drop not null;
