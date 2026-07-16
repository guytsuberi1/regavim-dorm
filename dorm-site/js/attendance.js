/* attendance.js — גיליון נוכחות יומי: סימון ע"י המדריכים בזמן פנימיה וסגירת היום */
(function (global) {
  'use strict';
  var U = global.U;
  var attDate = U.todayISO();
  var selClass = null;      // null = טרם נבחר (ייקבע אוטומטית לפי המדריך)
  var classInited = false;
  var progressHook = null;

  // משוב מישושי קצר בסימון (נייד)
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {} }

  function dormDays() { return (Store.core().settings || {}).dormDays || [0, 1, 2, 3]; }
  function isDormDay(iso) { return dormDays().indexOf(U.fromISO(iso).getDay()) !== -1; }

  // מעבר ליום הפעילות הקודם/הבא (מדלג על ימים ללא זמן פנימיה, עד שבוע)
  function stepDay(dir) {
    var d = attDate;
    for (var i = 0; i < 7; i++) {
      d = U.addDays(d, dir);
      if (isDormDay(d)) { attDate = d; App.render(); return; }
    }
    attDate = U.addDays(attDate, dir);
    App.render();
  }

  function activeStudents() {
    return (Store.core().students || []).filter(function (s) { return s.active !== false; });
  }

  function initClass() {
    if (classInited) return;
    classInited = true;
    var me = Store.myStaff();
    if (me && me.classId) selClass = me.classId;
    else selClass = ''; // הכל
  }

  function studentsOfClass() {
    var list = activeStudents();
    if (selClass) list = list.filter(function (s) { return s.classId === selClass; });
    return list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
  }

  function render(root) {
    initClass();
    var session = Store.attFor(attDate, false);
    var closed = session && session.status === 'closed';
    var isAdmin = Store.isAdmin();

    // ---------- כותרת ----------
    var dInp = U.el('input', { type: 'date', value: attDate });
    dInp.addEventListener('change', function () { if (dInp.value) { attDate = dInp.value; App.render(); } });
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '✅ נוכחות' }),
      U.el('button', { class: 'btn secondary ico', title: 'יום קודם', onclick: function () { stepDay(-1); } }, '→'),
      U.dateChip(U.weekdayName(attDate) + ' · ' + U.gregLabel(attDate) + ' · ' + U.hebrewDate(attDate), dInp),
      U.el('button', { class: 'btn secondary ico', title: 'יום הבא', onclick: function () { stepDay(1); } }, '←'),
      attDate !== U.todayISO() ? U.el('button', { class: 'btn secondary small', onclick: function () { attDate = U.todayISO(); App.render(); } }, '↩ היום') : null,
      U.el('span', { class: 'ds-report ' + (closed ? 'closed' : (session ? 'done' : 'wait')), text: closed ? '🔒 היום נסגר' : (session ? 'פתוח לסימון' : 'טרם החל סימון') }),
      U.el('div', { class: 'spacer' })
    ]);
    root.appendChild(head);

    if (!isDormDay(attDate)) {
      root.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;background:#fffaf0;border:1px solid #f0d79a;', text: 'ℹ️ ' + U.weekdayName(attDate) + ' אינו יום פנימיה לפי ההגדרות — אפשר לסמן בכל זאת במקרה מיוחד.' }));
    }

    if (!activeStudents().length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים במערכת. מנהל הפנימיה מוסיף תלמידים במסך "נתוני בסיס".'));
      return;
    }

    // ---------- בורר כיתה ----------
    var classes = Store.core().classes || [];
    var marks = (session && session.marks) || {};
    function classMarked(cid) {
      var stus = activeStudents().filter(function (s) { return !cid || s.classId === cid; });
      var m = stus.filter(function (s) { return marks[s.id]; }).length;
      return { marked: m, total: stus.length };
    }
    var clsTabs = U.el('div', { class: 'subtabs' },
      [U.el('button', {
        class: selClass === '' ? 'active' : '',
        onclick: function () { selClass = ''; App.render(); }
      }, 'כל הכיתות')].concat(classes.map(function (c) {
        var cm = classMarked(c.id);
        var done = cm.total && cm.marked === cm.total;
        return U.el('button', {
          class: selClass === c.id ? 'active' : '',
          onclick: function () { selClass = c.id; App.render(); }
        }, c.name + ' (' + cm.marked + '/' + cm.total + ')' + (done ? ' ✓' : ''));
      })));
    root.appendChild(clsTabs);

    // ---------- תעסוקת הערב של הכיתה ----------
    if (selClass) {
      var actId = Store.eveningActivityFor(attDate, selClass);
      var def = actId ? Store.activityDef(actId) : null;
      if (def) {
        root.appendChild(U.el('div', { style: 'margin-bottom:10px;' }, [
          U.el('span', { class: 'muted', style: 'font-size:13px;', text: 'תעסוקת הערב: ' }),
          U.el('span', { class: 'ev-pill', style: 'background:' + def.color + ';color:#fff;', text: def.label })
        ]));
      }
    }

    // ---------- פס התקדמות חי ----------
    var progWrap = U.el('div', { class: 'fprog' });
    function updateProgress() {
      var all = studentsOfClass();
      var s = Store.attFor(attDate, false);
      var mk = (s && s.marks) || {};
      U.clear(progWrap);
      if (!all.length) return;
      var marked = all.filter(function (x) { return mk[x.id]; }).length;
      var pct = Math.round(marked / all.length * 100);
      var done = marked === all.length;
      progWrap.appendChild(U.el('div', { class: 'fprog-track' }, [
        U.el('div', { class: 'fprog-fill' + (done ? ' done' : ''), style: 'width:' + pct + '%;' })
      ]));
      progWrap.appendChild(U.el('div', { class: 'fprog-lbl' + (done ? ' done' : ''), text: done ? '✓ הסימון הושלם — כל התלמידים סומנו' : 'סומנו ' + marked + ' מתוך ' + all.length + ' תלמידים' }));
    }
    progressHook = updateProgress;
    updateProgress();
    root.appendChild(progWrap);

    // ---------- רשימת התלמידים ----------
    var readOnly = closed && !isAdmin;
    var list = U.el('div', { class: 'field-students' });
    var students = studentsOfClass();
    if (selClass === '') {
      // "כל הכיתות" — קיבוץ לפי כיתה עם כותרות
      classes.forEach(function (c) {
        var stus = students.filter(function (s) { return s.classId === c.id; });
        if (!stus.length) return;
        list.appendChild(U.el('div', { class: 'field-team-head', text: '🏫 כיתה ' + c.name }));
        stus.forEach(function (s) { list.appendChild(buildStudentRow(s, readOnly)); });
      });
      var noClass = students.filter(function (s) { return !Store.getById('classes', s.classId); });
      if (noClass.length) {
        list.appendChild(U.el('div', { class: 'field-team-head', text: 'ללא כיתה' }));
        noClass.forEach(function (s) { list.appendChild(buildStudentRow(s, readOnly)); });
      }
    } else {
      students.forEach(function (s) { list.appendChild(buildStudentRow(s, readOnly)); });
    }
    if (!students.length) list.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים בכיתה זו.'));
    root.appendChild(list);

    // ---------- פעולות ----------
    var actions = U.el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;' });
    if (!readOnly) {
      actions.appendChild(U.el('button', { class: 'btn secondary', onclick: markRestPresent }, '✓ סמן את כל הנותרים כנוכחים'));
      if (!closed) actions.appendChild(U.el('button', { class: 'btn', onclick: closeDay }, '🔒 סיום זמן פנימיה — סגירת היום'));
    }
    if (closed && isAdmin) {
      actions.appendChild(U.el('button', { class: 'btn secondary', onclick: reopenDay }, '🔓 פתיחה מחדש (מנהל)'));
    }
    root.appendChild(actions);

    if (closed && session.closedBy) {
      root.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:8px;', text: 'נסגר ע"י ' + session.closedBy + ' · ' + new Date(session.closedAt).toLocaleString('he-IL') }));
    }
  }

  function buildStudentRow(stu, readOnly) {
    var session = Store.attFor(attDate, false);
    var mark = session && session.marks[stu.id];
    var leave = Store.leaveOf(attDate, stu.id);

    var row = U.el('div', { class: 'field-student' });
    var byLine = U.el('div', { class: 'fstu-by' });
    var flagLine = U.el('div', { class: 'fstu-by' }); // שורת התראות/פעולות (אי-התאמה, טיפול מחנך)

    var btns = {};
    function syncRow() {
      var s = Store.attFor(attDate, false);
      var m = s && s.marks[stu.id];
      U.ATT_STATUSES.forEach(function (st) {
        btns[st.key].classList.toggle('on', !!(m && m.st === st.key));
      });
      row.classList.toggle('done', !!(m && m.st === 'present'));
      row.classList.toggle('absent', !!(m && m.st === 'absent'));
      row.classList.toggle('home', !!(m && m.st === 'home'));
      row.classList.toggle('sick', !!(m && m.st === 'sick'));
      byLine.textContent = m ? ('סומן ע"י ' + (m.by || '') + ' · ' + new Date(m.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + (m.note ? ' · 📝 ' + m.note : '')) : '';
      byLine.style.display = m ? '' : 'none';
      // התראות: נעדר ללא אישור + כפתור "הועבר לטיפול מחנך"; או נוכח למרות יציאה מאושרת
      U.clear(flagLine); flagLine.style.display = 'none';
      if (m && m.st === 'absent' && !leave) {
        flagLine.style.display = '';
        flagLine.appendChild(U.el('span', { class: 'tl tl-red', text: '⚠️ נעדר ללא אישור' }));
        var parent = stu.parentPhone ? U.waNumber(stu.parentPhone) : null;
        if (parent) flagLine.appendChild(U.el('button', { class: 'btn small ico', style: 'margin-inline-start:6px;background:#25D366;color:#fff;', title: 'הודעת וואטסאפ להורים', onclick: function () { waParents(stu); }, html: U.WA_SVG }));
        if (!readOnly) {
          var handled = !!m.handledAt;
          flagLine.appendChild(U.el('button', { class: 'btn small ' + (handled ? '' : 'secondary'), style: 'margin-inline-start:6px;', title: handled ? 'טופל ע"י ' + (m.handledBy || '') : 'סימון: הועבר לטיפול מחנך', onclick: function () { Store.markHandled(attDate, stu.id, !handled); syncRow(); } }, handled ? '✓ בטיפול מחנך' : 'לטיפול מחנך'));
        } else if (m.handledAt) {
          flagLine.appendChild(U.el('span', { class: 'tl tl-green', style: 'margin-inline-start:6px;', text: '✓ בטיפול מחנך' }));
        }
      } else if (m && m.st === 'present' && leave) {
        flagLine.style.display = '';
        flagLine.appendChild(U.el('span', { class: 'tl tl-orange', text: '⚠️ סומן נוכח למרות אישור יציאה' }));
      }
    }

    var btnGroup = U.el('div', { class: 'fwent-grp' }, U.ATT_STATUSES.map(function (st) {
      var b = U.el('button', { class: 'fbtn ' + st.key, disabled: !!readOnly }, st.short);
      btns[st.key] = b;
      if (!readOnly) b.addEventListener('click', function () {
        var s = Store.attFor(attDate, false);
        var cur = s && s.marks[stu.id];
        // הקשה חוזרת על אותו סטטוס — מבטלת את הסימון
        Store.setMark(attDate, stu.id, (cur && cur.st === st.key) ? null : st.key);
        buzz(); syncRow();
        if (progressHook) progressHook();
      });
      return b;
    }));

    var noteBtn = U.el('button', { class: 'btn small secondary no-print', title: 'הערה', disabled: !!readOnly, onclick: function () { openNote(stu, syncRow); } }, '📝');

    var streak = Store.absStreak(stu.id);
    row.appendChild(U.el('div', { class: 'fstu-line' }, [
      U.el('div', { class: 'fstu-name' }, [
        U.el('span', { text: stu.name + '  ' }),
        global.ClassBadge ? ClassBadge(stu.classId) : null,
        leave ? U.el('span', { class: 'tl tl-orange', style: 'margin-inline-start:6px;', title: 'אישר: ' + (leave.approvedBy || '') + (leave.parentApproval ? ' · ' + leave.parentApproval : ''), text: '🏠 אושרה יציאה' + (leave.until ? ' · ' + leave.until : '') }) : null,
        streak >= 2 ? U.el('span', { class: 'tl tl-red', style: 'margin-inline-start:6px;', title: 'נעדר ' + streak + ' ערבים ברצף', text: '⚠️ ' + streak + ' ברצף' }) : null
      ]),
      U.el('div', { class: 'fstu-controls' }, [btnGroup, noteBtn])
    ]));
    row.appendChild(byLine);
    row.appendChild(flagLine);
    syncRow();
    return row;
  }

  // הודעת וואטסאפ מוכנה להורים על היעדרות
  function waParents(stu) {
    var wn = U.waNumber(stu.parentPhone);
    if (!wn) { U.toast('אין טלפון הורה תקין', 'error'); return; }
    var msg = 'שלום, כאן פנימיית ישיבת רגבים בנימין.\n' +
      'בנכם ' + stu.name + ' לא נמצא בפנימיה הערב (' + U.gregLabel(attDate) + ') ולא קיבלנו אישור יציאה.\n' +
      'נודה לעדכון. תודה!';
    window.open('https://wa.me/' + wn + '?text=' + encodeURIComponent(msg), '_blank');
  }

  function openNote(stu, sync) {
    var session = Store.attFor(attDate, true);
    var mark = session.marks[stu.id];
    var inp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'הערה (סיבת היעדרות, אישור וכו\')' });
    inp.value = (mark && mark.note) || '';
    Modal.open('הערה — ' + stu.name, U.el('div', { class: 'field' }, [inp]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var s = Store.attFor(attDate, true);
        var m = s.marks[stu.id];
        if (m) { m.note = inp.value; m.by = Store.myName(); m.at = new Date().toISOString(); }
        else if (inp.value.trim()) { s.marks[stu.id] = { st: 'absent', note: inp.value, by: Store.myName(), at: new Date().toISOString() }; }
        Store.saveAtt(attDate);
        close(); sync();
        if (progressHook) progressHook();
      } }
    ]);
  }

  function markRestPresent() {
    var students = studentsOfClass();
    var session = Store.attFor(attDate, true);
    var rest = students.filter(function (s) { return !session.marks[s.id]; });
    if (!rest.length) { U.toast('כל התלמידים כבר סומנו', 'info'); return; }
    // תלמידים עם יציאה מאושרת → מסומנים "בבית באישור" ולא "נוכח"
    var onLeave = rest.filter(function (s) { return Store.leaveOf(attDate, s.id); });
    var txt = 'לסמן ' + (rest.length - onLeave.length) + ' תלמידים כ"נוכח"?' +
      (onLeave.length ? '\n(' + onLeave.length + ' תלמידים עם יציאה מאושרת יסומנו "בבית באישור")' : '');
    Modal.confirm({ title: 'סימון הנותרים', text: txt, okLabel: 'סמן' }, function () {
      var now = new Date().toISOString(), by = Store.myName();
      rest.forEach(function (s) {
        session.marks[s.id] = { st: Store.leaveOf(attDate, s.id) ? 'home' : 'present', by: by, at: now };
      });
      Store.saveAtt(attDate);
      App.render();
      U.toast('סומנו ' + rest.length + ' תלמידים');
    });
  }

  function closeDay() {
    var session = Store.attFor(attDate, true);
    var all = activeStudents();
    var unmarked = all.filter(function (s) { return !session.marks[s.id]; });
    var txt = unmarked.length
      ? '⚠️ ' + unmarked.length + ' תלמידים טרם סומנו:\n' + unmarked.slice(0, 12).map(function (s) { return '· ' + s.name; }).join('\n') + (unmarked.length > 12 ? '\n· …' : '') + '\n\nלסגור את היום בכל זאת?'
      : 'כל התלמידים סומנו ✓\nלסגור את גיליון הנוכחות של היום? (זהו הדיווח הסופי — "מה באמת היה")';
    Modal.confirm({ title: '🔒 סגירת יום — ' + U.gregLabel(attDate), text: txt, okLabel: 'סגור את היום' }, function () {
      session.status = 'closed';
      session.closedBy = Store.myName();
      session.closedAt = new Date().toISOString();
      Store.saveAtt(attDate);
      App.render();
      U.toast('היום נסגר — הדיווח נשמר');
    });
  }

  function reopenDay() {
    var session = Store.attFor(attDate, false);
    if (!session) return;
    Modal.confirm({ title: 'פתיחה מחדש', text: 'לפתוח מחדש את גיליון ה-' + U.gregLabel(attDate) + ' לעריכה?', okLabel: 'פתח מחדש' }, function () {
      session.status = 'open';
      session.reopenedBy = Store.myName();
      session.reopenedAt = new Date().toISOString();
      Store.saveAtt(attDate);
      App.render();
      U.toast('היום נפתח מחדש לעריכה');
    });
  }

  global.AttendanceView = { render: render };
})(window);
