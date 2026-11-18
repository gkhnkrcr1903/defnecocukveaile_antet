# Defne Çocuk ve Aile Belge Uygulaması

Word, PDF, metin veya görsel dosyalarını **Defne Çocuk ve Aile antetli kâğıdına** yerleştiren, tarayıcıda çalışan uygulama. Sunucu gerektirmez; dosyalar bilgisayarınızdan dışarı gönderilmez.

## Özellikler

- **Belge yükleme:** `.docx` (Word), `.pdf`, `.txt`, `.md`, `.html`, `.png`, `.jpg` dosyalarını sürükle-bırak ile yükleyin. Word belgesinin hizalama, kalın/italik, liste ve tabloları korunur.
- **Düzenleme:** Yüklenen metni editörde düzenleyin; başlık, hizalama, liste, renk, tarih ve sayfa sonu ekleyin.
- **Otomatik sayfalama:** Uzun belgeler antetli A4 sayfalara bölünür (paragraflar, listeler ve tablolar sayfa sonunda düzgün bölünür).
- **Çıktı:** `PDF İndir` ile doğrudan PDF, `Yazdır` ile yazıcıya ya da “PDF olarak kaydet”e gönderin.
- **Antet düzenleme:** Üst bant, logo, başlık yazısı, ayraç çizgisi, filigran, alt bilgi (telefon/adres/web), yazı tipi, renkler ve kenar boşlukları değiştirilebilir. Yeni logo/filigran yüklenebilir.
- **Hazır antet modu:** İsterseniz başka bir antetli kâğıdı (PDF veya A4 görsel) doğrudan arka plan olarak kullanabilirsiniz.
- **Kayıt:** Antet ayarları ve son belge tarayıcıda otomatik saklanır. Ayarlar `.json` olarak dışa/içe aktarılabilir (başka bilgisayara taşımak için).

## Kullanım

Yayınlanan adres (GitHub Pages): `https://gkhnkrcr1903.github.io/defnecocukveaile_antet/`

Yerel çalıştırma:

```powershell
python -m http.server 8000
```

ardından tarayıcıda `http://localhost:8000` adresini açın.

## GitHub Pages ile yayınlama

Depo → **Settings → Pages → Build and deployment** → *Source: Deploy from a branch* → Branch: `main`, klasör: `/ (root)` → **Save**.

## Dosya yapısı

| Yol | Açıklama |
| --- | --- |
| `index.html` | Uygulama arayüzü |
| `css/style.css` | Stiller (yazdırma ayarları dahil) |
| `js/letterhead.js` | Antet modeli ve çizimi |
| `js/paginate.js` | İçeriği A4 sayfalara bölme |
| `js/importers.js` | Word/PDF/metin/görsel içe aktarma |
| `js/app.js` | Uygulama mantığı, antet düzenleme formu, PDF/yazdırma |
| `assets/antet_orijinal.pdf` | Orijinal antetli belge |
| `assets/logo.png`, `assets/filigran.png` | Antetten çıkarılan şeffaf logo ve filigran |
| `assets/defaults-assets.js` | Varsayılan logo/filigranın gömülü kopyası |
| `vendor/` | Kullanılan kütüphaneler (docx-preview, JSZip, pdf.js, html2canvas, jsPDF) |

## Notlar

- Eski `.doc` biçimi tarayıcıda okunamaz; Word'de **Farklı Kaydet → Word Belgesi (.docx)** ile kaydedip yükleyin.
- Orijinal antetteki “TT Firs Neue” yazı tipi ticari olduğundan, düzenlenebilir antette en yakın ücretsiz karşılığı olan **Lexend** kullanılır. Birebir görünüm için *Antet Düzenle → Antet türü → Hazır görsel / PDF antet → Orijinal Defne anteti* seçilebilir.
- `PDF İndir` sayfaları yüksek çözünürlüklü görüntü olarak kaydeder; metni seçilebilir PDF için `Yazdır → PDF olarak kaydet` kullanın.
