// ==========================================================
// POSTGRESQL DATABASE BAĞLANTISI
// ==========================================================
// Bu dosya, backend ile PostgreSQL database'i arasında
// bağlantı kurulmasını sağlar.
//
// DATABASE bağlantı bilgileri .env dosyasındaki
// DATABASE_URL değişkeninden alınır.
// Oluşturulan "pool" nesnesi, projenin farklı yerlerinden
// PostgreSQL'e SQL sorguları göndermek için kullanılır.
// ==========================================================

import 'dotenv/config';

// PostgreSQL ile bağlantı kurmak için pg paketindeki
// Pool sınıfını kullanıyoruz.
import { Pool } from 'pg';


// ==========================================================
// DATABASE_URL KONTROLÜ
// ==========================================================

// .env dosyasında DATABASE_URL tanımlı mı kontrol edilir.
// Tanımlı değilse uygulamanın database'e bağlanamayacağı
// için hata verilir.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL tanımlı değil. .env.example dosyasını .env olarak kopyalayıp bağlantı bilgisini girin.'
  );
}


// ==========================================================
// POSTGRESQL CONNECTION POOL
// ==========================================================

// .env dosyasındaki DATABASE_URL kullanılarak
// PostgreSQL bağlantı havuzu (connection pool) oluşturulur.
//
// Pool sayesinde her SQL sorgusunda yeniden bağlantı
// kurmak yerine mevcut database bağlantıları kullanılabilir.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


// Bu pool nesnesini diğer backend dosyalarının da
// kullanabilmesi için dışarı aktarırız.
//
// Örneğin server-postgres.js:
// import pool from './database.js';
//
// şeklinde bu bağlantıyı kullanabilir.
export default pool;