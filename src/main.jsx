import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createRoot } from 'react-dom/client';

import './styles.css';

const emptyForm = {
  branch: '',
  customerName: '',
  title: '',
  letterScope: '',
  letterLicense: '',
  tenderType: '',
  recipient: '',
  tenderName: '',
  authorityName: '',
  authorityPhone: '',
  authorityEmail: '',
  currency: 'TRY',
  amount: '',
  issueDate: '',
  expiryDate: '',
  referenceNo: '',
  projectNo: '',
  address: '',
  notes: '',
};

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

const HIGH_AMOUNT_LIMIT = 10_000_000;
const MAX_AMOUNT_LIMIT = 100_000_000;
const DAYS_TO_EXPIRY_WARNING = 30;

const statusLabels = {
  DRAFT: 'Taslak',
  PENDING: 'Onay bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};

const zorunluAlanlariKontrolEt = (form) => {
  const errors = {};

  requiredFields.forEach((field) => {
    if (!String(form[field] ?? '').trim()) {
      errors[field] = 'Bu alan zorunludur.';
    }
  });

  return errors;
};

const gecerlilikTarihiniKontrolEt = (form) => {
  if (
    form.issueDate &&
    form.expiryDate &&
    form.expiryDate < form.issueDate
  ) {
    return 'Geçerlilik tarihi düzenleme tarihinden önce olamaz.';
  }

  return '';
};

const epostaKontrolEt = (email) => {
  if (!email) return '';

  return !/^\S+@\S+\.\S+$/.test(email)
    ? 'Geçerli bir e-posta adresi girin.'
    : '';
};

const maksimumTutariKontrolEt = (
  amount,
  currency
) => {
  if (Number(amount) > MAX_AMOUNT_LIMIT) {
    return `Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString(
      'tr-TR'
    )} ${currency} limitini aşamaz.`;
  }

  return '';
};

const sureliMektubuKontrolEt = (form) => {
  if (
    form.letterLicense === 'Süreli' &&
    !form.expiryDate
  ) {
    return 'Süreli mektup için geçerlilik tarihi zorunludur.';
  }

  return '';
};

const yuksekTutarUyarisi = (
  amount,
  currency
) => {
  if (
    Number(amount) >= HIGH_AMOUNT_LIMIT &&
    Number(amount) <= MAX_AMOUNT_LIMIT
  ) {
    return {
      type: 'warning',
      text: `Yüksek tutarlı mektup: ${HIGH_AMOUNT_LIMIT.toLocaleString(
        'tr-TR'
      )} ${currency} ve üzerindeki kayıtlar yetkili onayı gerektirir.`,
    };
  }

  return null;
};

const limitAsimiUyarisi = (
  amount,
  currency
) => {
  if (Number(amount) > MAX_AMOUNT_LIMIT) {
    return {
      type: 'error',
      text: `Limit aşıldı: Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString(
        'tr-TR'
      )} ${currency} üst sınırını geçemez.`,
    };
  }

  return null;
};

const kisaGecerlilikUyarisi = (form) => {
  if (!form.issueDate || !form.expiryDate) {
    return null;
  }

  const days = Math.ceil(
    (
      new Date(`${form.expiryDate}T00:00:00`) -
      new Date(`${form.issueDate}T00:00:00`)
    ) / 86_400_000
  );

  if (
    days >= 0 &&
    days <= DAYS_TO_EXPIRY_WARNING
  ) {
    return {
      type: 'warning',
      text: `Kısa geçerlilik süresi: Mektubun geçerliliği ${days} gün. Muhatap şartlarını kontrol edin.`,
    };
  }

  return null;
};

function App() {
  const [form, setForm] = useState(emptyForm);

  const [errors, setErrors] = useState({});

  const [letters, setLetters] = useState([]);

  const [notice, setNotice] = useState('');

  const [isSaving, setIsSaving] =
    useState(false);

  const [sessionToken, setSessionToken] =
    useState(() =>
      localStorage.getItem(
        'letterSessionToken'
      )
    );

  const [user, setUser] = useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [loginError, setLoginError] =
    useState('');

  const [loginData, setLoginData] =
    useState({
      username: '',
      password: '',
    });

  const today = useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  );

  const ruleAlerts = useMemo(
    () =>
      [
        limitAsimiUyarisi(
          form.amount,
          form.currency
        ),
        yuksekTutarUyarisi(
          form.amount,
          form.currency
        ),
        kisaGecerlilikUyarisi(form),
      ].filter(Boolean),
    [form]
  );

  const amountOverLimit = Boolean(
    maksimumTutariKontrolEt(
      form.amount,
      form.currency
    )
  );

  const apiFetch = (
    path,
    options = {}
  ) =>
    fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : {}),
      },
    });

  /*
   * Mevcut session'ı kontrol eder.
   */
  useEffect(() => {
    const restoreSession = async () => {
      if (!sessionToken) {
        setAuthLoading(false);
        return;
      }

      try {
        const response = await apiFetch(
          '/api/auth/me',
          {
            signal:
              AbortSignal.timeout(8000),
          }
        );

        if (!response.ok) {
          throw new Error();
        }

        const result =
          await response.json();

        setUser(result.user);
      } catch {
        localStorage.removeItem(
          'letterSessionToken'
        );

        setSessionToken(null);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, [sessionToken]);

  /*
   * Kullanıcı giriş yaptıktan sonra
   * mektupları backend'den getirir.
   */
  useEffect(() => {
    const loadLetters = async () => {
      if (!user) return;

      try {
        const response = await apiFetch(
          '/api/letters',
          {
            signal:
              AbortSignal.timeout(8000),
          }
        );

        if (!response.ok) {
          throw new Error();
        }

        setLetters(
          await response.json()
        );
      } catch {
        setNotice(
          'Kayıt servisine ulaşılamadı. Önce "npm run server" komutunu çalıştırın.'
        );
      }
    };

    loadLetters();
  }, [user]);

  const update = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((current) => ({
        ...current,
        [name]: '',
      }));
    }

    setNotice('');
  };

  const validate = () => {
    const nextErrors =
      zorunluAlanlariKontrolEt(form);

    const dateError =
      gecerlilikTarihiniKontrolEt(form);

    const emailError =
      epostaKontrolEt(
        form.authorityEmail
      );

    const amountError =
      maksimumTutariKontrolEt(
        form.amount,
        form.currency
      );

    const termError =
      sureliMektubuKontrolEt(form);

    if (dateError) {
      nextErrors.expiryDate =
        dateError;
    }

    if (emailError) {
      nextErrors.authorityEmail =
        emailError;
    }

    if (amountError) {
      nextErrors.amount =
        amountError;
    }

    if (termError) {
      nextErrors.expiryDate =
        termError;
    }

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors).length === 0
    );
  };

  /*
   * Yeni mektup kaydeder.
   *
   * Backend bu kaydı otomatik olarak
   * PENDING durumunda oluşturur.
   */
  const saveLetter = async (event) => {
    event.preventDefault();

    if (!validate()) {
      setNotice(
        'Lütfen işaretli alanları kontrol edin.'
      );

      return;
    }

    setIsSaving(true);

    try {
      const response = await apiFetch(
        '/api/letters',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          signal:
            AbortSignal.timeout(8000),
          body: JSON.stringify(form),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Kayıt yapılamadı.'
        );
      }

      setLetters((current) => [
        result,
        ...current,
      ]);

      setForm(emptyForm);

      setErrors({});

      setNotice(
        'Mektup başarıyla kaydedildi ve onay bekleyen kayıtlara gönderildi.'
      );
    } catch (error) {
      setNotice(
        error.name === 'TimeoutError'
          ? 'Kayıt servisi 8 saniye içinde yanıt vermedi. Backend servisinin açık olduğunu kontrol edin.'
          : error.message ||
              'Kayıt servisine ulaşılamadı.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const clearForm = () => {
    setForm(emptyForm);
    setErrors({});
    setNotice('Form temizlendi.');
  };

  /*
   * LOGIN
   */
  const login = async (event) => {
    event.preventDefault();

    setLoginError('');

    try {
      const response = await fetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(loginData),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Giriş yapılamadı.'
        );
      }

      localStorage.setItem(
        'letterSessionToken',
        result.token
      );

      setSessionToken(result.token);

      setUser(result.user);
    } catch (error) {
      setLoginError(
        error.message ||
          'Giriş yapılamadı.'
      );
    }
  };

  /*
   * LOGOUT
   */
  const logout = async () => {
    try {
      await apiFetch(
        '/api/auth/logout',
        {
          method: 'POST',
        }
      );
    } catch {
      // Logout sırasında backend kapalı olsa bile
      // local session temizlenir.
    }

    localStorage.removeItem(
      'letterSessionToken'
    );

    setSessionToken(null);
    setUser(null);
    setLetters([]);
  };

  /*
   * ONAY / RET
   */
  const updateStatus = async (
    letter,
    status
  ) => {
    let rejectionReason = '';

    if (status === 'REJECTED') {
      rejectionReason =
        window.prompt(
          'Red nedenini girin:'
        )?.trim() || '';

      if (!rejectionReason) {
        setNotice(
          'Red işlemi için bir neden girmeniz gerekir.'
        );

        return;
      }
    }

    try {
      const response = await apiFetch(
        `/api/letters/${letter.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            status,
            rejectionReason,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Durum güncellenemedi.'
        );
      }

      setLetters((current) =>
        current.map((item) =>
          item.id === result.id
            ? result
            : item
        )
      );

      setNotice(
        status === 'APPROVED'
          ? 'Mektup başarıyla onaylandı.'
          : 'Mektup reddedildi.'
      );
    } catch (error) {
      setNotice(
        error.message ||
          'Durum güncellenemedi.'
      );
    }
  };

  /*
   * DELETE
   */
  const deleteLetter = async (
    letter
  ) => {
    const confirmed =
      window.confirm(
        `${letter.customerName} kaydını silmek istediğinize emin misiniz?`
      );

    if (!confirmed) return;

    try {
      const response =
        await apiFetch(
          `/api/letters/${letter.id}`,
          {
            method: 'DELETE',
          }
        );

      if (!response.ok) {
        const result =
          await response.json();

        throw new Error(
          result.message ||
            'Kayıt silinemedi.'
        );
      }

      setLetters((current) =>
        current.filter(
          (item) =>
            item.id !== letter.id
        )
      );

      setNotice(
        'Mektup kaydı silindi.'
      );
    } catch (error) {
      setNotice(
        error.message ||
          'Kayıt silinemedi.'
      );
    }
  };

  const canCreate =
    user &&
    ['BRANCH', 'ADMIN'].includes(
      user.role
    );

  const canReview =
    user &&
    ['AUTHORIZED', 'ADMIN'].includes(
      user.role
    );

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="loading-card">
          <div className="loading-spinner" />
          <p>
            Oturum kontrol ediliyor…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        loginData={loginData}
        setLoginData={setLoginData}
        login={login}
        loginError={loginError}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          B
        </div>

        <div>
          <p className="eyebrow">
            KURUMSAL BANKACILIK
          </p>

          <h1>
            Mektup Giriş İşlemleri
          </h1>
        </div>

        <div className="user-chip">
          <span className="user-dot">
            {user.fullName.charAt(0)}
          </span>

          <span>
            {user.fullName} ·{' '}
            {user.roleLabel}
          </span>

          <button
            type="button"
            className="logout-button"
            onClick={logout}
          >
            Çıkış
          </button>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow blue">
              MEKTUP YÖNETİMİ
            </p>

            <h2>
              {canCreate
                ? 'Mektup bilgilerini oluşturun'
                : 'Mektupları inceleyin'}
            </h2>

            <p className="intro-description">
              {canCreate
                ? 'Yeni mektup kaydı oluşturun. Kaydedilen mektuplar onay bekleyen kayıtlara gönderilir.'
                : 'Onay bekleyen mektupları inceleyebilir, onaylayabilir veya reddedebilirsiniz.'}
            </p>
          </div>

          <div className="secure-badge">
            ✓ Güvenli işlem ekranı
          </div>
        </section>

        {canCreate && (
          <form
            onSubmit={saveLetter}
            noValidate
          >
            <section className="form-card">
              {ruleAlerts.length > 0 && (
                <div
                  className="rule-alerts"
                  aria-live="polite"
                >
                  {ruleAlerts.map(
                    (alert, index) => (
                      <div
                        className={`rule-alert ${alert.type}`}
                        key={`${alert.type}-${index}`}
                      >
                        <span>
                          {alert.type ===
                          'info'
                            ? 'i'
                            : '!'}
                        </span>

                        {alert.text}
                      </div>
                    )
                  )}
                </div>
              )}

              <FormSection
                title="Müşteri ve işlem bilgileri"
                subtitle="Mektubu talep eden müşteri ve şube detayları"
              >
                <Field
                  label="İşlem şubesi"
                  name="branch"
                  value={form.branch}
                  onChange={update}
                  error={errors.branch}
                  required
                >
                  <select
                    name="branch"
                    value={form.branch}
                    onChange={update}
                  >
                    <option value="">
                      Şube seçin
                    </option>
                    <option>
                      İstanbul Merkez Şubesi
                    </option>
                    <option>
                      Ankara Kurumsal Şubesi
                    </option>
                    <option>
                      İzmir Ticari Şubesi
                    </option>
                    <option>
                      Bursa Organize Sanayi
                      Şubesi
                    </option>
                  </select>
                </Field>

                <Field
                  label="Müşteri ad soyad / ticari unvan"
                  name="customerName"
                  value={
                    form.customerName
                  }
                  onChange={update}
                  error={
                    errors.customerName
                  }
                  required
                  placeholder="Örn. Aydın Yapı San. ve Tic. A.Ş."
                />

                <Field
                  label="Müşteri unvanı"
                  name="title"
                  value={form.title}
                  onChange={update}
                  placeholder="Örn. Genel Müdür"
                />

                <Field
                  label="Müşteri referans numarası"
                  name="referenceNo"
                  value={
                    form.referenceNo
                  }
                  onChange={update}
                  placeholder="Örn. 1234567890"
                />
              </FormSection>

              <FormSection
                title="Mektup ve ihale bilgileri"
                subtitle="Mektubun kullanım amacı ile ihale detayları"
              >
                <Field
                  label="Mektup kapsamı"
                  name="letterScope"
                  value={
                    form.letterScope
                  }
                  onChange={update}
                  error={
                    errors.letterScope
                  }
                  required
                >
                  <select
                    name="letterScope"
                    value={
                      form.letterScope
                    }
                    onChange={update}
                  >
                    <option value="">
                      Kapsam seçin
                    </option>
                    <option>
                      Geçici teminat mektubu
                    </option>
                    <option>
                      Kesin teminat mektubu
                    </option>
                    <option>
                      Avans teminat mektubu
                    </option>
                    <option>
                      Gümrük teminat mektubu
                    </option>
                    <option>
                      Referans mektubu
                    </option>
                  </select>
                </Field>

                <Field
                  label="Mektup lisansı / türü"
                  name="letterLicense"
                  value={
                    form.letterLicense
                  }
                  onChange={update}
                >
                  <select
                    name="letterLicense"
                    value={
                      form.letterLicense
                    }
                    onChange={update}
                  >
                    <option value="">
                      Seçin
                    </option>
                    <option>
                      Süreli
                    </option>
                    <option>
                      Süresiz
                    </option>
                    <option>
                      Kontrgarantili
                    </option>
                  </select>
                </Field>

                <Field
                  label="İhale tipi"
                  name="tenderType"
                  value={
                    form.tenderType
                  }
                  onChange={update}
                  error={
                    errors.tenderType
                  }
                  required
                >
                  <select
                    name="tenderType"
                    value={
                      form.tenderType
                    }
                    onChange={update}
                  >
                    <option value="">
                      İhale tipi seçin
                    </option>
                    <option>
                      Açık ihale
                    </option>
                    <option>
                      Pazarlık usulü
                    </option>
                    <option>
                      Doğrudan temin
                    </option>
                    <option>
                      Özel sektör ihalesi
                    </option>
                  </select>
                </Field>

                <Field
                  label="İhalenin adı"
                  name="tenderName"
                  value={
                    form.tenderName
                  }
                  onChange={update}
                  error={
                    errors.tenderName
                  }
                  required
                  placeholder="İhale / proje adı"
                />

                <Field
                  label="Muhatabın adı"
                  name="recipient"
                  value={
                    form.recipient
                  }
                  onChange={update}
                  error={
                    errors.recipient
                  }
                  required
                  placeholder="Kurum veya şirket adı"
                />

                <Field
                  label="Proje / ihale numarası"
                  name="projectNo"
                  value={
                    form.projectNo
                  }
                  onChange={update}
                  placeholder="Varsa girin"
                />
              </FormSection>

              <FormSection
                title="Tutar ve geçerlilik"
                subtitle="Mektubun parasal ve tarih bilgileri"
              >
                <Field
                  label="Mektup tutarı"
                  name="amount"
                  value={form.amount}
                  onChange={update}
                  error={errors.amount}
                  required
                  type="number"
                  min="0"
                  placeholder="Örn. 15000000"
                  inputClassName={
                    amountOverLimit
                      ? 'input-danger'
                      : ''
                  }
                />

                <Field
                  label="Para birimi"
                  name="currency"
                  value={
                    form.currency
                  }
                  onChange={update}
                >
                  <select
                    name="currency"
                    value={
                      form.currency
                    }
                    onChange={update}
                  >
                    <option>TRY</option>
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                  </select>
                </Field>

                <Field
                  label="Düzenleme tarihi"
                  name="issueDate"
                  value={
                    form.issueDate
                  }
                  onChange={update}
                  error={
                    errors.issueDate
                  }
                  required
                  type="date"
                  max={today}
                />

                <Field
                  label="Geçerlilik tarihi"
                  name="expiryDate"
                  value={
                    form.expiryDate
                  }
                  onChange={update}
                  error={
                    errors.expiryDate
                  }
                  type="date"
                  min={
                    form.issueDate ||
                    today
                  }
                />
              </FormSection>

              <FormSection
                title="Yetkili ve ek bilgiler"
                subtitle="İletişim, adres ve kayıt notları"
              >
                <Field
                  label="Yetkili adı soyadı"
                  name="authorityName"
                  value={
                    form.authorityName
                  }
                  onChange={update}
                  placeholder="Talep yetkilisi"
                />

                <Field
                  label="Yetkili telefon"
                  name="authorityPhone"
                  value={
                    form.authorityPhone
                  }
                  onChange={update}
                  type="tel"
                  placeholder="05XX XXX XX XX"
                />

                <Field
                  label="Yetkili e-posta"
                  name="authorityEmail"
                  value={
                    form.authorityEmail
                  }
                  onChange={update}
                  error={
                    errors.authorityEmail
                  }
                  type="email"
                  placeholder="ornek@firma.com"
                />

                <Field
                  label="Muhatap adresi"
                  name="address"
                  value={form.address}
                  onChange={update}
                  className="span-2"
                  placeholder="Açık adres (varsa)"
                />

                <Field
                  label="Açıklama / özel not"
                  name="notes"
                  value={form.notes}
                  onChange={update}
                  className="span-2"
                >
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={update}
                    rows="3"
                    placeholder="Mektup için ek notlarınızı girin"
                  />
                </Field>
              </FormSection>
            </section>

            {notice && (
              <p
                className={
                  Object.keys(errors)
                    .length
                    ? 'notice warning'
                    : 'notice'
                }
                aria-live="polite"
              >
                {notice}
              </p>
            )}

            <div className="actions">
              <button
                type="button"
                className="button secondary"
                onClick={clearForm}
                disabled={isSaving}
              >
                Temizle
              </button>

              <button
                type="submit"
                className="button primary"
                disabled={isSaving}
              >
                {isSaving
                  ? 'Kaydediliyor…'
                  : 'Kaydet ve Onaya Gönder'}

                {!isSaving && (
                  <span>→</span>
                )}
              </button>
            </div>
          </form>
        )}

        {!canCreate && canReview && (
          <section className="role-message">
            <div className="role-message-icon">
              ✓
            </div>

            <div>
              <h2>
                Onay ve inceleme ekranı
              </h2>

              <p>
                Aşağıdaki listeden onay
                bekleyen mektupları
                inceleyebilir, onaylayabilir
                veya reddedebilirsiniz.
              </p>
            </div>
          </section>
        )}

        <section className="list-card">
          <div className="list-heading">
            <div>
              <p className="eyebrow blue">
                KAYIT LİSTESİ
              </p>

              <h2>
                Kaydedilen mektuplar
              </h2>
            </div>

            <span className="count">
              {letters.length} kayıt
            </span>
          </div>

          {letters.length === 0 ? (
            <div className="empty-state">
              <div>▤</div>

              <h3>
                Henüz kayıt bulunmuyor
              </h3>

              <p>
                Mektup kaydı
                oluşturulduğunda burada
                görüntülenecektir.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      Referans
                    </th>

                    <th>
                      Müşteri
                    </th>

                    <th>
                      Mektup kapsamı
                    </th>

                    <th>
                      Muhatap
                    </th>

                    <th>
                      Tutar
                    </th>

                    <th>
                      Durum
                    </th>

                    {canReview && (
                      <th>
                        İşlem
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {letters.map(
                    (letter) => (
                      <tr
                        key={letter.id}
                      >
                        <td>
                          {letter.referenceNo ||
                            '—'}
                        </td>

                        <td>
                          <strong>
                            {
                              letter.customerName
                            }
                          </strong>

                          <small>
                            {letter.branch}
                          </small>
                        </td>

                        <td>
                          {
                            letter.letterScope
                          }

                          <small>
                            {
                              letter.tenderName
                            }
                          </small>
                        </td>

                        <td>
                          {
                            letter.recipient
                          }
                        </td>

                        <td>
                          {Number(
                            letter.amount
                          ).toLocaleString(
                            'tr-TR',
                            {
                              minimumFractionDigits: 2,
                            }
                          )}{' '}
                          {
                            letter.currency
                          }
                        </td>

                        <td>
                          <span
                            className={`status status-${letter.status.toLowerCase()}`}
                          >
                            {
                              statusLabels[
                                letter.status
                              ] ||
                              letter.status
                            }
                          </span>

                          {letter.status ===
                            'REJECTED' &&
                            letter.rejectionReason && (
                              <small className="rejection-reason">
                                Red nedeni:{' '}
                                {
                                  letter.rejectionReason
                                }
                              </small>
                            )}
                        </td>

                        {canReview && (
                          <td>
                            <div className="review-actions">
                              {letter.status ===
                                'PENDING' && (
                                <>
                                  <button
                                    type="button"
                                    className="approve-button"
                                    onClick={() =>
                                      updateStatus(
                                        letter,
                                        'APPROVED'
                                      )
                                    }
                                  >
                                    Onayla
                                  </button>

                                  <button
                                    type="button"
                                    className="reject-button"
                                    onClick={() =>
                                      updateStatus(
                                        letter,
                                        'REJECTED'
                                      )
                                    }
                                  >
                                    Reddet
                                  </button>
                                </>
                              )}

                              {user.role ===
                                'ADMIN' && (
                                <button
                                  type="button"
                                  className="delete-button"
                                  onClick={() =>
                                    deleteLetter(
                                      letter
                                    )
                                  }
                                >
                                  Sil
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function FormSection({
  title,
  subtitle,
  children,
}) {
  return (
    <div className="form-section">
      <div className="section-title">
        <h3>{title}</h3>

        <p>{subtitle}</p>
      </div>

      <div className="fields">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  required,
  type = 'text',
  placeholder,
  children,
  className = '',
  inputClassName = '',
  ...props
}) {
  return (
    <label
      className={`field ${className}`}
    >
      <span>
        {label}

        {required && (
          <b> *</b>
        )}
      </span>

      {children || (
        <input
          className={inputClassName}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          {...props}
        />
      )}

      {error && (
        <em>{error}</em>
      )}
    </label>
  );
}

function LoginScreen({
  loginData,
  setLoginData,
  login,
  loginError,
}) {
  const updateLogin = (
    event
  ) => {
    setLoginData(
      (current) => ({
        ...current,
        [event.target.name]:
          event.target.value,
      })
    );
  };

  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={login}
      >
        <div className="login-brand">
          B
        </div>

        <p className="eyebrow blue">
          BANKA MEKTUP YÖNETİMİ
        </p>

        <h1>
          Giriş yapın
        </h1>

        <p className="login-description">
          Rolünüze uygun işlem ekranına
          erişmek için kullanıcı
          bilgilerinizle giriş yapın.
        </p>

        <label>
          Kullanıcı adı

          <input
            name="username"
            value={
              loginData.username
            }
            onChange={updateLogin}
            autoComplete="username"
            placeholder="Kullanıcı adınız"
            required
          />
        </label>

        <label>
          Parola

          <input
            name="password"
            type="password"
            value={
              loginData.password
            }
            onChange={updateLogin}
            autoComplete="current-password"
            placeholder="Parolanız"
            required
          />
        </label>

        {loginError && (
          <p className="login-error">
            {loginError}
          </p>
        )}

        <button
          className="button primary login-button"
          type="submit"
        >
          Giriş yap
          <span>→</span>
        </button>

        <p className="login-security">
          🔒 Güvenli oturum doğrulaması
        </p>
      </form>
    </main>
  );
}

createRoot(
  document.getElementById('root')
).render(
  <App />
);