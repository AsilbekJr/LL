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
| 7 | Polish, Lighthouse, E2E, deploy | ⏳ |

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

1. VAPID kalitlari: `npx web-push generate-vapid-keys`
2. `.env.local` va Vercel'ga: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>`
3. Supabase: **Database → Extensions** da `pg_net` ni yoqing, migratsiyalarni yuboring
   (`npx supabase db push`).
4. Funksiya va uning secret'lari (`<random>` — istalgan uzun tasodifiy satr):

   ```powershell
   npx supabase functions deploy send-reminders
   npx supabase secrets set CRON_SECRET=<random> VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:siz@example.com
   ```

5. **SQL Editor** da (cron funksiyani shu qiymatlar bilan chaqiradi):

   ```sql
   select vault.create_secret('https://<PROJECT-REF>.supabase.co', 'll_project_url');
   select vault.create_secret('<random>', 'll_cron_secret');
   ```

6. Ilovada **Sozlamalar → Eslatmalar → Yoqish**.

**iPhone/iPad**: push faqat ilova **Bosh ekranga qo'shilganda** ishlaydi (Safari → Ulashish →
"Bosh ekranga qo'shish"), keyin ilovani o'sha belgidan ochib eslatmalarni yoqing (iOS 16.4+).
Service worker faqat production build'da (`npm run build && npm start` yoki Vercel) ishlaydi.
