# Banka Mektup Giriş İşlemleri

Basit bir React/Vite arayüzüdür. Mektup bilgilerini doğrular, kayıtları tarayıcı oturumu boyunca listeler ve telefon ekranlarına uyum sağlar.

## VS Code'da çalıştırma

1. Bu klasörü VS Code ile açın.
2. VS Code terminalinde aşağıdaki komutu çalıştırın:

   ```bash
   npm install
   ```

3. İlk terminalde kayıt servisini başlatın:

   ```bash
   npm run server
   ```

4. İkinci bir terminal açıp arayüzü başlatın:

   ```bash
   npm run dev
   ```

5. Terminalde görünen yerel adresi (genellikle `http://localhost:5173`) tarayıcıda açın.

Kayıtlar proje içindeki `data/letters.json` dosyasına yazılır; uygulamayı kapatıp açsanız da kalırlar.

Uygulamayı üretim için kontrol etmek isterseniz `npm run build` komutunu kullanabilirsiniz.

> Not: Bu örnek eğitim amaçlıdır. Kaydedilen veriler yalnızca sayfa açıkken bellekte tutulur; gerçek bankacılık kullanımı için sunucu, kullanıcı yetkilendirmesi, şifreleme ve güvenlik incelemesi gerekir.
