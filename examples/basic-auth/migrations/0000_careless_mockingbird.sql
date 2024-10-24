CREATE TABLE `SessionService_sessions` (
	`sessionId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `SessionService_users` (
	`userId` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `UserService_users` (
	`userId` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerificationToken` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `UserService_users_email_unique` ON `UserService_users` (`email`);