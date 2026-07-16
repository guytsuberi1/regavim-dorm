/* roster.js — מצבת יום ויציאות: ניהול היציאות המאושרות עד 17:00, ומצבת "מי נמצא ומי לא" */
(function (global) {
  'use strict';
  var U = global.U;
  var rDate = U.todayISO();

  // הכיתה שאליה מוגבל מדריך (מנהל — ללא הגבלה)
  function limitClassId() {
    if (Store.isAdmin()) return null;
    var me = Store.myStaff();
    return (me && me.classId) || null;
  }
  function visibleStudents() {
    var lim = limitClassId();
    return (Store.core().students || []).filter(function (s) {
      return s.active !== false && (!lim || s.classId === lim);
    });
  }

  function render(root) {
    var lim = limitClassId();
    var dInp = U.el('input', { type: 'date', value: rDate });
    dInp.addEventListener('change', function () { if (dInp.value) { rDate = dInp.value; App.render(); } });

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📋 מצבת יום ויציאות' }),
      U.dateChip(U.weekdayName(rDate) + ' · ' + U.gregLabel(rDate), dInp),
      rDate !== U.todayISO() ? U.el('button', { class: 'btn secondary small', onclick: function () { rDate = U.todayISO(); App.render(); } }, '↩ היום') : null,
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: function () { openLeaveForm(); } }, '+ יציאה מאושרת')
    ]));

    if (!visibleStudents().length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים. מנהל הפנימיה מוסיף תלמידים במסך "נתוני בסיס".'));
      return;
    }

    // ---------- מצבת נוכחית: מי בפנימיה ומי לא ----------
    var students = visibleStudents();
    var leaves = {};
    Store.leavesOn(rDate).forEach(function (e) { leaves[e.studentId] = e; });
    var outNow = students.filter(function (s) { return leaves[s.id]; });

    root.appendChild(U.el('div', { class: 'totbar' }, [
      U.el('div', { class: 't' }, [U.el('b', { text: String(students.length - outNow.length) }), U.el('span', { text: 'אמורים להיות בפנימיה' })]),
      U.el('div', { class: 't' }, [U.el('b', { style: 'color:var(--warn);', text: String(outNow.length) }), U.el('span', { text: 'יצאו באישור' })]),
      U.el('div', { class: 't' }, [U.el('b', { text: rDate === U.todayISO() ? new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—' }), U.el('span', { text: 'נכון לשעה' })])
    ]));

    // כפתור מצבת חירום מהיר
    root.appendChild(U.el('div', { style: 'margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;' }, [
      U.el('button', { class: 'btn accent', onclick: function () { global.EmergencyRoster ? EmergencyRoster(rDate) : null; } }, '🚨 מצבת חירום — מי נמצא עכשיו'),
      U.el('button', { class: 'btn secondary', onclick: function () { copyRoster(students, leaves); } }, '📋 העתקת מצבת')
    ]));

    // ---------- טבלת היציאות המאושרות ----------
    root.appendChild(U.el('h3', { style: 'color:var(--brand-dark);font-size:15px;margin:8px 0;', text: 'יציאות מאושרות (' + outNow.length + ')' }));
    if (!outNow.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין יציאות מאושרות ליום זה. מוסיפים דרך "+ יציאה מאושרת".'));
    } else {
      var rows = outNow.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); }).map(function (s) {
        var e = leaves[s.id];
        return U.el('tr', null, [
          U.el('td', { text: s.name }),
          U.el('td', null, [global.ClassBadge ? ClassBadge(s.classId) : null]),
          U.el('td', { text: e.until || 'לא חוזר הלילה' }),
          U.el('td', { text: e.approvedBy || '—' }),
          U.el('td', { text: e.parentApproval || '' }),
          U.el('td', { class: 'actions' }, [
            U.el('button', { class: 'btn small secondary', title: 'עריכה', onclick: function () { openLeaveForm(s.id); } }, '✏️'),
            U.el('button', { class: 'btn small danger', title: 'ביטול יציאה', onclick: function () { cancelLeave(s); } }, '🗑')
          ])
        ]);
      });
      root.appendChild(U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null, [
          U.el('th', { text: 'תלמיד' }), U.el('th', { text: 'כיתה' }), U.el('th', { text: 'חוזר' }),
          U.el('th', { text: 'אישר' }), U.el('th', { text: 'אישור הורים' }), U.el('th', { text: '' })
        ])]),
        U.el('tbody', null, rows)
      ]));
    }

    // ---------- מצבת שבת (חמישי/שישי) ----------
    var wd = U.fromISO(rDate).getDay();
    if (Store.isAdmin() && (wd === 4 || wd === 5)) {
      root.appendChild(buildShabbatCard());
    }
  }

  // ---------- טופס יציאה ----------
  function openLeaveForm(studentId) {
    var students = visibleStudents().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
    var existing = studentId ? Store.leaveOf(rDate, studentId) : null;

    var sSel = U.el('select', { style: 'width:100%;' }, students.map(function (s) {
      return U.el('option', { value: s.id }, s.name + (global.ClassName ? ' · ' + ClassName(s.classId) : ''));
    }));
    if (studentId) { sSel.value = studentId; sSel.disabled = true; }

    var untilInp = U.el('input', { type: 'text', value: existing ? existing.until : '', placeholder: 'לדוגמה: לא חוזר הלילה / חוזר ב-21:00' });
    var apprSel = U.el('select', null, ['מחנך', 'ראש ישיבה', 'מנהל פנימיה', 'אחר'].map(function (o) { return U.el('option', { value: o }, o); }));
    if (existing && existing.approvedBy) apprSel.value = ['מחנך', 'ראש ישיבה', 'מנהל פנימיה'].indexOf(existing.approvedBy) !== -1 ? existing.approvedBy : 'אחר';
    var apprOther = U.el('input', { type: 'text', placeholder: 'שם המאשר', style: 'margin-top:6px;' + (apprSel.value === 'אחר' ? '' : 'display:none;') });
    if (existing && apprSel.value === 'אחר') apprOther.value = existing.approvedBy;
    apprSel.addEventListener('change', function () { apprOther.style.display = apprSel.value === 'אחר' ? '' : 'none'; });
    var parentInp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'פרטי אישור ההורים (חובה ליציאה חריגה אחרי 17:00)' });
    parentInp.value = existing ? existing.parentApproval : '';

    Modal.open((existing ? 'עריכת' : 'הוספת') + ' יציאה מאושרת · ' + U.gregLabel(rDate), U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'תלמיד' }), sSel]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'חוזר' }), untilInp]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'מי אישר' }), apprSel, apprOther]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'אישור הורים' }), parentInp])
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var by = apprSel.value === 'אחר' ? (apprOther.value || 'אחר') : apprSel.value;
        Store.setLeave(rDate, sSel.value, { until: untilInp.value, approvedBy: by, parentApproval: parentInp.value });
        close(); App.render();
        U.toast('היציאה נשמרה');
      } }
    ]);
  }

  function cancelLeave(stu) {
    Modal.confirm({ title: 'ביטול יציאה', text: 'לבטל את היציאה המאושרת של "' + stu.name + '" ליום ' + U.gregLabel(rDate) + '?', okLabel: 'בטל יציאה', danger: true }, function () {
      Store.setLeave(rDate, stu.id, null);
      App.render();
      U.toast('היציאה בוטלה');
    });
  }

  function copyRoster(students, leaves) {
    var out = students.filter(function (s) { return leaves[s.id]; });
    var inDorm = students.length - out.length;
    var lines = ['*מצבת ' + U.weekdayName(rDate) + ' ' + U.gregLabel(rDate) + '*',
      'בפנימיה: ' + inDorm + ' · יצאו: ' + out.length];
    if (out.length) {
      lines.push('\nיצאו באישור:');
      out.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); }).forEach(function (s) {
        var e = leaves[s.id];
        lines.push('· ' + s.name + (e.until ? ' (' + e.until + ')' : '') + (e.approvedBy ? ' — ' + e.approvedBy : ''));
      });
    }
    var txt = lines.join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('המצבת הועתקה'); });
    else U.toast('הדפדפן לא תומך בהעתקה', 'error');
  }

  // ---------- מצבת שבת ----------
  function buildShabbatCard() {
    // מוצא את השישי של השבוע הנוכחי
    var d = U.fromISO(rDate);
    var friday = U.addDays(rDate, 5 - d.getDay());
    var sh = Store.shabbatFor(friday) || { stayingIds: [], note: '' };
    var students = (Store.core().students || []).filter(function (s) { return s.active !== false; });

    var card = U.el('div', { class: 'card', style: 'margin-top:18px;background:#fffdf5;border:1px solid #f0d79a;' });
    card.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;' }, [
      U.el('h3', { style: 'margin:0;color:var(--brand-dark);', text: '🕯️ מצבת שבת — ' + U.gregLabel(friday) }),
      U.el('span', { class: 'tag', text: (sh.stayingIds || []).length + ' נשארים' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { pickStaying(friday, sh); } }, '👥 עריכת רשימת הנשארים')
    ]));
    if ((sh.stayingIds || []).length) {
      var names = sh.stayingIds.map(function (id) { var s = Store.getById('students', id); return s ? s.name : null; }).filter(Boolean);
      card.appendChild(U.el('div', { style: 'font-size:14px;line-height:1.7;', text: names.join(' · ') }));
      card.appendChild(U.el('button', { class: 'btn secondary small', style: 'margin-top:10px;', onclick: function () { copyShabbat(friday, sh); } }, '📋 העתקת מצבת שבת'));
    } else {
      card.appendChild(U.el('div', { class: 'muted', text: 'טרם הוגדרה רשימת נשארים לשבת זו.' }));
    }
    return card;
  }
  function pickStaying(friday, sh) {
    global.PickStudents('נשארים בשבת — ' + U.gregLabel(friday), sh.stayingIds || [], function (ids) {
      Store.setShabbat(friday, ids, sh.note || '');
      App.render();
      U.toast('מצבת השבת עודכנה (' + ids.length + ' נשארים)');
    });
  }
  function copyShabbat(friday, sh) {
    var names = (sh.stayingIds || []).map(function (id) { var s = Store.getById('students', id); return s ? s.name : null; }).filter(Boolean);
    var txt = '*מצבת שבת ' + U.gregLabel(friday) + '*\nנשארים (' + names.length + '):\n' + names.map(function (n) { return '· ' + n; }).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('מצבת השבת הועתקה'); });
    else U.toast('הדפדפן לא תומך בהעתקה', 'error');
  }

  // ---------- מצבת חירום (חלון ממורכז לכל הפנימיה) ----------
  global.EmergencyRoster = function (date) {
    var students = (Store.core().students || []).filter(function (s) { return s.active !== false; });
    var leaves = {};
    Store.leavesOn(date).forEach(function (e) { leaves[e.studentId] = e; });
    var session = Store.attFor(date, false);
    var marks = (session && session.marks) || {};

    // סטטוס אפקטיבי: קודם הנוכחות שסומנה, אחרת היציאה המאושרת
    function statusOf(s) {
      var m = marks[s.id];
      if (m) return { txt: U.attLabel(m.st), cls: m.st === 'present' ? 'tl-green' : (m.st === 'absent' ? 'tl-red' : 'tl-orange'), inDorm: m.st === 'present' };
      if (leaves[s.id]) return { txt: 'יצא באישור', cls: 'tl-orange', inDorm: false };
      return { txt: 'לא סומן', cls: 'tl-none', inDorm: null };
    }
    var classes = Store.core().classes || [];
    var inDorm = 0, out = 0, unknown = 0;
    students.forEach(function (s) { var st = statusOf(s); if (st.inDorm === true) inDorm++; else if (st.inDorm === false) out++; else unknown++; });

    var body = U.el('div', null, [
      U.el('div', { class: 'totbar', style: 'margin-top:0;' }, [
        U.el('div', { class: 't' }, [U.el('b', { style: 'color:var(--ok);', text: String(inDorm) }), U.el('span', { text: 'בפנימיה' })]),
        U.el('div', { class: 't' }, [U.el('b', { style: 'color:var(--warn);', text: String(out) }), U.el('span', { text: 'מחוץ לפנימיה' })]),
        U.el('div', { class: 't' }, [U.el('b', { text: String(unknown) }), U.el('span', { text: 'לא ידוע' })])
      ])
    ].concat(classes.map(function (c) {
      var stus = students.filter(function (s) { return s.classId === c.id; });
      if (!stus.length) return null;
      return U.el('div', { style: 'margin-bottom:10px;' }, [
        U.el('div', { style: 'font-weight:700;color:var(--brand-dark);margin-bottom:4px;', text: c.name + ' (' + stus.length + ')' }),
        U.el('div', { style: 'display:flex;flex-direction:column;gap:3px;' }, stus.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); }).map(function (s) {
          var st = statusOf(s);
          return U.el('div', { style: 'display:flex;justify-content:space-between;gap:8px;font-size:13.5px;padding:2px 0;border-bottom:1px solid var(--border);' }, [
            U.el('span', { text: s.name }),
            U.el('span', { class: 'tl ' + st.cls, text: st.txt })
          ]);
        }))
      ]);
    })));

    Modal.open('🚨 מצבת חירום · ' + U.weekdayName(date) + ' ' + U.gregLabel(date), body, [
      { label: 'העתקה לוואטסאפ', class: 'secondary', onClick: function (close) {
        var lines = ['*מצבת חירום ' + U.gregLabel(date) + '*', 'בפנימיה: ' + inDorm + ' · בחוץ: ' + out + ' · לא ידוע: ' + unknown, ''];
        classes.forEach(function (c) {
          var stus = students.filter(function (s) { return s.classId === c.id; });
          if (!stus.length) return;
          lines.push('*' + c.name + ':*');
          stus.forEach(function (s) { lines.push('· ' + s.name + ' — ' + statusOf(s).txt); });
          lines.push('');
        });
        var txt = lines.join('\n');
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('המצבת הועתקה'); });
        close();
      } },
      { label: 'סגור' }
    ]);
  };

  global.RosterView = { render: render, openLeaveForm: openLeaveForm };
})(window);
