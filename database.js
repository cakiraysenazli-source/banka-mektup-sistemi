import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL tanımlı değil. .env.example dosyasını .env olarak kopyalayıp bağlantı bilgisini girin.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default pool;
