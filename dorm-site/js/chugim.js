/* chugim.js — גיליון חוגים: דיווח מדריך החוג בסוף כל מפגש, וסטטוס למנהל */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'today';       // today | history | report
  var repChugId = null;    // החוג שמדווחים עליו כרגע
  var repDate = U.todayISO();

  function activeChugim() {
    return (Store.core().chugim || []).filter(function (c) { return c.active !== false; });
  }
  function myChugim() {
    var me = Store.myStaff();
    if (!me) return [];
    return activeChugim().filter(function (c) { return c.instructorStaffId === me.id; });
  }
  function chugToday(c, iso) {
    return (c.days || []).indexOf(U.fromISO(iso).getDay()) !== -1;
  }
  function instructorName(c) {
    var s = c.instructorStaffId ? Store.getById('staff', c.instructorStaffId) : null;
    return s ? s.name : '—';
  }

  // תזכורת וואטסאפ למדריך חוג שטרם דיווח
  function sendReminder(c) {
    var s = c.instructorStaffId ? Store.getById('staff', c.instructorStaffId) : null;
    var wn = s ? U.waNumber(s.phone) : null;
    if (!wn) { U.toast('למדריך החוג אין מספר טלפון בנתוני בסיס', 'error'); return; }
    var msg = 'היי ' + s.name + ', תזכורת קטנה 🙂\n' +
      'נשמח שתמלא את דיווח הנוכחות לחוג "' + c.name + '" של היום.\n' +
      'הקישור: ' + location.origin + location.pathname;
    window.open('https://wa.me/' + wn + '?text=' + encodeURIComponent(msg), '_blank');
  }

  function render(root) {
    var role = Store.currentRole();
    var mine = myChugim();

    var head = U.el('div', { class: 'page-head' }, [U.el('h2', { text: '🎨 חוגים' }), U.el('div', { class: 'spacer' })]);
    root.appendChild(head);

    if (!activeChugim().length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין חוגים במערכת. מנהל הפנימיה מוסיף חוגים במסך "נתוני בסיס".'));
      return;
    }

    // מדריך חוג — ישר למסך הדיווח של החוגים שלו
    if (role === 'chug') {
      if (!mine.length) {
        root.appendChild(U.el('div', { class: 'card empty' }, 'החשבון שלך אינו מקושר לחוג. פנו למנהל הפנימיה כדי לשייך אתכם לחוג ב"נתוני בסיס".'));
        return;
      }
      renderMyChugim(root, mine);
      return;
    }

    // מנהל/מדריך — סטטוס היום + היסטוריה (+ דיווח ידני למנהל)
    var tabs = [
      U.el('button', { class: sub === 'today' ? 'active' : '', onclick: function () { sub = 'today'; App.render(); } }, 'סטטוס היום'),
      U.el('button', { class: sub === 'history' ? 'active' : '', onclick: function () { sub = 'history'; App.render(); } }, 'היסטוריית דיווחים')
    ];
    if (mine.length) tabs.unshift(U.el('button', { class: sub === 'report' ? 'active' : '', onclick: function () { sub = 'report'; App.render(); } }, 'החוגים שלי'));
    root.appendChild(U.el('div', { class: 'subtabs' }, tabs));

    if (sub === 'report' && mine.length) renderMyChugim(root, mine);
    else if (sub === 'history') renderHistory(root);
    else renderTodayStatus(root);
  }

  // ---------- סטטוס היום (מנהל/מדריך) ----------
  function renderTodayStatus(root) {
    var today = U.todayISO();
    var scheduled = activeChugim().filter(function (c) { return chugToday(c, today); });
    var others = activeChugim().filter(function (c) { return !chugToday(c, today); });

    root.appendChild(U.el('div', { class: 'muted', style: 'margin-bottom:10px;', text: U.weekdayName(today) + ' · ' + U.gregLabel(today) }));

    if (!scheduled.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין חוגים מתוכננים להיום.'));
    } else {
      var rows = scheduled.map(function (c) {
        var rep = Store.reportFor(c.id, today);
        var present = rep ? Object.keys(rep.marks || {}).filter(function (k) { return rep.marks[k] === 'present'; }).length : null;
        return U.el('tr', null, [
          U.el('td', { text: c.name }),
          U.el('td', { text: instructorName(c) }),
          U.el('td', { text: c.time || '' }),
          U.el('td', null, [U.el('span', { class: 'ds-report ' + (rep ? 'done' : 'wait'), text: rep ? '✓ דווח' : 'ממתין לדיווח' })]),
          U.el('td', { text: rep ? (present + '/' + (c.studentIds || []).length + ' נכחו') : '' }),
          U.el('td', { text: rep && rep.rating ? '★ ' + rep.rating : '' }),
          U.el('td', { class: 'actions' }, [
            Store.isAdmin() || rep ? U.el('button', { class: 'btn small secondary', onclick: function () { openReportView(c, today, rep); } }, rep ? 'צפייה' : 'דיווח') : null,
            !rep && Store.isAdmin() ? U.el('button', { class: 'btn small ico', style: 'background:#25D366;color:#fff;', title: 'תזכורת וואטסאפ למדריך החוג', onclick: function () { sendReminder(c); }, html: U.WA_SVG }) : null
          ])
        ]);
      });
      root.appendChild(U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null, [
          U.el('th', { text: 'חוג' }), U.el('th', { text: 'מדריך' }), U.el('th', { text: 'שעה' }),
          U.el('th', { text: 'סטטוס' }), U.el('th', { text: 'נוכחות' }), U.el('th', { text: 'דירוג' }), U.el('th', { text: '' })
        ])]),
        U.el('tbody', null, rows)
      ]));
    }

    if (others.length) {
      root.appendChild(U.el('div', { class: 'dash-sec', text: 'חוגים בימים אחרים' }));
      root.appendChild(U.el('div', { class: 'card', style: 'font-size:13.5px;color:var(--muted);' },
        others.map(function (c) {
          return U.el('div', { style: 'padding:3px 0;' }, [
            U.el('b', { text: c.name + ' ' }),
            U.el('span', { text: '· ' + (c.days || []).map(function (d) { return U.WEEKDAYS[d]; }).join(', ') + (c.time ? ' · ' + c.time : '') + ' · ' + instructorName(c) })
          ]);
        })));
    }
  }

  // ---------- החוגים שלי (מדריך חוג) ----------
  function renderMyChugim(root, mine) {
    var today = U.todayISO();
    mine.forEach(function (c) {
      var isToday = chugToday(c, today);
      var rep = Store.reportFor(c.id, today);
      var card = U.el('div', { class: 'card', style: 'margin-bottom:14px;' });
      card.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;' }, [
        U.el('h3', { style: 'margin:0;color:var(--brand-dark);', text: '🎨 ' + c.name }),
        U.el('span', { class: 'tag', text: (c.days || []).map(function (d) { return U.WEEKDAYS[d]; }).join(', ') + (c.time ? ' · ' + c.time : '') }),
        isToday ? U.el('span', { class: 'ds-report ' + (rep ? 'done' : 'wait'), text: rep ? '✓ דווח היום' : 'מתקיים היום — ממתין לדיווח' }) : null,
        U.el('div', { class: 'spacer' }),
        U.el('button', { class: 'btn' + (isToday && !rep ? '' : ' secondary'), onclick: function () { openReportForm(c, today); } }, isToday ? (rep ? '✏️ עריכת הדיווח של היום' : '📝 דיווח מפגש היום') : '📝 דיווח למפגש')
      ]));
      card.appendChild(U.el('div', { class: 'muted', style: 'font-size:13px;', text: (c.studentIds || []).length + ' תלמידים רשומים' + (c.location ? ' · ' + c.location : '') }));

      // דיווחים אחרונים של החוג
      var reps = (Store.get().chug.reports || []).filter(function (r) { return r.chugId === c.id; })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5);
      if (reps.length) {
        card.appendChild(U.el('div', { class: 'dash-sec', text: 'דיווחים אחרונים' }));
        reps.forEach(function (r) {
          var present = Object.keys(r.marks || {}).filter(function (k) { return r.marks[k] === 'present'; }).length;
          card.appendChild(U.el('div', { class: 'dash-row' }, [
            U.el('span', { style: 'font-weight:600;min-width:90px;', text: U.weekdayName(r.date) + ' ' + U.gregLabel(r.date) }),
            U.el('span', { class: 'tag', text: present + ' נכחו' }),
            r.rating ? U.el('span', { text: '★ ' + r.rating }) : null,
            U.el('span', { class: 'muted', style: 'flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', text: r.note || '' }),
            U.el('button', { class: 'btn small secondary', onclick: function () { openReportForm(c, r.date); } }, '✏️')
          ]));
        });
      }
      root.appendChild(card);
    });
  }

  // ---------- היסטוריה (מנהל/מדריך) ----------
  var histChug = '';
  function renderHistory(root) {
    var reports = (Store.get().chug.reports || []).slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var cSel = U.el('select', null, [U.el('option', { value: '' }, 'כל החוגים')].concat(
      activeChugim().map(function (c) { return U.el('option', { value: c.id }, c.name); })));
    cSel.value = histChug;
    cSel.addEventListener('change', function () { histChug = cSel.value; App.render(); });
    root.appendChild(U.el('div', { style: 'margin-bottom:10px;' }, [cSel]));

    if (histChug) reports = reports.filter(function (r) { return r.chugId === histChug; });
    if (!reports.length) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין דיווחים עדיין.')); return; }

    var rows = reports.slice(0, 100).map(function (r) {
      var c = Store.getById('chugim', r.chugId);
      var present = Object.keys(r.marks || {}).filter(function (k) { return r.marks[k] === 'present'; }).length;
      var absent = Object.keys(r.marks || {}).filter(function (k) { return r.marks[k] === 'absent'; }).length;
      return U.el('tr', null, [
        U.el('td', { text: U.gregLabel(r.date) + ' · ' + U.weekdayName(r.date) }),
        U.el('td', { text: c ? c.name : '?' }),
        U.el('td', { text: present + ' נכחו · ' + absent + ' נעדרו' }),
        U.el('td', { text: r.rating ? '★ ' + r.rating : '' }),
        U.el('td', { text: r.note || '' }),
        U.el('td', { class: 'muted', style: 'font-size:12px;', text: r.by || '' }),
        U.el('td', null, [U.el('button', { class: 'btn small secondary', onclick: function () { openReportView(c, r.date, r); } }, 'פרטים')])
      ]);
    });
    root.appendChild(U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'תאריך' }), U.el('th', { text: 'חוג' }), U.el('th', { text: 'נוכחות' }),
        U.el('th', { text: 'דירוג' }), U.el('th', { text: 'הערה' }), U.el('th', { text: 'דווח ע"י' }), U.el('th', { text: '' })
      ])]),
      U.el('tbody', null, rows)
    ]));
  }

  // ---------- טופס דיווח מפגש ----------
  function openReportForm(chug, date) {
    var existing = Store.reportFor(chug.id, date);
    var roster = (chug.studentIds || []).map(function (id) { return Store.getById('students', id); })
      .filter(Boolean)
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    var marks = {};
    if (existing) { Object.keys(existing.marks || {}).forEach(function (k) { marks[k] = existing.marks[k]; }); }

    var dInp = U.el('input', { type: 'date', value: date, style: 'max-width:170px;' });

    var listBox = U.el('div', { class: 'field-students', style: 'margin:10px 0;' });
    if (!roster.length) {
      listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:6px;', text: 'אין תלמידים רשומים לחוג — מנהל הפנימיה משייך תלמידים ב"נתוני בסיס".' }));
    }
    roster.forEach(function (s) {
      var row = U.el('div', { class: 'field-student' });
      var pBtn = U.el('button', { class: 'fbtn present' }, '✓ נוכח');
      var aBtn = U.el('button', { class: 'fbtn absent' }, '✕ נעדר');
      function sync() {
        pBtn.classList.toggle('on', marks[s.id] === 'present');
        aBtn.classList.toggle('on', marks[s.id] === 'absent');
        row.classList.toggle('done', marks[s.id] === 'present');
        row.classList.toggle('absent', marks[s.id] === 'absent');
      }
      pBtn.addEventListener('click', function () { marks[s.id] = marks[s.id] === 'present' ? undefined : 'present'; sync(); });
      aBtn.addEventListener('click', function () { marks[s.id] = marks[s.id] === 'absent' ? undefined : 'absent'; sync(); });
      row.appendChild(U.el('div', { class: 'fstu-line' }, [
        U.el('div', { class: 'fstu-name', text: s.name }),
        U.el('div', { class: 'fstu-controls' }, [U.el('div', { class: 'fwent-grp' }, [pBtn, aBtn])])
      ]));
      sync();
      listBox.appendChild(row);
    });

    // דירוג המפגש 1–5
    var rating = existing ? existing.rating : null;
    var rbtns = [1, 2, 3, 4, 5].map(function (n) {
      var b = U.el('button', { class: 'frbtn' + (rating === n ? ' on' : '') }, String(n));
      b.addEventListener('click', function () {
        rating = (rating === n ? null : n);
        rbtns.forEach(function (x, i) { x.classList.toggle('on', rating === i + 1); });
      });
      return b;
    });

    var noteInp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'איך היה המפגש? אירועים מיוחדים…' });
    noteInp.value = (existing && existing.note) || '';

    var body = U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'תאריך המפגש' }), dInp]),
      U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
        U.el('label', { style: 'margin:0;', text: 'נוכחות תלמידים' }),
        U.el('button', { class: 'btn secondary small', onclick: function () {
          roster.forEach(function (s) { if (!marks[s.id]) marks[s.id] = 'present'; });
          U.$all('.fbtn.present', listBox).forEach(function (b) { b.classList.add('on'); });
          U.$all('.field-student', listBox).forEach(function (r) { if (!r.classList.contains('absent')) r.classList.add('done'); });
        } }, '✓ סמן את כל השאר כנוכחים')
      ]),
      listBox,
      U.el('div', { class: 'field' }, [U.el('label', { text: 'דירוג המפגש (5 = מצוין)' }), U.el('div', { class: 'frate' }, rbtns)]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'הערה' }), noteInp])
    ]);

    Modal.open('דיווח מפגש — ' + chug.name, body, [
      { label: 'ביטול', class: 'secondary' },
      { label: existing ? 'עדכון הדיווח' : 'שליחת הדיווח', onClick: function (closeFn) {
        var cleanMarks = {};
        Object.keys(marks).forEach(function (k) { if (marks[k]) cleanMarks[k] = marks[k]; });
        var rep = existing || { chugId: chug.id };
        rep.date = dInp.value || date;
        rep.marks = cleanMarks;
        rep.rating = rating;
        rep.note = noteInp.value;
        rep.by = Store.myName();
        rep.at = rep.at || new Date().toISOString();
        Store.upsertReport(rep);
        closeFn();
        App.render();
        U.toast('הדיווח נשמר — ' + chug.name);
      } }
    ]);
  }

  // צפייה בדיווח (או פתיחת טופס אם אין)
  function openReportView(chug, date, rep) {
    if (!chug) return;
    if (!rep) { openReportForm(chug, date); return; }
    var roster = (chug.studentIds || []).map(function (id) { return Store.getById('students', id); }).filter(Boolean);
    var present = roster.filter(function (s) { return rep.marks[s.id] === 'present'; });
    var absent = roster.filter(function (s) { return rep.marks[s.id] === 'absent'; });
    var body = U.el('div', null, [
      U.el('p', { style: 'margin:0 0 8px;' }, [
        U.el('b', { text: U.weekdayName(rep.date) + ' · ' + U.gregLabel(rep.date) }),
        rep.rating ? U.el('span', { text: '  ·  דירוג ★ ' + rep.rating }) : null
      ]),
      present.length ? U.el('div', { style: 'margin-bottom:8px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: 'נכחו (' + present.length + '):' }),
        U.el('div', { text: present.map(function (s) { return s.name; }).join(', ') })
      ]) : null,
      absent.length ? U.el('div', { style: 'margin-bottom:8px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: 'נעדרו (' + absent.length + '):' }),
        U.el('div', { style: 'color:var(--danger);', text: absent.map(function (s) { return s.name; }).join(', ') })
      ]) : null,
      rep.note ? U.el('div', null, [
        U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: 'הערת המדריך:' }),
        U.el('div', { style: 'white-space:pre-wrap;', text: rep.note })
      ]) : null,
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:10px;', text: 'דווח ע"י ' + (rep.by || '') })
    ]);
    Modal.open('דיווח — ' + chug.name, body, [
      { label: 'עריכה', class: 'secondary', onClick: function (close) { close(); openReportForm(chug, rep.date); } },
      { label: 'סגור' }
    ]);
  }

  global.ChugimView = { render: render };
})(window);
