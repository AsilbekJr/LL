# LL — So'z yodlash (SRS + faol ishlatish)

Shaxsiy PWA: inglizcha so'z/gaplarni interval takrorlash bilan yodlash va ularni
yozish hamda gapirishda **majburan ishlatish**. Next.js 16 + Supabase.

Reja, papka tuzilmasi va DB sxemasi: [`docs/PLAN.md`](docs/PLAN.md).

## Holat

| Faza | Mazmuni | Holat |
| --- | --- | --- |
| 1 | Loyiha, Supabase sxema + RLS, auth, layout, PWA shell | ✅ |
| 2 | SRS engine + unit testlar | ✅ |
| 3 | Qo'shish / Kutubxona / Import / Backup | ✅ |
| 4 | Takrorlash sessiyasi (1–6 bosqich) | ✅ |
| 5 | Production (yozish, gapirish, shadowing) + AI | ✅ |
| 6 | Kalendar, statistika, push, offline sync | ✅ |
| 7 | Polish, Lighthouse, E2E, deploy | ✅ |

## 1. O'rnatish (Windows, PowerShell)

Kerak: Node.js ≥ 20.9 (sizda 24 bor), Git.

```powershell
cd C:\Users\Asilbek\Desktop\vibe1\LL
npm install
copy .env.example .env.local
```

> Paket versiyalari `package.json`da `^` bilan berilgan — `npm install` mos keluvchi
> eng so'nggi barqaror versiyalarni o'rnatadi.

## 2. Supabase loyihasini yaratish

1. <https://supabase.com/dashboard> → **New project** (region: Frankfurt yoki eng yaqini).
2. **Project Settings → API**: `Project URL` va **publishable key** ni `.env.local`ga yozing.
3. **Database → Extensions**: `pg_cron` ni yoqing.
4. Migratsiyalarni yuborish:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <PROJECT-REF>
   npx supabase db push
   npm run db:types   # TypeScript tiplarini bazadan qayta yaratadi
   ```

5. **Authentication → Users → Add user**: o'z email/parolingiz bilan hisob yarating
   ("Auto confirm user" belgilang).
6. **Authentication → Sign In / Providers → Email**: hisob yaratilgach
   **"Allow new users to sign up"** ni **o'chiring** (shaxsiy ilova).

## 3. Ishga tushirish

```powershell
npm run dev        # http://localhost:3000
npm test           # unit testlar (Vitest)
npm run lint
npm run typecheck
```

Telefonda sinash: kompyuter va telefon bir Wi-Fi'da bo'lsa, `npm run dev -- -H 0.0.0.0`
va telefondan `http://<kompyuter-IP>:3000`. (Service worker faqat `npm run build && npm start`
yoki HTTPS'da ishlaydi.)

## 4. Testlar

```powershell
npm test            # unit testlar (Vitest) — SRS, sana chegaralari, import, oflayn
npm run test:e2e    # Playwright: lokal build'ni ishga tushirib sinaydi
```

**E2E production'ga qarshi** (telefon 360px + desktop):

```powershell
$env:E2E_BASE_URL="https://ll-topaz-zeta.vercel.app"
$env:E2E_EMAIL="e2e-test@example.com"      # alohida test hisobi
$env:E2E_PASSWORD="<.env.local dagi E2E_PASSWORD>"
npx playwright install chromium
npm run test:e2e
```

- `tests/e2e/shell.spec.ts` — kirmagan foydalanuvchi: `/login` ga yo'naltirish, forma
  validatsiyasi, 360px da gorizontal scroll yo'qligi, manifest.
- `tests/e2e/app.spec.ts` — test hisobi bilan: bo'sh kutubxona, barcha ekranlar 360px ga
  sig'ishi, so'z qo'shish + dublikat, ro'yxat qo'shish, qidiruv, import (xato fayl + namunaviy
  to'plam), takrorlash sessiyasi **o'rtasida internet uziladi va qaytgach sinxronlanadi**,
  kalendar, statistika, sozlamalar, oxirida tozalash.
- Test hisobi haqiqiy hisobingizdan alohida (RLS ularni to'liq ajratadi). Uni yaratish:
  Supabase → Authentication → Users → Add user (yoki SQL), parolni `.env.local` dagi
  `E2E_EMAIL` / `E2E_PASSWORD` ga yozing.

**Lighthouse (mobil)**: Chrome DevTools → Lighthouse → Mobile, yoki
`npx lighthouse https://ll-topaz-zeta.vercel.app/login --form-factor=mobile --view`.

Oxirgi o'lchov (`/login`, 2026-11-06): desktop — Performance 97, Accessibility 100,
Best Practices 100, SEO 100 (LCP 0.7 s, TBT 0 ms). Mobil (tuzatishlardan oldin) — 94 / 100 /
100 / 91; tuzatishlardan keyingi mobil o'lchov beqaror tarmoq sababli yakunlanmadi.

## 5. Deploy (Vercel)

1. GitHub repo Vercel'ga ulangan: `main` ga har push avtomatik production deploy.
2. Vercel → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   ixtiyoriy `AI_FEEDBACK_ENABLED` + `ANTHROPIC_API_KEY`.
3. Supabase → Authentication → URL Configuration: Site URL va Redirect URLs ga Vercel
   manzilini qo'shing.
4. Yangi migratsiyalar: `npx supabase db push`; Edge Function:
   `npx supabase functions deploy send-reminders`.

## Muhim texnik qarorlar

- **Next.js 16**: `middleware.ts` → `src/proxy.ts`. Build `next build --webpack` bilan,
  chunki Serwist (service worker) webpack plaginiga tayanadi.
- **Kun chegarasi**: barcha `due_date` Asia/Tashkent kalendar sanasi. Unit testlar
  ataylab `TZ=America/New_York` da ishlaydi.
- **Kechikkan kartalar** hech qayerga ko'chirilmaydi: `due_date` o'tmishda qoladi,
  `cards_view.overdue_days` har doim bugungi sanadan hisoblanadi → karta yo'qolmaydi.
- **RLS** har bir jadvalda; child jadvallar composite FK `(id, user_id)` bilan bog'langan,
  shuning uchun boshqa foydalanuvchi qatoriga bog'lab bo'lmaydi.
- **pg_cron** har kecha 00:05 (Toshkent) da `daily_snapshots` yozadi (kalendar tarixi uchun).
- **Oflayn takrorlash**: har bir javob avval IndexedDB (Dexie) navbatiga yoziladi, keyin
  tartib bilan Supabase'ga yuboriladi (`client_id` bilan idempotent). Internet bor paytda
  bugungi sessiya nusxasi saqlab boriladi, shuning uchun takrorlashni internetsiz ham boshlash
  mumkin (shu kuni ilova kamida bir marta internet bilan ochilgan bo'lsa). Kech yetib kelgan
  eski javob kartaning yangiroq holatini bosib ketmaydi: `cards` dagi trigger
  `last_reviewed_at` eskiroq bo'lgan yangilashni o'tkazib yuboradi (log saqlanadi).
- **Lug'at** (`public/vocab/*.json`, 8 645 so'z, A1–C2): Import → "Lug'atlar" tabida daraja →
  so'z turkumi bo'yicha ~60 so'zlik lug'atlar → yangi so'zlarni tanlab qo'shish; "Qo'shish"
  sahifasida inglizcha maydon shu lug'atdan takliflar beradi (Downshift combobox).
  Manba: [CEFR-J Wordlist 1.5](https://www.cefr-j.org/download.html) (© Tono Lab, TUFS) va
  [Octanove Vocabulary Profile C1/C2](https://github.com/openlanguageprofiles/olp-en-cefrj)
  (CC BY-SA 4.0); o'zbekcha tarjimalar `data/vocab/uz/*.tsv` da. Qayta yig'ish:
  `node scripts/vocab/normalize.mjs && node scripts/vocab/build.mjs` (batafsil:
  `data/vocab/source/README.md`).
- **Nutq mashqi** (`/nutq`): *Qoliplar* (60 ta gap qolipi, A1–C2, kutubxonadagi so'z bilan
  to'ldirib aytiladi), *Tarjima* (o'zbekcha gap → inglizcha og'zaki), *Erkin nutq*, *Shadowing*.
  So'z 3 xil kunda nutqda to'g'ri ishlatilgach "faol" sanaladi (statistikada ko'rinadi).
  Gaplar: [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR) → `public/sentences/*.json`.
  Qayta yig'ish: `eng_sentences.tsv` ni [Tatoeba eksportidan](https://downloads.tatoeba.org/exports/per_language/eng/)
  yuklab, `node scripts/vocab/sentences.mjs <papka>`; tarjima mashqlari
  `data/vocab/sentences/uz/*.tsv` dan: `node scripts/vocab/translations.mjs`.

## Env o'zgaruvchilar

`.env.example` ga qarang. `NEXT_PUBLIC_*` dan boshqa kalitlar faqat serverda ishlatiladi.

### AI fikr-mulohaza (ixtiyoriy)

Yozma/og'zaki mashqlarda "AI bilan tekshirish" tugmasi Claude orqali grammatika va so'z
ishlatilishini tekshiradi. Yoqish uchun `.env.local` ga:

```
AI_FEEDBACK_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...      # https://platform.claude.com → API Keys
# AI_MODEL=claude-opus-5-5        # ixtiyoriy, standart qiymat
```

Kalit faqat serverda (`/api/ai-feedback`) ishlatiladi, brauzerga yuborilmaydi. Har bir
foydalanuvchiga daqiqasiga 20 tagacha so'rov.

### Push eslatmalar (ixtiyoriy)

Har 5 daqiqada pg_cron `send-reminders` Edge Function'ni chaqiradi; funksiya Sozlamalardagi
eslatma vaqti kelgan va bugun takrorlashi bor foydalanuvchiga
"Bugun 24 ta takrorlash, 5 tasi kechikkan" xabarini yuboradi (har vaqt uchun kuniga bir marta).

1. VAPID kalitlari: `npx web-push generate-vapid-keys` (ushbu loyihada allaqachon
   `.env.local` ga yozilgan: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `CRON_SECRET`).
2. Vercel → Settings → Environment Variables: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>`,
   keyin qayta deploy.
3. Supabase: **Database → Extensions** da `pg_net` ni yoqing, migratsiyalarni yuboring
   (`npx supabase db push`) va funksiyani deploy qiling
   (`npx supabase functions deploy send-reminders`).
4. **SQL Editor** da secret'larni Vault'ga yozing (`<random>` = `CRON_SECRET`):

   ```sql
   select vault.create_secret('https://<PROJECT-REF>.supabase.co', 'll_project_url');
   select vault.create_secret('<random>', 'll_cron_secret');
   select vault.create_secret('<public key>', 'll_vapid_public_key');
   select vault.create_secret('<private key>', 'll_vapid_private_key');
   select vault.create_secret('https://<ilova manzili>', 'll_vapid_subject');
   ```

5. Ilovada **Sozlamalar → Eslatmalar → Yoqish**.

**iPhone/iPad**: push faqat ilova **Bosh ekranga qo'shilganda** ishlaydi (Safari → Ulashish →
"Bosh ekranga qo'shish"), keyin ilovani o'sha belgidan ochib eslatmalarni yoqing (iOS 16.4+).
Service worker faqat production build'da (`npm run build && npm start` yoki Vercel) ishlaydi.
