# LL — SRS ilova: reja, papka tuzilmasi va DB sxemasi (tasdiqlash uchun)

## 1. Papka tuzilmasi

```
LL/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/                      # himoyalangan zona, bottom-tab (mobil) / sidebar (desktop)
│  │  │  ├─ layout.tsx
│  │  │  ├─ bugun/page.tsx           # Today / Dashboard
│  │  │  ├─ takrorlash/page.tsx      # Review session (full-screen)
│  │  │  ├─ qoshish/page.tsx         # Add (+ paste list)
│  │  │  ├─ kutubxona/page.tsx       # Library
│  │  │  ├─ yodlanganlar/page.tsx    # Mastered
│  │  │  ├─ kalendar/page.tsx
│  │  │  ├─ import/page.tsx
│  │  │  ├─ statistika/page.tsx
│  │  │  ├─ sozlamalar/page.tsx
│  │  │  └─ nutq/page.tsx            # Free speaking drill (stage 9)
│  │  ├─ api/ai-feedback/route.ts    # AI SDK, faqat server, env flag ortida
│  │  ├─ manifest.ts
│  │  └─ sw.ts                       # Serwist service worker
│  ├─ components/
│  │  ├─ ui/                         # shadcn
│  │  ├─ layout/                     # BottomNav, Sidebar
│  │  ├─ review/                     # har bir metod uchun komponent (Encounter, MultipleChoice, Flashcard, Spelling, Listening, Cloze, WordOrder, WritingProduction, SpeakingProduction, Shadowing)
│  │  ├─ calendar/                   # MonthView, Heatmap
│  │  └─ common/                     # OverdueBadge, EmptyState, ErrorState
│  ├─ lib/
│  │  ├─ srs/                        # SOF MANTIQ, UI'siz, 100% unit-test
│  │  │  ├─ ladder.ts                # interval ladder scheduler
│  │  │  ├─ fsrs.ts                  # ts-fsrs adapter
│  │  │  ├─ dates.ts                 # Asia/Tashkent kun chegaralari
│  │  │  ├─ overdue.ts               # rollover, kechikish, jarima
│  │  │  ├─ mastery.ts               # mastered qoidasi + "fake passing" bloki
│  │  │  ├─ stages.ts                # card stage → metod tanlash, interleaving
│  │  │  └─ queue.ts                 # kunlik navbat, load balancing
│  │  ├─ text/                       # Levenshtein, diff, so'z ishlatilganini tekshirish (lemma/forma)
│  │  ├─ speech/                     # TTS / SpeechRecognition wrapper + fallback
│  │  ├─ schemas/                    # Zod: item, pack import, backup, settings
│  │  ├─ supabase/                   # client.ts, server.ts, middleware.ts, database.types.ts
│  │  ├─ offline/                    # Dexie DB, sync queue
│  │  └─ i18n/uz.ts                  # barcha UI matnlari bir joyda
│  ├─ hooks/                         # TanStack Query hook'lar
│  ├─ stores/                        # Zustand (session state)
│  └─ middleware.ts
├─ supabase/
│  ├─ migrations/                    # 0001_init.sql, 0002_rls.sql, 0003_cron.sql ...
│  ├─ functions/send-reminders/      # Edge Function (web-push)
│  └─ seed.sql
├─ public/samples/                   # a1.json … c2.json (~20 ta), template.json
├─ tests/
│  ├─ unit/                          # Vitest
│  └─ e2e/                           # Playwright (360px viewport)
└─ docs/
```

## 2. DB sxemasi (spec + tavsiya etilgan o'zgarishlar)

Barcha jadvallarda `user_id uuid not null default auth.uid()` va RLS `user_id = auth.uid()`.

**items** — spec bo'yicha + `updated_at`.
Unikal: `create unique index on items (user_id, lower(english))` (ifodaga unique *constraint* qo'yib bo'lmaydi, shuning uchun unique *index*).

**cards** — spec bo'yicha + quyidagilar:
- `user_id` (spec'da yo'q, lekin `(user_id, due_date)` indeks va RLS uchun kerak)
- `stage smallint` (1–6 card darajasida; 7–8 item darajasida, `productions` orqali)
- `updated_at timestamptz` (offline sync konfliktlari uchun)
- unikal `(item_id, direction)`
- `overdue_days` — **saqlanmaydi**, chunki u bugungi sanaga bog'liq (Postgres generated column `current_date`ni qabul qilmaydi). O'rniga `cards_view` view'da va klientda hisoblanadi: `max(0, today_tashkent − due_date)`.

**review_logs** — spec + `user_id`, `client_id uuid unique` (offline'dan qayta yuborilsa dublikat bo'lmasligi uchun), `ladder_step_before/after`, `interval_days`.

**productions** — spec + `user_id`, `card_id` (nullable), `context` (work/travel/IELTS…), `prompt`, `passed boolean`, `duration_ms` (gapirish vaqti), `kind` ('written'|'spoken'|'shadowing'|'drill').

**packs** — spec + `user_id`.

**settings** — `user_id` PK, spec maydonlari + `timezone` (default 'Asia/Tashkent'), `overdue_penalty` (sozlanadigan), `theme`.

**push_subscriptions** — spec + `id`, `created_at`, unikal `endpoint`.

**daily_snapshots** (YANGI) — `user_id, day date, due_count, done_count, missed_count`. pg_cron har kuni Toshkent yarim tunida yozadi. Kalendardagi "missed" sonini o'tmish uchun aniq ko'rsatish uchun kerak (aks holda faqat taxminiy hisoblanadi).

Indekslar: `cards(user_id, due_date)`, `cards(user_id, status)`, `review_logs(user_id, reviewed_at)`, `productions(item_id)`.

## 3. SRS qoidalari (aniqlashtirilgan)
- Hard: `max(1, round(ladder[step] × 0.6))`.
- Again: `step = max(0, step − 2)`, `due = bugun`, sessiya oxiriga qayta qo'shiladi.
- Kechikish jarimasi: Good/Easy'da interval × `max(0.7, 1 − 0.05 × overdue_days)` (sozlanadigan).
  Eslatma: FSRS tadqiqotlari aslida *kechikib to'g'ri eslangan* kartaga uzunroq interval beradi; spec talabiga ko'ra yumshoq jarima qo'llayman, lekin uni sozlamalarda o'chirish mumkin bo'ladi.
- "Fake passing" bloki: item'da ≥1 o'tilgan yozma VA ≥1 o'tilgan og'zaki production bo'lmaguncha card oxirgi 3 pog'onaga (35/60/100) chiqa olmaydi — o'sha joyda production bosqichi majburan beriladi.
- Mastered: ikkala yo'nalish oxirgi pog'onadan o'tgan + production shartlari → status `mastered`, `due = +180 kun`.

### 3.1. Engine'da qabul qilingan qarorlar (2-faza, `src/lib/srs/`)
- `ladder_step` = o'tilgan pog'onalar soni. `s` qadamda Good → interval `ladder[s]`, `s+1`; Easy → `ladder[s+1]`, `s+2` (bitta pog'ona sakraladi).
- Gate ushlab qolganda card oxirgi ochiq pog'onada qoladi (default: qadam 5, interval 20 kun) va `productionRequired` qaytariladi; sessiya avval yozma, keyin og'zaki production beradi.
- Status: Again yoki `ladder_step < 2` → `learning`, aks holda `review`. Mastered card'da Again → `learning`, qadam −2.
- Bosqichlar (card): 1 encounter (baholanmaydi) → 2 recognition → 3 recall → 4 spelling → 5 listening → 6 cloze. Gaplar uchun: 4 listening → 5 cloze → 6 word_order. Good/Easy +1, Hard o'zgarmaydi, Again −1 (2 dan pastga emas).
- Kunlik navbat: eng ko'p kechikkanlar birinchi, `daily_review_limit` gacha. `daily_new_limit` — yangi **item**lar soni; `both` rejimida ikkala yo'nalish, `random` rejimida bitta tasodifiy yo'nalish. Yangilar takrorlashlar orasiga teng taqsimlanadi, bir item'ning ikki card'i ketma-ket kelmaydi.
- Load balancing: ≥4 kunlik intervalda ±10% (max ±7 kun) oralig'ida eng bo'sh kun tanlanadi.
- FSRS rejimi: interval ts-fsrs'dan (fuzz o'chiq), lekin `ladder_step`, bosqich, gate va mastery qoidalari ladder bilan bir xil ishlaydi; gate FSRS intervalini ham cheklaydi.

## 4. Spec'dan chetlanishlar
1. **Versiyalarni tekshira olmadim** — ish muhitida npm registry'ga tarmoq yopiq. `package.json`da 2026 holatidagi ma'lum barqaror versiyalarni yozaman; o'zingiz `npm install` qilganda haqiqiy so'nggi versiyalar o'rnatiladi.
2. `date-fns-tz` o'rniga `@date-fns/tz` (date-fns v4'ning rasmiy timezone paketi) — v4 bilan to'g'ri ishlaydi.
3. `overdue_days` — view'da hisoblanadi (yuqoriga qarang).
4. `daily_snapshots` jadvali qo'shildi.
