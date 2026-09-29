import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER!,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

declare global {
  var __ihsPool: sql.ConnectionPool | undefined;
  var __ihsPoolSql: typeof sql | undefined;
}

export function getPool(): Promise<sql.ConnectionPool> {
  // The pool lives on `global` to survive dev hot reloads, but a reload can also load a fresh copy
  // of mssql. Its type objects (sql.VarChar, ...) don't work with a pool built by the old copy
  // ("parameter.type.validate is not a function"), so rebuild the pool when the copy changes.
  if (!global.__ihsPool || global.__ihsPoolSql !== sql) {
    global.__ihsPool?.close().catch(() => {});
    global.__ihsPool = new sql.ConnectionPool(config);
    global.__ihsPoolSql = sql;
  }
  const pool = global.__ihsPool;
  return pool.connected ? Promise.resolve(pool) : pool.connect();
}

export { sql };
