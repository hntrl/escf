import {
  NoopLogger,
  RelationalSchemaConfig,
  TablesRelationalConfig,
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  sql,
} from "drizzle-orm";
import { DrizzleD1Database, SQLiteD1Session } from "drizzle-orm/d1";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";

export class DrizzleD1Storage<
  TSchema extends Record<string, unknown>
> extends DrizzleD1Database<TSchema> {
  constructor(binding: D1Database, tableSchema: TSchema) {
    // this init logic is just ripped from drizzle d1
    // https://github.com/drizzle-team/drizzle-orm/blob/3513d0a76f8a227a3f94673762ae73538fd849bc/drizzle-orm/src/d1/driver.ts#L32-L59
    const dialect = new SQLiteAsyncDialect();
    const logger = new NoopLogger();
    let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
    if (tableSchema) {
      const tablesConfig = extractTablesRelationalConfig(
        tableSchema,
        createTableRelationsHelpers
      );
      schema = {
        fullSchema: tableSchema,
        schema: tablesConfig.tables,
        tableNamesMap: tablesConfig.tableNamesMap,
      };
    }
    const session = new SQLiteD1Session(binding, dialect, schema, {
      logger,
    });
    super("async", dialect, session, schema);
  }

  async destroy() {
    const tableSchema = this._.schema;
    if (!tableSchema) throw new Error("No table schema defined");
    const tables = Object.values(tableSchema);
    await Promise.all(
      tables.map((table) => this.run(sql.raw(`DELETE FROM ${table.dbName};`)))
    );

    // : this would be preferable, but using drizzle's transactions in DO's makes cloudflare shit itself
    // : (todo) - create an issue
    // await this.transaction(async (tx) =>
    //   Promise.all(
    //     tables.map((table) => tx.run(sql.raw(`DELETE FROM ${table.dbName};`)))
    //   )
    // );
  }
}
