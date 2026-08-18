import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const dataFile = join(directory, 'data', 'letters.json');
const port = 3001;

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const getLetters = async () => {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const saveLetters = async (letters) => {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(letters, null, 2), 'utf8');
};

const readBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Geçersiz JSON verisi.')); }
  });
  request.on('error', reject);
});

const required = ['branch', 'customerName', 'letterScope', 'tenderType', 'recipient', 'tenderName', 'amount', 'issueDate'];
const validateLetter = (letter) => {
  const missing = required.filter((field) => !String(letter[field] ?? '').trim());
  if (missing.length) return `Zorunlu alanlar eksik: ${missing.join(', ')}`;
  if (Number(letter.amount) > 100_000_000) return 'Mektup tutarı izin verilen üst limiti aşıyor.';
  return '';
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/letters') {
      return sendJson(response, 200, await getLetters());
    }

    if (request.method === 'POST' && request.url === '/api/letters') {
      const letter = await readBody(request);
      const validationError = validateLetter(letter);
      if (validationError) return sendJson(response, 400, { message: validationError });

      const savedLetter = { ...letter, id: randomUUID(), createdAt: new Date().toLocaleString('tr-TR') };
      const letters = await getLetters();
      letters.unshift(savedLetter);
      await saveLetters(letters);
      return sendJson(response, 201, savedLetter);
    }

    return sendJson(response, 404, { message: 'İstenen API adresi bulunamadı.' });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { message: 'Sunucuda kayıt işlemi sırasında hata oluştu.' });
  }
});

server.on('error', (error) => {
  console.error('Kayıt servisi başlatılamadı:', error.message);
});

server.listen(port, '127.0.0.1', () => console.log(`Mektup kayıt servisi http://localhost:${port} adresinde çalışıyor.`));
