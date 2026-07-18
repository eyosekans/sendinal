# TODO

Proje geliştirme görevlerinin kategorilere ayrılmış ve önceliklendirilmiş listesi.

---

## 🐞 Bug

- [x] **Tekil (Solo) kullanıcı ekleme hatası** — 🚨 Yüksek
  Kullanıcılar tek bir alıcıyı CSV içe aktarmaya gerek kalmadan ekleyemiyor; işlem sırasında hata alınıyor.
  - [x] Hatanın kök nedenini tespit et (frontend validasyon mu, API mi, DB constraint mi?)
  - [x] Solo ekleme akışını CSV importundan bağımsız olarak düzelt
  - [x] Hata giderildikten sonra regresyon testleri yaz (tekil ekleme, çoklu ekleme, hatalı veri girişi senaryoları)

  > **Çözüm (2026-07-18):** Kök neden DB/validasyon değil, akış tasarımıydı: e-posta
  > sistemde zaten kayıtlıysa `POST /api/contacts` 409 "already exists" döndürüyordu
  > (CSV import upsert yaptığı için çalışıyordu) ve liste seçiliyken eklenen kişi
  > listeye üye yapılmıyordu (filtreli görünümde hiç görünmüyordu). Fix: endpoint
  > artık opsiyonel `listId` alıyor — yeni kişi oluşturulup listeye ekleniyor; mevcut
  > kişi güncellenip (isimler yazıldıysa, attributes merge) listeye ekleniyor; zaten
  > listedeyse anlamlı bir 409 ("already in this list") dönüyor. `listId` olmadan
  > eski 409 sözleşmesi aynen korunuyor. Regresyon testleri:
  > `node --env-file=.env tests/contacts-add.e2e.mjs` (23 senaryo).

---

## ✨ Feature

- [x] **E-posta şablonlarına zorunlu Unsubscribe bölümü** — 🚨 Yüksek
  Tüm e-posta şablonlarına varsayılan olarak bir "Abonelikten Çık" bölümü eklenmeli. Yasal/uyumluluk gereksinimi olduğu için kaldırılabilir olmamalı.
  - [x] Şablon motoruna sabit (non-removable) bir Unsubscribe bloğu tanımla
  - [x] Blok içeriğinin (metin, link, stil) kullanıcı tarafından düzenlenebilmesini sağla
  - [x] Var olan tüm şablonlara geriye dönük olarak bu bölümü otomatik ekle
  - [x] Kullanıcının bölümü silmeye çalıştığı durumları engelleyen UI/validasyon kontrolü ekle

  > **Çözüm (2026-07-18):** `shared/unsubscribe.ts` — kilitli footer satırı
  > (`deletable/duplicatable/draggable/hideable:false`, metin+link+stil serbest,
  > `{{unsubscribe_url}}` placeholder'lı) + `ensureUnsubscribeRow` /
  > `appendUnsubscribeFooter` yardımcıları. Editör wrapper'ı her yüklemede
  > (boş tasarım dahil) bloğu garanti eder; export güvenlik ağı eksikse yeniden
  > ekler; Unlayer link picker'ına "Unsubscribe" special link eklendi. Mevcut
  > şablonlar `node --env-file=.env scripts/add-unsubscribe-block.ts` ile
  > geriye dönük güncellendi (2 şablon; idempotent, `--dry-run` destekli).
  > Kullanıcı linki metinden silse bile worker'ın `injectUnsubscribe` fallback'i
  > gönderimde uyumluluğu korur. Ayrıca bulunan bir bug fixlendi: vue-email-editor
  > sabit `editor-id` verilmeden remount+yavaş embed.js yarışında "Could not find
  > a valid element" fırlatıp editörü sonsuz "Loading editor…"da bırakıyordu.

- [x] **Kampanya detay sayfasına gelişmiş filtreleme** — ⚡ Orta
  Kampanya detay sayfasına Search, Pagination ve durum (status) filtresi eklenmeli.
  - [x] Arama kutusu (kampanya/alıcı bazlı arama)
  - [x] Durum filtresi (ör. gönderildi, beklemede, başarısız, açıldı vb.)
  - [x] Filtrelerin sayfalama (pagination) ile birlikte tutarlı çalışması

  > **Çözüm (2026-07-18):** `GET /api/campaigns/:id/activity` artık `search`
  > (alıcı e-posta/ad-soyad, case-insensitive) ve `status` (türetilmiş durum:
  > delivered/clicked/opened/unsubscribed/bounced/complained/failed/queued)
  > parametrelerini alıyor. Türetilmiş durum sends + email_events'ten geldiği
  > için filtreleme in-app yapılıyor (stats endpoint'iyle aynı yaklaşım; embedded
  > join'lerle 2 sorgu, 4.7'de cache'lenebilir) — `total` her zaman filtreli
  > kümeyi yansıttığından pagination tutarlı. UI: "Individual send results"
  > panelinde debounced arama kutusu + durum dropdown'ı; filtre değişimi
  > sayfayı 1'e döndürüyor, filtreli boş durum ayrı mesaj gösteriyor.
  > Regresyon: `node --env-file=.env tests/campaign-activity.e2e.mjs` (18 senaryo).

---

## 🎨 UI/UX

- [x] **Listeleme ekranlarına arama kutusu eklenmesi** — ⚡ Orta
  Tüm listeleme ekranlarının üst kısmına ortak bir arama (Search) bileşeni eklenmeli.
  - [x] Genel/tekrar kullanılabilir bir Search component tasarımı
  - [x] Debounce ile performanslı arama davranışı

- [x] **Sayfa başına kayıt sayısı seçimi (Pagination page size)** — 💡 Düşük
  Kullanıcı, listeleme ekranlarında sayfa başına gösterilecek kayıt sayısını (ör. 10/25/50/100) seçebilmeli.
  - [x] Page size seçim dropdown'ı ekle
  - [x] Seçimin kullanıcı tercihine göre hatırlanması (opsiyonel: localStorage/kullanıcı ayarları)

  > **Çözüm (2026-07-18):** Ortak arama zaten layout'taki tek topbar Search
  > bileşeni üzerinden tüm listeleme ekranlarında vardı (contacts/campaigns/
  > templates ona bağlanıyor); debounce dahil bu davranış artık
  > `useListControls` composable'ında tek yerde. Page size:
  > `<ListPager>` (10/25/50/100 dropdown + Previous/Next + "Showing X of Y")
  > contacts ve campaigns tablolarında; seçim ekran başına cookie'de saklanıyor
  > (SSR ilk render'da bile hatırlanan boyutla gelir). Templates client-side
  > filtreli ve sayfalamasız (≤100 kayıt) olduğundan pager kapsam dışı.

---

## 🚀 Improvement

- [x] **Filtreleme/arama altyapısının ortak hale getirilmesi** — 💡 Düşük
  Search, Pagination ve durum filtresi gibi özellikler birden fazla ekranda (listeleme, kampanya detay) tekrar edeceği için ortak, yeniden kullanılabilir bir yapı üzerinden yönetilmesi önerilir.
  - [x] Search/Pagination/Filter için ortak hook veya component katmanı oluştur
  - [x] Farklı ekranlarda tutarlı UX sağla

  > **Çözüm (2026-07-18):** `app/composables/useListControls.ts` — debounced
  > arama + sayfa + cookie'de saklanan page-size'ı tek yerde yönetir (arama veya
  > page-size değişince sayfa 1'e döner; `topbarPlaceholder` verilirse topbar'a
  > bağlanır, verilmezse ekran-yerel arama ref'i üretir) —
  > + `app/components/ListPager.vue` (footer: sayaç + page-size + Prev/Next).
  > Contacts ve campaigns sayfalarındaki kopya debounce/pager kodu silinip bu
  > katmana taşındı. Kampanya detayındaki activity paneli kendi yerel arama/
  > pager'ını koruyor (yeni yapıldı, panel-stilinde); ileride istenirse
  > `useListControls`'a (topbar'sız mod) geçirilebilir. Durum filtreleri
  > ekran-özel kaldı (farklı sözlükler: kampanya/kişi/etkinlik durumları).

---

## 📌 Notlar

- Öncelik seviyeleri iş etkisine ve kullanıcı deneyimine olan etkiye göre belirlenmiştir; sprint planlamasına göre yeniden değerlendirilebilir.
- Unsubscribe görevi yasal uyumluluk (CAN-SPAM / KVKK vb.) açısından öncelikli tutulmuştur.
- Solo kullanıcı ekleme hatası, temel bir işlevi engellediği için Yüksek öncelikli olarak sınıflandırılmıştır.
