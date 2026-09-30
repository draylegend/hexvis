import { createNodeEngines } from '@surrealdb/node';
import { Surreal } from 'surrealdb';

const db = new Surreal({ engines: createNodeEngines() });

await db.connect('surrealkv://./data/hexvis', { namespace: 'hexvis', database: 'runtime' });

export default db;
