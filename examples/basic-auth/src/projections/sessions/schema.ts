import { relations } from "drizzle-orm";
import { integer, sqliteTableCreator, text } from "drizzle-orm/sqlite-core";

const sqliteTable = sqliteTableCreator((name) => `SessionService_${name}`);

export const sessions = sqliteTable("sessions", {
  sessionId: text("sessionId").primaryKey(),
  userId: text("userId").notNull(),
  expiresAt: integer("expiresAt").notNull(),
});

export const users = sqliteTable("users", {
  userId: text("userId").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));
