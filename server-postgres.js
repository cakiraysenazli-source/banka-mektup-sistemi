// Frontend ile PostgreSQL arasındaki iletişimi yöneten backend/API sunucusu.
// Kullanıcı girişlerini, yetkilendirmeyi, mektup işlemlerini ve onay/ret süreçlerini yönetir.

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

  const calculatedHash = scryptSync(
    password,
    salt,
    64
  ).toString('hex');

  const savedBuffer = Buffer.from(
    savedHash,
    'hex'
  );

  const calculatedBuffer = Buffer.from(
    calculatedHash,
    'hex'
  );

  if (
    savedBuffer.length !==
    calculatedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    savedBuffer,
    calculatedBuffer
  );
};

const getUser = (request) => {
  const token =
    request.headers.authorization?.replace(
      'Bearer ',
      ''
    );

  return token ? sessions.get(token) : null;
};

const requireUser = (request, response) => {
  const user = getUser(request);

  if (!user) {
    sendJson(response, 401, {
      message:
        'Bu işlem için giriş yapmalısınız.',
    });
  }

  return user;
};

/*
 * Normal mektup için zorunlu alan kontrolü.
 * PENDING olarak gönderilecek kayıtlarda kullanılır.
 */
const validateLetter = (letter) => {
  const missing = requiredFields.filter(
    (field) =>
      !String(letter[field] ?? '').trim()
  );

  if (missing.length) {
    return `Zorunlu alanlar eksik: ${missing.join(
      ', '
    )}`;
  }

  if (
    Number(letter.amount) >
    MAX_AMOUNT_LIMIT
  ) {
    return 'Mektup tutarı izin verilen üst limiti aşıyor.';
  }

  if (
    letter.expiryDate &&
    letter.issueDate &&
    letter.expiryDate <
      letter.issueDate
  ) {
    return 'Geçerlilik tarihi düzenleme tarihinden önce olamaz.';
  }

  return '';
};

/*
 * Taslak için tüm alanların doldurulması
 * zorunlu değildir.
 *
 * Ancak girilmiş bir tutar varsa üst limit
 * yine kontrol edilir.
 */
const validateDraft = (letter) => {
  if (
    letter.amount &&
    Number(letter.amount) >
      MAX_AMOUNT_LIMIT
  ) {
    return 'Mektup tutarı izin verilen üst limiti aşıyor.';
  }

  if (
    letter.expiryDate &&
    letter.issueDate &&
    letter.expiryDate <
      letter.issueDate
  ) {
    return 'Geçerlilik tarihi düzenleme tarihinden önce olamaz.';
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
  amount:
    letter.amount !== null &&
    letter.amount !== undefined
      ? String(letter.amount)
      : '',
  issueDate: letter.issue_date
    ? String(letter.issue_date).slice(0, 10)
    : '',
  expiryDate: letter.expiry_date
    ? String(letter.expiry_date).slice(0, 10)
    : '',
  referenceNo: letter.reference_no,
  projectNo: letter.project_no,
  address: letter.address,
  notes: letter.notes,
  status: letter.status,

  approvedBy:
    letter.approved_by_name || '',

  approvedAt:
    letter.approved_at || '',

  rejectedBy:
    letter.rejected_by_name || '',

  rejectedAt:
    letter.rejected_at || '',

rejectionReason:
  letter.rejection_reason,
  createdAt: letter.created_at
    ? new Date(
        letter.created_at
      ).toLocaleString('tr-TR')
    : '',
  createdBy:
    letter.created_by_name || '',
});

const values = (letter) => [
  letter.branch || null,
  letter.customerName || null,
  letter.title || null,
  letter.letterScope || null,
  letter.letterLicense || null,
  letter.tenderType || null,
  letter.recipient || null,
  letter.tenderName || null,
  letter.authorityName || null,
  letter.authorityPhone || null,
  letter.authorityEmail || null,
  letter.currency || 'TRY',
  letter.amount || null,
  letter.issueDate || null,
  letter.expiryDate || null,
  letter.referenceNo || null,
  letter.projectNo || null,
  letter.address || null,
  letter.notes || null,
];

const listLetters = async (user) => {
  const branchOnly =
    user.role === 'BRANCH';

  //Aşağıda SELECT ile başlayan gerçek SQL sorgusu. 
  //Letters tablosundaki mektupları getir. Ayrıca bu mektubu oluşturan kullanıcının adını users tablosundan getir.
  const query = `
    SELECT
      letters.*,

      creator.full_name AS created_by_name,
      approver.full_name AS approved_by_name,
      rejector.full_name AS rejected_by_name

    FROM letters

    JOIN users AS creator
      ON creator.id = letters.created_by

    LEFT JOIN users AS approver
      ON approver.id = letters.approved_by

    LEFT JOIN users AS rejector
      ON rejector.id = letters.rejected_by

    ${
      branchOnly
        ? 'WHERE letters.created_by = $1'
        : ''
    }

    ORDER BY letters.created_at DESC
  `;
  // pool.query() ile sorguyu çalıştır ve sonuçları al
  const result = await pool.query(
    query,
    branchOnly ? [user.id] : []
  );
  // Sonuçları react'ın anlayacağı şekilde döndür. Dönüşümü mapLetter() yapıyor.
  return result.rows.map(mapLetter);
};

const server = createServer(
  async (request, response) => {
    try {
      /*
       * =========================
       * LOGIN
       * =========================
       */

      if (
        request.method === 'POST' &&
        request.url ===
          '/api/auth/login'
      ) {
        const {
          username,
          password,
        } = await readBody(request);

        const result =
          await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
          );

        const user = result.rows[0];

        if (
          !user ||
          !verifyPassword(
            password,
            user.password_hash
          )
        ) {
          return sendJson(
            response,
            401,
            {
              message:
                'Kullanıcı adı veya parola hatalı.',
            }
          );
        }

        const token = randomUUID();

        sessions.set(
          token,
          publicUser(user)
        );

        return sendJson(
          response,
          200,
          {
            token,
            user: publicUser(user),
          }
        );
      }

      /*
       * =========================
       * LOGOUT
       * =========================
       */

      if (
        request.method === 'POST' &&
        request.url ===
          '/api/auth/logout'
      ) {
        const token =
          request.headers.authorization?.replace(
            'Bearer ',
            ''
          );

        if (token) {
          sessions.delete(token);
        }

        response.writeHead(204);
        return response.end();
      }

      /*
       * =========================
       * CURRENT USER
       * =========================
       */

      if (
        request.method === 'GET' &&
        request.url ===
          '/api/auth/me'
      ) {
        const user = requireUser(
          request,
          response
        );

        if (!user) return;

        return sendJson(
          response,
          200,
          {
            user,
          }
        );
      }

      /*
       * Diğer bütün API işlemleri
       * giriş gerektirir.
       */

      const user = requireUser(
        request,
        response
      );

      if (!user) return;

      /*
       * =========================
       * GET LETTERS
       * =========================
       */
      ///api/letters istendi. listLetters() fonksiyonunu çalıştırayım
      if (
        request.method === 'GET' &&
        request.url ===
          '/api/letters'
      ) {
        return sendJson(
          response,
          200,
          await listLetters(user)
        );
      }

      /*
       * =========================
       * CREATE LETTER
       * =========================
       *
       * BRANCH ve ADMIN oluşturabilir.
       *
       * status:
       * DRAFT   -> Taslak Kaydet
       * PENDING -> Onaya Gönder
       */

      if (
        request.method === 'POST' &&
        request.url ===
          '/api/letters'
      ) {
        if (
          !['BRANCH', 'ADMIN'].includes(
            user.role
          )
        ) {
          return sendJson(
            response,
            403,
            {
              message:
                'Bu işlem için yetkiniz bulunmuyor.',
            }
          );
        }

        const letter =
          await readBody(request);

        const requestedStatus =
          letter.status === 'DRAFT'
            ? 'DRAFT'
            : 'PENDING';

        /*
         * Taslakta eksik alanlara izin ver.
         */
        const error =
          requestedStatus === 'DRAFT'
            ? validateDraft(letter)
            : validateLetter(letter);

        if (error) {
          return sendJson(
            response,
            400,
            {
              message: error,
            }
          );
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
            $21,$22
          )
          RETURNING *
        `;

        const saved =
          await pool.query(
            query,
            [
              randomUUID(),
              ...values(letter),
              user.id,
              requestedStatus,
            ]
          );

        return sendJson(
          response,
          201,
          mapLetter({
            ...saved.rows[0],
            created_by_name:
              user.fullName,
          })
        );
      }

      /*
       * =========================
       * LETTER ID
       * =========================
       */

      const match =
        request.url.match(
          /^\/api\/letters\/([\w-]+)$/
        );

      /*
       * =========================
       * DELETE LETTER
       * =========================
       *
       * Sadece ADMIN silebilir.
       */

      if (
        match &&
        request.method === 'DELETE'
      ) {
        if (
          user.role !== 'ADMIN'
        ) {
          return sendJson(
            response,
            403,
            {
              message:
                'Mektup silme yetkisi yalnızca yöneticidedir.',
            }
          );
        }

        const deleted =
          await pool.query(
            `
              DELETE FROM letters
              WHERE id = $1
              RETURNING id
            `,
            [match[1]]
          );

        if (!deleted.rowCount) {
          return sendJson(
            response,
            404,
            {
              message:
                'Mektup bulunamadı.',
            }
          );
        }

        response.writeHead(204);
        return response.end();
      }

      /*
       * =========================
       * UPDATE LETTER
       * =========================
       *
       * AUTHORIZED / ADMIN:
       * PENDING -> APPROVED
       * PENDING -> REJECTED
       *
       * BRANCH:
       * Kendi DRAFT kaydını düzenler.
       * Düzenleyip gönderdiğinde:
       * DRAFT -> PENDING
       */

      if (
        match &&
        request.method === 'PATCH'
      ) {
        const found =
          await pool.query(
            `
              SELECT *
              FROM letters
              WHERE id = $1
            `,
            [match[1]]
          );

        const letter =
          found.rows[0];

        if (!letter) {
          return sendJson(
            response,
            404,
            {
              message:
                'Mektup bulunamadı.',
            }
          );
        }

        const payload =
          await readBody(request);

/*
 * =========================
 * AUTHORIZED / ADMIN
 * =========================
 */

if (
  ['AUTHORIZED', 'ADMIN'].includes(
    user.role
  )
) {
  if (
    letter.status !== 'PENDING'
  ) {
    return sendJson(
      response,
      400,
      {
        message:
          'Sadece onay bekleyen mektuplar üzerinde işlem yapılabilir.',
      }
    );
  }

  if (
    !['APPROVED', 'REJECTED'].includes(
      payload.status
    )
  ) {
    return sendJson(
      response,
      400,
      {
        message:
          'Yetkili veya yönetici yalnızca onay veya ret işlemi yapabilir.',
      }
    );
  }

  if (
    payload.status === 'REJECTED' &&
    !payload.rejectionReason?.trim()
  ) {
    return sendJson(
      response,
      400,
      {
        message:
          'Red işlemi için neden zorunludur.',
      }
    );
  }

  let updated;

  if (
    payload.status === 'APPROVED'
  ) {
    updated = await pool.query(
      `
        UPDATE letters
        SET
          status = 'APPROVED',
          approved_by = $1,
          approved_at = NOW(),
          rejected_by = NULL,
          rejected_at = NULL,
          rejection_reason = NULL,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [
        user.id,
        letter.id,
      ]
    );
  } else {
    updated = await pool.query(
      `
        UPDATE letters
        SET
          status = 'REJECTED',
          rejection_reason = $1,
          rejected_by = $2,
          rejected_at = NOW(),
          approved_by = NULL,
          approved_at = NULL,
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `,
      [
        payload.rejectionReason.trim(),
        user.id,
        letter.id,
      ]
    );
  }

  return sendJson(
    response,
    200,
    mapLetter({
      ...updated.rows[0],
      created_by_name:
        letter.created_by_name || '',
    })
  );
}

/*
 * =========================
 * BRANCH - DRAFT EDIT
 * =========================
 */

        if (
          user.role === 'BRANCH' &&
          letter.created_by ===
            user.id &&
          letter.status === 'DRAFT'
        ) {
          const error =
            validateLetter(payload);

          if (error) {
            return sendJson(
              response,
              400,
              {
                message: error,
              }
            );
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
              rejection_reason = NULL,
              updated_at = NOW()
            WHERE id = $20
            RETURNING *
          `;

          const updated =
            await pool.query(
              query,
              [
                ...values(payload),
                letter.id,
              ]
            );

          return sendJson(
            response,
            200,
            mapLetter({
              ...updated.rows[0],
              created_by_name:
                user.fullName,
            })
          );
        }

        return sendJson(
          response,
          403,
          {
            message:
              'Bu kaydı güncelleme yetkiniz yok.',
          }
        );
      }

      return sendJson(
        response,
        404,
        {
          message:
            'İstenen API adresi bulunamadı.',
        }
      );
    } catch (error) {
      console.error(error);

      return sendJson(
        response,
        500,
        {
          message:
            'Sunucuda işlem sırasında hata oluştu.',
        }
      );
    }
  }
);

server.on(
  'error',
  (error) => {
    console.error(
      'Kayıt servisi başlatılamadı:',
      error.message
    );
  }
);

server.listen(
  port,
  '127.0.0.1',
  () => {
    console.log(
      `PostgreSQL kayıt servisi http://localhost:${port} adresinde çalışıyor.`
    );
  }
);