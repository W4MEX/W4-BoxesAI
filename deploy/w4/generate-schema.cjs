const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { databaseConnection } = require('../../packages/server/api/dist/w4-database.cjs');

async function main() {
  if (process.env.AP_POSTGRES_DATABASE !== 'w4_mit') throw new Error('Schema generation requires the isolated w4_mit database');
  const db = databaseConnection();
  await db.initialize();
  try {
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(tables.length, 0, 'Schema generation requires an empty database');
    const sql = await db.driver.createSchemaBuilder().log();
    assert.ok(sql.upQueries.length > 0);
    for (const query of [...sql.upQueries, ...sql.downQueries]) assert.ok(!query.parameters?.length, 'Unexpected migration parameters');
    const up = "CREATE COLLATION en_natural (provider = icu, locale = 'en-u-kn-true');\n" + sql.upQueries.map(query => query.query + ';').join('\n');
    const down = [...sql.downQueries].reverse().map(query => query.query + ';').join('\n') + '\nDROP COLLATION en_natural;';
    const target = path.resolve('deploy/w4');
    await fs.writeFile(path.join(target, 'schema-initial.sql'), up + '\n');
    await fs.writeFile(path.join(target, 'schema-initial-down.sql'), down + '\n');
    await db.query(up);
    const drift = await db.driver.createSchemaBuilder().log();
    await fs.writeFile('/tmp/w4-schema-drift.json', JSON.stringify(drift, null, 2));
    assert.equal(drift.upQueries.length, 0, 'Initial schema differs from entity metadata');
    await db.query(down);
    const after = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(after.length, 0, 'Rollback left application tables behind');
    console.log(JSON.stringify({ entities: db.entityMetadatas.length, upStatements: sql.upQueries.length, downStatements: sql.downQueries.length, schemaDrift: 0, rollbackTables: 0 }));
  } finally { await db.destroy(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
