/* settings.js — הגדרות: ניהול משתמשים, ימי פעילות, שאלון השיחה, לוגו, גיבוי/שחזור (מנהל בלבד) */
(function (global) {
  'use strict';
  var U = global.U;

  function render(root) {
    var core = Store.core();
    root.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '⚙️ הגדרות וגיבוי' })]));

    // ---- ניהול משתמשים (מנהל) ----
    if (global.UsersView && Store.isAdmin()) {
      var umBox = U.el('div', { class: 'card', style: 'margin-bottom:16px;' });
      global.UsersView.render(umBox);
      root.appendChild(umBox);
    }

    // ---- הגדרות כלליות ----
    var nameInp = U.el('input', { type: 'text', value: core.settings.schoolName || '', style: 'width:100%;' });
    nameInp.addEventListener('change', function () { core.settings.schoolName = nameInp.value; Store.save('core'); });

    // לוגו מותאם (מחליף את ה-🏠 בסרגל הצד, מסונכרן לכל המשתמשים)
    var curLogo = core.settings.logoDataUrl || '';
    var logoPrev = U.el('span', { class: 'logo-prev' }, curLogo ? [U.el('img', { src: curLogo, alt: 'לוגו' })] : '🏠');
    var logoFile = U.el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
    logoFile.addEventListener('change', function () {
      var f = logoFile.files[0]; if (!f) return;
      readLogoFile(f, function (url) {
        if (!url) { U.toast('לא ניתן לקרוא את קובץ התמונה', 'error'); return; }
        core.settings.logoDataUrl = url;
        Store.save('core'); App.render();
        U.toast('הלוגו עודכן');
      });
    });
    var logoRow = U.el('div', { class: 'field' }, [
      U.el('label', { text: 'סמל / לוגו' }),
      U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        logoPrev,
        U.el('button', { class: 'btn small secondary', onclick: function () { logoFile.click(); } }, '🖼 העלאת תמונה'),
        curLogo ? U.el('button', { class: 'btn small secondary', title: 'חזרה לסמל המקורי 🏠', onclick: function () {
          delete core.settings.logoDataUrl;
          Store.save('core'); App.render();
          U.toast('חזרנו לסמל המקורי');
        } }, '✕ הסרה') : null,
        logoFile
      ])
    ]);

    // ימי פעילות (זמן פנימיה)
    var daysWrap = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
    [0, 1, 2, 3, 4, 5, 6].forEach(function (day) {
      var chk = U.el('input', { type: 'checkbox', checked: (core.settings.dormDays || []).indexOf(day) !== -1 });
      chk.addEventListener('change', function () {
        var set = {};
        (core.settings.dormDays || []).forEach(function (d) { set[d] = true; });
        if (chk.checked) set[day] = true; else delete set[day];
        core.settings.dormDays = Object.keys(set).map(Number).sort();
        Store.save('core');
      });
      daysWrap.appendChild(U.el('label', { style: 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:13.5px;border:1px solid var(--border);border-radius:8px;padding:5px 9px;margin:0;' }, [chk, U.el('span', { text: U.WEEKDAYS[day] })]));
    });

    // יעד שיחות אישיות — שיחה לכל תלמיד כל X ימים
    var goalInp = U.el('input', { type: 'number', min: '1', value: U.num(core.settings.convGoalDays, 30) || 30, style: 'width:70px;' });
    goalInp.addEventListener('change', function () { core.settings.convGoalDays = Math.max(1, U.num(goalInp.value, 30)); Store.save('core'); });

    // שעת התראת סגירת לילה
    var closeInp = U.el('input', { type: 'number', min: '0', max: '23', value: U.num(core.settings.closeHour, 22), style: 'width:64px;' });
    closeInp.addEventListener('change', function () { core.settings.closeHour = Math.min(23, Math.max(0, U.num(closeInp.value, 22))); Store.save('core'); });

    root.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:560px;' }, [
      U.el('h3', { style: 'margin-top:0;', text: 'הגדרות כלליות' }),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם המוסד' }), nameInp]),
      logoRow,
      U.el('div', { class: 'field' }, [
        U.el('label', { text: 'ימי זמן פנימיה (מילוי נוכחות)' }), daysWrap,
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'בימים אלו נפתח גיליון נוכחות; אפשר לסמן גם בימים אחרים במקרה חריג.' })
      ]),
      U.el('div', { class: 'field' }, [
        U.el('label', { text: '🔔 התראת סגירת לילה' }),
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          U.el('span', { text: 'הצג התראה בדשבורד אם היום לא נסגר עד השעה' }), closeInp
        ]),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'בדרך כלל 22 (סגירת 22:30).' })
      ]),
      U.el('div', { class: 'field' }, [
        U.el('label', { text: '🎯 יעד שיחות אישיות' }),
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          U.el('span', { text: 'שיחה אישית לכל תלמיד כל' }), goalInp, U.el('span', { text: 'ימים' })
        ]),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'קובע את ההתראות בדשבורד ואת פסי ההתקדמות של המדריכים בגיליון חינוך תלמידים.' })
      ])
    ]));

    // ---- שאלון השיחה האישית ----
    root.appendChild(buildQuestionsCard(core));

    // ---- גיבוי ----
    var backup = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:560px;' });
    backup.appendChild(U.el('h3', { style: 'margin-top:0;', text: 'גיבוי' }));
    backup.appendChild(U.el('p', { class: 'muted', style: 'font-size:13px;', text: 'הנתונים נשמרים ומסונכרנים אוטומטית בענן. כאן אפשר להוריד גיבוי נקודתי לקובץ ולשחזר ממנו בעת הצורך.' }));
    var fileInput = U.el('input', { type: 'file', accept: '.json', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      Modal.confirm({ title: 'שחזור מגיבוי', text: 'שחזור מגיבוי יחליף את כל הנתונים הקיימים. להמשיך?', okLabel: 'שחזר', danger: true }, function () {
        Store.importJSONFile(f, function (err) {
          if (err) U.toast('שגיאה בטעינה: ' + err.message, 'error');
          else { U.toast('הנתונים נטענו בהצלחה'); App.render(); }
        });
      });
    });
    backup.appendChild(U.el('div', { class: 'row' }, [
      U.el('button', { class: 'btn', onclick: function () { Store.exportJSON(); } }, '⬇ הורד גיבוי'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fileInput.click(); } }, '⬆ שחזור מקובץ')
    ]));
    backup.appendChild(fileInput);

    // גיבוי אוטומטי תקופתי — snapshots במכשיר
    maybeAutoSnapshot();
    var autoChk = U.el('input', { type: 'checkbox', checked: core.settings.autoBackup !== false });
    autoChk.addEventListener('change', function () { core.settings.autoBackup = autoChk.checked; Store.save('core'); App.render(); });
    var daysInp = U.el('input', { type: 'number', min: '1', value: U.num(core.settings.autoBackupDays, 7) || 7, style: 'width:64px;' });
    daysInp.addEventListener('change', function () { core.settings.autoBackupDays = Math.max(1, U.num(daysInp.value, 7)); Store.save('core'); });
    backup.appendChild(U.el('hr', { style: 'margin:12px 0;border:0;border-top:1px solid var(--border);' }));
    backup.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
      U.el('label', { style: 'display:inline-flex;gap:6px;align-items:center;cursor:pointer;font-weight:600;' }, [autoChk, U.el('span', { text: 'גיבוי אוטומטי' })]),
      U.el('span', { class: 'muted', text: 'כל' }), daysInp, U.el('span', { class: 'muted', text: 'ימים (4 האחרונים נשמרים במכשיר)' })
    ]));
    var snaps = getSnapshots();
    if (snaps.length) {
      var listWrap = U.el('div');
      snaps.slice().reverse().forEach(function (sn) {
        listWrap.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;' }, [
          U.el('span', { style: 'flex:1;font-size:13px;', text: '📅 ' + U.gregLabel(sn.date) + ' · ' + Math.round((sn.size || 0) / 1024) + 'KB' }),
          U.el('button', { class: 'btn small secondary', onclick: function () { restoreSnapshot(sn); } }, 'שחזר'),
          U.el('button', { class: 'btn small secondary', title: 'הורדה לקובץ', onclick: function () { downloadSnapshot(sn); } }, '⬇')
        ]));
      });
      backup.appendChild(U.el('div', { style: 'margin-top:6px;' }, [U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:2px;', text: 'גיבויים אוטומטיים שמורים:' }), listWrap]));
    }
    root.appendChild(backup);

    // ---- אזור סכנה ----
    var danger = U.el('div', { class: 'card danger-zone', style: 'max-width:560px;' });
    danger.appendChild(U.el('h3', { style: 'margin-top:0;color:var(--danger);', text: '⚠ אזור מסוכן' }));
    danger.appendChild(U.el('p', { class: 'muted', text: 'מחיקת כל הנתונים (תלמידים, נוכחות, חוגים, שיחות והכל). פעולה בלתי הפיכה — קובץ גיבוי מלא יורד אוטומטית לפני המחיקה.' }));
    danger.appendChild(U.el('button', { class: 'btn danger', onclick: function () {
      Modal.confirm({ title: '⚠ מחיקת כל הנתונים', text: 'כל הנתונים יימחקו — תלמידים, נוכחות, חוגים, שיחות והכל.\nבטוחים?', okLabel: 'המשך', danger: true }, function () {
        Modal.confirm({ title: '⚠ אזהרה אחרונה', text: 'הפעולה בלתי הפיכה.\nקובץ גיבוי מלא יירד אוטומטית לפני המחיקה — שמרו אותו במקום בטוח.\nלמחוק את הכל?', okLabel: 'מחק את הכל', danger: true }, function () {
          try { Store.exportJSON(); } catch (e) {}
          var fresh = Store.defaultData();
          fresh.core.wipedAt = new Date().toISOString(); // מחיקה מכוונת — עוקפת את ההגנה מפני דריסה בליבה ריקה
          Store.replaceAll(fresh);
          Store.saveAllRows();
          App.render();
          U.toast('כל הנתונים נמחקו', 'info');
        });
      });
    } }, 'מחק את כל הנתונים'));
    root.appendChild(danger);
  }

  // ---------- עורך שאלון השיחה האישית ----------
  function buildQuestionsCard(core) {
    var box = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:560px;' });
    box.appendChild(U.el('h3', { style: 'margin-top:0;', text: '💬 שאלון השיחה האישית' }));
    box.appendChild(U.el('p', { class: 'muted', style: 'font-size:13px;', text: 'השאלות שהמדריך ממלא אחרי כל שיחה אישית (גיליון "חינוך תלמידים"). אפשר להוסיף, לשנות ולסדר.' }));

    var typeLabels = { scale: 'דירוג 1–5', text: 'טקסט חופשי', yesno: 'כן / לא' };
    var qs = core.settings.convQuestions || [];

    var list = U.el('div');
    qs.forEach(function (q, i) {
      var lblInp = U.el('input', { type: 'text', value: q.label, style: 'flex:1;min-width:150px;' });
      lblInp.addEventListener('change', function () { q.label = lblInp.value; Store.save('core'); });
      var typeSel = U.el('select', null, Object.keys(typeLabels).map(function (t) { return U.el('option', { value: t }, typeLabels[t]); }));
      typeSel.value = q.type || 'text';
      typeSel.addEventListener('change', function () { q.type = typeSel.value; Store.save('core'); });
      list.appendChild(U.el('div', { style: 'display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;' }, [
        U.el('span', { class: 'muted', style: 'width:18px;font-size:12px;', text: String(i + 1) }),
        lblInp, typeSel,
        U.el('button', { class: 'btn small secondary', title: 'העברה למעלה', disabled: i === 0, onclick: function () {
          qs.splice(i, 1); qs.splice(i - 1, 0, q); Store.save('core'); App.render();
        } }, '↑'),
        U.el('button', { class: 'btn small danger', title: 'מחיקת השאלה', onclick: function () {
          Modal.confirm({ title: 'מחיקת שאלה', text: 'למחוק את השאלה "' + q.label + '"?\nתשובות שכבר נשמרו בשיחות קודמות יישארו.', okLabel: 'מחק', danger: true }, function () {
            qs.splice(i, 1); Store.save('core'); App.render();
          });
        } }, '🗑')
      ]));
    });
    box.appendChild(list);
    box.appendChild(U.el('button', { class: 'btn secondary small', style: 'margin-top:10px;', onclick: function () {
      qs.push({ id: 'q_' + Store.uid(), label: 'שאלה חדשה', type: 'text' });
      Store.save('core'); App.render();
    } }, '+ הוספת שאלה'));
    return box;
  }

  // ---------- קריאת קובץ לוגו: הקטנה ל-128px ושמירה כ-Data URL (קטן מספיק לסנכרון ענן) ----------
  function readLogoFile(f, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var max = 128, sc = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * sc));
          cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cb(cv.toDataURL('image/png'));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = rd.result;
    };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(f);
  }

  // ---------- גיבוי אוטומטי: snapshots ב-localStorage ----------
  function getSnapshots() { try { return JSON.parse(localStorage.getItem('dorm_snapshots')) || []; } catch (e) { return []; } }
  function saveSnapshots(a) { try { localStorage.setItem('dorm_snapshots', JSON.stringify(a)); } catch (e) { /* מכסה מלאה */ } }
  function maybeAutoSnapshot() {
    var d = (global.Store && Store.get) ? Store.get() : null;
    if (!d || !d.core || !d.core.settings || d.core.settings.autoBackup === false) return;
    var days = U.num(d.core.settings.autoBackupDays, 7) || 7;
    var snaps = getSnapshots();
    var today = U.todayISO();
    if (snaps.length) {
      var last = snaps[snaps.length - 1];
      var diff = (U.fromISO(today) - U.fromISO(last.date)) / 86400000;
      if (diff < days) return;
    }
    var json;
    try { json = JSON.stringify(d); } catch (e) { return; }
    snaps.push({ date: today, size: json.length, json: json });
    while (snaps.length > 4) snaps.shift();
    saveSnapshots(snaps);
  }
  function restoreSnapshot(sn) {
    Modal.confirm({ title: 'שחזור גיבוי', text: 'לשחזר גיבוי מתאריך ' + U.gregLabel(sn.date) + '?\nכל הנתונים הנוכחיים יוחלפו.', okLabel: 'שחזר', danger: true }, function () {
      try {
        Store.replaceAll(JSON.parse(sn.json));
        Store.saveAllRows();
        U.toast('הגיבוי שוחזר בהצלחה'); App.render();
      } catch (e) { U.toast('שגיאה בשחזור: ' + (e.message || e), 'error'); }
    });
  }
  function downloadSnapshot(sn) {
    var blob = new Blob([sn.json], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'גיבוי-פנימיה-' + sn.date + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.SettingsView = { render: render, autoSnapshot: maybeAutoSnapshot };
})(window);
