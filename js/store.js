/* store.js — מודל הנתונים והסנכרון לענן (Supabase).
   בשונה מאפליקציית החקלאות (blob יחיד), הנתונים כאן מפוצלים לשורות לפי תחום
   בטבלת dorm_state — כדי שכמה מדריכים יוכלו לסמן נוכחות בו-זמנית בלי לדרוס זה את זה:
     core        — תלמידים, כיתות, צוות, חוגים, הגדרות (כתיבה נדירה, החלפה מלאה)
     att:YYYY-MM-DD — גיליון נוכחות של יום (חם, רב-כותבים — מיזוג לפי תלמיד)
     chug        — דיווחי חוגים (מיזוג לפי מזהה דיווח)
     edu         — שיחות ותיעוד חינוכי (מיזוג לפי מזהה שיחה)              */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'regavim_dorm_v1';

  // ---------- מבנה ברירת מחדל ----------
  function newMeta() { return { version: 1, lastModified: new Date().toISOString() }; }

  function defaultQuestions() {
    return [
      { id: 'q_mood',    label: 'מצב רוח כללי',                 type: 'scale' },
      { id: 'q_social',  label: 'תחושה חברתית בפנימיה',         type: 'scale' },
      { id: 'q_study',   label: 'מצב לימודי בישיבה',            type: 'scale' },
      { id: 'q_hard',    label: 'קשיים שעלו בשיחה',             type: 'text' },
      { id: 'q_strong',  label: 'נקודות חוזק והצלחות',          type: 'text' },
      { id: 'q_follow',  label: 'נדרש מעקב / המשך טיפול?',      type: 'yesno' }
    ];
  }

  function defaultCore() {
    return {
      meta: newMeta(),
      settings: {
        schoolName: 'ישיבת רגבים בנימין',
        dormDays: [0, 1, 2, 3],           // ראשון–רביעי
        convQuestions: defaultQuestions()  // שאלון השיחה האישית — המנהל עורך בהגדרות
      },
      classes: [                           // 5 הכיתות של הפנימיה
        { id: 'c9',  name: 'ט'  },
        { id: 'c10a', name: 'י1' },
        { id: 'c10b', name: 'י2' },
        { id: 'c11', name: 'יא' },
        { id: 'c12', name: 'יב' }
      ],
      students: [],  // { id, name, classId, room, building, phone, parentName, parentPhone, active, notes, eduStatus:{level,note,by,at} }
      staff: [],     // { id, name, email, phone, role:'admin'|'madrich'|'chug', classId, active }
      chugim: []     // { id, name, instructorStaffId, days:[0..6], time, location, studentIds:[], active }
    };
  }

  function defaultData() {
    return {
      core: defaultCore(),
      att: {},  // { 'YYYY-MM-DD': { date, status:'open'|'closed', marks:{studentId:{st,note,by,at}}, closedBy, closedAt, meta } }
      chug: { meta: newMeta(), reports: [] },      // { id, chugId, date, marks:{studentId:'present'|'absent'}, rating, note, by, at, updatedAt }
      edu:  { meta: newMeta(), conversations: [] } // { id, studentId, date, by, byName, answers:{qid:val}, summary, flag, updatedAt }
    };
  }

  var data = null;

  // ---------- מזהה ייחודי ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- טעינה/שמירה מקומית ----------
  function ensureCoreFields(core) {
    var def = defaultCore();
    for (var k in def) { if (!(k in core)) core[k] = def[k]; }
    if (!core.settings.dormDays) core.settings.dormDays = [0, 1, 2, 3];
    if (!core.settings.convQuestions || !core.settings.convQuestions.length) core.settings.convQuestions = defaultQuestions();
    if (!core.settings.convGoalDays) core.settings.convGoalDays = 30; // יעד: שיחה אישית לכל תלמיד כל X ימים
    return core;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = JSON.parse(raw);
        var def = defaultData();
        for (var k in def) { if (!(k in data)) data[k] = def[k]; }
        ensureCoreFields(data.core);
      } else {
        data = defaultData();
      }
    } catch (e) {
      console.error('load failed', e);
      data = defaultData();
    }
    return data;
  }

  function persistLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.error('save failed', e); if (global.U) U.toast('שגיאה בשמירה מקומית: ' + e.message, 'error'); }
  }

  // ---------- גישה לשורות (rowId → אובייקט בזיכרון) ----------
  function rowGet(rowId) {
    if (rowId === 'core') return data.core;
    if (rowId === 'chug') return data.chug;
    if (rowId === 'edu') return data.edu;
    if (rowId.indexOf('att:') === 0) return data.att[rowId.slice(4)] || null;
    return null;
  }
  function rowSet(rowId, obj) {
    if (rowId === 'core') data.core = ensureCoreFields(obj);
    else if (rowId === 'chug') data.chug = obj;
    else if (rowId === 'edu') data.edu = obj;
    else if (rowId.indexOf('att:') === 0) data.att[rowId.slice(4)] = obj;
  }
  function allRowIds() {
    var ids = ['core', 'chug', 'edu'];
    Object.keys(data.att || {}).forEach(function (d) { ids.push('att:' + d); });
    return ids;
  }

  // ---------- מצב ענן (Supabase) ----------
  var SB_URL = 'https://dcnndzrdimkogfjsvcku.supabase.co';
  var SB_KEY = 'sb_publishable_LoALeRJVUqiyBwWhCF_0qQ_RpLwS4ew';
  var TABLE = 'dorm_state';
  var sb = (global.supabase && global.supabase.createClient) ? global.supabase.createClient(SB_URL, SB_KEY) : null;
  var cloudMode = !!sb;
  // כניסה דרך קישור "איפוס סיסמה" מהמייל — נזהה ונבקש סיסמה חדשה אחרי הטעינה
  var pendingRecovery = false;
  try { if (/type=recovery/.test(String(location.hash))) pendingRecovery = true; } catch (e) {}
  if (sb && sb.auth && sb.auth.onAuthStateChange) {
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') pendingRecovery = true; });
  }
  var applyingRemote = false;
  var pendingRemote = {}; // rowId → עדכון מהענן שממתין כל עוד חלון עריכה (מודאל) פתוח

  // ---------- תפקידים ----------
  // מנהלי-על (bootstrap): מקבלים הרשאת מנהל גם כשרשימת הצוות עדיין ריקה
  var ADMIN_EMAILS = ['yagelflorsheim@gmail.com', 'guy@rgvb.org.il'];
  var sessionUser = null;
  function setSessionUser(u) { sessionUser = u || null; }
  function currentEmail() { return sessionUser && sessionUser.email ? String(sessionUser.email).toLowerCase() : null; }

  function staffByEmail(email) {
    email = String(email || '').toLowerCase();
    if (!email || !data) return null;
    return (data.core.staff || []).filter(function (s) {
      return (s.email || '').toLowerCase() === email && s.active !== false;
    })[0] || null;
  }
  // הרשאה אפקטיבית: admin=מנהל פנימיה (הכל) · madrich=מדריך · chug=מדריך חוג
  function roleOf(email) {
    email = String(email || '').toLowerCase();
    if (!email) return 'madrich';
    if (ADMIN_EMAILS.indexOf(email) !== -1) return 'admin';
    var s = staffByEmail(email);
    if (s && (s.role === 'admin' || s.role === 'madrich' || s.role === 'chug')) return s.role;
    return 'madrich';
  }
  function currentRole() {
    if (!cloudMode) return 'admin'; // מצב מקומי (פיתוח, ללא ענן) — גישה מלאה
    return sessionUser ? roleOf(currentEmail()) : 'madrich';
  }
  function isAdmin() { return currentRole() === 'admin'; }
  function myStaff() { return staffByEmail(currentEmail()); }
  function myName() {
    var s = myStaff();
    if (s && s.name) return s.name;
    var em = currentEmail();
    return em ? em.split('@')[0] : 'משתמש';
  }

  // ---------- שמירה: debounce נפרד לכל שורה ----------
  var saveTimers = {};
  var CLIENT_ID = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // rowId ברירת מחדל: 'core'
  function save(rowId) {
    if (!data) return;
    rowId = rowId || 'core';
    var row = rowGet(rowId);
    if (!row) return;
    if (!row.meta) row.meta = newMeta();
    row.meta.lastModified = new Date().toISOString();
    row.meta.savedBy = CLIENT_ID;
    persistLocal();
    if (cloudMode && !applyingRemote) {
      setStatus('שומר…');
      scheduleCloudSave(rowId);
    }
  }
  function scheduleCloudSave(rowId) {
    if (!cloudMode) return;
    if (saveTimers[rowId]) clearTimeout(saveTimers[rowId]);
    saveTimers[rowId] = setTimeout(function () { cloudSave(rowId); }, 500);
  }
  function cloudSave(rowId) {
    var row = rowGet(rowId);
    if (!sb || !row) return;
    row.meta = row.meta || newMeta();
    row.meta.savedBy = CLIENT_ID;
    sb.from(TABLE).upsert({ id: rowId, data: row, updated_at: new Date().toISOString() })
      .then(function (res) {
        if (res.error) { console.error('cloudSave', rowId, res.error); setStatus('שגיאת שמירה לענן'); }
        else setStatus('נשמר בענן ' + new Date().toLocaleTimeString('he-IL'));
      });
  }

  // ---------- מיזוג ברמת רשומה ----------
  function ts(x) { return x ? (Date.parse(x) || 0) : 0; }
  function metaTs(row) { return row && row.meta ? ts(row.meta.lastModified) : 0; }

  // גיליון נוכחות: איחוד הסימונים לפי תלמיד — הסימון החדש (at) מנצח; "סגור" גובר על "פתוח"
  function mergeAtt(local, incoming) {
    if (!local) return incoming;
    if (!incoming) return local;
    var out = { date: local.date || incoming.date, marks: {}, meta: metaTs(local) >= metaTs(incoming) ? local.meta : incoming.meta };
    var keys = {};
    Object.keys(local.marks || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(incoming.marks || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      var a = (local.marks || {})[k], b = (incoming.marks || {})[k];
      if (!a) { out.marks[k] = b; return; }
      if (!b) { out.marks[k] = a; return; }
      out.marks[k] = ts(a.at) >= ts(b.at) ? a : b;
    });
    var closed = (local.status === 'closed' || incoming.status === 'closed');
    // "פתיחה מחדש" של מנהל: reopenedAt חדש יותר מ-closedAt מבטלת את הסגירה
    var closedAt = Math.max(ts(local.closedAt), ts(incoming.closedAt));
    var reopenedAt = Math.max(ts(local.reopenedAt), ts(incoming.reopenedAt));
    if (closed && reopenedAt > closedAt) closed = false;
    out.status = closed ? 'closed' : 'open';
    var src = ts(local.closedAt) >= ts(incoming.closedAt) ? local : incoming;
    out.closedBy = src.closedBy; out.closedAt = src.closedAt;
    if (reopenedAt) { var rsrc = ts(local.reopenedAt) >= ts(incoming.reopenedAt) ? local : incoming; out.reopenedAt = rsrc.reopenedAt; out.reopenedBy = rsrc.reopenedBy; }
    return out;
  }

  // אוספי רשומות (דיווחי חוגים / שיחות): איחוד לפי id — updatedAt חדש מנצח
  function mergeRecords(localArr, incomingArr) {
    var byId = {};
    (incomingArr || []).forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    (localArr || []).forEach(function (r) {
      if (!r || !r.id) return;
      var other = byId[r.id];
      if (!other || ts(r.updatedAt) > ts(other.updatedAt)) byId[r.id] = r;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
  }

  function jsonEq(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }

  // החלת שורה שהגיעה מהענן (בטעינה ראשונית או ברילטיים)
  // מחזירה true אם השתנה משהו מקומית (ונדרש רינדור)
  function mergeIncoming(rowId, incoming, initial) {
    if (!incoming) return false;
    var local = rowGet(rowId);

    if (rowId.indexOf('att:') === 0) {
      var mergedAtt = mergeAtt(local, incoming);
      if (jsonEq(mergedAtt, local)) return false;
      rowSet(rowId, mergedAtt);
      // אם למקומי היו סימונים שהצד השני לא ראה — נדחוף את התוצאה הממוזגת חזרה לענן
      if (!jsonEq(mergedAtt, incoming)) scheduleCloudSave(rowId);
      return true;
    }

    if (rowId === 'chug' || rowId === 'edu') {
      var key = rowId === 'chug' ? 'reports' : 'conversations';
      var merged = {};
      merged[key] = mergeRecords(local ? local[key] : [], incoming[key]);
      merged.meta = metaTs(local) >= metaTs(incoming) ? (local && local.meta) : incoming.meta;
      if (jsonEq(merged[key], local && local[key])) { rowSet(rowId, merged); return false; }
      rowSet(rowId, merged);
      if (!jsonEq(merged[key], incoming[key])) scheduleCloudSave(rowId);
      return true;
    }

    // core — החלפה מלאה, החדש מנצח (כתיבה נדירה של המנהל)
    if (local && metaTs(local) > metaTs(incoming)) {
      if (!initial) return false;
      // בטעינה ראשונית המידע המקומי חדש יותר — נדחוף אותו לענן
      scheduleCloudSave(rowId);
      return false;
    }
    if (jsonEq(local, incoming)) return false;
    rowSet(rowId, incoming);
    return true;
  }

  // ---------- ענן: טעינה ורילטיים ----------
  function cloudLoadAll() {
    return sb.from(TABLE).select('id, data')
      .then(function (res) {
        if (res.error) { console.error('cloudLoadAll', res.error); return null; }
        return res.data || [];
      }).catch(function (e) { console.error(e); return null; });
  }

  function subscribeRealtime() {
    if (!sb) return;
    sb.channel('dorm_state_rt').on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      function (payload) {
        var rowId = payload.new && payload.new.id;
        var incoming = payload.new && payload.new.data;
        if (!rowId || !incoming) return;
        // דלג על הד שמקורו בלקוח הזה
        if (incoming.meta && incoming.meta.savedBy === CLIENT_ID) return;
        // אל תחיל עדכון core בזמן שהמשתמש עורך בטופס — החל עם סגירת החלון
        if (rowId === 'core' && typeof document !== 'undefined' && document.querySelector('.modal-bg')) {
          pendingRemote[rowId] = incoming;
          return;
        }
        applyRemote(rowId, incoming);
      }).subscribe();
  }

  function applyRemote(rowId, incoming) {
    applyingRemote = true;
    var changed = mergeIncoming(rowId, incoming, false);
    if (changed) {
      persistLocal();
      var _sy = (global.scrollY || 0);
      if (global.App && App.render) App.render();
      global.scrollTo(0, _sy);
      setStatus('עודכן בזמן אמת ' + new Date().toLocaleTimeString('he-IL'));
    }
    applyingRemote = false;
  }

  // נקרא עם סגירת מודאל — מחיל עדכונים מהענן שהמתינו בזמן העריכה
  function flushPendingRemote() {
    if (typeof document !== 'undefined' && document.querySelector('.modal-bg')) return;
    var ids = Object.keys(pendingRemote);
    if (!ids.length) return;
    ids.forEach(function (rowId) {
      var inc = pendingRemote[rowId];
      delete pendingRemote[rowId];
      applyRemote(rowId, inc);
    });
  }

  // ---------- גישה לנתונים (אוספי core) ----------
  function get() { return data; }
  function core() { return data.core; }

  function getById(collection, id) {
    var arr = data.core[collection] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function upsert(collection, item) {
    if (!data.core[collection]) data.core[collection] = [];
    if (!item.id) { item.id = uid(); data.core[collection].push(item); }
    else {
      var arr = data.core[collection], found = false;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === item.id) { arr[i] = item; found = true; break; }
      }
      if (!found) arr.push(item);
    }
    save('core');
    return item;
  }

  function remove(collection, id) {
    var arr = data.core[collection] || [];
    data.core[collection] = arr.filter(function (x) { return x.id !== id; });
    save('core');
  }

  // ---------- נוכחות ----------
  // מחזיר את גיליון היום; create=true יוצר אותו אם אינו קיים
  function attFor(date, create) {
    var s = data.att[date];
    if (!s && create) {
      s = { date: date, status: 'open', marks: {}, meta: newMeta() };
      data.att[date] = s;
    }
    return s || null;
  }
  function saveAtt(date) { save('att:' + date); }

  // סימון נוכחות לתלמיד: st=null מוחק את הסימון
  function setMark(date, studentId, st, note) {
    var s = attFor(date, true);
    if (st == null) { delete s.marks[studentId]; }
    else {
      var m = s.marks[studentId] || {};
      m.st = st;
      if (note !== undefined) m.note = note;
      m.by = myName();
      m.at = new Date().toISOString();
      s.marks[studentId] = m;
    }
    saveAtt(date);
    return s;
  }

  // סטטיסטיקת נוכחות לתלמיד ב-N הימים האחרונים (רק ימים שיש להם גיליון)
  function attStats(studentId, lastNDays) {
    var since = lastNDays ? U.addDays(U.todayISO(), -lastNDays) : null;
    var total = 0, present = 0, byStatus = { present: 0, absent: 0, home: 0, sick: 0 };
    Object.keys(data.att).forEach(function (d) {
      if (since && d < since) return;
      var m = data.att[d].marks[studentId];
      if (!m) return;
      total++;
      if (byStatus[m.st] !== undefined) byStatus[m.st]++;
      if (m.st === 'present') present++;
    });
    return { total: total, present: present, pct: total ? Math.round(present / total * 100) : null, byStatus: byStatus };
  }

  // רצף היעדרויות נוכחי: כמה ימים רצופים (מהיום המסומן האחרון אחורה) התלמיד "נעדר"
  function absStreak(studentId) {
    var dates = Object.keys(data.att).sort().reverse();
    var streak = 0;
    for (var i = 0; i < dates.length; i++) {
      var m = data.att[dates[i]].marks[studentId];
      if (!m) { if (streak === 0) continue; break; } // מדלג על ימים שטרם סומן בהם, עד הסימון האחרון
      if (m.st === 'absent') streak++;
      else break;
    }
    return streak;
  }

  // ---------- דיווחי חוגים ----------
  function upsertReport(report) {
    if (!report.id) report.id = uid();
    report.updatedAt = new Date().toISOString();
    var arr = data.chug.reports, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === report.id) { arr[i] = report; found = true; break; }
    if (!found) arr.push(report);
    save('chug');
    return report;
  }
  function reportFor(chugId, date) {
    return (data.chug.reports || []).filter(function (r) { return r.chugId === chugId && r.date === date; })[0] || null;
  }

  // ---------- שיחות (חינוך תלמידים) ----------
  function upsertConversation(conv) {
    if (!conv.id) conv.id = uid();
    conv.updatedAt = new Date().toISOString();
    var arr = data.edu.conversations, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === conv.id) { arr[i] = conv; found = true; break; }
    if (!found) arr.push(conv);
    save('edu');
    return conv;
  }
  function lastConversation(studentId) {
    var list = (data.edu.conversations || []).filter(function (c) { return c.studentId === studentId; });
    list.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    return list[0] || null;
  }

  // ---------- גיבוי/שחזור ידני ----------
  function exportJSON() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'גיבוי-פנימיה-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function replaceAll(obj) {
    data = obj;
    var def = defaultData();
    for (var k in def) { if (!(k in data)) data[k] = def[k]; }
    ensureCoreFields(data.core);
    persistLocal();
  }

  function importJSONFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        replaceAll(JSON.parse(reader.result));
        saveAllRows();
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    };
    reader.onerror = function () { cb && cb(reader.error); };
    reader.readAsText(file);
  }

  function saveAllRows() { allRowIds().forEach(function (id) { save(id); }); }

  function isEmptyData() {
    if (!data) return true;
    return !((data.core.students && data.core.students.length) ||
             (data.core.staff && data.core.staff.length) ||
             Object.keys(data.att || {}).length);
  }

  var statusEl = null;
  function setStatus(msg) {
    if (!statusEl) statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;
    // יצירת span חדש בכל עדכון — מפעיל מחדש את אנימציית ההבהוב (חיווי "נשמר" חי)
    statusEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'flash';
    span.textContent = msg;
    statusEl.appendChild(span);
  }

  // ---------- ענן: התחברות ואתחול ----------
  function cloudStart(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    cloudLoadAll().then(function (rows) {
      if (rows) {
        var seen = {};
        rows.forEach(function (r) { seen[r.id] = true; mergeIncoming(r.id, r.data, true); });
        // שורות שקיימות רק מקומית (או seed ראשוני) — נדחפות לענן
        if (!rows.length && isEmptyData() && global.__SEED_DATA) replaceAll(global.__SEED_DATA);
        allRowIds().forEach(function (id) {
          if (!seen[id]) scheduleCloudSave(id);
        });
        if (!seen.core) scheduleCloudSave('core');
        persistLocal();
      }
      subscribeRealtime();
      updateUserBar();
      setStatus('מחובר לענן');
      cb && cb(true);
      // הגעה מקישור איפוס סיסמה — מבקשים סיסמה חדשה מיד אחרי הטעינה
      if (pendingRecovery) { pendingRecovery = false; setTimeout(openNewPasswordDialog, 400); }
    });
  }

  // דיאלוג בחירת סיסמה חדשה (אחרי לחיצה על הקישור מהמייל)
  function openNewPasswordDialog() {
    var U = global.U, Modal = global.Modal;
    if (!U || !Modal) return;
    var p1 = U.el('input', { type: 'password', placeholder: 'סיסמה חדשה (6 תווים לפחות)', autocomplete: 'new-password', style: 'width:100%;' });
    var p2 = U.el('input', { type: 'password', placeholder: 'אימות הסיסמה', autocomplete: 'new-password', style: 'width:100%;' });
    var err = U.el('div', { class: 'login-err', style: 'min-height:18px;' });
    Modal.open('🔑 בחירת סיסמה חדשה', U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'נכנסתם דרך קישור איפוס הסיסמה. בחרו סיסמה חדשה לחשבון.' }),
      U.el('div', { class: 'field' }, [p1]),
      U.el('div', { class: 'field' }, [p2]),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירת סיסמה', onClick: function (close) {
        var v1 = p1.value || '', v2 = p2.value || '';
        if (v1.length < 6) { err.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים'; p1.focus(); return; }
        if (v1 !== v2) { err.textContent = 'הסיסמאות אינן זהות'; p2.focus(); return; }
        err.textContent = '';
        sb.auth.updateUser({ password: v1 }).then(function (res) {
          if (res.error) { err.textContent = 'שמירת הסיסמה נכשלה — נסו שוב'; return; }
          close();
          global.U.toast('הסיסמה עודכנה בהצלחה');
        });
      } }
    ]);
  }

  function showLogin(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    var btn = document.getElementById('loginBtn');
    var emailEl = document.getElementById('loginEmail');
    var passEl = document.getElementById('loginPass');
    var errEl = document.getElementById('loginErr');
    function doLogin() {
      var email = (emailEl.value || '').trim(), pass = passEl.value || '';
      if (!email || !pass) { if (errEl) errEl.textContent = 'נא למלא אימייל וסיסמה'; return; }
      if (errEl) errEl.textContent = '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spin"></span>מתחבר…'; }
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
        if (res.error) { if (errEl) errEl.textContent = 'אימייל או סיסמה שגויים — נסו שוב'; if (passEl) { passEl.value = ''; passEl.focus(); } return; }
        setSessionUser(res.data && res.data.user);
        cloudStart(cb);
      });
    }
    if (btn) btn.onclick = doLogin;
    // שכחתי סיסמה — שליחת מייל עם קישור איפוס לכתובת שהוזנה
    var forgot = document.getElementById('forgotBtn');
    if (forgot) forgot.onclick = function () {
      var email = (emailEl.value || '').trim();
      if (!email) {
        if (errEl) { errEl.classList.remove('ok'); errEl.textContent = 'מלאו את האימייל למעלה ואז לחצו שוב על "שכחתי סיסמה"'; }
        emailEl.focus(); return;
      }
      forgot.disabled = true; forgot.textContent = 'שולח…';
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (res) {
        forgot.disabled = false; forgot.textContent = 'שכחתי סיסמה';
        if (!errEl) return;
        if (res.error) { errEl.classList.remove('ok'); errEl.textContent = 'שליחת המייל נכשלה — נסו שוב בעוד רגע'; return; }
        errEl.classList.add('ok');
        errEl.textContent = '✓ נשלח מייל עם קישור לאיפוס — בדקו את תיבת הדואר (גם בספאם)';
      });
    };
    if (passEl) passEl.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    if (emailEl) emailEl.onkeydown = function (e) { if (e.key === 'Enter') { passEl && passEl.focus(); } };
    // עין להצגת/הסתרת הסיסמה
    var eye = document.getElementById('passEye');
    if (eye && passEl) eye.onclick = function () {
      var show = passEl.type === 'password';
      passEl.type = show ? 'text' : 'password';
      eye.textContent = show ? '🙈' : '👁️';
      passEl.focus();
    };
  }

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function roleLabel(r) { return { admin: 'מנהל פנימיה', madrich: 'מדריך', chug: 'מדריך חוג' }[r] || r; }
  function updateUserBar() {
    if (!sb) return;
    sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      var el = document.getElementById('headerSync');
      if (!el || !u) return;
      var email = u.email || '';
      var name = myName();
      var first = name.split(/\s+/)[0] || '?';
      var dark = document.body.classList.contains('dark');
      el.innerHTML = '<button class="mode-switch' + (dark ? ' on' : '') + '" id="darkToggle" role="switch" aria-checked="' + dark + '" aria-label="מצב לילה" title="' + (dark ? 'מעבר למצב יום' : 'מעבר למצב לילה') + '">'
          + '<span class="ms-ico ms-sun">☀️</span><span class="ms-ico ms-moon">🌙</span><span class="ms-knob"></span></button>'
        + '<div class="usermenu">'
        + '<button class="avatar" id="avatarBtn" aria-label="תפריט משתמש" title="' + escHtml(name) + ' · ' + escHtml(email) + '">' + escHtml(first) + '</button>'
        + '<div class="usermenu-pop" id="userPop">'
          + '<div class="um-name">' + escHtml(name) + '</div>'
          + '<div class="um-email">' + escHtml(email) + '</div>'
          + '<div class="um-role">הרשאה: ' + escHtml(roleLabel(currentRole())) + '</div>'
          + '<a class="um-item" href="guide.html" target="_blank" style="text-decoration:none;display:block;">📖 מדריך למשתמש</a>'
          + '<button class="um-item um-logout" id="umLogout">↩️ התנתקות</button>'
        + '</div></div>';
      var ab = document.getElementById('avatarBtn'), pop = document.getElementById('userPop');
      if (ab && pop) {
        ab.onclick = function (e) { e.stopPropagation(); pop.classList.toggle('open'); };
        document.addEventListener('click', function () { pop.classList.remove('open'); });
      }
      var lo = document.getElementById('umLogout'); if (lo) lo.onclick = doLogout;
      var dt = document.getElementById('darkToggle');
      if (dt) dt.onclick = function () {
        var on = document.body.classList.toggle('dark');
        try { localStorage.setItem('dorm_dark', on ? '1' : '0'); } catch (e) {}
        dt.classList.toggle('on', on);
        dt.setAttribute('aria-checked', on ? 'true' : 'false');
        dt.title = on ? 'מעבר למצב יום' : 'מעבר למצב לילה';
      };
    }).catch(function () {});
  }
  function doLogout() { if (sb) sb.auth.signOut().then(function () { location.reload(); }); }

  // אתחול שמירה/טעינה — נקרא פעם אחת בעליית האפליקציה
  function initPersistence(cb) {
    if (cloudMode) {
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { setSessionUser(r.data.session.user); cloudStart(cb); }
        else showLogin(cb);
      }).catch(function () { showLogin(cb); });
      return;
    }
    cb && cb(false); // ללא ענן — מצב מקומי בלבד (פיתוח)
  }

  // ---------- ניהול משתמשים (דרך Edge Function dorm-manage-users) ----------
  function manageUsers(payload) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    return sb.functions.invoke('dorm-manage-users', { body: payload }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(
            function (j) { throw new Error((j && j.error) || res.error.message); },
            function () { throw res.error; }
          );
        }
        throw res.error;
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data || {};
    });
  }

  // ---------- חשיפה גלובלית ----------
  global.Store = {
    uid: uid,
    load: load,
    save: save,
    get: get,
    core: core,
    getById: getById,
    upsert: upsert,
    remove: remove,
    // נוכחות
    attFor: attFor,
    saveAtt: saveAtt,
    setMark: setMark,
    attStats: attStats,
    absStreak: absStreak,
    // חוגים
    upsertReport: upsertReport,
    reportFor: reportFor,
    // חינוך תלמידים
    upsertConversation: upsertConversation,
    lastConversation: lastConversation,
    // גיבוי
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    replaceAll: replaceAll,
    saveAllRows: saveAllRows,
    defaultData: defaultData,
    // ענן והרשאות
    initPersistence: initPersistence,
    manageUsers: manageUsers,
    setStatus: setStatus,
    isAdmin: isAdmin,
    currentRole: currentRole,
    roleOf: roleOf,
    roleLabel: roleLabel,
    myStaff: myStaff,
    myName: myName,
    currentEmail: currentEmail,
    flushPendingRemote: flushPendingRemote,
    ADMIN_EMAILS: ADMIN_EMAILS
  };
})(window);
