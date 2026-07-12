# ניהול פנימיה — ישיבת רגבים בנימין

אפליקציית ניהול פנימיה למנהל הפנימיה וצוות המדריכים: נוכחות תלמידים בזמן פנימיה, דיווחי חוגים, גיליון חינוך תלמידים (שיחות אישיות + רמזור), ודשבורד מנהלים חי.

בנויה באותה תבנית של אפליקציית ניהול החקלאות: אתר סטטי ללא build (HTML + CSS + JS), נתונים ואימות ב-Supabase, אירוח ב-GitHub Pages.

## מבנה

```
dorm-site/            האתר עצמו (מתפרסם ל-GitHub Pages)
  index.html          שלד הדף: התחברות, סרגל צד, אזור תוכן
  styles.css          העיצוב (פלטה כחולה, מבוסס על עיצוב אפליקציית החקלאות)
  js/
    util.js           עזרי DOM/תאריכים/טוסטים
    store.js          שכבת הנתונים: Supabase, localStorage, realtime, תפקידים
    app.js            ניתוב טאבים, הרשאות תצוגה, מודאל
    attendance.js     גיליון נוכחות יומי
    atthistory.js     דוחות נוכחות (לפי תאריך / לפי תלמיד) + ייצוא אקסל
    chugim.js         דיווחי חוגים
    education.js      גיליון חינוך תלמידים: רמזור + שיחות אישיות
    dashboard.js      דשבורד מנהלים
    base.js           נתוני בסיס: תלמידים/כיתות/צוות/חוגים
    users.js          ניהול משתמשים (דרך פונקציית ענן)
    settings.js       הגדרות, שאלון השיחה, גיבוי/שחזור
    importData.js     ייבוא תלמידים (JSON של אפליקציית החקלאות / אקסל)
supabase/functions/dorm-manage-users/   פונקציית ענן ליצירת/איפוס חשבונות (אופציונלי)
.github/workflows/deploy-pages.yml      פרסום אוטומטי ל-GitHub Pages בכל push ל-main
```

## התקנה חד-פעמית

### 1. טבלת הנתונים ב-Supabase

באתר Supabase (הפרויקט הקיים המשותף לכל האפליקציות) → SQL Editor → הריצו פעם אחת:

```sql
create table if not exists public.dorm_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.dorm_state enable row level security;
create policy "dorm read"   on public.dorm_state for select to authenticated using (true);
create policy "dorm insert" on public.dorm_state for insert to authenticated with check (true);
create policy "dorm update" on public.dorm_state for update to authenticated using (true);
create policy "dorm delete" on public.dorm_state for delete to authenticated using (true);
alter table public.dorm_state replica identity full;
alter publication supabase_realtime add table public.dorm_state;
```

הנתונים נשמרים בשורות נפרדות לפי תחום (`core`, `att:<תאריך>`, `chug`, `edu`) —
כך כמה מדריכים יכולים לסמן נוכחות בו-זמנית, והסימונים מתמזגים לפי תלמיד במקום לדרוס זה את זה.

### 2. משתמשים

- משתמשים נוצרים ב-Supabase → Authentication → Users (אימייל + סיסמה), או מתוך האפליקציה במסך ההגדרות אם פרסתם את פונקציית `dorm-manage-users`.
- אותם משתמשים משמשים גם את אפליקציות התקציב והחקלאות (אותו פרויקט Supabase).
- **תפקידים** נקבעים בתוך האפליקציה: נתוני בסיס → צוות (או הגדרות → ניהול משתמשים):
  - **מנהל פנימיה** — כל המסכים.
  - **מדריך** — נוכחות, דוחות נוכחות (הכיתה שלו), חוגים (צפייה), חינוך תלמידים.
  - **מדריך חוג** — דיווח על החוגים שלו בלבד.
- המיילים `yagelflorsheim@gmail.com` ו-`guy@rgvb.org.il` מקבלים הרשאת מנהל תמיד (קבוע `ADMIN_EMAILS` ב-`store.js`) — כדי שהכניסה הראשונה, לפני שהוזן צוות, תהיה עם גישה מלאה.

### 3. GitHub Pages

בהגדרות הריפו: **Settings → Pages → Source: GitHub Actions**.
מרגע זה כל push ל-`main` שנוגע ב-`dorm-site/` מפרסם אוטומטית את האתר בכתובת:
`https://guytsuberi1.github.io/regavim-dorm/`

(רוצים דומיין משלכם, למשל `pnimia.rgvb.org.il`? הוסיפו קובץ `CNAME` בתוך `dorm-site/` ורשומת DNS מתאימה.)

### 4. אופציונלי — פונקציית ניהול משתמשים

מאפשרת ליצור/לאפס/למחוק חשבונות מתוך מסך ההגדרות (במקום דרך לוח הבקרה של Supabase):

```bash
supabase functions deploy dorm-manage-users
```

הפונקציה מאמתת שהקורא הוא מנהל מורשה (Secret אופציונלי `DORM_ADMIN_EMAILS`, אחרת הרשימה הקשיחה בקוד) ורק אז משתמשת במפתח ה-service-role. בלי פריסה — האפליקציה עובדת רגיל, ורק כפתורי יצירת החשבונות מציגים הודעה מתאימה.

## ייבוא תלמידים

נתוני בסיס → תפריט ⋮ → **ייבוא תלמידים מאפליקציית החקלאות**: בוחרים את קובץ הגיבוי (JSON) של אפליקציית החקלאות, ממפים כל שכבה לכיתת פנימיה (ט, י1, י2, יא, יב) — והתלמידים נכנסים. אפשר גם דרך תבנית אקסל.

## מודל האבטחה — חשוב לדעת

כמו באפליקציות התקציב והחקלאות: מפתח ה-anon של Supabase מוטמע בדף, וכל משתמש **מאומת** יכול טכנית לקרוא ולכתוב את כל הנתונים (RLS פתוח ל-authenticated). ההרשאות בתוך האפליקציה (מנהל/מדריך/מדריך חוג) הן ברמת הממשק בלבד. זה מתאים לצוות קטן ואמון; אין להזין למערכת מידע רגיש במיוחד.

## פיתוח

- אין build — עורכים את הקבצים ודוחפים.
- **חשוב:** אחרי כל שינוי ב-CSS/JS יש להעלות את מספר הגרסה `?v=N` ב-`index.html` (בכל השורות) — אחרת דפדפנים יגישו קבצים ישנים מהמטמון.
- הנתונים נשמרים גם ב-localStorage מקומי (`regavim_dorm_v1`) לטעינה מהירה ועבודה רציפה.
