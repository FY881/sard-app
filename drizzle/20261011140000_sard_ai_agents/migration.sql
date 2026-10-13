CREATE TABLE IF NOT EXISTS `SardAiCache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`novelId` integer NOT NULL,
	`kind` text NOT NULL,
	`cacheKey` text NOT NULL,
	`content` text NOT NULL,
	`upToOrder` integer,
	`model` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sard_ai_cache_unique` ON `SardAiCache` (`novelId`,`kind`,`cacheKey`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardGlossaryEntry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`novelId` integer NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`category` text DEFAULT 'term' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	`firstSeenOrder` integer DEFAULT 0 NOT NULL,
	`firstSeenChapterName` text,
	`lastSeenOrder` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sard_glossary_novel_name_unique` ON `SardGlossaryEntry` (`novelId`,`normalizedName`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardNovelAgent` (
	`novelId` integer PRIMARY KEY NOT NULL,
	`autoDownload` integer DEFAULT false NOT NULL,
	`autoDownloadCount` integer DEFAULT 5 NOT NULL,
	`wifiOnly` integer DEFAULT true NOT NULL,
	`lastRunAt` integer,
	`lastQueuedCount` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardAgentLog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`novelId` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_agent_log_created_idx` ON `SardAgentLog` (`createdAt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardChatMessage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`payload` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_chat_thread_idx` ON `SardChatMessage` (`thread`,`createdAt`);
