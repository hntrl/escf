import { integer, sqliteTableCreator, text } from "drizzle-orm/sqlite-core";

const sqliteTable = sqliteTableCreator((name) => `UserService_${name}`);

export const users = sqliteTable("users", {
  userId: text("userId").primaryKey(),
  createdAt: integer("createdAt").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
