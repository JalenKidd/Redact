import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const spaces = sqliteTable("sync_spaces", {
  id: text("id").primaryKey(),
  payload: text("payload"),
  version: integer("version").notNull().default(0),
  activityPayload: text("activity_payload"),
  activityVersion: integer("activity_version").notNull().default(0),
});

export const devices = sqliteTable("sync_devices", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, table => [index("sync_devices_space").on(table.spaceId)]);

export const invitations = sqliteTable("sync_invitations", {
  tokenHash: text("token_hash").primaryKey(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  expires: integer("expires").notNull(),
  consumed: integer("consumed").notNull().default(0),
});

export const limits = sqliteTable("sync_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expires: integer("expires").notNull(),
});
