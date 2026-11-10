# LL — o'zgarishlar rejasi

Maqsad: ilova sodda va ishonchli bo'lsin. Foydalanuvchi faqat **so'z** bilan ishlaydi,
har kuni bitta tugma bosadi, natijani esa "nutqda ishlata oladigan so'zlar soni" bilan o'lchaydi.

Qadamlar prioritet tartibida. Har bir qadam alohida tekshiriladi va alohida commit bo'ladi.

## 1. So'z — yagona birlik ✅ (bajarildi, commit kutmoqda)

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

## 3. Bitta kunlik sessiya

- "Boshlash": takrorlash → yangi so'zlar → oxirida kechagi xato gaplarni to'g'rilab aytish
  (hozirgi "Xatolar" tabi) bitta oqimda.
- Bugun sahifasida asosiy ko'rsatkich: **faol so'zlar** (nutqda 3 xil kunda to'g'ri
  ishlatilgan), ketma-ketlik yonida.
- Push eslatma so'zlar bilan sanaydi (migratsiya tayyor:
  `20261110000100_reminder_words.sql`, qo'llash uchun ruxsat kerak).

## 4. So'zni hayotdan tez ushlash

- Telefonda matnni belgilab "Ulashish → LL": Qo'shish sahifasi so'z bilan ochiladi
  (PWA share target).

## 5. Ishonchlilik

- Ma'lumot eksporti (JSON/CSV) — avval mavjudligi tekshiriladi.
- Qiyin so'zlar: qayta-qayta "Qayta" bosilayotgan so'zni aniqlash va boshqa usul taklif qilish.

## Qilinmaydigan ishlar (hozircha)

- Kartalar jadvalini qayta qurish: hozirgi tuzilma yangi qoidalar bilan ishlaydi.
- Yangi mashq turlari: avval mavjudlari ishlatilishi ko'rilsin.
