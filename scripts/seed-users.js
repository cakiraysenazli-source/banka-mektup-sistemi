import 'dotenv/config';
import { randomUUID, scryptSync } from 'node:crypto';
import pool from '../database.js';

const hashPassword = (password) => {
  const salt = randomUUID();
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

// Eğitim amaçlı örnek hesaplar. Gerçek bir projede bu parolaları paylaşmayın.
const users = [
  { username: 'sube.kullanici', password: 'Sube123!', fullName: 'Ayşe Şube Kullanıcısı', role: 'BRANCH' },
  { username: 'yetkili', password: 'Yetkili123!', fullName: 'Mehmet Yetkili', role: 'AUTHORIZED' },
  { username: 'yonetici', password: 'Yonetici123!', fullName: 'Deniz Yönetici', role: 'ADMIN' }
];

try {
  for (const user of users) {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
    if (existing.rowCount) continue;
    await pool.query(
      'INSERT INTO users (id, username, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), user.username, hashPassword(user.password), user.fullName, user.role]
    );
  }
  console.log('Örnek kullanıcılar eklendi.');
} finally {
  await pool.end();
}
