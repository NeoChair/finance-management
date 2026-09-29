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
}

export function getPool(): Promise<sql.ConnectionPool> {
  if (!global.__ihsPool) {
    global.__ihsPool = new sql.ConnectionPool(config);
  }
  const pool = global.__ihsPool;
  return pool.connected ? Promise.resolve(pool) : pool.connect();
}

export { sql };
