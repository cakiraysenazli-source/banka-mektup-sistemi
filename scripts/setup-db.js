import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../database.js';

const directory = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(join(directory, '..', 'db', 'schema.sql'), 'utf8');

try {
  await pool.query(schema);
  console.log('PostgreSQL tabloları hazırlandı.');
} finally {
  await pool.end();
}
