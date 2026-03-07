CREATE TABLE `resource_clicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceUrl` text NOT NULL,
	`resourceName` text NOT NULL,
	`category` varchar(50),
	`query` text,
	`sessionId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resource_clicks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `search_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`query` text NOT NULL,
	`translatedQuery` text,
	`language` varchar(10) NOT NULL DEFAULT 'en',
	`resultsFound` int NOT NULL DEFAULT 0,
	`topResultUrl` text,
	`topResultName` text,
	`sessionId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `search_analytics_id` PRIMARY KEY(`id`)
);
