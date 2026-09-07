// ==========================================================
// DATABASE KURULUM SCRIPTİ
// ==========================================================
// Bu dosya, db/schema.sql dosyasındaki SQL komutlarını okuyarak
// PostgreSQL database'indeki tabloları oluşturur.
// Örneğin users ve letters tablolarının hazırlanmasını sağlar.
//
// Bu script genellikle database ilk kurulurken çalıştırılır.
// ==========================================================

import 'dotenv/config';

// schema.sql dosyasını okuyabilmek için kullanılır.
import { readFile } from 'node:fs/promises';

// Dosya yollarını oluşturmak için kullanılır.
import { dirname, join } from 'node:path';

// Mevcut JavaScript dosyasının bulunduğu klasörün yolunu
// bulmak için kullanılır.
import { fileURLToPath } from 'node:url';

// PostgreSQL bağlantısını database.js üzerinden alır.
import pool from '../database.js';


// ==========================================================
// SCHEMA DOSYASININ YOLUNU BUL
// ==========================================================

// Bu dosyanın bulunduğu klasörün yolunu bulur.
const directory = dirname(
  fileURLToPath(import.meta.url)
);

// db/schema.sql dosyasını okuyup içeriğini "schema" değişkenine
// aktarır.
const schema = await readFile(
  join(
    directory,
    '..',
    'db',
    'schema.sql'
  ),
  'utf8'
);


// ==========================================================
// SQL KOMUTLARINI POSTGRESQL'DE ÇALIŞTIR
// ==========================================================

try {
  // schema.sql içerisindeki CREATE TABLE vb. SQL komutlarını
  // PostgreSQL'e gönderir ve çalıştırır.
  await pool.query(schema);

  console.log(
    'PostgreSQL tabloları hazırlandı.'
  );

} finally {

  // İşlem tamamlandıktan sonra PostgreSQL bağlantısını kapatır.
  await pool.end();
}