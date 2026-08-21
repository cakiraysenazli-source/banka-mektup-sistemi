# Banka Mektup Giriş İşlemleri

Basit bir React/Vite arayüzüdür. Mektup bilgilerini doğrular, kayıtları tarayıcı oturumu boyunca listeler ve telefon ekranlarına uyum sağlar.

## VS Code'da çalıştırma

1. Bu klasörü VS Code ile açın.
2. VS Code terminalinde aşağıdaki komutu çalıştırın:

   ```bash
   npm install
   ```

3. PostgreSQL'i bilgisayarınıza kurun ve aşağıdaki adla boş bir veritabanı oluşturun:

   ```sql
   CREATE DATABASE banka_mektup;
   ```

4. `.env.example` dosyasını `.env` olarak kopyalayın ve bağlantı bilgisini kendi PostgreSQL kullanıcı adı/parolanızla güncelleyin.

5. Tabloları ve eğitim amaçlı örnek kullanıcıları oluşturun:

   ```bash
   npm run setup-db
   npm run seed-users
   ```

6. İlk terminalde kayıt servisini başlatın:

   ```bash
   npm run server
   ```

7. İkinci bir terminal açıp arayüzü başlatın:

   ```bash
   npm run dev
   ```

8. Terminalde görünen yerel adresi (genellikle `http://localhost:5173`) tarayıcıda açın.

Kayıtlar PostgreSQL'deki `letters` tablosuna yazılır. Kullanıcılar ve rolleri `users` tablosunda tutulur.

## Örnek kullanıcılar

`npm run seed-users` komutu aşağıdaki eğitim hesaplarını ekler:

| Kullanıcı adı | Parola | Rol |
| --- | --- | --- |
| `sube.kullanici` | `Sube123!` | Şube kullanıcısı |
| `yetkili` | `Yetkili123!` | Yetkili |
| `yonetici` | `Yonetici123!` | Yönetici |

Bu parolalar yalnızca yerel eğitim ortamı içindir; gerçek kullanımda değiştirilmelidir.

Uygulamayı üretim için kontrol etmek isterseniz `npm run build` komutunu kullanabilirsiniz.

> Not: Bu örnek eğitim amaçlıdır. Oturumlar sunucu belleğinde tutulur ve servis yeniden başladığında kapanır. Gerçek bankacılık kullanımı için HTTPS, güvenli oturum yönetimi, kalıcı oturum deposu, denetim kaydı ve kapsamlı güvenlik incelemesi gerekir.
