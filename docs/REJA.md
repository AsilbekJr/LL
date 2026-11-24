# LL — o'zgarishlar rejasi

Maqsad: ilova sodda va ishonchli bo'lsin. Foydalanuvchi faqat **so'z** bilan ishlaydi,
har kuni bitta tugma bosadi, natijani esa "nutqda ishlata oladigan so'zlar soni" bilan o'lchaydi.

Qadamlar prioritet tartibida. Har bir qadam alohida tekshiriladi va alohida commit bo'ladi.

## 1. So'z — yagona birlik ✅

**Muammo.** Har bir so'zning ikkita kartasi bor (EN→UZ, UZ→EN) va "Yo'nalish" sozlamasi
to'rt xil rejimga ega edi. Shundan "26 ta takrorlash", so'zning bir kunda ikki marta chiqishi
va sahifalar orasidagi farqlar kelib chiqdi.

**Yangi qoida (sozlamasiz, hamma uchun bitta):**
- Bir so'z bir kunda ko'pi bilan **bitta** karta ko'rsatadi.
- Yangi so'z har doim EN→UZ (tanib olish) bilan boshlanadi.
- UZ→EN (o'zi eslab aytish) birinchi yo'nalish "takrorlash" holatiga o'tgach ochiladi;
  yangi so'z limitini ishlatmaydi.
- Ikkala yo'nalish bir kunga tushsa, ko'proq kechikkani (teng bo'lsa — uzoqroq oldin
  takrorlangani) chiqadi, ikkinchisi ertaga ko'chadi.
- Bugun, Kalendar va Statistika bir xil sanaydi.

**Olib tashlandi:** Sozlamalardagi "Yo'nalish" maydoni. Bazadagi `direction_mode` ustuni
qoladi, lekin ishlatilmaydi (migratsiya kerak emas, ma'lumot o'zgarmaydi).

**Himoya.** `tests/unit/today-plan.test.ts` — "navbatda bir so'zdan bittadan ortiq karta
bo'lmaydi" qoidasi har o'zgarishda avtomatik tekshiriladi.

## 2. Sozlamalar va Nutqni soddalashtirish ✅

- Sozlamalar: algoritm sozlamalari (zinapoya, ladder/FSRS, gate qadamlari, maintenance,
  kechikish jarimasi) yopiq "Qo'shimcha sozlamalar" bo'limida; xato bo'lsa o'zi ochiladi.
- Kunlik yangi so'z maydoni ostida yuk haqida izoh (5–7 yengil, 15+ og'ir).
  Mavjud qiymat o'zgartirilmadi; standartni o'zgartirish foydalanuvchi qarori.
- Nutq: 4 ta tab — Suhbat, Qoliplar, Xatolar, Boshqa (Tarjima, Erkin nutq, Shadowing).
- "Yodlanganlar" menyudan olindi; Kutubxonada "Yodlangan" filtri tanlanganda unga havola chiqadi.

## 3. Bitta kunlik sessiya ✅

- Sessiya oxirida oxirgi bosqich: nutq mashqlarida xato aytilgan gaplar bo'lsa,
  "Xato gaplarni to'g'rilash (N)" tugmasi shu yerning o'zida mashqni ochadi.
- Bugun sahifasida **faol so'zlar** ko'rsatkichi (nutqda 3 xil kunda to'g'ri ishlatilgan
  so'zlar / hamma so'zlar) va to'g'rilanmagan xato gaplar uchun havola.
- AI ishonchliligi: model osilib qolsa, zaxira modelga o'tiladi; qolip tanlash 12 soniyadan
  keyin so'z turkumi bo'yicha tanlashga qaytadi.
- Push eslatma so'zlar bilan sanaydi (migratsiya qo'llangan:
  `20261110000100_reminder_words.sql`).

## 4. So'zni hayotdan tez ushlash ✅

- Telefonda matnni belgilab "Ulashish → LL": Qo'shish sahifasi so'z bilan ochiladi
  (PWA share target). Qo'shtirnoq, tinish belgisi va sahifa manzili olib tashlanadi.
- Lug'atda bor so'zning tarjimasi, misoli va turkumi o'zi to'ladi; yo'q bo'lsa
  tarjimani foydalanuvchi yozadi.
- Kirish talab qilinsa ham ulashilgan so'z yo'qolmaydi.
- Ishlashi uchun ilova telefonga o'rnatilgan (Bosh ekranga qo'shilgan) bo'lishi kerak;
  o'rnatilgan bo'lsa, manifest yangilanishi uchun qayta o'rnatish kerak bo'lishi mumkin.

## 5. Ishonchlilik ✅

- Ma'lumot eksporti allaqachon bor ekan: Import → Zaxira (so'zlar, kartalar, takrorlash
  tarixi, sozlamalar; matnlar kirmaydi). Yangi ish kerak bo'lmadi.
- Qiyin so'zlar: o'rganilayotgan va 3+ marta unutilgan so'z "Qiyin" belgisi oladi.
  Kutubxonada "Faqat qiyin so'zlar" filtri va maslahat; Bugun sahifasida ular bo'lsa havola.

## 6. Lug'atda yo'q so'zlar ✅

- Ichki lug'at 8 645 ta so'zdan iborat; unda yo'q so'z (masalan "puddle") yozilsa yoki
  ulashilsa, tarjima, daraja, misol va izohni AI to'ldiradi va buni maydon ostida aytadi.
- Lug'atda bor so'z taklifdan tanlanmasdan yozilsa ham o'zi to'ladi.
- Foydalanuvchi yozgan tarjima hech qachon almashtirilmaydi.

## 2-bosqich reja: "tilga kirish" (2026-11-24)

**Maqsad.** So'zlarni faol so'zlarga aylantirib, ingliz tilida har kuni ishlata olish —
"tilga kirish". Shior: *1 000 ta passiv lug'at emas, 500 ta aktiv lug'at*. 500 — ramziy
bekat, chegara emas (yo'l belgilari: 50 → 100 → 250 → 500 → 1000 → …).

**Bosh ko'rsatkichlar (Bugun sahifasi):**
- 🗣 Bugun erkin ishlatilgan so'zlar (so'ralmasdan gapda ishlatilgan).
- 🔥 Gapirgan kunlar ketma-ketligi (Kun yakuni bajarilgan kunlar).
- 🟢 Faol so'zlar — jami va haftalik o'sish.

**So'z yo'li — 5 pog'ona** (Kutubxona, Bugun, Statistika bir xil ko'rsatadi):

| # | Pog'ona | O'tish sharti |
| --- | --- | --- |
| 1 | ⚪ Yangi | Qo'shildi |
| 2 | 🔵 Taniydi | EN→UZ karta `review` holatida |
| 3 | 🟣 Eslaydi | UZ→EN karta `review` holatida |
| 4 | 🟡 Birikmada | 3 ta birikma mustahkam (har biri 2+ marta to'g'ri eslangan) |
| 5 | 🟢 Faol | So'z/birikmasi Kun yakuni yoki Suhbatda so'ralmasdan 2 xil kunda to'g'ri ishlatilgan |

Faol so'z 21 kun erkin ishlatilmasa 🟡 ga tushadi (so'nish).

### Qurish tartibi

1. **Takrorlash xaritasi** — Bugun sahifasida bugungi so'zlar qo'shilgan kuni bo'yicha
   guruhlarda: guruhdagi so'zlar soni, bugun takrorlanadiganlari, nechanchi takrorlash
   (har so'z uchun alohida — takrorlangan kunlar soni), izoh. Sessiyada har karta
   tepasida guruh chipi. Migratsiyasiz.
2. **Qaytish rejimi** — 2+ kun kirilmasa yoki yuk odatdagidan 1,5× ko'p bo'lsa: yangi
   so'zlar to'xtaydi, kunlik yuk odatdagi hajm bilan cheklanadi, qolgani 3–5 kunga
   taqsimlanadi (`due_date` o'zgarmaydi), navbat "eng ko'p kechikkan" emas "eng ko'p xavf
   ostidagi" (yosh kartalar, `overdue_days / interval`) bo'yicha. "5 daqiqalik sessiya".
3. **Kun yakuni** — 1–2 daqiqa ovozli erkin gapirish (yozish — zaxira); 3–5 ta taklif
   so'z; AI: ishlatilgan faol so'zlar, bitta asosiy xato, aytolmagan narsa uchun birikma.
   Erkin faollik shu yerda (va Suhbatda) sanaladi.
4. **So'z yo'li** — 5 pog'ona ko'rinishi va Bugundagi 3 ta raqam.
5. **Birikma zanjiri** — 3-pog'onadan keyin takrorlash: eski birikmani eslash (SRS bahosi
   shundan) + eski eslansa yangi, takrorlanmaydigan birikma yangi kontekstda. So'zga ≤ 6
   birikma, `norm_key` unikal, kontekst oxirgi 3 tadan farqli, nutqda tez-tez
   ishlatiladiganlar birinchi. Jadvallar: `collocations`, `collocation_reviews`.
6. **So'nish va passiv qarz** — 🔵+🟣 so'zlar 40 dan oshsa yangi so'z limiti yarmiga tushadi.

## Keyingi g'oyalar (rejalashtirilmagan)

- Zaxiraga matnlar va nutq tarixini qo'shish.
- Qiyin so'z uchun AI yordamida yangi misol yoki eslab qolish usuli taklif qilish.

## Qilinmaydigan ishlar (hozircha)

- Kartalar jadvalini qayta qurish: hozirgi tuzilma yangi qoidalar bilan ishlaydi.
- Yangi mashq turlari: avval mavjudlari ishlatilishi ko'rilsin.
