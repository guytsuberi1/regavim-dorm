/* dashboard.js — דשבורד מנהלים: נוכחות חיה, חוגים, חינוך תלמידים ותחזוקה (מנהל בלבד) */
(function (global) {
  'use strict';
  var U = global.U;

  function activeStudents() {
    return (Store.core().students || []).filter(function (s) { return s.active !== false; });
  }

  function render(root) {
    var today = U.todayISO();
    var session = Store.attFor(today, false);
    var marks = (session && session.marks) || {};
    var students = activeStudents();
    var isDormDay = ((Store.core().settings || {}).dormDays || []).indexOf(U.fromISO(today).getDay()) !== -1;

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📊 דשבורד' }),
      U.dateChip(U.weekdayName(today) + ' · ' + U.gregLabel(today) + ' · ' + U.hebrewDate(today), null, { title: 'היום' }),
      U.el('div', { class: 'spacer' }),
      U.actionMenu([
        { html: U.WA_SVG, label: 'סיכום ערב לוואטסאפ', onClick: function () { sendSummaryWhatsApp(); } },
        { icon: '📋', label: 'העתקת סיכום הערב', onClick: function () { copySummary(); } }
      ])
    ]));

    if (!students.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, [
        'ברוכים הבאים! עדיין אין תלמידים במערכת.',
        U.el('div', { class: 'empty-actions' }, [
          U.el('button', { class: 'btn', onclick: function () { App.setTab('base'); } }, '🗂️ למסך נתוני בסיס'),
          global.ImportData ? U.el('button', { class: 'btn secondary', onclick: function () { ImportData.openAgriImport(); } }, '🌱 ייבוא תלמידים מאפליקציית החקלאות') : null
        ])
      ]));
      return;
    }

    // ---------- KPI נוכחות היום ----------
    var counts = { present: 0, absent: 0, home: 0, sick: 0 };
    students.forEach(function (s) {
      var m = marks[s.id];
      if (m && counts[m.st] !== undefined) counts[m.st]++;
    });
    var markedN = counts.present + counts.absent + counts.home + counts.sick;
    var unmarked = students.length - markedN;
    var dayState = !isDormDay && !session ? 'אין פנימיה היום' : (session ? (session.status === 'closed' ? '🔒 נסגר' : 'פתוח לסימון') : 'טרם החל');

    function kpi(cls, icon, val, lbl, sub, onClick) {
      var node = U.el('div', { class: 'kpi ' + cls + (onClick ? ' kpi-click' : ''), onclick: onClick || null }, [
        U.el('div', { class: 'kpi-ic', text: icon }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-row' }, [U.el('span', { class: 'kpi-val', text: String(val) })]),
          U.el('div', { class: 'kpi-lbl', text: lbl }),
          sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
        ])
      ]);
      if (onClick) node.style.cursor = 'pointer';
      return node;
    }

    root.appendChild(U.el('div', { class: 'dash-sec', text: 'נוכחות היום — זמן פנימיה' }));
    root.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi('kpi-good', '✓', counts.present, 'נוכחים', null, function () { App.setTab('attendance'); }),
      kpi('kpi-bad', '✕', counts.absent, 'נעדרים', null, function () { App.setTab('attendance'); }),
      kpi('kpi-warn', '🏠', counts.home + counts.sick, 'בבית / מחלה', counts.home + ' בבית · ' + counts.sick + ' מחלה'),
      kpi('kpi-neutral', '⏳', unmarked, 'טרם סומנו', null, function () { App.setTab('attendance'); }),
      kpi('kpi-info', '📋', dayState, 'סטטוס היום', session && session.closedBy ? 'נסגר ע"י ' + session.closedBy : null)
    ]));

    // ---------- מגמת נוכחות — 14 ימי הפעילות האחרונים ----------
    var attDatesAll = Object.keys(Store.get().att || {}).sort();
    if (attDatesAll.length > 1) {
      var att = Store.get().att;
      var trendCols = attDatesAll.slice(-14).map(function (d) {
        var present = 0;
        students.forEach(function (s) { var m = att[d].marks[s.id]; if (m && m.st === 'present') present++; });
        var pct = students.length ? Math.round(present / students.length * 100) : 0;
        return { label: U.gregLabel(d), pct: pct, text: pct + '%', cur: d === today,
          title: U.weekdayName(d) + ' ' + U.gregLabel(d) + ' — נוכחים ' + present + '/' + students.length };
      });
      var trendPanel = U.el('div', { class: 'dash-panel', style: 'margin-bottom:18px;' });
      trendPanel.appendChild(U.el('div', { class: 'dash-panel-head' }, [
        U.el('h3', { text: '📈 מגמת נוכחות — ' + trendCols.length + ' ימי הפעילות האחרונים' }),
        U.el('button', { class: 'btn small secondary', onclick: function () { App.setTab('atthistory'); } }, 'לדוחות ←')
      ]));
      trendPanel.appendChild(U.el('div', { class: 'trend-scroll' }, [U.trendChart(trendCols)]));
      root.appendChild(trendPanel);
    }

    // ---------- שתי עמודות: נוכחות לפי כיתה + חוגים היום ----------
    var cols = U.el('div', { class: 'dash-cols' });
    cols.appendChild(buildClassPanel(students, marks));
    cols.appendChild(buildChugPanel());
    root.appendChild(cols);

    // ---------- שתי עמודות: חינוך תלמידים + תחזוקה ----------
    var cols2 = U.el('div', { class: 'dash-cols' });
    cols2.appendChild(buildEduPanel(students));
    cols2.appendChild(buildMaintPanel());
    root.appendChild(cols2);
  }

  // נוכחות לפי כיתה
  function buildClassPanel(students, marks) {
    var panel = U.el('div', { class: 'dash-panel' });
    panel.appendChild(U.el('div', { class: 'dash-panel-head' }, [
      U.el('h3', { text: '🏫 נוכחות לפי כיתה' }),
      U.el('button', { class: 'btn small secondary', onclick: function () { App.setTab('attendance'); } }, 'לגיליון ←')
    ]));
    var chart = U.el('div', { class: 'cls-chart', style: 'max-width:none;' });
    var classes = Store.core().classes || [];
    classes.forEach(function (c) {
      var stus = students.filter(function (s) { return s.classId === c.id; });
      if (!stus.length) return;
      var present = stus.filter(function (s) { return marks[s.id] && marks[s.id].st === 'present'; }).length;
      var marked = stus.filter(function (s) { return marks[s.id]; }).length;
      var absentNames = stus.filter(function (s) { return marks[s.id] && marks[s.id].st !== 'present'; })
        .map(function (s) { return s.name + ' (' + U.attLabel(marks[s.id].st) + ')'; });
      var pct = stus.length ? Math.round(present / stus.length * 100) : 0;
      chart.appendChild(U.el('div', { class: 'cls-row' }, [
        U.el('span', { class: 'cls-lbl', text: c.name }),
        U.el('div', { class: 'cls-track' }, [U.el('div', { class: 'cls-fill', style: 'width:' + pct + '%;background:' + (marked === stus.length ? 'var(--ok)' : 'var(--brand)') + ';' })]),
        U.el('span', { class: 'cls-val', text: present + '/' + stus.length })
      ]));
      if (absentNames.length) {
        chart.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin:-3px 0 4px;padding-inline-start:98px;', text: absentNames.join(' · ') }));
      }
    });
    panel.appendChild(chart);
    return panel;
  }

  // חוגים היום
  function buildChugPanel() {
    var today = U.todayISO();
    var panel = U.el('div', { class: 'dash-panel' });
    panel.appendChild(U.el('div', { class: 'dash-panel-head' }, [
      U.el('h3', { text: '🎨 חוגים היום' }),
      U.el('button', { class: 'btn small secondary', onclick: function () { App.setTab('chugim'); } }, 'לגיליון ←')
    ]));
    var chugim = (Store.core().chugim || []).filter(function (c) {
      return c.active !== false && (c.days || []).indexOf(U.fromISO(today).getDay()) !== -1;
    });
    if (!chugim.length) {
      panel.appendChild(U.el('div', { class: 'dash-empty', text: 'אין חוגים מתוכננים להיום.' }));
      return panel;
    }
    chugim.forEach(function (c) {
      var rep = Store.reportFor(c.id, today);
      var present = rep ? Object.keys(rep.marks || {}).filter(function (k) { return rep.marks[k] === 'present'; }).length : null;
      var instructor = c.instructorStaffId ? Store.getById('staff', c.instructorStaffId) : null;
      panel.appendChild(U.el('div', { class: 'dash-row' }, [
        U.el('span', { style: 'font-weight:600;min-width:110px;', text: c.name }),
        U.el('span', { class: 'muted', style: 'font-size:12.5px;', text: (c.time || '') + (instructor ? ' · ' + instructor.name : '') }),
        U.el('span', { class: 'spacer' }),
        rep && rep.rating ? U.el('span', { text: '★ ' + rep.rating }) : null,
        rep ? U.el('span', { class: 'tag', text: present + '/' + (c.studentIds || []).length }) : null,
        U.el('span', { class: 'ds-report ' + (rep ? 'done' : 'wait'), text: rep ? '✓ דווח' : 'ממתין' })
      ]));
    });
    return panel;
  }

  // חינוך תלמידים
  function buildEduPanel(students) {
    var panel = U.el('div', { class: 'dash-panel' });
    panel.appendChild(U.el('div', { class: 'dash-panel-head' }, [
      U.el('h3', { text: '🎓 חינוך תלמידים' }),
      U.el('button', { class: 'btn small secondary', onclick: function () { App.setTab('education'); } }, 'לגיליון ←')
    ]));

    var counts = { green: 0, orange: 0, red: 0, none: 0 };
    students.forEach(function (s) {
      var lv = s.eduStatus && s.eduStatus.level;
      if (counts[lv] !== undefined) counts[lv]++; else counts.none++;
    });
    panel.appendChild(U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;' }, [
      U.el('span', { class: 'tl tl-red', text: '🔴 ' + counts.red }),
      U.el('span', { class: 'tl tl-orange', text: '🟠 ' + counts.orange }),
      U.el('span', { class: 'tl tl-green', text: '🟢 ' + counts.green }),
      U.el('span', { class: 'tl tl-none', text: '⚪ ' + counts.none })
    ]));

    // תלמידים ברמזור אדום/כתום
    var attention = students.filter(function (s) { return s.eduStatus && (s.eduStatus.level === 'red' || s.eduStatus.level === 'orange'); });
    attention.sort(function (a, b) { return (a.eduStatus.level === 'red' ? 0 : 1) - (b.eduStatus.level === 'red' ? 0 : 1); });
    if (attention.length) {
      attention.slice(0, 8).forEach(function (s) {
        var st30 = Store.attStats(s.id, 30);
        var lastConv = Store.lastConversation(s.id);
        panel.appendChild(U.el('div', { class: 'dash-row' }, [
          U.flagPill(s.eduStatus.level),
          U.el('span', { style: 'font-weight:600;', text: s.name }),
          U.el('span', { class: 'muted', style: 'font-size:12px;flex:1;', text: (st30.pct != null ? 'נוכחות ' + st30.pct + '%' : '') + (lastConv ? ' · שיחה ' + U.gregLabel(lastConv.date) : ' · טרם נערכה שיחה') })
        ]));
      });
    }

    // מעקבים פתוחים (שיחות שסומנו "נדרש מעקב" וטרם טופלו)
    var openFU = (Store.get().edu.conversations || []).filter(function (c) { return c.followUp && !c.followUpDone; });
    if (openFU.length) {
      panel.appendChild(U.el('div', { class: 'dash-row', style: 'cursor:pointer;', onclick: function () { App.setTab('education'); } }, [
        U.el('span', { class: 'tl tl-orange', text: '⚠️ ' + openFU.length + ' מעקבים פתוחים' }),
        U.el('span', { class: 'muted', style: 'font-size:12.5px;', text: 'שיחות שדרשו המשך טיפול — לחצו למעבר' })
      ]));
    }

    // נעדרים ברצף (2+ ערבים)
    var streaks = students.map(function (s) { return { s: s, n: Store.absStreak(s.id) }; })
      .filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return b.n - a.n; });
    if (streaks.length) {
      panel.appendChild(U.el('div', { class: 'dash-sec', text: '❌ נעדרים ברצף' }));
      streaks.slice(0, 6).forEach(function (x) {
        panel.appendChild(U.el('div', { class: 'dash-row' }, [
          U.el('span', { class: 'tl tl-red', text: x.n + ' ערבים' }),
          U.el('span', { style: 'font-weight:600;', text: x.s.name }),
          U.el('span', { class: 'muted', style: 'font-size:12px;', text: global.ClassName ? ClassName(x.s.classId) : '' })
        ]));
      });
    }

    // תלמידים ללא שיחה אישית מעבר ליעד
    var today = U.todayISO();
    var gd = (Store.core().settings || {}).convGoalDays || 30;
    var noConv = students.filter(function (s) {
      var lc = Store.lastConversation(s.id);
      if (!lc) return true;
      return (U.fromISO(today) - U.fromISO(lc.date)) / 86400000 > gd;
    });
    if (noConv.length) {
      panel.appendChild(U.el('div', { class: 'dash-sec', text: '⏰ ללא שיחה אישית מעל ' + gd + ' יום (' + noConv.length + ')' }));
      panel.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;', text: noConv.slice(0, 10).map(function (s) { return s.name; }).join(' · ') + (noConv.length > 10 ? ' · …' : '') }));
    }
    return panel;
  }

  // ---------- סיכום ערב: טקסט מוכן לוואטסאפ ----------
  function buildSummaryText() {
    var today = U.todayISO();
    var students = activeStudents();
    var session = Store.attFor(today, false);
    var marks = (session && session.marks) || {};
    var lines = ['*סיכום זמן פנימיה — ' + U.weekdayName(today) + ' ' + U.gregLabel(today) + '*'];

    var present = 0, out = [];
    students.forEach(function (s) {
      var m = marks[s.id];
      if (m && m.st === 'present') present++;
      else if (m) out.push(s.name + ' (' + U.attLabel(m.st) + (m.note ? ' — ' + m.note : '') + ')');
    });
    var unmarked = students.length - present - out.length;
    lines.push('✅ נוכחים: ' + present + '/' + students.length + (session && session.status === 'closed' ? ' · היום נסגר 🔒' : ''));
    if (out.length) lines.push('🚫 לא בפנימיה (' + out.length + '):\n' + out.map(function (t) { return '· ' + t; }).join('\n'));
    if (unmarked > 0) lines.push('⏳ טרם סומנו: ' + unmarked);

    // לפי כיתה
    var byClass = (Store.core().classes || []).map(function (c) {
      var stus = students.filter(function (s) { return s.classId === c.id; });
      if (!stus.length) return null;
      var p = stus.filter(function (s) { return marks[s.id] && marks[s.id].st === 'present'; }).length;
      return c.name + ' ' + p + '/' + stus.length;
    }).filter(Boolean);
    if (byClass.length) lines.push('🏫 לפי כיתה: ' + byClass.join(' · '));

    // חוגים של היום
    var chugim = (Store.core().chugim || []).filter(function (c) {
      return c.active !== false && (c.days || []).indexOf(U.fromISO(today).getDay()) !== -1;
    });
    if (chugim.length) {
      lines.push('🎨 חוגים: ' + chugim.map(function (c) {
        var rep = Store.reportFor(c.id, today);
        return c.name + (rep ? ' ✓' + (rep.rating ? ' ★' + rep.rating : '') : ' — ממתין לדיווח');
      }).join(' · '));
    }
    return lines.join('\n\n');
  }

  function sendSummaryWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(buildSummaryText()), '_blank');
  }

  function copySummary() {
    var txt = buildSummaryText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { U.toast('הסיכום הועתק — אפשר להדביק בכל מקום'); })
        .catch(function () { U.toast('ההעתקה נכשלה', 'error'); });
    } else {
      U.toast('הדפדפן לא תומך בהעתקה אוטומטית', 'error');
    }
  }

  // תחזוקה — placeholder לאפליקציה הייעודית
  function buildMaintPanel() {
    var panel = U.el('div', { class: 'dash-panel' });
    panel.appendChild(U.el('div', { class: 'dash-panel-head' }, [U.el('h3', { text: '🔧 סטטוס תחזוקה' })]));
    panel.appendChild(U.el('div', { class: 'dash-empty' }, [
      U.el('div', { style: 'font-size:26px;margin-bottom:6px;', text: '🚧' }),
      U.el('div', { text: 'בקרוב — הכרטיס יתחבר לאפליקציית התחזוקה הייעודית.' })
    ]));
    return panel;
  }

  global.DashboardView = { render: render };
})(window);
