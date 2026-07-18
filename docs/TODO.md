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

- [ ] **E-posta şablonlarına zorunlu Unsubscribe bölümü** — 🚨 Yüksek
  Tüm e-posta şablonlarına varsayılan olarak bir "Abonelikten Çık" bölümü eklenmeli. Yasal/uyumluluk gereksinimi olduğu için kaldırılabilir olmamalı.
  - [ ] Şablon motoruna sabit (non-removable) bir Unsubscribe bloğu tanımla
  - [ ] Blok içeriğinin (metin, link, stil) kullanıcı tarafından düzenlenebilmesini sağla
  - [ ] Var olan tüm şablonlara geriye dönük olarak bu bölümü otomatik ekle
  - [ ] Kullanıcının bölümü silmeye çalıştığı durumları engelleyen UI/validasyon kontrolü ekle

- [ ] **Kampanya detay sayfasına gelişmiş filtreleme** — ⚡ Orta
  Kampanya detay sayfasına Search, Pagination ve durum (status) filtresi eklenmeli.
  - [ ] Arama kutusu (kampanya/alıcı bazlı arama)
  - [ ] Durum filtresi (ör. gönderildi, beklemede, başarısız, açıldı vb.)
  - [ ] Filtrelerin sayfalama (pagination) ile birlikte tutarlı çalışması

---

## 🎨 UI/UX

- [ ] **Listeleme ekranlarına arama kutusu eklenmesi** — ⚡ Orta
  Tüm listeleme ekranlarının üst kısmına ortak bir arama (Search) bileşeni eklenmeli.
  - [ ] Genel/tekrar kullanılabilir bir Search component tasarımı
  - [ ] Debounce ile performanslı arama davranışı

- [ ] **Sayfa başına kayıt sayısı seçimi (Pagination page size)** — 💡 Düşük
  Kullanıcı, listeleme ekranlarında sayfa başına gösterilecek kayıt sayısını (ör. 10/25/50/100) seçebilmeli.
  - [ ] Page size seçim dropdown'ı ekle
  - [ ] Seçimin kullanıcı tercihine göre hatırlanması (opsiyonel: localStorage/kullanıcı ayarları)

---

## 🚀 Improvement

- [ ] **Filtreleme/arama altyapısının ortak hale getirilmesi** — 💡 Düşük
  Search, Pagination ve durum filtresi gibi özellikler birden fazla ekranda (listeleme, kampanya detay) tekrar edeceği için ortak, yeniden kullanılabilir bir yapı üzerinden yönetilmesi önerilir.
  - [ ] Search/Pagination/Filter için ortak hook veya component katmanı oluştur
  - [ ] Farklı ekranlarda tutarlı UX sağla

---

## 📌 Notlar

- Öncelik seviyeleri iş etkisine ve kullanıcı deneyimine olan etkiye göre belirlenmiştir; sprint planlamasına göre yeniden değerlendirilebilir.
- Unsubscribe görevi yasal uyumluluk (CAN-SPAM / KVKK vb.) açısından öncelikli tutulmuştur.
- Solo kullanıcı ekleme hatası, temel bir işlevi engellediği için Yüksek öncelikli olarak sınıflandırılmıştır.
