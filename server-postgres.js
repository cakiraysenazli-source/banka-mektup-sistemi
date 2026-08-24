import 'dotenv/config';
import { createServer } from 'node:http';
import {
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

import pool from './database.js';

const port = 3001;

const sessions = new Map();

const requiredFields = [
  'branch',
  'customerName',
  'letterScope',
  'tenderType',
  'recipient',
  'tenderName',
  'amount',
  'issueDate',
];

const MAX_AMOUNT_LIMIT = 100_000_000;

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  response.end(JSON.stringify(body));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Geçersiz JSON verisi.'));
      }
    });

    request.on('error', reject);
  });

const roleLabel = (role) =>
  ({
    BRANCH: 'Şube kullanıcısı',
    AUTHORIZED: 'Yetkili',
    ADMIN: 'Yönetici',
  })[role] || role;

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  fullName: user.full_name,
  role: user.role,
  roleLabel: roleLabel(user.role),
});

const verifyPassword = (password, storedValue) => {
  const [salt, savedHash] = storedValue.split(':');

  if (!salt || !savedHash) {
    return false;
  }

  const calculatedHash = scryptSync(password, salt, 64).toString('hex');

  const savedBuffer = Buffer.from(savedHash, 'hex');
  const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

  if (savedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return timingSafeEqual(savedBuffer, calculatedBuffer);
};

const getUser = (request) => {
  const token = request.headers.authorization?.replace('Bearer ', '');

  return token ? sessions.get(token) : null;
};

const requireUser = (request, response) => {
  const user = getUser(request);

  if (!user) {
    sendJson(response, 401, {
      message: 'Bu işlem için giriş yapmalısınız.',
    });
  }

  return user;
};

const validateLetter = (letter) => {
  const missing = requiredFields.filter(
    (field) => !String(letter[field] ?? '').trim()
  );

  if (missing.length) {
    return `Zorunlu alanlar eksik: ${missing.join(', ')}`;
  }

  if (Number(letter.amount) > MAX_AMOUNT_LIMIT) {
    return 'Mektup tutarı izin verilen üst limiti aşıyor.';
  }

  return '';
};

const mapLetter = (letter) => ({
  id: letter.id,
  branch: letter.branch,
  customerName: letter.customer_name,
  title: letter.title,
  letterScope: letter.letter_scope,
  letterLicense: letter.letter_license,
  tenderType: letter.tender_type,
  recipient: letter.recipient,
  tenderName: letter.tender_name,
  authorityName: letter.authority_name,
  authorityPhone: letter.authority_phone,
  authorityEmail: letter.authority_email,
  currency: letter.currency,
  amount: String(letter.amount),
  issueDate: String(letter.issue_date).slice(0, 10),
  expiryDate: letter.expiry_date
    ? String(letter.expiry_date).slice(0, 10)
    : '',
  referenceNo: letter.reference_no,
  projectNo: letter.project_no,
  address: letter.address,
  notes: letter.notes,
  status: letter.status,
  rejectionReason: letter.rejection_reason,
  createdAt: new Date(letter.created_at).toLocaleString('tr-TR'),
  createdBy: letter.created_by_name,
});

const values = (letter) => [
  letter.branch,
  letter.customerName,
  letter.title,
  letter.letterScope,
  letter.letterLicense,
  letter.tenderType,
  letter.recipient,
  letter.tenderName,
  letter.authorityName,
  letter.authorityPhone,
  letter.authorityEmail,
  letter.currency,
  letter.amount,
  letter.issueDate,
  letter.expiryDate || null,
  letter.referenceNo,
  letter.projectNo,
  letter.address,
  letter.notes,
];

const listLetters = async (user) => {
  const branchOnly = user.role === 'BRANCH';

  const query = `
    SELECT
      letters.*,
      users.full_name AS created_by_name
    FROM letters
    JOIN users ON users.id = letters.created_by
    ${branchOnly ? 'WHERE letters.created_by = $1' : ''}
    ORDER BY letters.created_at DESC
  `;

  const result = await pool.query(
    query,
    branchOnly ? [user.id] : []
  );

  return result.rows.map(mapLetter);
};

const server = createServer(async (request, response) => {
  try {
    /*
     * LOGIN
     */
    if (
      request.method === 'POST' &&
      request.url === '/api/auth/login'
    ) {
      const { username, password } = await readBody(request);

      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      const user = result.rows[0];

      if (
        !user ||
        !verifyPassword(password, user.password_hash)
      ) {
        return sendJson(response, 401, {
          message: 'Kullanıcı adı veya parola hatalı.',
        });
      }

      const token = randomUUID();

      sessions.set(token, publicUser(user));

      return sendJson(response, 200, {
        token,
        user: publicUser(user),
      });
    }

    /*
     * LOGOUT
     */
    if (
      request.method === 'POST' &&
      request.url === '/api/auth/logout'
    ) {
      const token =
        request.headers.authorization?.replace('Bearer ', '');

      if (token) {
        sessions.delete(token);
      }

      response.writeHead(204);
      return response.end();
    }

    /*
     * CURRENT USER
     */
    if (
      request.method === 'GET' &&
      request.url === '/api/auth/me'
    ) {
      const user = requireUser(request, response);

      if (!user) return;

      return sendJson(response, 200, {
        user,
      });
    }

    /*
     * LOGIN REQUIRED FOR ALL OTHER API ENDPOINTS
     */
    const user = requireUser(request, response);

    if (!user) return;

    /*
     * GET LETTERS
     */
    if (
      request.method === 'GET' &&
      request.url === '/api/letters'
    ) {
      return sendJson(
        response,
        200,
        await listLetters(user)
      );
    }

    /*
     * CREATE LETTER
     *
     * BRANCH ve ADMIN mektup oluşturabilir.
     *
     * Yeni kayıt doğrudan PENDING olur.
     */
    if (
      request.method === 'POST' &&
      request.url === '/api/letters'
    ) {
      if (!['BRANCH', 'ADMIN'].includes(user.role)) {
        return sendJson(response, 403, {
          message:
            'Bu işlem için yetkiniz bulunmuyor.',
        });
      }

      const letter = await readBody(request);

      const error = validateLetter(letter);

      if (error) {
        return sendJson(response, 400, {
          message: error,
        });
      }

      const query = `
        INSERT INTO letters (
          id,
          branch,
          customer_name,
          title,
          letter_scope,
          letter_license,
          tender_type,
          recipient,
          tender_name,
          authority_name,
          authority_phone,
          authority_email,
          currency,
          amount,
          issue_date,
          expiry_date,
          reference_no,
          project_no,
          address,
          notes,
          created_by,
          status
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,
          'PENDING'
        )
        RETURNING *
      `;

      const saved = await pool.query(
        query,
        [
          randomUUID(),
          ...values(letter),
          user.id,
        ]
      );

      return sendJson(response, 201, {
        ...mapLetter({
          ...saved.rows[0],
          created_by_name: user.fullName,
        }),
      });
    }

    /*
     * DELETE LETTER
     *
     * Sadece ADMIN silebilir.
     */
    const match = request.url.match(
      /^\/api\/letters\/([\w-]+)$/
    );

    if (
      match &&
      request.method === 'DELETE'
    ) {
      if (user.role !== 'ADMIN') {
        return sendJson(response, 403, {
          message:
            'Mektup silme yetkisi yalnızca yöneticidedir.',
        });
      }

      const deleted = await pool.query(
        'DELETE FROM letters WHERE id = $1 RETURNING id',
        [match[1]]
      );

      if (!deleted.rowCount) {
        return sendJson(response, 404, {
          message: 'Mektup bulunamadı.',
        });
      }

      response.writeHead(204);
      return response.end();
    }

    /*
     * UPDATE LETTER
     *
     * AUTHORIZED / ADMIN:
     * APPROVED veya REJECTED yapabilir.
     *
     * BRANCH:
     * Sadece kendi DRAFT kaydını düzenleyebilir.
     */
    if (
      match &&
      request.method === 'PATCH'
    ) {
      const found = await pool.query(
        'SELECT * FROM letters WHERE id = $1',
        [match[1]]
      );

      const letter = found.rows[0];

      if (!letter) {
        return sendJson(response, 404, {
          message: 'Mektup bulunamadı.',
        });
      }

      const payload = await readBody(request);

      /*
       * AUTHORIZED / ADMIN
       *
       * Sadece PENDING mektubu
       * onaylayabilir veya reddedebilir.
       */
      if (
        ['AUTHORIZED', 'ADMIN'].includes(user.role)
      ) {
        if (letter.status !== 'PENDING') {
          return sendJson(response, 400, {
            message:
              'Sadece onay bekleyen mektuplar üzerinde işlem yapılabilir.',
          });
        }

        if (
          !['APPROVED', 'REJECTED'].includes(
            payload.status
          )
        ) {
          return sendJson(response, 400, {
            message:
              'Yetkili yalnızca onay veya ret işlemi yapabilir.',
          });
        }

        if (
          payload.status === 'REJECTED' &&
          !payload.rejectionReason?.trim()
        ) {
          return sendJson(response, 400, {
            message:
              'Red işlemi için neden zorunludur.',
          });
        }

        const updated = await pool.query(
          `
            UPDATE letters
            SET
              status = $1,
              rejection_reason = $2,
              updated_at = NOW()
            WHERE id = $3
            RETURNING *
          `,
          [
            payload.status,
            payload.rejectionReason?.trim() || null,
            letter.id,
          ]
        );

        return sendJson(response, 200, {
          ...mapLetter({
            ...updated.rows[0],
            created_by_name: user.fullName,
          }),
        });
      }

      /*
       * BRANCH
       *
       * Branch kullanıcı sadece kendi DRAFT
       * kaydını düzenleyebilir.
       */
      if (
        user.role === 'BRANCH' &&
        letter.created_by === user.id &&
        letter.status === 'DRAFT'
      ) {
        const error = validateLetter(payload);

        if (error) {
          return sendJson(response, 400, {
            message: error,
          });
        }

        const query = `
          UPDATE letters
          SET
            branch = $1,
            customer_name = $2,
            title = $3,
            letter_scope = $4,
            letter_license = $5,
            tender_type = $6,
            recipient = $7,
            tender_name = $8,
            authority_name = $9,
            authority_phone = $10,
            authority_email = $11,
            currency = $12,
            amount = $13,
            issue_date = $14,
            expiry_date = $15,
            reference_no = $16,
            project_no = $17,
            address = $18,
            notes = $19,
            status = 'PENDING',
            updated_at = NOW()
          WHERE id = $20
          RETURNING *
        `;

        const updated = await pool.query(
          query,
          [...values(payload), letter.id]
        );

        return sendJson(response, 200, {
          ...mapLetter({
            ...updated.rows[0],
            created_by_name: user.fullName,
          }),
        });
      }

      return sendJson(response, 403, {
        message:
          'Bu kaydı güncelleme yetkiniz yok.',
      });
    }

    return sendJson(response, 404, {
      message:
        'İstenen API adresi bulunamadı.',
    });
  } catch (error) {
    console.error(error);

    return sendJson(response, 500, {
      message:
        'Sunucuda işlem sırasında hata oluştu.',
    });
  }
});

server.on('error', (error) => {
  console.error(
    'Kayıt servisi başlatılamadı:',
    error.message
  );
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `PostgreSQL kayıt servisi http://localhost:${port} adresinde çalışıyor.`
  );
});