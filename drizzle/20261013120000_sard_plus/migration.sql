CREATE TABLE IF NOT EXISTS `SardBookmark` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`novelId` integer NOT NULL,
	`chapterId` integer NOT NULL,
	`novelName` text,
	`chapterName` text,
	`progress` real DEFAULT 0 NOT NULL,
	`excerpt` text,
	`note` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_bookmark_novel_idx` ON `SardBookmark` (`novelId`,`createdAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_bookmark_chapter_idx` ON `SardBookmark` (`chapterId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardVocab` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`word` text NOT NULL,
	`normalized` text NOT NULL,
	`sentence` text,
	`meaning` text,
	`novelId` integer,
	`novelName` text,
	`chapterId` integer,
	`box` integer DEFAULT 1 NOT NULL,
	`dueAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`reviewedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sard_vocab_normalized_unique` ON `SardVocab` (`normalized`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardNovelMeta` (
	`novelId` integer PRIMARY KEY NOT NULL,
	`status` text,
	`rating` integer,
	`note` text,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardTag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sard_tag_name_unique` ON `SardTag` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardNovelTag` (
	`novelId` integer NOT NULL,
	`tagId` integer NOT NULL,
	PRIMARY KEY(`novelId`, `tagId`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_novel_tag_tag_idx` ON `SardNovelTag` (`tagId`);
