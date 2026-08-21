import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const emptyForm = {
  branch: '', customerName: '', title: '', letterScope: '', letterLicense: '',
  tenderType: '', recipient: '', tenderName: '', authorityName: '', authorityPhone: '',
  authorityEmail: '', currency: 'TRY', amount: '', issueDate: '', expiryDate: '',
  referenceNo: '', projectNo: '', address: '', notes: '', status: 'Taslak'
};

const requiredFields = ['branch', 'customerName', 'letterScope', 'tenderType', 'recipient', 'tenderName', 'amount', 'issueDate'];

// Örnek iş kuralları: Kurumun gerçek limitlerine göre güncellenmelidir.
const HIGH_AMOUNT_LIMIT = 10_000_000;
const MAX_AMOUNT_LIMIT = 100_000_000;
const DAYS_TO_EXPIRY_WARNING = 30;

// Her iş kuralı ayrı bir fonksiyondadır. Bu fonksiyonlar sadece sonucu döndürür;
// ekrandaki state'i değiştirmez. Böylece tek tek test edilmeleri kolaylaşır.
const zorunluAlanlariKontrolEt = (form) => {
  const errors = {};
  requiredFields.forEach((field) => {
    if (!String(form[field]).trim()) errors[field] = 'Bu alan zorunludur.';
  });
  return errors;
};

const gecerlilikTarihiniKontrolEt = (form) => {
  if (form.issueDate && form.expiryDate && form.expiryDate < form.issueDate) {
    return 'Geçerlilik tarihi düzenleme tarihinden önce olamaz.';
  }
  return '';
};

const epostaKontrolEt = (email) => email && !/^\S+@\S+\.\S+$/.test(email)
  ? 'Geçerli bir e-posta adresi girin.' : '';

const maksimumTutariKontrolEt = (amount, currency) => Number(amount) > MAX_AMOUNT_LIMIT
  ? `Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString('tr-TR')} ${currency} limitini aşamaz.` : '';

const sureliMektubuKontrolEt = (form) => form.letterLicense === 'Süreli' && !form.expiryDate
  ? 'Süreli mektup için geçerlilik tarihi zorunludur.' : '';

const yuksekTutarUyarisi = (amount, currency) => Number(amount) >= HIGH_AMOUNT_LIMIT && Number(amount) <= MAX_AMOUNT_LIMIT
  ? { type: 'warning', text: `Yüksek tutarlı mektup: ${HIGH_AMOUNT_LIMIT.toLocaleString('tr-TR')} ${currency} ve üzerindeki kayıtlar yetkili onayı gerektirir.` } : null;

const limitAsimiUyarisi = (amount, currency) => Number(amount) > MAX_AMOUNT_LIMIT
  ? { type: 'error', text: `Limit aşıldı: Mektup tutarı ${MAX_AMOUNT_LIMIT.toLocaleString('tr-TR')} ${currency} üst sınırını geçemez. Kayıt yapılamaz.` } : null;

const kisaGecerlilikUyarisi = (form) => {
  if (!form.issueDate || !form.expiryDate) return null;
  const days = Math.ceil((new Date(`${form.expiryDate}T00:00:00`) - new Date(`${form.issueDate}T00:00:00`)) / 86_400_000);
  return days >= 0 && days <= DAYS_TO_EXPIRY_WARNING
    ? { type: 'warning', text: `Kısa geçerlilik süresi: Mektubun geçerliliği ${days} gün. Muhatap şartlarını kontrol edin.` } : null;
};

const onayliKayitYetkilisiUyarisi = (form) => form.status === 'Onaylandı' && !form.authorityName
  ? { type: 'info', text: 'Onaylanan kayıtlarda yetkili adı soyadı eklenmesi önerilir.' } : null;

function App() {
  // Ana bileşen: form verisini, hata mesajlarını ve kayıt listesini yönetir.
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [letters, setLetters] = useState([]);
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ISO tarih metninin ilk 10 karakterini (YYYY-AA-GG) alır; [] sayesinde ilk yüklemede hesaplanır.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Form değiştikçe uyarıları yeniden hesaplar; filter(Boolean) null gibi boş sonuçları kaldırır.
  const ruleAlerts = useMemo(() => [
    limitAsimiUyarisi(form.amount, form.currency),
    yuksekTutarUyarisi(form.amount, form.currency),
    kisaGecerlilikUyarisi(form),
    onayliKayitYetkilisiUyarisi(form)
  ].filter(Boolean), [form]);

  // Üst limit aşılmışsa true olur ve tutar alanına kırmızı CSS sınıfı eklenmesini sağlar.
  const amountOverLimit = Boolean(maksimumTutariKontrolEt(form.amount, form.currency));

  // Sayfa ilk açıldığında servisten kayıtları yükler. Bu effect silinirse eski kayıtlar otomatik görünmez.
  useEffect(() => {
    const loadLetters = async () => {
      try {
        const response = await fetch('/api/letters', { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error();
        setLetters(await response.json());
      } catch {
        setNotice('Kayıt servisine ulaşılamadı. Önce "npm run server" komutunu çalıştırın.');
      }
    };
    loadLetters();
  }, []);

  // Kullanıcının değiştirdiği inputun name ve value değerleriyle formu günceller.
  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }));
    setNotice('');
  };

  // Kaydetmeden önce tüm doğrulama kurallarını çalıştırır; hata varsa kayıt işlemini durdurur.
  const validate = () => {
    const nextErrors = zorunluAlanlariKontrolEt(form);
    const dateError = gecerlilikTarihiniKontrolEt(form);
    const emailError = epostaKontrolEt(form.authorityEmail);
    const amountError = maksimumTutariKontrolEt(form.amount, form.currency);
    const termError = sureliMektubuKontrolEt(form);

    if (dateError) nextErrors.expiryDate = dateError;
    if (emailError) nextErrors.authorityEmail = emailError;
    if (amountError) nextErrors.amount = amountError;
    if (termError) nextErrors.expiryDate = termError;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Form geçerliyse mektubu servise gönderir, kayıt başarılıysa tabloyu ve formu günceller.
  const saveLetter = async (event) => {
    event.preventDefault(); // Tarayıcının varsayılan sayfa yenilemeli form gönderimini durdurur.
    if (!validate()) {
      setNotice('Lütfen işaretli alanları kontrol edin.');
      return;
    }
    setIsSaving(true); // Kayıt sürerken butonları pasif hâle getirerek çift kaydı önler.
    try {
      const response = await fetch('/api/letters', {
        method: 'POST', // POST yeni bir kayıt oluşturur.
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000), // Sekiz saniye yanıt gelmezse isteği iptal eder.
        body: JSON.stringify(form) // Form nesnesini JSON metnine dönüştürüp servise gönderir.
      });
      const result = await response.json(); // Servisin başarı veya hata cevabını JavaScript nesnesine çevirir.
      if (!response.ok) throw new Error(result.message || 'Kayıt yapılamadı.');
      setLetters((current) => [result, ...current]); // Yeni kaydı mevcut kayıtların başına ekler.
      setForm(emptyForm); // Formu başlangıç değerlerine döndürür.
      setErrors({});
      setNotice('Mektup kaydı servise başarıyla kaydedildi.');
    } catch (error) {
      setNotice(error.name === 'TimeoutError'
        ? 'Kayıt servisi 8 saniye içinde yanıt vermedi. Servisin ve geliştirme sunucusunun açık olduğunu kontrol edin.'
        : (error.message || 'Kayıt servisine ulaşılamadı.'));
    } finally {
      setIsSaving(false); // İşlem bitince butonları tekrar kullanılabilir hâle getirir.
    }
  };

  const clearForm = () => {
    setForm(emptyForm);
    setErrors({});
    setNotice('Form temizlendi.');
  };

  // JSX: App bileşeninin ekranda gösterdiği arayüz.
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">B</div>
      <div><p className="eyebrow">KURUMSAL BANKACILIK</p><h1>Mektup Giriş İşlemleri</h1></div>
      <div className="user-chip"><span className="user-dot">A</span><span>Şube Kullanıcısı</span></div>
    </header>

    <main>
      <section className="intro">
        <div><p className="eyebrow blue">YENİ KAYIT</p><h2>Mektup bilgilerini oluşturun</h2><p>Yıldızlı alanlar zorunludur. Kaydedilen kayıtlar aşağıdaki listede görüntülenir.</p></div>
        <div className="secure-badge">⌁ Güvenli işlem ekranı</div>
      </section>

      <form onSubmit={saveLetter} noValidate>
        <section className="form-card">
          {/* Her uyarı için bir kutu oluşturur; uyarı yoksa bu bölüm görünmez. */}
          {ruleAlerts.length > 0 && <div className="rule-alerts" aria-live="polite">{ruleAlerts.map((alert, index) => <div className={`rule-alert ${alert.type}`} key={`${alert.type}-${index}`}><span>{alert.type === 'info' ? 'i' : '!'}</span>{alert.text}</div>)}</div>}
          <FormSection title="Müşteri ve işlem bilgileri" subtitle="Mektubu talep eden müşteri ve şube detayları">
            <Field label="İşlem şubesi" name="branch" value={form.branch} onChange={update} error={errors.branch} required><select name="branch" value={form.branch} onChange={update}><option value="">Şube seçin</option><option>İstanbul Merkez Şubesi</option><option>Ankara Kurumsal Şubesi</option><option>İzmir Ticari Şubesi</option><option>Bursa Organize Sanayi Şubesi</option></select></Field>
            <Field label="Müşteri ad soyad / ticari unvan" name="customerName" value={form.customerName} onChange={update} error={errors.customerName} required placeholder="Örn. Aydın Yapı San. ve Tic. A.Ş." />
            <Field label="Müşteri unvanı" name="title" value={form.title} onChange={update} placeholder="Örn. Genel Müdür" />
            <Field label="Müşteri referans numarası" name="referenceNo" value={form.referenceNo} onChange={update} placeholder="Örn. 1234567890" />
          </FormSection>

          <FormSection title="Mektup ve ihale bilgileri" subtitle="Mektubun kullanım amacı ile ihale detayları">
            <Field label="Mektup kapsamı" name="letterScope" value={form.letterScope} onChange={update} error={errors.letterScope} required><select name="letterScope" value={form.letterScope} onChange={update}><option value="">Kapsam seçin</option><option>Geçici teminat mektubu</option><option>Kesin teminat mektubu</option><option>Avans teminat mektubu</option><option>Gümrük teminat mektubu</option><option>Referans mektubu</option></select></Field>
            <Field label="Mektup lisansı / türü" name="letterLicense" value={form.letterLicense} onChange={update}><select name="letterLicense" value={form.letterLicense} onChange={update}><option value="">Seçin</option><option>Süreli</option><option>Süresiz</option><option>Kontrgarantili</option></select></Field>
            <Field label="İhale tipi" name="tenderType" value={form.tenderType} onChange={update} error={errors.tenderType} required><select name="tenderType" value={form.tenderType} onChange={update}><option value="">İhale tipi seçin</option><option>Açık ihale</option><option>Pazarlık usulü</option><option>Doğrudan temin</option><option>Özel sektör ihalesi</option></select></Field>
            <Field label="İhalenin adı" name="tenderName" value={form.tenderName} onChange={update} error={errors.tenderName} required placeholder="İhale / proje adı" />
            <Field label="Muhatabın adı" name="recipient" value={form.recipient} onChange={update} error={errors.recipient} required placeholder="Kurum veya şirket adı" />
            <Field label="Proje / ihale numarası" name="projectNo" value={form.projectNo} onChange={update} placeholder="Varsa girin" />
          </FormSection>

          <FormSection title="Tutar ve geçerlilik" subtitle="Mektubun parasal ve tarih bilgileri">
            <Field label="Mektup tutarı" name="amount" value={form.amount} onChange={update} error={errors.amount} required type="number" min="0" placeholder="Örn. 15000000" inputClassName={amountOverLimit ? 'input-danger' : ''} />
            <Field label="Para birimi" name="currency" value={form.currency} onChange={update}><select name="currency" value={form.currency} onChange={update}><option>TRY</option><option>USD</option><option>EUR</option><option>GBP</option></select></Field>
            {/* Düzenleme tarihi bugünden ilerisi olamaz. */}
            <Field label="Düzenleme tarihi" name="issueDate" value={form.issueDate} onChange={update} error={errors.issueDate} required type="date" max={today} />
            {/* Düzenleme tarihi seçildiyse geçerlilik tarihi ondan önce seçilemez. */}
            <Field label="Geçerlilik tarihi" name="expiryDate" value={form.expiryDate} onChange={update} error={errors.expiryDate} type="date" min={form.issueDate || today} />
          </FormSection>

          <FormSection title="Yetkili ve ek bilgiler" subtitle="İletişim, adres ve kayıt notları">
            <Field label="Yetkili adı soyadı" name="authorityName" value={form.authorityName} onChange={update} placeholder="Talep yetkilisi" />
            <Field label="Yetkili telefon" name="authorityPhone" value={form.authorityPhone} onChange={update} type="tel" placeholder="05XX XXX XX XX" />
            <Field label="Yetkili e-posta" name="authorityEmail" value={form.authorityEmail} onChange={update} error={errors.authorityEmail} type="email" placeholder="ornek@firma.com" />
            <Field label="Kayıt durumu" name="status" value={form.status} onChange={update}><select name="status" value={form.status} onChange={update}><option>Taslak</option><option>Onaya gönderildi</option><option>Onaylandı</option></select></Field>
            <Field label="Muhatap adresi" name="address" value={form.address} onChange={update} className="span-2" placeholder="Açık adres (varsa)" />
            <Field label="Açıklama / özel not" name="notes" value={form.notes} onChange={update} className="span-2"><textarea name="notes" value={form.notes} onChange={update} rows="3" placeholder="Mektup için ek notlarınızı girin" /></Field>
          </FormSection>
        </section>
        {/* Hata varsa mesaj uyarı görünümünde, diğer durumlarda başarı görünümünde gösterilir. */}
        {notice && <p className={Object.keys(errors).length ? 'notice warning' : 'notice'} aria-live="polite">{notice}</p>}
        {/* Kayıt sürerken iki buton da pasiftir; Kaydet butonunun metni değişir. */}
        <div className="actions"><button type="button" className="button secondary" onClick={clearForm} disabled={isSaving}>Temizle</button><button type="submit" className="button primary" disabled={isSaving}>{isSaving ? 'Kaydediliyor…' : <>Kaydet ve Listeye Ekle <span>→</span></>}</button></div>
      </form>

      <section className="list-card">
        <div className="list-heading"><div><p className="eyebrow blue">KAYIT LİSTESİ</p><h2>Kaydedilen mektuplar</h2></div><span className="count">{letters.length} kayıt</span></div>
        {/* Kayıt yoksa boş durum mesajı, varsa küçük ekranlarda kaydırılabilen tablo gösterilir. */}
        {letters.length === 0 ? <div className="empty-state"><div>▤</div><h3>Henüz kayıt bulunmuyor</h3><p>Yukarıdaki formu doldurup kaydettiğinizde mektuplar burada listelenir.</p></div> : <div className="table-wrap"><table><thead><tr><th>Referans</th><th>Müşteri</th><th>Mektup kapsamı</th><th>Muhatap</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>{letters.map((letter) => <tr key={letter.id}><td>{letter.referenceNo || '—'}</td><td><strong>{letter.customerName}</strong><small>{letter.branch}</small></td><td>{letter.letterScope}<small>{letter.tenderName}</small></td><td>{letter.recipient}</td><td>{Number(letter.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {letter.currency}</td><td><span className="status">{letter.status}</span></td></tr>)}</tbody></table></div>}
      </section>
    </main>
  </div>;
}

// Form bölümlerinin başlık, açıklama ve alan yerleşimini ortaklaştırır.
function FormSection({ title, subtitle, children }) { return <div className="form-section"><div className="section-title"><h3>{title}</h3><p>{subtitle}</p></div><div className="fields">{children}</div></div>; }

// Form alanlarının etiketini, input/select/textarea içeriğini ve hata mesajını ortaklaştırır.
function Field({ label, name, value, onChange, error, required, type = 'text', placeholder, children, className = '', inputClassName = '', ...props }) {
  return <label className={`field ${className}`}><span>{label}{required && <b> *</b>}</span>{children || <input className={inputClassName} type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={Boolean(error)} {...props} />}{error && <em>{error}</em>}</label>;
}

createRoot(document.getElementById('root')).render(<App />);
