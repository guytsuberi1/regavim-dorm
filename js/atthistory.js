/* atthistory.js — דוחות נוכחות: לפי תאריך ולפי תלמיד.
   מנהל רואה הכל; מדריך רואה את הכיתה שלו בלבד. */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'bydate';
  var selDate = null;      // null = התאריך האחרון שקיים
  var selStudent = null;
  var filterClass = '';
  var filterStatus = '';   // סינון לפי סטטוס בתצוגה היומית
  var selMonth = null;     // 'YYYY-MM' בלוח החודשי

  // הכיתה שאליה מוגבל המשתמש (מדריך → הכיתה שלו; מנהל → ללא הגבלה)
  function limitClassId() {
    if (Store.isAdmin()) return null;
    var me = Store.myStaff();
    return (me && me.classId) || null;
  }

  function visibleStudents() {
    var lim = limitClassId();
    return (Store.core().students || []).filter(function (s) {
      if (s.active === false) return false;
      if (lim && s.classId !== lim) return false;
      return true;
    }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
  }

  function attDates() {
    return Object.keys(Store.get().att || {}).sort();
  }

  function render(root) {
    var lim = limitClassId();

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📅 דוחות נוכחות' }),
      lim ? U.el('span', { class: 'tag', text: 'כיתה ' + (global.ClassName ? ClassName(lim) : '') }) : null,
      U.el('div', { class: 'spacer' }),
      Store.isAdmin() ? U.actionMenu([
        { html: U.XLS_SVG, label: 'ייצוא חודש נוכחי לאקסל', onClick: exportMonthXlsx }
      ]) : null
    ]);
    root.appendChild(head);

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      U.el('button', { class: sub === 'bydate' ? 'active' : '', onclick: function () { sub = 'bydate'; App.render(); } }, 'לפי תאריך'),
      U.el('button', { class: sub === 'month' ? 'active' : '', onclick: function () { sub = 'month'; App.render(); } }, 'לוח חודשי'),
      U.el('button', { class: sub === 'trends' ? 'active' : '', onclick: function () { sub = 'trends'; App.render(); } }, 'מגמות'),
      U.el('button', { class: sub === 'bystudent' ? 'active' : '', onclick: function () { sub = 'bystudent'; App.render(); } }, 'לפי תלמיד')
    ]));

    if (!attDates().length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'עדיין אין גיליונות נוכחות. הגיליון הראשון ייווצר עם הסימון הראשון במסך "נוכחות".'));
      return;
    }

    if (sub === 'bydate') renderByDate(root);
    else if (sub === 'month') renderMonth(root);
    else if (sub === 'trends') renderTrends(root);
    else renderByStudent(root);
  }

  // ---------- לפי תאריך ----------
  function renderByDate(root) {
    var dates = attDates();
    if (!selDate || dates.indexOf(selDate) === -1) selDate = dates[dates.length - 1];
    var idx = dates.indexOf(selDate);
    var session = Store.get().att[selDate];
    var lim = limitClassId();

    var dSel = U.el('select', null, dates.slice().reverse().map(function (d) {
      return U.el('option', { value: d }, U.weekdayName(d) + ' · ' + U.gregLabel(d));
    }));
    dSel.value = selDate;
    dSel.addEventListener('change', function () { selDate = dSel.value; App.render(); });

    var bar = U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('button', { class: 'btn secondary ico', title: 'יום קודם', disabled: idx <= 0, onclick: function () { selDate = dates[idx - 1]; App.render(); } }, '→'),
      dSel,
      U.el('button', { class: 'btn secondary ico', title: 'יום הבא', disabled: idx >= dates.length - 1, onclick: function () { selDate = dates[idx + 1]; App.render(); } }, '←'),
      U.el('span', { class: 'ds-report ' + (session.status === 'closed' ? 'closed' : 'wait'), text: session.status === 'closed' ? '🔒 נסגר' : 'פתוח' })
    ]);

    // סינון כיתה (מנהל בלבד)
    if (!lim) {
      var cSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הכיתות')].concat(
        (Store.core().classes || []).map(function (c) { return U.el('option', { value: c.id }, c.name); })));
      cSel.value = filterClass;
      cSel.addEventListener('change', function () { filterClass = cSel.value; App.render(); });
      bar.appendChild(cSel);
    }
    // סינון לפי סטטוס
    var stSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הסטטוסים')].concat(
      U.ATT_STATUSES.map(function (s) { return U.el('option', { value: s.key }, s.label); }))
      .concat([U.el('option', { value: 'none' }, 'לא סומנו')]));
    stSel.value = filterStatus;
    stSel.addEventListener('change', function () { filterStatus = stSel.value; App.render(); });
    bar.appendChild(stSel);
    root.appendChild(bar);

    var students = visibleStudents().filter(function (s) { return !filterClass || lim || s.classId === filterClass; });
    if (!lim && filterClass) students = students.filter(function (s) { return s.classId === filterClass; });

    // שורת סיכום (לפני סינון הסטטוס — מציגה את תמונת היום המלאה)
    var counts = { present: 0, absent: 0, home: 0, sick: 0, none: 0 };
    students.forEach(function (s) {
      var m = session.marks[s.id];
      if (!m) counts.none++;
      else counts[m.st] = (counts[m.st] || 0) + 1;
    });
    root.appendChild(U.el('div', { class: 'totbar' }, [
      tot(counts.present, 'נוכחים'), tot(counts.absent, 'נעדרים'),
      tot(counts.home, 'בבית באישור'), tot(counts.sick, 'מחלה'), tot(counts.none, 'לא סומנו')
    ]));

    if (filterStatus) {
      students = students.filter(function (s) {
        var m = session.marks[s.id];
        return filterStatus === 'none' ? !m : (m && m.st === filterStatus);
      });
    }

    var rows = students.map(function (s) {
      var m = session.marks[s.id];
      return U.el('tr', null, [
        U.el('td', { text: s.name }),
        U.el('td', null, [global.ClassBadge ? ClassBadge(s.classId) : null]),
        U.el('td', null, [statusPill(m && m.st)]),
        U.el('td', { text: (m && m.note) || '' }),
        U.el('td', { class: 'muted', style: 'font-size:12px;', text: m ? ((m.by || '') + ' · ' + new Date(m.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })) : '' })
      ]);
    });

    root.appendChild(U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'תלמיד' }), U.el('th', { text: 'כיתה' }),
        U.el('th', { text: 'סטטוס' }), U.el('th', { text: 'הערה' }), U.el('th', { text: 'מי סימן' })
      ])]),
      U.el('tbody', null, rows)
    ]));
  }

  function tot(n, label) {
    return U.el('div', { class: 't' }, [U.el('b', { text: String(n) }), U.el('span', { text: label })]);
  }

  function statusPill(st) {
    if (!st) return U.el('span', { class: 'ds-report off', text: 'לא סומן' });
    var cls = { present: 'done', absent: 'wait', home: 'wait', sick: 'wait' }[st] || 'off';
    if (st === 'absent') return U.el('span', { class: 'tl tl-red', text: U.attLabel(st) });
    if (st === 'present') return U.el('span', { class: 'tl tl-green', text: U.attLabel(st) });
    return U.el('span', { class: 'tl tl-orange', text: U.attLabel(st) });
  }

  // ---------- לוח חודשי: מטריצה צבעונית תלמיד × יום ----------
  function renderMonth(root) {
    var dates = attDates();
    var months = [];
    dates.forEach(function (d) { var mk = U.monthKey(d); if (months.indexOf(mk) === -1) months.push(mk); });
    if (!selMonth || months.indexOf(selMonth) === -1) selMonth = months[months.length - 1];
    var mi = months.indexOf(selMonth);
    var monthDates = dates.filter(function (d) { return U.monthKey(d) === selMonth; });
    var lim = limitClassId();

    var bar = U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;' }, [
      U.el('button', { class: 'btn secondary ico', title: 'חודש קודם', disabled: mi <= 0, onclick: function () { selMonth = months[mi - 1]; App.render(); } }, '→'),
      U.el('span', { class: 'range-chip' }, [U.el('span', { class: 'rc-ic', text: '📅' }), U.el('span', { text: U.monthLabel(selMonth) })]),
      U.el('button', { class: 'btn secondary ico', title: 'חודש הבא', disabled: mi >= months.length - 1, onclick: function () { selMonth = months[mi + 1]; App.render(); } }, '←')
    ]);
    if (!lim) {
      var cSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הכיתות')].concat(
        (Store.core().classes || []).map(function (c) { return U.el('option', { value: c.id }, c.name); })));
      cSel.value = filterClass;
      cSel.addEventListener('change', function () { filterClass = cSel.value; App.render(); });
      bar.appendChild(cSel);
    }
    root.appendChild(bar);

    root.appendChild(U.el('div', { class: 'att-legend' }, [
      U.el('span', null, [U.el('span', { class: 'att-cell present' }), 'נוכח']),
      U.el('span', null, [U.el('span', { class: 'att-cell absent' }), 'נעדר']),
      U.el('span', null, [U.el('span', { class: 'att-cell home' }), 'בבית באישור']),
      U.el('span', null, [U.el('span', { class: 'att-cell sick' }), 'מחלה']),
      U.el('span', null, [U.el('span', { class: 'att-cell none' }), 'לא סומן'])
    ]));

    var students = visibleStudents().filter(function (s) { return lim || !filterClass || s.classId === filterClass; });
    var att = Store.get().att;

    var thead = U.el('tr', null, [U.el('th', { text: 'תלמיד' })].concat(monthDates.map(function (d) {
      return U.el('th', { title: U.weekdayName(d), text: String(parseInt(d.slice(8), 10)) });
    })).concat([U.el('th', { text: '%' })]));

    var rows = students.map(function (s) {
      var present = 0, total = 0;
      var cells = monthDates.map(function (d) {
        var m = att[d].marks[s.id];
        if (m) { total++; if (m.st === 'present') present++; }
        var title = U.gregLabel(d) + ' — ' + (m ? U.attLabel(m.st) + (m.note ? ' · ' + m.note : '') : 'לא סומן');
        return U.el('td', null, [U.el('span', { class: 'att-cell ' + (m ? m.st : 'none'), title: title })]);
      });
      var pct = total ? Math.round(present / total * 100) : null;
      return U.el('tr', null, [U.el('td', { text: s.name })].concat(cells)
        .concat([U.el('td', { class: 'num', style: 'font-weight:700;', text: pct == null ? '—' : pct + '%' })]));
    });

    root.appendChild(U.el('table', { class: 'grid att-matrix' }, [
      U.el('thead', null, [thead]),
      U.el('tbody', null, rows.length ? rows : [U.el('tr', null, [U.el('td', { colspan: String(monthDates.length + 2), class: 'center muted', text: 'אין תלמידים.' })])])
    ]));
  }

  // ---------- מגמות: אחוז נוכחות לאורך זמן ----------
  function renderTrends(root) {
    var lim = limitClassId();
    if (!lim) {
      var cSel = U.el('select', { style: 'margin-bottom:10px;' }, [U.el('option', { value: '' }, 'כל הפנימיה')].concat(
        (Store.core().classes || []).map(function (c) { return U.el('option', { value: c.id }, c.name); })));
      cSel.value = filterClass;
      cSel.addEventListener('change', function () { filterClass = cSel.value; App.render(); });
      root.appendChild(U.el('div', null, [cSel]));
    }
    var classId = lim || filterClass;
    var students = visibleStudents().filter(function (s) { return !classId || s.classId === classId; });
    if (!students.length) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים.')); return; }

    var att = Store.get().att;
    var dates = attDates().slice(-20); // 20 ימי הפעילות האחרונים
    var today = U.todayISO();
    var cols = dates.map(function (d) {
      var present = 0, marked = 0;
      students.forEach(function (s) {
        var m = att[d].marks[s.id];
        if (m) { marked++; if (m.st === 'present') present++; }
      });
      var pct = students.length ? Math.round(present / students.length * 100) : 0;
      return {
        label: U.gregLabel(d), pct: pct, text: pct + '%', cur: d === today,
        title: U.weekdayName(d) + ' ' + U.gregLabel(d) + ' — נוכחים ' + present + '/' + students.length + (marked < students.length ? ' (סומנו ' + marked + ')' : '')
      };
    });

    // ממוצע התקופה
    var avg = cols.length ? Math.round(cols.reduce(function (a, c) { return a + c.pct; }, 0) / cols.length) : 0;
    root.appendChild(U.el('div', { class: 'totbar' }, [
      tot(avg + '%', 'ממוצע נוכחות בתקופה'),
      tot(cols.length, 'ימי פעילות בגרף'),
      tot(students.length, 'תלמידים')
    ]));

    var card = U.el('div', { class: 'card' });
    card.appendChild(U.el('h3', { style: 'margin:0 0 8px;color:var(--brand-dark);font-size:15px;', text: '📈 אחוז נוכחות לפי ערב' + (classId ? ' — כיתה ' + (global.ClassName ? ClassName(classId) : '') : ' — כל הפנימיה') }));
    card.appendChild(U.el('div', { class: 'trend-scroll' }, [U.trendChart(cols)]));
    root.appendChild(card);
  }

  // ---------- לפי תלמיד ----------
  function renderByStudent(root) {
    var students = visibleStudents();
    if (!students.length) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים.')); return; }
    if (!selStudent || !students.some(function (s) { return s.id === selStudent; })) selStudent = students[0].id;

    var sSel = U.el('select', { style: 'min-width:200px;' }, students.map(function (s) {
      return U.el('option', { value: s.id }, s.name + (global.ClassName ? ' · ' + ClassName(s.classId) : ''));
    }));
    sSel.value = selStudent;
    sSel.addEventListener('change', function () { selStudent = sSel.value; App.render(); });
    root.appendChild(U.el('div', { style: 'margin-bottom:12px;' }, [sSel]));

    var stu = Store.getById('students', selStudent);
    if (!stu) return;

    var stAll = Store.attStats(selStudent, null);
    var st30 = Store.attStats(selStudent, 30);

    root.appendChild(U.el('div', { class: 'totbar' }, [
      tot(stAll.total, 'ימים שנרשמו'),
      tot(stAll.present, 'נוכחויות'),
      tot(stAll.byStatus.absent, 'היעדרויות'),
      tot(st30.pct == null ? '—' : st30.pct + '%', 'נוכחות 30 יום'),
      tot(stAll.pct == null ? '—' : stAll.pct + '%', 'נוכחות כללית')
    ]));

    // טבלת הימים שבהם התלמיד לא היה "נוכח"
    var att = Store.get().att;
    var issues = [];
    Object.keys(att).sort().reverse().forEach(function (d) {
      var m = att[d].marks[selStudent];
      if (m && m.st !== 'present') issues.push({ date: d, m: m });
    });

    if (!issues.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, '🎉 אין היעדרויות רשומות לתלמיד זה.'));
      return;
    }
    root.appendChild(U.el('h3', { style: 'color:var(--brand-dark);font-size:15px;margin:14px 0 8px;', text: 'ימים ללא נוכחות (' + issues.length + ')' }));
    root.appendChild(U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'תאריך' }), U.el('th', { text: 'יום' }),
        U.el('th', { text: 'סטטוס' }), U.el('th', { text: 'הערה' }), U.el('th', { text: 'מי סימן' })
      ])]),
      U.el('tbody', null, issues.map(function (row) {
        return U.el('tr', null, [
          U.el('td', { text: U.gregLabel(row.date) }),
          U.el('td', { text: U.weekdayName(row.date) }),
          U.el('td', null, [statusPill(row.m.st)]),
          U.el('td', { text: row.m.note || '' }),
          U.el('td', { class: 'muted', style: 'font-size:12px;', text: row.m.by || '' })
        ]);
      }))
    ]));
  }

  // ---------- ייצוא חודש לאקסל (מנהל) ----------
  function exportMonthXlsx() {
    if (!global.XLSX) { U.toast('ספריית האקסל לא נטענה', 'error'); return; }
    var mk = U.monthKey(selDate || U.todayISO());
    var dates = attDates().filter(function (d) { return U.monthKey(d) === mk; });
    if (!dates.length) { U.toast('אין נתוני נוכחות בחודש ' + U.monthLabel(mk), 'info'); return; }
    var students = (Store.core().students || []).filter(function (s) { return s.active !== false; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
    var att = Store.get().att;
    var header = ['תלמיד', 'כיתה'].concat(dates.map(function (d) { return U.gregLabel(d); })).concat(['נוכחויות', 'היעדרויות', '% נוכחות']);
    var mapChar = { present: '✓', absent: '✕', home: 'ב', sick: 'ח' };
    var rows = students.map(function (s) {
      var present = 0, total = 0;
      var cells = dates.map(function (d) {
        var m = att[d].marks[s.id];
        if (!m) return '';
        total++;
        if (m.st === 'present') present++;
        return mapChar[m.st] || '';
      });
      return [s.name, global.ClassName ? ClassName(s.classId) : ''].concat(cells)
        .concat([present, total - present, total ? Math.round(present / total * 100) + '%' : '']);
    });
    var aoa = [header].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'][0] = { RTL: true };
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נוכחות');
    XLSX.writeFile(wb, 'נוכחות-פנימיה-' + mk + '.xlsx');
    U.toast('קובץ האקסל ירד — ' + U.monthLabel(mk));
  }

  global.AttHistoryView = { render: render };
})(window);
