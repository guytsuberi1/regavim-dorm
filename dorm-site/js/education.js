/* education.js — גיליון חינוך תלמידים: רמזור חינוכי + שאלון שיחה אישית.
   מדריך ממלא שיחות ורואה את שלו; המנהל רואה הכל ומעדכן סטטוס. */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';   // students | conversations
  var filterFlag = '';
  var filterStudent = '';
  var filterBy = '';

  function visibleStudents() {
    var me = Store.myStaff();
    var lim = (!Store.isAdmin() && me && me.classId) ? me.classId : null;
    return (Store.core().students || []).filter(function (s) {
      if (s.active === false) return false;
      if (lim && s.classId !== lim) return false;
      return true;
    }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
  }

  function myConversations() {
    var all = (Store.get().edu.conversations || []).slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    if (Store.isAdmin()) return all;
    var em = Store.currentEmail();
    return all.filter(function (c) { return (c.by || '').toLowerCase() === em; });
  }

  function render(root) {
    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🎓 חינוך תלמידים' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: function () { openConversationForm(null); } }, '💬 שיחה אישית חדשה')
    ]));

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      U.el('button', { class: sub === 'students' ? 'active' : '', onclick: function () { sub = 'students'; App.render(); } }, 'גיליון תלמידים'),
      U.el('button', { class: sub === 'conversations' ? 'active' : '', onclick: function () { sub = 'conversations'; App.render(); } }, 'שיחות אישיות (' + myConversations().length + ')')
    ]));

    if (sub === 'students') renderStudentsSheet(root);
    else renderConversations(root);
  }

  // ---------- גיליון התלמידים (רמזור) ----------
  function renderStudentsSheet(root) {
    var students = visibleStudents();
    if (!students.length) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים.')); return; }

    // סינון רמזור
    var counts = { green: 0, orange: 0, red: 0, none: 0 };
    students.forEach(function (s) {
      var lv = s.eduStatus && s.eduStatus.level;
      if (counts[lv] !== undefined) counts[lv]++; else counts.none++;
    });
    var flags = [
      { key: '', label: 'הכל (' + students.length + ')' },
      { key: 'red', label: '🔴 דורש טיפול (' + counts.red + ')' },
      { key: 'orange', label: '🟠 דורש מעקב (' + counts.orange + ')' },
      { key: 'green', label: '🟢 תקין (' + counts.green + ')' },
      { key: 'none', label: '⚪ ללא סטטוס (' + counts.none + ')' }
    ];
    root.appendChild(U.el('div', { class: 'subtabs' }, flags.map(function (f) {
      return U.el('button', { class: filterFlag === f.key ? 'active' : '', onclick: function () { filterFlag = f.key; App.render(); } }, f.label);
    })));

    var shown = students.filter(function (s) {
      if (!filterFlag) return true;
      var lv = (s.eduStatus && s.eduStatus.level) || 'none';
      return lv === filterFlag;
    });

    var rows = shown.map(function (s) {
      var st30 = Store.attStats(s.id, 30);
      var lastConv = Store.lastConversation(s.id);
      var daysSince = lastConv ? Math.floor((U.fromISO(U.todayISO()) - U.fromISO(lastConv.date)) / 86400000) : null;
      return U.el('tr', null, [
        U.el('td', null, [U.el('button', { class: 'btn small secondary', style: 'font-weight:600;', onclick: function () { if (global.BaseView) BaseView.openStudentCard(s); } }, s.name)]),
        U.el('td', null, [global.ClassBadge ? ClassBadge(s.classId) : null]),
        U.el('td', null, [(function () {
          var p = U.flagPill(s.eduStatus && s.eduStatus.level, 'tl-btn');
          p.title = 'עדכון סטטוס חינוכי';
          p.style.cursor = 'pointer';
          p.addEventListener('click', function () { openStatusDialog(s); });
          return p;
        })()]),
        U.el('td', { text: (s.eduStatus && s.eduStatus.note) || '' }),
        U.el('td', { text: st30.pct == null ? '—' : st30.pct + '%' }),
        U.el('td', null, [
          lastConv
            ? U.el('span', { text: U.gregLabel(lastConv.date) + (daysSince > 30 ? ' ⚠️' : ''), title: daysSince + ' ימים' })
            : U.el('span', { class: 'muted', text: 'טרם נערכה' })
        ]),
        U.el('td', { class: 'actions' }, [
          U.el('button', { class: 'btn small', title: 'שיחה אישית חדשה', onclick: function () { openConversationForm(s.id); } }, '💬')
        ])
      ]);
    });

    root.appendChild(U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'תלמיד' }), U.el('th', { text: 'כיתה' }), U.el('th', { text: 'סטטוס חינוכי' }),
        U.el('th', { text: 'הערת סטטוס' }), U.el('th', { text: 'נוכחות 30 יום' }), U.el('th', { text: 'שיחה אחרונה' }), U.el('th', { text: '' })
      ])]),
      U.el('tbody', null, rows.length ? rows : [U.el('tr', null, [U.el('td', { colspan: '7', class: 'center muted', text: 'אין תלמידים בסינון זה.' })])])
    ]));
  }

  // עדכון רמזור ידני
  function openStatusDialog(stu) {
    var level = (stu.eduStatus && stu.eduStatus.level) || null;
    var btns = U.FLAGS.map(function (f) {
      var b = U.el('button', { class: 'tl ' + f.cls + ' tl-btn' + (level === f.key ? ' sel' : ''), style: 'font-size:14px;padding:8px 16px;border:2px solid ' + (level === f.key ? 'currentColor' : 'transparent') + ';cursor:pointer;', text: f.label });
      b.addEventListener('click', function () {
        level = f.key;
        btnsWrap.querySelectorAll('.tl').forEach(function (x) { x.style.border = '2px solid transparent'; });
        b.style.border = '2px solid currentColor';
      });
      return b;
    });
    var btnsWrap = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, btns);
    var noteInp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'הערה קצרה (מה הרקע לסטטוס)' });
    noteInp.value = (stu.eduStatus && stu.eduStatus.note) || '';

    Modal.open('סטטוס חינוכי — ' + stu.name, U.el('div', null, [
      btnsWrap,
      U.el('div', { class: 'field' }, [U.el('label', { text: 'הערה' }), noteInp])
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'הסרת סטטוס', class: 'secondary', onClick: function (close) {
        delete stu.eduStatus;
        Store.save('core'); close(); App.render();
      } },
      { label: 'שמירה', onClick: function (close) {
        if (!level) { U.toast('בחרו רמזור', 'error'); return; }
        stu.eduStatus = { level: level, note: noteInp.value, by: Store.myName(), at: new Date().toISOString() };
        Store.save('core'); close(); App.render();
        U.toast('הסטטוס של ' + stu.name + ' עודכן');
      } }
    ]);
  }

  // ---------- רשימת השיחות ----------
  function renderConversations(root) {
    var convs = myConversations();
    var isAdmin = Store.isAdmin();

    if (isAdmin && convs.length) {
      var students = (Store.core().students || []).filter(function (s) { return s.active !== false; });
      var byNames = {};
      convs.forEach(function (c) { if (c.byName) byNames[c.byName] = true; });
      var bar = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;' });
      var sSel = U.el('select', null, [U.el('option', { value: '' }, 'כל התלמידים')].concat(
        students.map(function (s) { return U.el('option', { value: s.id }, s.name); })));
      sSel.value = filterStudent;
      sSel.addEventListener('change', function () { filterStudent = sSel.value; App.render(); });
      var bSel = U.el('select', null, [U.el('option', { value: '' }, 'כל המדריכים')].concat(
        Object.keys(byNames).map(function (n) { return U.el('option', { value: n }, n); })));
      bSel.value = filterBy;
      bSel.addEventListener('change', function () { filterBy = bSel.value; App.render(); });
      var fSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הרמזורים')].concat(
        U.FLAGS.map(function (f) { return U.el('option', { value: f.key }, f.label); })));
      fSel.value = filterFlag;
      fSel.addEventListener('change', function () { filterFlag = fSel.value; App.render(); });
      bar.appendChild(sSel); bar.appendChild(bSel); bar.appendChild(fSel);
      root.appendChild(bar);

      convs = convs.filter(function (c) {
        if (filterStudent && c.studentId !== filterStudent) return false;
        if (filterBy && c.byName !== filterBy) return false;
        if (filterFlag && filterFlag !== 'none' && c.flag !== filterFlag) return false;
        return true;
      });
    }

    if (!convs.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, [
        'עדיין אין שיחות מתועדות.',
        U.el('div', { class: 'empty-actions' }, [
          U.el('button', { class: 'btn', onclick: function () { openConversationForm(null); } }, '💬 תיעוד שיחה ראשונה')
        ])
      ]));
      return;
    }

    var rows = convs.slice(0, 200).map(function (c) {
      var stu = Store.getById('students', c.studentId);
      return U.el('tr', null, [
        U.el('td', { text: U.gregLabel(c.date) }),
        U.el('td', { text: stu ? stu.name : '?' }),
        U.el('td', null, [U.flagPill(c.flag)]),
        U.el('td', { style: 'max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', text: c.summary || '' }),
        U.el('td', { text: c.followUp ? '⚠️ כן' : '' }),
        U.el('td', { class: 'muted', style: 'font-size:12px;', text: c.byName || '' }),
        U.el('td', { class: 'actions' }, [
          U.el('button', { class: 'btn small secondary', onclick: function () { openConversationView(c); } }, 'פרטים')
        ])
      ]);
    });

    root.appendChild(U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'תאריך' }), U.el('th', { text: 'תלמיד' }), U.el('th', { text: 'רמזור' }),
        U.el('th', { text: 'סיכום' }), U.el('th', { text: 'מעקב' }), U.el('th', { text: 'מדריך' }), U.el('th', { text: '' })
      ])]),
      U.el('tbody', null, rows)
    ]));
  }

  // ---------- טופס שיחה אישית (שאלון דינמי מההגדרות) ----------
  function openConversationForm(studentId, existing) {
    var students = visibleStudents();
    if (!students.length) { U.toast('אין תלמידים במערכת', 'error'); return; }
    var questions = (Store.core().settings || {}).convQuestions || [];

    var sSel = U.el('select', { style: 'width:100%;' }, students.map(function (s) {
      return U.el('option', { value: s.id }, s.name + (global.ClassName ? ' · ' + ClassName(s.classId) : ''));
    }));
    sSel.value = existing ? existing.studentId : (studentId || students[0].id);

    var dInp = U.el('input', { type: 'date', value: existing ? existing.date : U.todayISO() });

    // שדות דינמיים לפי השאלון
    var answers = {};
    if (existing) Object.keys(existing.answers || {}).forEach(function (k) { answers[k] = existing.answers[k]; });
    var qFields = questions.map(function (q) {
      var field;
      if (q.type === 'scale') {
        var btns = [1, 2, 3, 4, 5].map(function (n) {
          var b = U.el('button', { type: 'button', class: 'frbtn' + (answers[q.id] === n ? ' on' : '') }, String(n));
          b.addEventListener('click', function () {
            answers[q.id] = (answers[q.id] === n ? null : n);
            btns.forEach(function (x, i) { x.classList.toggle('on', answers[q.id] === i + 1); });
          });
          return b;
        });
        field = U.el('div', { class: 'frate' }, btns);
      } else if (q.type === 'yesno') {
        var yes = U.el('button', { type: 'button', class: 'fbtn present' + (answers[q.id] === true ? ' on' : '') }, 'כן');
        var no = U.el('button', { type: 'button', class: 'fbtn absent' + (answers[q.id] === false ? ' on' : '') }, 'לא');
        yes.addEventListener('click', function () { answers[q.id] = answers[q.id] === true ? null : true; yes.classList.toggle('on', answers[q.id] === true); no.classList.remove('on'); });
        no.addEventListener('click', function () { answers[q.id] = answers[q.id] === false ? null : false; no.classList.toggle('on', answers[q.id] === false); yes.classList.remove('on'); });
        field = U.el('div', { class: 'fwent-grp' }, [yes, no]);
      } else {
        var ta = U.el('textarea', { rows: '2', style: 'width:100%;' });
        ta.value = answers[q.id] || '';
        ta.addEventListener('change', function () { answers[q.id] = ta.value; });
        field = ta;
      }
      return U.el('div', { class: 'field' }, [U.el('label', { text: q.label }), field]);
    });

    var sumInp = U.el('textarea', { rows: '3', style: 'width:100%;', placeholder: 'עיקרי השיחה, סיכומים והחלטות…' });
    sumInp.value = (existing && existing.summary) || '';

    // רמזור מוצע בעקבות השיחה
    var flag = existing ? existing.flag : 'green';
    var flagBtns = U.FLAGS.map(function (f) {
      var b = U.el('button', { type: 'button', class: 'tl ' + f.cls, style: 'font-size:13px;padding:7px 14px;cursor:pointer;border:2px solid ' + (flag === f.key ? 'currentColor' : 'transparent') + ';', text: f.label });
      b.addEventListener('click', function () {
        flag = f.key;
        flagWrap.querySelectorAll('.tl').forEach(function (x) { x.style.border = '2px solid transparent'; });
        b.style.border = '2px solid currentColor';
      });
      return b;
    });
    var flagWrap = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, flagBtns);

    var body = U.el('div', null, [
      U.el('div', { class: 'row' }, [
        U.el('div', { class: 'field' }, [U.el('label', { text: 'תלמיד *' }), sSel]),
        U.el('div', { class: 'field' }, [U.el('label', { text: 'תאריך השיחה' }), dInp])
      ])
    ].concat(qFields).concat([
      U.el('div', { class: 'field' }, [U.el('label', { text: 'סיכום השיחה' }), sumInp]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'רמזור בעקבות השיחה' }), flagWrap])
    ]));

    Modal.open(existing ? 'עריכת שיחה אישית' : '💬 שיחה אישית חדשה', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירת השיחה', onClick: function (close) {
        var cleanAnswers = {};
        Object.keys(answers).forEach(function (k) { if (answers[k] != null && answers[k] !== '') cleanAnswers[k] = answers[k]; });
        var followQ = ((Store.core().settings || {}).convQuestions || []).filter(function (q) { return q.type === 'yesno'; })[0];
        var conv = existing || {};
        conv.studentId = sSel.value;
        conv.date = dInp.value || U.todayISO();
        conv.answers = cleanAnswers;
        conv.summary = sumInp.value;
        conv.flag = flag;
        conv.followUp = followQ ? cleanAnswers[followQ.id] === true : false;
        conv.by = Store.currentEmail();
        conv.byName = Store.myName();
        Store.upsertConversation(conv);
        // עדכון הרמזור של התלמיד בעקבות השיחה
        var stu = Store.getById('students', conv.studentId);
        if (stu && flag) {
          stu.eduStatus = { level: flag, note: 'עודכן משיחה אישית ' + U.gregLabel(conv.date), by: Store.myName(), at: new Date().toISOString() };
          Store.save('core');
        }
        close();
        App.render();
        U.toast('השיחה נשמרה' + (stu ? ' והרמזור של ' + stu.name + ' עודכן' : ''));
      } }
    ]);
  }

  // ---------- צפייה בשיחה ----------
  function openConversationView(conv) {
    var stu = Store.getById('students', conv.studentId);
    var questions = (Store.core().settings || {}).convQuestions || [];
    function valLabel(q, v) {
      if (q.type === 'scale') return '★ ' + v + ' / 5';
      if (q.type === 'yesno') return v === true ? 'כן' : 'לא';
      return String(v);
    }
    var qRows = questions.filter(function (q) { return conv.answers && conv.answers[q.id] != null; })
      .map(function (q) {
        return U.el('div', { style: 'padding:6px 0;border-bottom:1px solid var(--border);' }, [
          U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: q.label }),
          U.el('div', { style: 'font-weight:600;white-space:pre-wrap;', text: valLabel(q, conv.answers[q.id]) })
        ]);
      });
    var body = U.el('div', null, [
      U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;' }, [
        U.el('b', { text: stu ? stu.name : '?' }),
        U.flagPill(conv.flag),
        U.el('span', { class: 'muted', text: U.weekdayName(conv.date) + ' · ' + U.gregLabel(conv.date) + ' · ' + (conv.byName || '') }),
        conv.followUp ? U.el('span', { class: 'tl tl-orange', text: '⚠️ נדרש מעקב' }) : null
      ])
    ].concat(qRows).concat([
      conv.summary ? U.el('div', { style: 'margin-top:10px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: 'סיכום השיחה' }),
        U.el('div', { style: 'white-space:pre-wrap;', text: conv.summary })
      ]) : null
    ]));
    var canEdit = Store.isAdmin() || (conv.by || '').toLowerCase() === Store.currentEmail();
    var btns = [{ label: 'סגור', class: 'secondary' }];
    if (canEdit) btns.push({ label: '✏️ עריכה', onClick: function (close) { close(); openConversationForm(conv.studentId, conv); } });
    if (stu) btns.push({ label: '🚦 עדכון סטטוס', class: 'secondary', onClick: function (close) { close(); openStatusDialog(stu); } });
    Modal.open('שיחה אישית — ' + (stu ? stu.name : ''), body, btns);
  }

  global.EducationView = { render: render, openConversationForm: openConversationForm, openStatusDialog: openStatusDialog };
})(window);
