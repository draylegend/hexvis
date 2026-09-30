import type { NamespaceDatabase, Surreal } from 'surrealdb';

/**
 * Opens the embedded SurrealKV store scoped to a database under the shared namespace.
 *
 * @param {string} namespace Namespace selected for this connection.
 * @param {string} database Database selected for this connection.
 * @param {string} url Storage URL, defaults to the workspace `data/` directory.
 * @returns {Surreal} Connected database.
 */
export const openDatabase = async (
  url = 'surrealkv://./data/hexvis',
  { namespace = 'hexvis', database = 'runtime' }: NamespaceDatabase = {},
): Promise<Surreal> => {
  // @surrealdb/node ships ESM only; dynamic import keeps the CJS electron bundle loadable.
  const { createNodeEngines } = await import('@surrealdb/node');
  const { Surreal } = await import('surrealdb');

  const db = new Surreal({ engines: createNodeEngines() });
  await db.connect(url, { namespace, database });
  return db;
};
