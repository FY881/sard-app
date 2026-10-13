CREATE TABLE IF NOT EXISTS `SardHighlight` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`novelId` integer NOT NULL,
	`chapterId` integer NOT NULL,
	`novelName` text,
	`novelCover` text,
	`pluginId` text,
	`novelPath` text,
	`chapterName` text,
	`chapterPath` text,
	`text` text NOT NULL,
	`note` text,
	`color` text DEFAULT 'yellow' NOT NULL,
	`startOffset` integer NOT NULL,
	`endOffset` integer NOT NULL,
	`prefix` text,
	`suffix` text,
	`orphaned` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_highlight_chapter_idx` ON `SardHighlight` (`chapterId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_highlight_novel_idx` ON `SardHighlight` (`novelId`,`createdAt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SardReadingDay` (
	`day` text NOT NULL,
	`novelId` integer NOT NULL,
	`timeSpent` integer DEFAULT 0 NOT NULL,
	`chaptersRead` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer,
	PRIMARY KEY(`day`, `novelId`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sard_reading_day_day_idx` ON `SardReadingDay` (`day`);--> statement-breakpoint
INSERT OR IGNORE INTO `SardReadingDay` (`day`, `novelId`, `timeSpent`, `chaptersRead`)
SELECT date(`readTime`), `novelId`, SUM(COALESCE(`timeSpent`, 0)), SUM(CASE WHEN `unread` = 0 THEN 1 ELSE 0 END)
FROM `Chapter`
WHERE `readTime` IS NOT NULL AND date(`readTime`) IS NOT NULL
GROUP BY date(`readTime`), `novelId`;
