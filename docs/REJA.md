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

## 5. Ishonchlilik

- Ma'lumot eksporti (JSON/CSV) — avval mavjudligi tekshiriladi.
- Qiyin so'zlar: qayta-qayta "Qayta" bosilayotgan so'zni aniqlash va boshqa usul taklif qilish.

## Qilinmaydigan ishlar (hozircha)

- Kartalar jadvalini qayta qurish: hozirgi tuzilma yangi qoidalar bilan ishlaydi.
- Yangi mashq turlari: avval mavjudlari ishlatilishi ko'rilsin.
