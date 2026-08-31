// React'ten uygulamada kullanacağımız Hook'ları import ediyoruz.
// useState  -> component içinde değişken/state tutmamızı sağlar.
// useEffect -> belirli bir state değiştiğinde veya component açıldığında
//              yan etkili işlemler yapmamızı sağlar.
// useMemo   -> hesaplanan bir değeri gereksiz yere tekrar hesaplamamak için kullanılır.
import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

// React uygulamasını HTML'deki root elementine bağlamak için kullanılır.
import { createRoot } from 'react-dom/client';

// Uygulamanın CSS dosyasını içeri aktarıyoruz.
import './styles.css';


// ============================================================
// 1. FORMUN BAŞLANGIÇ DEĞERLERİ
// ============================================================

// Yeni bir mektup oluşturulduğunda formun başlangıçta sahip olacağı değerler.
// Form temizlendiğinde de tekrar bu obje kullanılır.
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
  currency: 'TRY', // Para biriminin varsayılan değeri TRY
  amount: '',
  issueDate: '',
  expiryDate: '',
  referenceNo: '',
  projectNo: '',
  address: '',
  notes: '',
};


// ============================================================
// 2. ZORUNLU ALANLAR
// ============================================================

// Kullanıcı "Kaydet ve Onaya Gönder" dediğinde
// mutlaka doldurulması gereken alanların isimleri.
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
// 3. İŞ KURALI LİMİTLERİ
// ============================================================

// 10 milyon ve üzerindeki mektuplar yüksek tutarlı kabul edilir.
const HIGH_AMOUNT_LIMIT = 10_000_000;

// Mektubun ulaşabileceği maksimum tutar.
const MAX_AMOUNT_LIMIT = 100_000_000;

// Geçerlilik süresi 30 gün veya daha azsa kullanıcıya uyarı gösterilir.
const DAYS_TO_EXPIRY_WARNING = 30;


// ============================================================
// 4. DURUM ETİKETLERİ
// ============================================================

// Veritabanında İngilizce olarak tuttuğumuz status değerlerini
// kullanıcıya Türkçe göstermek için kullanıyoruz.
//
// Örneğin:
// PENDING   -> Onay bekliyor
// APPROVED  -> Onaylandı
const statusLabels = {
  DRAFT: 'Taslak',
  PENDING: 'Onay bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};


// ============================================================
// 5. ZORUNLU ALAN KONTROLÜ
// ============================================================

const zorunluAlanlariKontrolEt = (form) => {

  // Hataları burada obje olarak tutacağız.
  //
  // Örneğin:
  // {
  //   customerName: "Bu alan zorunludur."
  // }
  const errors = {};

  // requiredFields dizisindeki bütün alanları tek tek kontrol ediyoruz.
  requiredFields.forEach((field) => {

    // form[field] ile alanın değerine ulaşıyoruz.
    //
    // ?? '' :
    // Eğer değer null veya undefined ise boş string kullan.
    //
    // trim():
    // Kullanıcının sadece boşluk girmesini de boş kabul eder.
    if (
      !String(
        form[field] ?? ''
      ).trim()
    ) {

      // Alan boşsa hata mesajı oluşturuyoruz.
      errors[field] =
        'Bu alan zorunludur.';
    }
  });

  // Oluşturduğumuz hata objesini geri döndürüyoruz.
  return errors;
};


// ============================================================
// 6. TARİH KONTROLÜ
// ============================================================

// Geçerlilik tarihinin düzenleme tarihinden önce olup olmadığını kontrol eder.
const gecerlilikTarihiniKontrolEt = (form) => {

  // İki tarih de girilmişse kontrol yapıyoruz.
  if (
    form.issueDate &&
    form.expiryDate &&

    // Geçerlilik tarihi düzenleme tarihinden küçükse
    form.expiryDate <
      form.issueDate
  ) {

    return 'Geçerlilik tarihi düzenleme tarihinden önce olamaz.';
  }

  // Hata yoksa boş string döndürürüz.
  return '';
};


// ============================================================
// 7. E-POSTA KONTROLÜ
// ============================================================

const epostaKontrolEt = (email) => {

  // E-posta alanı boş bırakılabiliyorsa hata verme.
  if (!email) return '';

  // Regular Expression (regex) ile basit e-posta formatı kontrolü.
  //
  // Örnek geçerli:
  // example@gmail.com
  //
  // Geçersiz:
  // example
  // example@
  return !/^\S+@\S+\.\S+$/.test(
    email
  )
    ? 'Geçerli bir e-posta adresi girin.'
    : '';
};


// ============================================================
// 8. MAKSİMUM TUTAR KONTROLÜ
// ============================================================

const maksimumTutariKontrolEt = (
  amount,
  currency
) => {

  // Number() ile input değerini sayıya çeviriyoruz.
  if (
    Number(amount) >
    MAX_AMOUNT_LIMIT
  ) {

    return `Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString(
      'tr-TR'
    )} ${currency} limitini aşamaz.`;
  }

  return '';
};


// ============================================================
// 9. SÜRELİ MEKTUP KONTROLÜ
// ============================================================

// Eğer mektup "Süreli" seçilmişse,
// geçerlilik tarihinin girilmesini zorunlu hale getiriyoruz.
const sureliMektubuKontrolEt = (
  form
) => {

  if (
    form.letterLicense ===
      'Süreli' &&
    !form.expiryDate
  ) {

    return 'Süreli mektup için geçerlilik tarihi zorunludur.';
  }

  return '';
};


// ============================================================
// 10. YÜKSEK TUTAR UYARISI
// ============================================================

// Mektup 10 milyon TL veya daha yüksekse,
// kullanıcıya uyarı gösteriyoruz.
//
// Bu bir ERROR değildir.
// Kullanıcı işlemi devam ettirebilir.
const yuksekTutarUyarisi = (
  amount,
  currency
) => {

  if (
    Number(amount) >=
      HIGH_AMOUNT_LIMIT &&
    Number(amount) <=
      MAX_AMOUNT_LIMIT
  ) {

    return {
      type: 'warning',

      text: `Yüksek tutarlı mektup: ${HIGH_AMOUNT_LIMIT.toLocaleString(
        'tr-TR'
      )} ${currency} ve üzerindeki kayıtlar yetkili onayı gerektirir.`,
    };
  }

  // Uyarı yoksa null döndürürüz.
  return null;
};


// ============================================================
// 11. MAKSİMUM LİMİT AŞIMI UYARISI
// ============================================================

const limitAsimiUyarisi = (
  amount,
  currency
) => {

  if (
    Number(amount) >
    MAX_AMOUNT_LIMIT
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
// 12. KISA GEÇERLİLİK SÜRESİ UYARISI
// ============================================================

const kisaGecerlilikUyarisi = (
  form
) => {

  // Tarihlerden biri yoksa hesaplama yapamayız.
  if (
    !form.issueDate ||
    !form.expiryDate
  ) {
    return null;
  }

  // İki tarihi JavaScript Date objesine çeviriyoruz.
  //
  // T00:00:00 eklememizin sebebi:
  // tarihi gece 00:00 olarak değerlendirmek.
  const days = Math.ceil(
    (
      new Date(
        `${form.expiryDate}T00:00:00`
      ) -
      new Date(
        `${form.issueDate}T00:00:00`
      )
    ) /
      86_400_000
  );

  // Geçerlilik süresi 0-30 gün arasındaysa uyarı ver.
  if (
    days >= 0 &&
    days <=
      DAYS_TO_EXPIRY_WARNING
  ) {

    return {
      type: 'warning',

      text: `Kısa geçerlilik süresi: Mektubun geçerliliği ${days} gün. Muhatap şartlarını kontrol edin.`,
    };
  }

  return null;
};


// ============================================================
// 13. ANA REACT COMPONENT'I
// ============================================================

function App() {

  // ----------------------------------------------------------
  // FORM STATE
  // ----------------------------------------------------------

  // Formdaki bütün alanların değerlerini tutuyoruz.
  const [form, setForm] =
    useState(emptyForm);


  // Şu anda bir taslak düzenleniyor mu?
  //
  // null  -> yeni kayıt
  // ID    -> mevcut taslak düzenleniyor
  const [editingDraftId, setEditingDraftId] =
    useState(null);


  // Formdaki validation hatalarını tutar.
  const [errors, setErrors] =
    useState({});


  // PostgreSQL'den gelen mektup kayıtlarını tutar.
  const [letters, setLetters] =
    useState([]);


  // Kullanıcıya gösterilecek genel mesaj.
  const [notice, setNotice] =
    useState('');


  // Kayıt gönderilirken true olur.
  // Böylece butonları geçici olarak disable edebiliriz.
  const [isSaving, setIsSaving] =
    useState(false);


  // ----------------------------------------------------------
  // LOGIN / SESSION STATE
  // ----------------------------------------------------------

  // Daha önce login olunmuşsa token'ı localStorage'dan alıyoruz.
  //
  // Böylece kullanıcı sayfayı yenilediğinde tekrar login olmak
  // zorunda kalmayabilir.
  const [sessionToken, setSessionToken] =
    useState(() =>
      localStorage.getItem(
        'letterSessionToken'
      )
    );


  // PostgreSQL/backend tarafından doğrulanan kullanıcı bilgisi.
  //
  // Örnek:
  // {
  //   username: "sube.kullanici",
  //   role: "BRANCH",
  //   fullName: "Ayşe Şube Kullanıcısı"
  // }
  const [user, setUser] =
    useState(null);


  // Kullanıcının session'ı kontrol edilirken true.
  const [authLoading, setAuthLoading] =
    useState(true);


  // Login sırasında oluşan hata mesajı.
  const [loginError, setLoginError] =
    useState('');


  // Login formundaki kullanıcı adı ve parola.
  const [loginData, setLoginData] =
    useState({
      username: '',
      password: '',
    });


  // ----------------------------------------------------------
  // BUGÜNÜN TARİHİ
  // ----------------------------------------------------------

  // Bugünün tarihini YYYY-MM-DD formatına çeviriyoruz.
  //
  // useMemo sayesinde component her render olduğunda
  // tekrar hesaplanmaz.
  const today = useMemo(
    () =>
      new Date()
        .toISOString()
        .slice(0, 10),
    []
  );


  // ----------------------------------------------------------
  // FORM KURALLARINA GÖRE UYARILAR
  // ----------------------------------------------------------

  // Formdaki tutar ve tarih gibi alanlara göre
  // kullanıcıya gösterilecek uyarıları hesaplıyoruz.
  const ruleAlerts = useMemo(
    () =>
      [

        // 100 milyon üzerindeyse hata
        limitAsimiUyarisi(
          form.amount,
          form.currency
        ),

        // 10 milyon üzerindeyse yüksek tutar uyarısı
        yuksekTutarUyarisi(
          form.amount,
          form.currency
        ),

        // Geçerlilik süresi 30 gün veya daha azsa uyarı
        kisaGecerlilikUyarisi(
          form
        ),

      // null değerleri listeden çıkarıyoruz.
      ].filter(Boolean),

    // form değiştiğinde uyarıları tekrar hesapla.
    [form]
  );


  // Tutar maksimum limiti geçti mi?
  //
  // Boolean(...) sonucu true veya false olur.
  const amountOverLimit =
    Boolean(
      maksimumTutariKontrolEt(
        form.amount,
        form.currency
      )
    );


  // ==========================================================
  // API REQUEST HELPER
  // ==========================================================

  // Backend'e yapılan bütün isteklerde session token'ı
  // Authorization header'ına otomatik olarak ekliyoruz.
  const apiFetch = (
    path,
    options = {}
  ) =>
    fetch(path, {

      // GET, POST, PATCH gibi options değerlerini koru.
      ...options,

      headers: {

        // Önceden verilmiş header'ları koru.
        ...(options.headers || {}),

        // Kullanıcı login olmuşsa token gönder.
        ...(sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : {}),
      },
    });


  // ==========================================================
  // SESSION KONTROLÜ
  // ==========================================================

  // Component açıldığında veya sessionToken değiştiğinde çalışır.
  useEffect(() => {

    const restoreSession =
      async () => {

        // Token yoksa login yapılmamış demektir.
        if (!sessionToken) {
          setAuthLoading(false);
          return;
        }

        try {

          // Backend'e "Ben kimim?" diye soruyoruz.
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

          // HTTP response başarılı değilse hata oluştur.
          if (!response.ok) {
            throw new Error();
          }

          // Backend'in JSON cevabını al.
          const result =
            await response.json();

          // Kullanıcı bilgilerini state'e kaydet.
          setUser(result.user);

        } catch {

          // Token geçersizse localStorage'dan sil.
          localStorage.removeItem(
            'letterSessionToken'
          );

          setSessionToken(null);

        } finally {

          // Session kontrolü tamamlandı.
          setAuthLoading(false);
        }
      };

    restoreSession();

  }, [sessionToken]);


  // ==========================================================
  // MEKTUPLARI BACKEND'DEN ÇEKME
  // ==========================================================

  // user değiştiğinde çalışır.
  //
  // Kullanıcı login olduğunda user değişir ve
  // mektuplar backend'den çekilir.
  useEffect(() => {

    const loadLetters =
      async () => {

        // Kullanıcı login değilse mektupları çekme.
        if (!user) return;

        try {
          // API'den mektupları çek, apiFetch de session token'ı ekliyor:
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

          // Backend'den gelen mektupları state'e koy.
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


  // ==========================================================
  // FORM DEĞİŞİKLİĞİ
  // ==========================================================

  const update = (event) => {

    // Input'un name ve value değerlerini alıyoruz.
    const {
      name,
      value,
    } = event.target;

    // Sadece değiştirilen alanı güncelliyoruz.
    //
    // ...current:
    // Formdaki diğer alanları korur.
    //
    // [name]:
    // Dinamik property kullanımıdır.
    setForm((current) => ({
      ...current,
      [name]: value,
    }));


    // Kullanıcı hatalı alanı düzeltmeye başladıysa
    // o alandaki hata mesajını kaldır.
    if (errors[name]) {

      setErrors((current) => ({
        ...current,
        [name]: '',
      }));
    }

    // Önceki bilgilendirme mesajını temizle.
    setNotice('');
  };


  // ==========================================================
  // NORMAL FORM VALIDATION
  // ==========================================================

  // "Kaydet ve Onaya Gönder" işleminde kullanılır.
  const validate = () => {

    // Önce zorunlu alanları kontrol et.
    const nextErrors =
      zorunluAlanlariKontrolEt(
        form
      );


    // Tarih kontrolü
    const dateError =
      gecerlilikTarihiniKontrolEt(
        form
      );


    // E-posta kontrolü
    const emailError =
      epostaKontrolEt(
        form.authorityEmail
      );


    // Maksimum tutar kontrolü
    const amountError =
      maksimumTutariKontrolEt(
        form.amount,
        form.currency
      );


    // Süreli mektup kontrolü
    const termError =
      sureliMektubuKontrolEt(
        form
      );


    // Hata varsa ilgili input'a bağla.
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


    // Hataları state'e kaydet.
    setErrors(nextErrors);


    // Hata objesinin key sayısı 0 ise
    // validation başarılıdır.
    return (
      Object.keys(nextErrors)
        .length === 0
    );
  };


  // ==========================================================
  // TASLAK VALIDATION
  // ==========================================================

  // Taslak kaydedilirken bütün zorunlu alanların
  // doldurulması gerekmez.
  //
  // Örneğin kullanıcı formu yarıda bırakıp taslak kaydedebilir.
  const validateDraft = () => {

    const nextErrors = {};

    // Taslakta yine tarih mantığı kontrol edilir.
    const dateError =
      gecerlilikTarihiniKontrolEt(
        form
      );

    // E-posta formatı kontrol edilir.
    const emailError =
      epostaKontrolEt(
        form.authorityEmail
      );

    // Tutar limiti kontrol edilir.
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
  // MEKTUP KAYDETME / TASLAK KAYDETME
  // ==========================================================

  // status:
  //
  // DRAFT   -> Taslak olarak kaydet
  // PENDING -> Onaya gönder
  const saveLetter = async (
    event,
    status = 'PENDING'
  ) => {

    // Eğer form submit oluyorsa sayfanın refresh olmasını engeller.
    if (event) {
      event.preventDefault();
    }


    // --------------------------------------------------------
    // ONAYA GÖNDERME VALIDATION
    // --------------------------------------------------------

    // PENDING ise bütün zorunlu alanlar doldurulmalı.
    if (
      status === 'PENDING' &&
      !validate()
    ) {

      setNotice(
        'Lütfen işaretli alanları kontrol edin.'
      );

      return;
    }


    // --------------------------------------------------------
    // TASLAK VALIDATION
    // --------------------------------------------------------

    // Taslakta sadece mantıksal hataları kontrol ediyoruz.
    if (
      status === 'DRAFT' &&
      !validateDraft()
    ) {

      setNotice(
        'Lütfen işaretli alanları kontrol edin.'
      );

      return;
    }


    // Kaydetme işlemi başladı.
    setIsSaving(true);


    try {

      // ======================================================
      // MEVCUT TASLAĞI ONAYA GÖNDER
      // ======================================================

      // editingDraftId varsa mevcut bir taslak düzenleniyor.
      //
      // Status PENDING ise artık taslak olmaktan çıkıp
      // onay bekleyen duruma geçecek.
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

              // Formdaki güncel bilgileri backend'e gönder.
              body: JSON.stringify(
                form
              ),
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


        // Güncellenen kaydı frontend'deki
        // letters listesinde de güncelliyoruz.
        setLetters(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                result.id
                  ? result
                  : item
            )
        );


        // İşlem bittikten sonra formu temizle.
        setForm(emptyForm);

        setEditingDraftId(null);

        setErrors({});


        setNotice(
          'Taslak başarıyla güncellendi ve onaya gönderildi.'
        );

        return;
      }


      // ======================================================
      // YENİ MEKTUP KAYDI
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

            // Form bilgilerini JSON olarak backend'e gönder.
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


      // Yeni kaydı listenin en başına ekliyoruz.
      setLetters((current) => [
        result,
        ...current,
      ]);


      // Formu temizle.
      setForm(emptyForm);

      setEditingDraftId(null);

      setErrors({});


      // Kullanıcıya işlemin sonucunu bildir.
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

      // Backend cevap vermediyse timeout mesajı göster.
      setNotice(
        error.name ===
          'TimeoutError'
          ? 'Kayıt servisi 8 saniye içinde yanıt vermedi. Backend servisinin açık olduğunu kontrol edin.'
          : error.message ||
              'Kayıt servisine ulaşılamadı.'
      );

    } finally {

      // Başarılı veya başarısız fark etmez,
      // kaydetme işlemi sona erdi.
      setIsSaving(false);
    }
  };


  // ==========================================================
  // FORMU TEMİZLE
  // ==========================================================

  const clearForm = () => {

    // Formu başlangıç haline döndür.
    setForm(emptyForm);

    // Taslak düzenleme modundan çık.
    setEditingDraftId(null);

    // Validation hatalarını temizle.
    setErrors({});

    // Kullanıcıya bilgi ver.
    setNotice(
      'Form temizlendi.'
    );
  };


  // ==========================================================
  // TASLAK DÜZENLE
  // ==========================================================

  const formatDateForInput = (date) => {
  if (!date) return '';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
  };

  const editDraft = (letter) => {

    // Veritabanından gelen mektup bilgilerini
    // forma dolduruyoruz.
    //
    // || '' kullanarak null/undefined değerlerin
    // input'u bozmasını engelliyoruz.
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
        letter.amount || '',

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


    // Artık bu ID'li taslağı düzenliyoruz.
    setEditingDraftId(
      letter.id
    );


    setErrors({});


    setNotice(
      'Taslak düzenleme modunda. Değişikliklerinizi yaptıktan sonra "Onaya Gönder" butonuna basabilirsiniz.'
    );


    // Kullanıcıyı sayfanın en üstüne götür.
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };


  // ==========================================================
  // LOGIN
  // ==========================================================

  const login = async (
    event
  ) => {

    // Form submit olduğunda sayfanın yenilenmesini engelle.
    event.preventDefault();

    // Önceki login hatasını temizle.
    setLoginError('');


    try {

      // Backend'in login endpoint'ine POST isteği gönderiyoruz.
      const response =
        await fetch(
          '/api/auth/login',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            // Kullanıcı adı ve parolayı JSON olarak gönder.
            body: JSON.stringify(
              loginData
            ),
          }
        );


      // Backend'in JSON cevabını oku.
      const result =
        await response.json();


      // HTTP response başarısızsa hata oluştur.
      if (!response.ok) {
        throw new Error(
          result.message ||
            'Giriş yapılamadı.'
        );
      }


      // Backend'in verdiği session token'ı
      // tarayıcının localStorage alanına kaydet.
      localStorage.setItem(
        'letterSessionToken',
        result.token
      );


      // React state'ini de güncelle.
      setSessionToken(
        result.token
      );


      // Login olan kullanıcıyı state'e kaydet.
      setUser(result.user);


    } catch (error) {

      // Login sırasında hata oluşursa ekranda göster.
      setLoginError(
        error.message ||
          'Giriş yapılamadı.'
      );
    }
  };


  // ==========================================================
  // LOGOUT
  // ==========================================================

  const logout = async () => {

    try {

      // Backend'e logout isteği gönder.
      await apiFetch(
        '/api/auth/logout',
        {
          method: 'POST',
        }
      );

    } catch {

      // Backend kapalı olsa bile frontend'deki
      // session'ı temizlemeye devam ediyoruz.
    }


    // Token'ı tarayıcıdan sil.
    localStorage.removeItem(
      'letterSessionToken'
    );


    // React state'lerini temizle.
    setSessionToken(null);

    setUser(null);

    setLetters([]);

    setForm(emptyForm);

    setEditingDraftId(null);
  };


  // ==========================================================
  // APPROVE / REJECT
  // ==========================================================

  const updateStatus = async (
    letter,
    status
  ) => {

    let rejectionReason = '';


    // Eğer işlem RED ise kullanıcıdan neden istiyoruz.
    if (
      status === 'REJECTED'
    ) {

      rejectionReason =
        window
          .prompt(
            'Red nedenini girin:'
          )
          ?.trim() || '';


      // Kullanıcı neden girmediyse işlemi durdur.
      if (!rejectionReason) {

        setNotice(
          'Red işlemi için bir neden girmeniz gerekir.'
        );

        return;
      }
    }


    try {

      // Backend'e PATCH isteği gönderiyoruz.
      //
      // PATCH:
      // Var olan kaydın belirli alanlarını güncellemek için kullanılır.
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


      // Güncellenmiş kaydı frontend listesinde de güncelle.
      setLetters(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              result.id
                ? result
                : item
          )
      );


      // İşlem sonucunu kullanıcıya göster.
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

    // Önce kullanıcıdan silme onayı al.
    const confirmed =
      window.confirm(
        `${letter.customerName || 'Bu kayıt'} kaydını silmek istediğinize emin misiniz?`
      );


    // Kullanıcı "Hayır" derse hiçbir şey yapma.
    if (!confirmed) return;


    try {

      // Backend'e DELETE isteği gönder.
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


      // Başarıyla silinen kaydı frontend listesinden de çıkar.
      setLetters(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              letter.id
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
  // ROL BAZLI YETKİLER
  // ==========================================================

  // BRANCH ve ADMIN kullanıcıları mektup oluşturabilir.
  const canCreate =
    user &&
    ['BRANCH', 'ADMIN'].includes(
      user.role
    );


  // AUTHORIZED ve ADMIN kullanıcıları
  // onay/reddetme işlemi yapabilir.
  const canReview =
    user &&
    ['AUTHORIZED', 'ADMIN'].includes(
      user.role
    );


  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  // Uygulama açıldığında session kontrol edilirken
  // kullanıcıya loading ekranı gösteriyoruz.
  if (authLoading) {

    return (
      <div className="login-page">

        <div className="loading-card">

          <div className="loading-spinner" />

          <p>
            Oturum kontrol
            ediliyor…
          </p>

        </div>

      </div>
    );
  }


  // ==========================================================
  // LOGIN SCREEN
  // ==========================================================

  // Kullanıcı login değilse ana uygulamayı gösterme.
  //
  // Bunun yerine LoginScreen component'ini göster.
  if (!user) {

    return (
      <LoginScreen
        loginData={loginData}

        setLoginData={
          setLoginData
        }

        login={login}

        loginError={loginError}
      />
    );
  }


  // ==========================================================
  // ANA UYGULAMA
  // ==========================================================

  // Buraya geldiysek kullanıcı login olmuştur.
  return (
    <div className="app-shell">

      {/* ----------------------------------------------------
          ÜST MENÜ / HEADER
          ---------------------------------------------------- */}

      <header className="topbar">

        <div className="brand-mark">
          B
        </div>


        <div>

          <p className="eyebrow">
            KURUMSAL BANKACILIK
          </p>

          <h1>
            Mektup Giriş
            İşlemleri
          </h1>

        </div>


        {/* Kullanıcı bilgileri ve çıkış butonu */}
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

        {/* --------------------------------------------------
            SAYFA BAŞLIĞI
            -------------------------------------------------- */}

        <section className="intro">

          <div>

            <p className="eyebrow blue">
              MEKTUP YÖNETİMİ
            </p>


            <h2>

              {editingDraftId
                ? 'Taslağı düzenleyin'

                : canCreate
                ? 'Mektup bilgilerini oluşturun'

                : 'Mektupları inceleyin'}

            </h2>


            <p className="intro-description">

              {editingDraftId
                ? 'Taslak üzerindeki bilgileri düzenleyip onaya gönderebilirsiniz.'

                : canCreate
                ? 'Yeni mektup kaydı oluşturun. İsterseniz taslak olarak kaydedebilir, tamamladığınızda onaya gönderebilirsiniz.'

                : 'Onay bekleyen mektupları inceleyebilir, onaylayabilir veya reddedebilirsiniz.'}

            </p>

          </div>


          <div className="secure-badge">
            ✓ Güvenli işlem ekranı
          </div>

        </section>


        {/* ==================================================
            MEKTUP OLUŞTURMA FORMU

            canCreate true ise sadece BRANCH ve ADMIN
            kullanıcılarına gösterilir.
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

            {/* Taslak düzenleniyorsa bilgi banner'ı */}
            {editingDraftId && (

              <div className="editing-banner">

                <strong>
                  Taslak düzenleniyor
                </strong>

                <span>
                  Bu kayıt üzerinde yaptığınız değişiklikler "Onaya Gönder" seçeneğiyle PENDING durumuna geçecektir.
                </span>


                <button
                  type="button"
                  onClick={
                    clearForm
                  }
                >
                  Düzenlemeyi iptal et
                </button>

              </div>
            )}


            <section className="form-card">


              {/* ============================================
                  KURAL UYARILARI
                  ============================================ */}

              {ruleAlerts.length > 0 && (

                <div
                  className="rule-alerts"
                  aria-live="polite"
                >

                  {ruleAlerts.map(
                    (
                      alert,
                      index
                    ) => (

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


              {/* ============================================
                  MÜŞTERİ BİLGİLERİ
                  ============================================ */}

              <FormSection
                title="Müşteri ve işlem bilgileri"
                subtitle="Mektubu talep eden müşteri ve şube detayları"
              >

                <Field
                  label="İşlem şubesi"
                  name="branch"
                  value={
                    form.branch
                  }
                  onChange={update}
                  error={
                    errors.branch
                  }
                  required
                >

                  <select
                    name="branch"
                    value={
                      form.branch
                    }
                    onChange={
                      update
                    }
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
                  value={
                    form.title
                  }
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


              {/* ============================================
                  İHALE BİLGİLERİ
                  ============================================ */}

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
                    onChange={
                      update
                    }
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
                    onChange={
                      update
                    }
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
                    onChange={
                      update
                    }
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


              {/* ============================================
                  TUTAR VE TARİHLER
                  ============================================ */}

              <FormSection
                title="Tutar ve geçerlilik"
                subtitle="Mektubun parasal ve tarih bilgileri"
              >

                <Field
                  label="Mektup tutarı"
                  name="amount"
                  value={
                    form.amount
                  }
                  onChange={update}
                  error={
                    errors.amount
                  }
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
                    onChange={
                      update
                    }
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


              {/* ============================================
                  YETKİLİ VE EK BİLGİLER
                  ============================================ */}

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
                  value={
                    form.address
                  }
                  onChange={update}
                  className="span-2"
                  placeholder="Açık adres (varsa)"
                />


                <Field
                  label="Açıklama / özel not"
                  name="notes"
                  value={
                    form.notes
                  }
                  onChange={update}
                  className="span-2"
                >

                  <textarea
                    name="notes"
                    value={
                      form.notes
                    }
                    onChange={
                      update
                    }
                    rows="3"
                    placeholder="Mektup için ek notlarınızı girin"
                  />

                </Field>

              </FormSection>

            </section>


            {/* Kullanıcıya bilgi / hata mesajı */}
            {notice && (

              <p
                className={
                  Object.keys(
                    errors
                  ).length
                    ? 'notice warning'
                    : 'notice'
                }
                aria-live="polite"
              >
                {notice}
              </p>
            )}


            {/* ============================================
                FORM BUTONLARI
                ============================================ */}

            <div className="actions">

              {/* Formu temizleme */}
              <button
                type="button"
                className="button secondary"
                onClick={
                  clearForm
                }
                disabled={
                  isSaving
                }
              >
                Temizle
              </button>


              {/* Yeni kayıt oluşturuluyorsa
                  Taslak Kaydet butonu göster */}
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
                  disabled={
                    isSaving
                  }
                >

                  {isSaving
                    ? 'Kaydediliyor…'
                    : 'Taslak Kaydet'}

                </button>
              )}


              {/* Ana submit butonu */}
              <button
                type="submit"
                className="button primary"
                disabled={
                  isSaving
                }
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
            YETKİLİ KULLANICI EKRANI
            ================================================== */}

        {!canCreate &&
          canReview && (

            <section className="role-message">

              <div className="role-message-icon">
                ✓
              </div>

              <div>

                <h2>
                  Onay ve inceleme
                  ekranı
                </h2>

                <p>
                  Aşağıdaki listeden
                  onay bekleyen
                  mektupları
                  inceleyebilir,
                  onaylayabilir
                  veya
                  reddedebilirsiniz.
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
                Kaydedilen
                mektuplar
              </h2>

            </div>


            {/* Toplam kayıt sayısı */}
            <span className="count">
              {letters.length}{' '}
              kayıt
            </span>

          </div>


          {/* Hiç kayıt yoksa boş ekran */}
          {letters.length === 0 ? (

            <div className="empty-state">

              <div>▤</div>

              <h3>
                Henüz kayıt
                bulunmuyor
              </h3>

              <p>
                Mektup kaydı
                oluşturulduğunda
                burada
                görüntülenecektir.
              </p>

            </div>

          ) : (

            /* Kayıt varsa tablo */
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


                    {/* İşlem sütununu sadece
                        yetkili/admin veya şube kullanıcılarına göster */}
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

                  {/* letters dizisindeki her kayıt için
                      bir tablo satırı oluştur */}
                  {letters.map(
                    (letter) => (

                      <tr
                        key={
                          letter.id
                        }
                      >

                        <td>
                          {letter.referenceNo ||
                            '—'}
                        </td>


                        <td>

                          <strong>
                            {letter.customerName ||
                              'Taslak kayıt'}
                          </strong>

                          <small>
                            {
                              letter.branch
                            }
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


                        {/* Tutarı Türkçe sayı formatında göster */}
                        <td>

                          {letter.amount
                            ? Number(
                                letter.amount
                              ).toLocaleString(
                                'tr-TR',
                                {
                                  minimumFractionDigits:
                                    2,
                                }
                              )
                            : '—'}{' '}

                          {
                            letter.currency
                          }

                        </td>


                        {/* Durum */}
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


                          {/* Eğer mektup reddedilmişse
                              red nedenini göster */}
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


                        {/* İşlem butonları */}
                        {(canReview ||
                          user.role ===
                            'BRANCH') && (

                          <td>

                            <div className="review-actions">


                              {/* Şube kullanıcısı sadece
                                  DRAFT kayıtlarını düzenleyebilir */}
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


                              {/* Yetkili kullanıcı
                                  PENDING kayıtlarını onaylayabilir/reddedebilir */}
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


                              {/* ADMIN bütün kayıtları silebilir */}
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


// ============================================================
// FORM SECTION COMPONENT
// ============================================================

// Formdaki bölümleri tekrar tekrar yazmak yerine
// tek bir reusable component oluşturuyoruz.
//
// Örneğin:
//
// <FormSection
//   title="Müşteri bilgileri"
//   subtitle="..."
// >
//   ...
// </FormSection>
//
// children -> component'in açılış/kapanış etiketi arasındaki içeriktir.
function FormSection({
  title,
  subtitle,
  children,
}) {

  return (

    <div className="form-section">

      <div className="section-title">

        <h3>
          {title}
        </h3>

        <p>
          {subtitle}
        </p>

      </div>


      <div className="fields">

        {children}

      </div>

    </div>
  );
}


// ============================================================
// FIELD COMPONENT
// ============================================================

// Input alanlarını standartlaştırmak için oluşturduğumuz
// reusable component.
//
// Böylece her input için label, error, placeholder,
// required gibi şeyleri tekrar tekrar yazmamıza gerek kalmaz.
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

      {/* Input'un başlığı */}
      <span>

        {label}

        {/* required true ise * göster */}
        {required && (
          <b> *</b>
        )}

      </span>


      {/* 
        children varsa onu kullan.

        Örneğin select veya textarea gönderdiğimizde
        children kullanılır.

        children yoksa normal <input> oluşturulur.
      */}
      {children || (

        <input
          className={
            inputClassName
          }

          type={type}

          name={name}

          value={value}

          onChange={onChange}

          placeholder={
            placeholder
          }

          // Hata varsa accessibility için
          // aria-invalid=true gönder.
          aria-invalid={Boolean(
            error
          )}

          {...props}
        />
      )}


      {/* Validation hatası varsa göster */}
      {error && (
        <em>
          {error}
        </em>
      )}

    </label>
  );
}


// ============================================================
// LOGIN SCREEN COMPONENT
// ============================================================

// Login ekranını ayrı bir component olarak oluşturuyoruz.
function LoginScreen({
  loginData,
  setLoginData,
  login,
  loginError,
}) {


  // Login formundaki input değişikliklerini yönetir.
  const updateLogin = (
    event
  ) => {

    setLoginData(
      (current) => ({
        ...current,

        // username veya password alanını
        // input'un name değerine göre güncelle.
        [event.target.name]:
          event.target.value,
      })
    );
  };


  return (

    <main className="login-page">

      {/* Login formu */}
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
          Rolünüze uygun işlem
          ekranına erişmek için
          kullanıcı bilgilerinizle
          giriş yapın.
        </p>


        {/* Kullanıcı adı */}
        <label>

          Kullanıcı adı

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
          />

        </label>


        {/* Parola */}
        <label>

          Parola

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
          />

        </label>


        {/* Login hatası varsa göster */}
        {loginError && (

          <p className="login-error">
            {loginError}
          </p>
        )}


        {/* Login butonu */}
        <button
          className="button primary login-button"
          type="submit"
        >

          Giriş yap

          <span>
            →
          </span>

        </button>


        <p className="login-security">
          🔒 Güvenli oturum
          doğrulaması
        </p>

      </form>

    </main>
  );
}


// ============================================================
// REACT UYGULAMASINI HTML'E BAĞLAMA
// ============================================================

// HTML'deki:
//
// <div id="root"></div>
//
// elementini buluyoruz.
createRoot(
  document.getElementById(
    'root'
  )
)

// React uygulamasını bu root elementinin
// içine render ediyoruz.
.render(
  <App />
);