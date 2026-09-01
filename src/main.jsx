import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createRoot } from 'react-dom/client';

import './styles.css';


// ============================================================
// FORM BAŞLANGIÇ DEĞERLERİ
// ============================================================

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


// ============================================================
// ZORUNLU ALANLAR
// ============================================================

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


// ============================================================
// İŞ KURALLARI
// ============================================================

const HIGH_AMOUNT_LIMIT = 10_000_000;
const MAX_AMOUNT_LIMIT = 100_000_000;
const DAYS_TO_EXPIRY_WARNING = 30;


// ============================================================
// DURUM ETİKETLERİ
// ============================================================

const statusLabels = {
  DRAFT: 'Taslak',
  PENDING: 'Onay bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};


// ============================================================
// ZORUNLU ALAN KONTROLÜ
// ============================================================

const zorunluAlanlariKontrolEt = (form) => {
  const errors = {};

  requiredFields.forEach((field) => {
    if (!String(form[field] ?? '').trim()) {
      errors[field] = 'Bu alan zorunludur.';
    }
  });

  return errors;
};


// ============================================================
// TARİH KONTROLÜ
// ============================================================

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


// ============================================================
// E-POSTA KONTROLÜ
// ============================================================

const epostaKontrolEt = (email) => {
  if (!email) {
    return '';
  }

  return !/^\S+@\S+\.\S+$/.test(email)
    ? 'Geçerli bir e-posta adresi girin.'
    : '';
};


// ============================================================
// MAKSİMUM TUTAR KONTROLÜ
// ============================================================

const maksimumTutariKontrolEt = (
  amount,
  currency
) => {
  if (
    amount !== '' &&
    Number(amount) > MAX_AMOUNT_LIMIT
  ) {
    return `Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString(
      'tr-TR'
    )} ${currency} limitini aşamaz.`;
  }

  return '';
};


// ============================================================
// SÜRELİ MEKTUP KONTROLÜ
// ============================================================

const sureliMektubuKontrolEt = (form) => {
  if (
    form.letterLicense === 'Süreli' &&
    !form.expiryDate
  ) {
    return 'Süreli mektup için geçerlilik tarihi zorunludur.';
  }

  return '';
};


// ============================================================
// YÜKSEK TUTAR UYARISI
// ============================================================

const yuksekTutarUyarisi = (
  amount,
  currency
) => {
  if (
    amount !== '' &&
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


// ============================================================
// LİMİT AŞIMI UYARISI
// ============================================================

const limitAsimiUyarisi = (
  amount,
  currency
) => {
  if (
    amount !== '' &&
    Number(amount) > MAX_AMOUNT_LIMIT
  ) {
    return {
      type: 'error',
      text: `Limit aşıldı: Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString(
        'tr-TR'
      )} ${currency} üst sınırını geçemez.`,
    };
  }

  return null;
};


// ============================================================
// KISA GEÇERLİLİK UYARISI
// ============================================================

const kisaGecerlilikUyarisi = (form) => {
  if (
    !form.issueDate ||
    !form.expiryDate
  ) {
    return null;
  }

  const issueDate = new Date(
    `${form.issueDate}T00:00:00`
  );

  const expiryDate = new Date(
    `${form.expiryDate}T00:00:00`
  );

  if (
    Number.isNaN(issueDate.getTime()) ||
    Number.isNaN(expiryDate.getTime())
  ) {
    return null;
  }

  const days = Math.ceil(
    (expiryDate - issueDate) /
      86_400_000
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


// ============================================================
// ANA APP
// ============================================================

function App() {
  const [form, setForm] = useState({
    ...emptyForm,
  });

  const [
    editingDraftId,
    setEditingDraftId,
  ] = useState(null);

  const [errors, setErrors] = useState({});

  const [letters, setLetters] = useState([]);

  const [notice, setNotice] = useState('');

  const [isSaving, setIsSaving] =
    useState(false);


  // ==========================================================
  // LOGIN / SESSION
  // ==========================================================

  const [sessionToken, setSessionToken] =
    useState(() =>
      localStorage.getItem(
        'letterSessionToken'
      )
    );

  const [user, setUser] =
    useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [loginError, setLoginError] =
    useState('');

  const [isLoggingIn, setIsLoggingIn] =
    useState(false);

  const [loginData, setLoginData] =
    useState({
      username: '',
      password: '',
    });


  // ==========================================================
  // BUGÜN
  // ==========================================================

  const today = useMemo(
    () =>
      new Date()
        .toISOString()
        .slice(0, 10),
    []
  );


  // ==========================================================
  // KURAL UYARILARI
  // ==========================================================

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


  // ==========================================================
  // TUTAR LİMİT KONTROLÜ
  // ==========================================================

  const amountOverLimit = Boolean(
    maksimumTutariKontrolEt(
      form.amount,
      form.currency
    )
  );


  // ==========================================================
  // API REQUEST HELPER
  // ==========================================================

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
              Authorization:
                `Bearer ${sessionToken}`,
            }
          : {}),
      },
    });


  // ==========================================================
  // SESSION KONTROLÜ
  // ==========================================================

  useEffect(() => {
    const restoreSession = async () => {
      if (!sessionToken) {
        setUser(null);
        setLetters([]);
        setAuthLoading(false);

        return;
      }

      setAuthLoading(true);

      try {
        const response =
          await apiFetch(
            '/api/auth/me',
            {
              signal:
                AbortSignal.timeout(
                  8000
                ),
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
        setUser(null);
        setLetters([]);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, [sessionToken]);


  // ==========================================================
  // MEKTUPLARI ÇEK
  // ==========================================================

  useEffect(() => {
    const loadLetters = async () => {
      if (!user) {
        setLetters([]);
        return;
      }

      try {
        const response =
          await apiFetch(
            '/api/letters',
            {
              signal:
                AbortSignal.timeout(
                  8000
                ),
            }
          );

        if (!response.ok) {
          throw new Error();
        }

        const result =
          await response.json();

        setLetters(
          Array.isArray(result)
            ? result
            : []
        );
      } catch {
        setNotice(
          'Kayıt servisine ulaşılamadı. Önce "npm run server" komutunu çalıştırın.'
        );
      }
    };

    loadLetters();
  }, [user]);


  // ==========================================================
  // FORM UPDATE
  // ==========================================================

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


  // ==========================================================
  // VALIDATION
  // ==========================================================

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
      Object.keys(nextErrors)
        .length === 0
    );
  };


  // ==========================================================
  // TASLAK VALIDATION
  // ==========================================================

  const validateDraft = () => {
    const nextErrors = {};

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

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors)
        .length === 0
    );
  };


  // ==========================================================
  // MEKTUP KAYDET
  // ==========================================================

  const saveLetter = async (
    event,
    status = 'PENDING'
  ) => {
    if (event) {
      event.preventDefault();
    }

    if (
      status === 'PENDING' &&
      !validate()
    ) {
      setNotice(
        'Lütfen işaretli alanları kontrol edin.'
      );

      return;
    }

    if (
      status === 'DRAFT' &&
      !validateDraft()
    ) {
      setNotice(
        'Lütfen işaretli alanları kontrol edin.'
      );

      return;
    }

    setIsSaving(true);
    setNotice('');

    try {

      // ======================================================
      // TASLAĞI ONAYA GÖNDER
      // ======================================================

      if (
        editingDraftId &&
        status === 'PENDING'
      ) {
        const response =
          await apiFetch(
            `/api/letters/${editingDraftId}`,
            {
              method: 'PATCH',

              headers: {
                'Content-Type':
                  'application/json',
              },

              signal:
                AbortSignal.timeout(
                  8000
                ),

              body: JSON.stringify({
                ...form,
                status: 'PENDING',
              }),
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              'Taslak onaya gönderilemedi.'
          );
        }

        setLetters((current) =>
          current.map((item) =>
            item.id === result.id
              ? result
              : item
          )
        );

        setForm({
          ...emptyForm,
        });

        setEditingDraftId(null);

        setErrors({});

        setNotice(
          'Taslak başarıyla güncellendi ve onaya gönderildi.'
        );

        return;
      }


      // ======================================================
      // YENİ MEKTUP
      // ======================================================

      const response =
        await apiFetch(
          '/api/letters',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            signal:
              AbortSignal.timeout(
                8000
              ),

            body: JSON.stringify({
              ...form,
              status,
            }),
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

      setForm({
        ...emptyForm,
      });

      setEditingDraftId(null);

      setErrors({});

      if (status === 'DRAFT') {
        setNotice(
          'Mektup taslak olarak kaydedildi. Daha sonra düzenleyip onaya gönderebilirsiniz.'
        );
      } else {
        setNotice(
          'Mektup başarıyla kaydedildi ve onay bekleyen kayıtlara gönderildi.'
        );
      }

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


  // ==========================================================
  // FORM TEMİZLE
  // ==========================================================

  const clearForm = () => {
    setForm({
      ...emptyForm,
    });

    setEditingDraftId(null);

    setErrors({});

    setNotice(
      'Form temizlendi.'
    );
  };


  // ==========================================================
  // TARİH FORMATLAMA
  // ==========================================================

  const formatDateForInput = (
    date
  ) => {
    if (!date) {
      return '';
    }

    const parsedDate =
      new Date(date);

    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {
      return '';
    }

    return parsedDate
      .toISOString()
      .slice(0, 10);
  };


  // ==========================================================
  // TASLAK DÜZENLE
  // ==========================================================

  const editDraft = (letter) => {
    setForm({
      branch:
        letter.branch || '',

      customerName:
        letter.customerName || '',

      title:
        letter.title || '',

      letterScope:
        letter.letterScope || '',

      letterLicense:
        letter.letterLicense || '',

      tenderType:
        letter.tenderType || '',

      recipient:
        letter.recipient || '',

      tenderName:
        letter.tenderName || '',

      authorityName:
        letter.authorityName || '',

      authorityPhone:
        letter.authorityPhone || '',

      authorityEmail:
        letter.authorityEmail || '',

      currency:
        letter.currency || 'TRY',

      amount:
        letter.amount ?? '',

      issueDate:
        formatDateForInput(
          letter.issueDate
        ),

      expiryDate:
        formatDateForInput(
          letter.expiryDate
        ),

      referenceNo:
        letter.referenceNo || '',

      projectNo:
        letter.projectNo || '',

      address:
        letter.address || '',

      notes:
        letter.notes || '',
    });

    setEditingDraftId(
      letter.id
    );

    setErrors({});

    setNotice(
      'Taslak düzenleme modunda. Değişikliklerinizi yaptıktan sonra "Onaya Gönder" butonuna basabilirsiniz.'
    );

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };


  // ==========================================================
  // LOGIN
  // ==========================================================

  const login = async (event) => {
    event.preventDefault();

    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response =
        await fetch(
          '/api/auth/login',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              loginData
            ),
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

      setSessionToken(
        result.token
      );

      setUser(result.user);

      setLoginData({
        username: '',
        password: '',
      });

    } catch (error) {

      setLoginError(
        error.message ||
          'Giriş yapılamadı.'
      );

    } finally {
      setIsLoggingIn(false);
    }
  };


  // ==========================================================
  // LOGOUT
  // ==========================================================

  const logout = async () => {
    try {
      await apiFetch(
        '/api/auth/logout',
        {
          method: 'POST',
        }
      );
    } catch {
      // Frontend yine temizlenir.
    }

    localStorage.removeItem(
      'letterSessionToken'
    );

    setSessionToken(null);

    setUser(null);

    setLetters([]);

    setForm({
      ...emptyForm,
    });

    setEditingDraftId(null);

    setErrors({});

    setNotice('');
  };


  // ==========================================================
  // APPROVE / REJECT
  // ==========================================================

  const updateStatus = async (
    letter,
    status
  ) => {
    let rejectionReason = '';

    if (status === 'REJECTED') {
      rejectionReason =
        window
          .prompt(
            'Red nedenini girin:'
          )
          ?.trim() || '';

      if (!rejectionReason) {
        setNotice(
          'Red işlemi için bir neden girmeniz gerekir.'
        );

        return;
      }
    }

    try {
      const response =
        await apiFetch(
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


  // ==========================================================
  // DELETE
  // ==========================================================

  const deleteLetter = async (
    letter
  ) => {
    const confirmed =
      window.confirm(
        `${letter.customerName || 'Bu kayıt'} kaydını silmek istediğinize emin misiniz?`
      );

    if (!confirmed) {
      return;
    }

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


  // ==========================================================
  // ROL YETKİLERİ
  // ==========================================================

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


  // ==========================================================
  // LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <div className="login-page">

        <div className="loading-card">

          <div className="loading-logo">
            A
          </div>

          <div className="loading-spinner" />

          <p>
            Oturum kontrol ediliyor…
          </p>

        </div>

      </div>
    );
  }


  // ==========================================================
  // LOGIN
  // ==========================================================

  if (!user) {
    return (
      <LoginScreen
        loginData={loginData}
        setLoginData={setLoginData}
        login={login}
        loginError={loginError}
        isLoggingIn={isLoggingIn}
      />
    );
  }


  // ==========================================================
  // ANA UYGULAMA
  // ==========================================================

  return (
    <div className="app-shell">

      {/* ==================================================
          TOPBAR
          ================================================== */}

      <header className="topbar">

        <div className="brand-area">

          <div className="brand-logo">
            A
          </div>

          <div>

            <div className="brand-name">
              Ayşe Bank
            </div>

            <div className="brand-subtitle">
              Kurumsal Mektup Yönetimi
            </div>

          </div>

        </div>


        {/* Mobil marka */}

        <div className="mobile-brand">

          <div className="mobile-logo">
            A
          </div>

          <div>

            <div className="mobile-brand-name">
              Ayşe Bank
            </div>

            <div className="mobile-brand-subtitle">
              Kurumsal Mektup Yönetimi
            </div>

          </div>

        </div>


        <div className="topbar-right">

          <div className="topbar-secure">

            <span className="secure-dot" />

            Güvenli oturum

          </div>


          <div className="user-chip">

            <span className="user-avatar">
              {user.fullName
                ?.charAt(0)
                .toUpperCase() || 'A'}
            </span>

            <div className="topbar-user-info">

              <strong>
                {user.fullName}
              </strong>

              <span>
                {user.roleLabel}
              </span>

            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Çıkış
            </button>

          </div>

        </div>

      </header>


      <main className="main-content">

        {/* ==================================================
            INTRO
            ================================================== */}

        <section className="intro">

          <div>

            <div className="welcome-line">
              Günaydın,{' '}
              {user.fullName
                ?.split(' ')[0] || 'Kullanıcı'}{' '}
              👋🏻
            </div>

            <p className="eyebrow blue">
              MEKTUP YÖNETİMİ
            </p>

            <h1>

              {editingDraftId
                ? 'Taslağı düzenleyin'
                : canCreate
                ? 'Mektup bilgilerini oluşturun'
                : 'Mektupları inceleyin'}

            </h1>

            <p className="intro-description">

              {editingDraftId
                ? 'Taslak üzerindeki bilgileri düzenleyip onaya gönderebilirsiniz.'
                : canCreate
                ? 'Yeni mektup kaydı oluşturun. İsterseniz taslak olarak kaydedebilir, tamamladığınızda onaya gönderebilirsiniz.'
                : 'Onay bekleyen mektupları inceleyebilir, onaylayabilir veya reddedebilirsiniz.'}

            </p>

          </div>


          <div className="secure-badge">

            <span>
              ✓
            </span>

            Güvenli işlem ekranı

          </div>

        </section>


        {/* ==================================================
            STATS
            ================================================== */}

        <section className="stats-grid">

          <StatCard
            icon="✉"
            label="Toplam mektup"
            value={letters.length}
            type="purple"
          />

          <StatCard
            icon="◷"
            label="Onay bekleyen"
            value={
              letters.filter(
                (letter) =>
                  letter.status ===
                  'PENDING'
              ).length
            }
            type="orange"
          />

          <StatCard
            icon="✓"
            label="Onaylanan"
            value={
              letters.filter(
                (letter) =>
                  letter.status ===
                  'APPROVED'
              ).length
            }
            type="green"
          />

          <StatCard
            icon="◫"
            label="Taslak"
            value={
              letters.filter(
                (letter) =>
                  letter.status ===
                  'DRAFT'
              ).length
            }
            type="pink"
          />

        </section>


        {/* ==================================================
            FORM
            ================================================== */}

        {canCreate && (

          <form
            onSubmit={(event) =>
              saveLetter(
                event,
                'PENDING'
              )
            }
            noValidate
          >

            {editingDraftId && (

              <div className="editing-banner">

                <div className="editing-banner-icon">
                  ✎
                </div>

                <div>

                  <strong>
                    Taslak düzenleniyor
                  </strong>

                  <span>
                    Bu kayıt üzerinde yaptığınız değişiklikler "Onaya Gönder" seçeneğiyle PENDING durumuna geçecektir.
                  </span>

                </div>

                <button
                  type="button"
                  onClick={clearForm}
                  disabled={isSaving}
                >
                  Düzenlemeyi iptal et
                </button>

              </div>

            )}


            <section className="form-card">

              {/* UYARILAR */}

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
                          !
                        </span>

                        {alert.text}

                      </div>

                    )
                  )}

                </div>

              )}


              {/* MÜŞTERİ */}

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
                      Bursa Organize Sanayi Şubesi
                    </option>

                  </select>

                </Field>


                <Field
                  label="Müşteri ad soyad / ticari unvan"
                  name="customerName"
                  value={form.customerName}
                  onChange={update}
                  error={errors.customerName}
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
                  value={form.referenceNo}
                  onChange={update}
                  placeholder="Örn. 1234567890"
                />

              </FormSection>


              {/* İHALE */}

              <FormSection
                title="Mektup ve ihale bilgileri"
                subtitle="Mektubun kullanım amacı ile ihale detayları"
              >

                <Field
                  label="Mektup kapsamı"
                  name="letterScope"
                  value={form.letterScope}
                  onChange={update}
                  error={errors.letterScope}
                  required
                >

                  <select
                    name="letterScope"
                    value={form.letterScope}
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
                  value={form.letterLicense}
                  onChange={update}
                  error={errors.letterLicense}
                >

                  <select
                    name="letterLicense"
                    value={form.letterLicense}
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
                  value={form.tenderType}
                  onChange={update}
                  error={errors.tenderType}
                  required
                >

                  <select
                    name="tenderType"
                    value={form.tenderType}
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
                  value={form.tenderName}
                  onChange={update}
                  error={errors.tenderName}
                  required
                  placeholder="İhale / proje adı"
                />


                <Field
                  label="Muhatabın adı"
                  name="recipient"
                  value={form.recipient}
                  onChange={update}
                  error={errors.recipient}
                  required
                  placeholder="Kurum veya şirket adı"
                />


                <Field
                  label="Proje / ihale numarası"
                  name="projectNo"
                  value={form.projectNo}
                  onChange={update}
                  placeholder="Varsa girin"
                />

              </FormSection>


              {/* TUTAR */}

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
                  value={form.currency}
                  onChange={update}
                  error={errors.currency}
                >

                  <select
                    name="currency"
                    value={form.currency}
                    onChange={update}
                  >

                    <option>
                      TRY
                    </option>

                    <option>
                      USD
                    </option>

                    <option>
                      EUR
                    </option>

                    <option>
                      GBP
                    </option>

                  </select>

                </Field>


                <Field
                  label="Düzenleme tarihi"
                  name="issueDate"
                  value={form.issueDate}
                  onChange={update}
                  error={errors.issueDate}
                  required
                  type="date"
                  max={today}
                />


                <Field
                  label="Geçerlilik tarihi"
                  name="expiryDate"
                  value={form.expiryDate}
                  onChange={update}
                  error={errors.expiryDate}
                  type="date"
                  min={
                    form.issueDate ||
                    today
                  }
                />

              </FormSection>


              {/* YETKİLİ */}

              <FormSection
                title="Yetkili ve ek bilgiler"
                subtitle="İletişim, adres ve kayıt notları"
              >

                <Field
                  label="Yetkili adı soyadı"
                  name="authorityName"
                  value={form.authorityName}
                  onChange={update}
                  placeholder="Talep yetkilisi"
                />


                <Field
                  label="Yetkili telefon"
                  name="authorityPhone"
                  value={form.authorityPhone}
                  onChange={update}
                  type="tel"
                  placeholder="05XX XXX XX XX"
                />


                <Field
                  label="Yetkili e-posta"
                  name="authorityEmail"
                  value={form.authorityEmail}
                  onChange={update}
                  error={errors.authorityEmail}
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


            {/* NOTICE */}

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


            {/* BUTONLAR */}

            <div className="actions">

              <button
                type="button"
                className="button secondary"
                onClick={clearForm}
                disabled={isSaving}
              >
                Temizle
              </button>


              {!editingDraftId && (

                <button
                  type="button"
                  className="button draft-button"
                  onClick={() =>
                    saveLetter(
                      null,
                      'DRAFT'
                    )
                  }
                  disabled={isSaving}
                >
                  {isSaving
                    ? 'Kaydediliyor…'
                    : 'Taslak Kaydet'}
                </button>

              )}


              <button
                type="submit"
                className="button primary"
                disabled={isSaving}
              >

                {isSaving
                  ? 'Gönderiliyor…'
                  : editingDraftId
                  ? 'Onaya Gönder'
                  : 'Kaydet ve Onaya Gönder'}

                {!isSaving && (
                  <span>
                    →
                  </span>
                )}

              </button>

            </div>

          </form>

        )}


        {/* ==================================================
            YETKİLİ MESAJI
            ================================================== */}

        {!canCreate && canReview && (

          <section className="role-message">

            <div className="role-message-icon">
              ✓
            </div>

            <div>

              <p className="eyebrow blue">
                YETKİLİ İŞLEMLERİ
              </p>

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


        {/* ==================================================
            MEKTUP LİSTESİ
            ================================================== */}

        <section className="list-card">

          <div className="list-heading">

            <div>

              <p className="eyebrow blue">
                KAYIT LİSTESİ
              </p>

              <h2>
                Kaydedilen mektuplar
              </h2>

              <p className="list-description">
                Sistemdeki tüm mektup kayıtlarını
                buradan takip edebilirsiniz.
              </p>

            </div>

            <span className="count">
              {letters.length} kayıt
            </span>

          </div>


          {letters.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                ✉
              </div>

              <h3>
                Henüz kayıt bulunmuyor
              </h3>

              <p>
                Mektup kaydı oluşturulduğunda
                burada görüntülenecektir.
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

                    {(canReview ||
                      user.role ===
                        'BRANCH') && (

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

                          <span className="reference-cell">
                            {letter.referenceNo ||
                              '—'}
                          </span>

                        </td>


                        <td>

                          <strong>
                            {letter.customerName ||
                              'Taslak kayıt'}
                          </strong>

                          <small>
                            {letter.branch ||
                              '—'}
                          </small>

                        </td>


                        <td>

                          {letter.letterScope ||
                            '—'}

                          <small>
                            {letter.tenderName ||
                              '—'}
                          </small>

                        </td>


                        <td>
                          {letter.recipient ||
                            '—'}
                        </td>


                        <td>

                          <strong className="amount-cell">

                            {letter.amount !==
                            null &&
                            letter.amount !==
                            undefined &&
                            letter.amount !== ''
                              ? Number(
                                  letter.amount
                                ).toLocaleString(
                                  'tr-TR',
                                  {
                                    minimumFractionDigits:
                                      2,
                                  }
                                )
                              : '—'}

                            {' '}

                            {letter.currency ||
                              ''}

                          </strong>

                        </td>


                        <td>

                          <span
                            className={`status status-${(
                              letter.status ||
                              ''
                            ).toLowerCase()}`}
                          >

                            <span className="status-dot" />

                            {statusLabels[
                              letter.status
                            ] ||
                              letter.status ||
                              'Bilinmiyor'}

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


                        {(canReview ||
                          user.role ===
                            'BRANCH') && (

                          <td>

                            <div className="review-actions">

                              {user.role ===
                                'BRANCH' &&
                                letter.status ===
                                  'DRAFT' && (

                                <button
                                  type="button"
                                  className="edit-button"
                                  onClick={() =>
                                    editDraft(
                                      letter
                                    )
                                  }
                                >
                                  Düzenle
                                </button>

                              )}


                              {canReview &&
                                letter.status ===
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


        <footer className="page-footer">

          <span>
            © 2026 Ayşe Bank
          </span>

          <span>
            Kurumsal Mektup Yönetim Sistemi
          </span>

        </footer>

      </main>

    </div>
  );
}


// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  icon,
  label,
  value,
  type,
}) {
  return (
    <div className="stat-card">

      <div
        className={`stat-icon ${type}`}
      >
        {icon}
      </div>

      <div>

        <span className="stat-label">
          {label}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  );
}


// ============================================================
// FORM SECTION
// ============================================================

function FormSection({
  title,
  subtitle,
  children,
}) {
  return (
    <div className="form-section">

      <div className="section-title">

        <div className="section-number">
          ✓
        </div>

        <div>

          <h3>
            {title}
          </h3>

          <p>
            {subtitle}
          </p>

        </div>

      </div>


      <div className="fields">
        {children}
      </div>

    </div>
  );
}


// ============================================================
// FIELD
// ============================================================

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

      <span className="field-label">

        {label}

        {required && (
          <b>
            *
          </b>
        )}

      </span>


      {children ? (

        React.cloneElement(
          children,
          {
            'aria-invalid':
              Boolean(error),

            ...children.props,
          }
        )

      ) : (

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
        <em>
          {error}
        </em>
      )}

    </label>
  );
}


// ============================================================
// LOGIN SCREEN
// ============================================================

function LoginScreen({
  loginData,
  setLoginData,
  login,
  loginError,
  isLoggingIn,
}) {
  const updateLogin = (
    event
  ) => {
    setLoginData((current) => ({
      ...current,

      [event.target.name]:
        event.target.value,
    }));
  };


  return (
    <main className="login-page">

      <div className="login-decoration decoration-one" />

      <div className="login-decoration decoration-two" />


      <form
        className="login-card"
        onSubmit={login}
      >

        <div className="login-header">

          <div className="login-brand">
            A
          </div>

          <div>

            <div className="login-bank-name">
              Ayşe Bank
            </div>

            <div className="login-bank-subtitle">
              Kurumsal Bankacılık
            </div>

          </div>

        </div>


        <div className="login-title-area">

          <p className="eyebrow blue">
            MEKTUP YÖNETİMİ
          </p>

          <h1>
            Hoş geldiniz
          </h1>

          <p className="login-description">
            Ayşe Bank Mektup Yönetim
            Sistemi'ne erişmek için
            kullanıcı bilgilerinizle
            giriş yapın.
          </p>

        </div>


        <label className="login-field">

          <span>
            Kullanıcı adı
          </span>

          <div className="login-input-wrap">

            <span className="input-icon">
              ◉
            </span>

            <input
              name="username"
              value={
                loginData.username
              }
              onChange={
                updateLogin
              }
              autoComplete="username"
              placeholder="Kullanıcı adınız"
              required
              disabled={isLoggingIn}
            />

          </div>

        </label>


        <label className="login-field">

          <span>
            Parola
          </span>

          <div className="login-input-wrap">

            <span className="input-icon">
              ●
            </span>

            <input
              name="password"
              type="password"
              value={
                loginData.password
              }
              onChange={
                updateLogin
              }
              autoComplete="current-password"
              placeholder="Parolanız"
              required
              disabled={isLoggingIn}
            />

          </div>

        </label>


        {loginError && (

          <p className="login-error">

            <span>
              !
            </span>

            {loginError}

          </p>

        )}


        <button
          className="button primary login-button"
          type="submit"
          disabled={isLoggingIn}
        >

          {isLoggingIn
            ? 'Giriş yapılıyor…'
            : 'Giriş yap'}

          {!isLoggingIn && (
            <span>
              →
            </span>
          )}

        </button>


        <div className="login-security">

          <span>
            🔒
          </span>

          Güvenli oturum doğrulaması

        </div>


        <div className="login-footer">
          Ayşe Bank · Kurumsal Sistem
        </div>

      </form>

    </main>
  );
}


// ============================================================
// REACT'I HTML'E BAĞLA
// ============================================================

createRoot(
  document.getElementById('root')
).render(
  <App />
);