/* base.js — מסך נתוני בסיס: תלמידים / כיתות / צוות / חוגים (מנהל בלבד) */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';
  var showArchive = false; // הצגת רשומות בארכיון (active=false) במקום הפעילות
  var sortKey = null, sortDir = 1;
  var searchTerm = '';

  // תג כיתה צבעוני לפי מיקום הכיתה ברשימה
  function classBadge(classId) {
    var classes = Store.core().classes || [];
    var i = -1, name = '—';
    classes.forEach(function (c, idx) { if (c.id === classId) { i = idx; name = c.name; } });
    return U.el('span', { class: 'grade-badge gb' + (i < 0 ? 'x' : (i % 5)), title: 'כיתה ' + name, text: name });
  }
  global.ClassBadge = classBadge;

  function className(classId) {
    var c = Store.getById('classes', classId);
    return c ? c.name : '';
  }
  global.ClassName = className;

  function staffName(staffId) {
    var s = Store.getById('staff', staffId);
    return s ? s.name : '';
  }

  // הגדרת השדות לכל אוסף
  function fieldDefs(coll) {
    if (coll === 'students') return [
      { key: 'name', label: 'שם התלמיד', type: 'text', required: true, col: true },
      { key: 'classId', label: 'כיתה', type: 'selectColl', coll: 'classes', required: true, col: true },
      { key: 'building', label: 'מבנה', type: 'text', col: true },
      { key: 'room', label: 'חדר', type: 'text', col: true },
      { key: 'phone', label: 'טלפון תלמיד', type: 'text', col: true },
      { key: 'parentName', label: 'שם הורה', type: 'text' },
      { key: 'parentPhone', label: 'טלפון הורה', type: 'text', col: true },
      { key: 'notes', label: 'הערות', type: 'text' }
    ];
    if (coll === 'classes') return [
      { key: 'name', label: 'שם הכיתה', type: 'text', required: true, col: true }
    ];
    if (coll === 'staff') return [
      { key: 'name', label: 'שם', type: 'text', required: true, col: true },
      { key: 'role', label: 'תפקיד', type: 'select', options: ['מדריך', 'מדריך חוג', 'מנהל פנימיה'],
        values: ['madrich', 'chug', 'admin'], col: true, def: 'madrich' },
      { key: 'classId', label: 'כיתה באחריות', type: 'selectColl', coll: 'classes', col: true, optional: true, hint: 'למדריך — הכיתה שהוא אחראי עליה' },
      { key: 'email', label: 'אימייל להתחברות', type: 'text', required: true, col: true },
      { key: 'phone', label: 'טלפון', type: 'text', col: true }
    ];
    if (coll === 'chugim') return [
      { key: 'name', label: 'שם החוג', type: 'text', required: true, col: true },
      { key: 'instructorStaffId', label: 'מדריך החוג', type: 'selectColl', coll: 'staff', col: true, optional: true },
      { key: 'days', label: 'ימי פעילות', type: 'days', col: true },
      { key: 'time', label: 'שעה', type: 'text', col: true },
      { key: 'location', label: 'מיקום', type: 'text' }
    ];
    return [];
  }

  function collTitle(c) {
    return { students: 'תלמידים', classes: 'כיתות', staff: 'צוות', chugim: 'חוגים' }[c];
  }

  function cmpVal(a, b, def) {
    var va = a[def.key], vb = b[def.key];
    if (def.key === 'classId') return String(className(va)).localeCompare(String(className(vb)), 'he');
    if (def.type === 'number') return U.num(va) - U.num(vb);
    return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'he');
  }

  function daysLabel(days) {
    if (!days || !days.length) return '—';
    return days.slice().sort().map(function (d) { return U.WEEKDAYS[d]; }).join(', ');
  }

  function displayVal(def, item) {
    var v = item[def.key];
    if (def.key === 'role') return Store.roleLabel(v || 'madrich');
    if (def.type === 'selectColl') return def.coll === 'classes' ? className(v) : (def.coll === 'staff' ? staffName(v) : v);
    if (def.type === 'days') return daysLabel(v);
    return v == null ? '' : v;
  }

  function render(root) {
    var core = Store.core();

    var headBtns = [U.el('h2', { text: '🗂️ נתוני בסיס' }), U.el('div', { class: 'spacer' })];
    if (showArchive) {
      headBtns.push(U.el('button', { class: 'btn secondary', title: 'חזרה לרשומות הפעילות', onclick: function () { showArchive = false; App.render(); } }, '↩ חזרה לפעילים'));
    } else {
      headBtns.push(U.el('button', { class: 'btn', onclick: function () { openForm(null); } }, '+ הוספה'));
      var menuItems = [];
      if (sub === 'students' && global.ImportData) {
        menuItems.push({ icon: '🌱', label: 'ייבוא תלמידים מאפליקציית החקלאות', onClick: function () { ImportData.openAgriImport(); } });
        menuItems.push({ html: U.XLS_SVG, label: 'ייבוא תלמידים מאקסל', onClick: function () { ImportData.openExcelImport(); } });
        menuItems.push({ icon: '📄', label: 'הורדת תבנית אקסל', onClick: function () { ImportData.downloadTemplate(); } });
        menuItems.push(null);
      }
      menuItems.push({ icon: '📦', label: 'ארכיון', title: 'הצגת רשומות שהועברו לארכיון', onClick: function () { showArchive = true; App.render(); } });
      headBtns.push(U.actionMenu(menuItems));
    }
    root.appendChild(U.el('div', { class: 'page-head' }, headBtns));

    var tabs = U.el('div', { class: 'subtabs' },
      ['students', 'classes', 'staff', 'chugim'].map(function (c) {
        var count = (core[c] || []).filter(function (x) { return x.active !== false; }).length;
        return U.el('button', {
          class: sub === c ? 'active' : '',
          onclick: function () { sub = c; sortKey = null; searchTerm = ''; App.render(); }
        }, collTitle(c) + ' (' + count + ')');
      })
    );
    root.appendChild(tabs);

    var searchInp = U.el('input', { type: 'search', class: 'no-print', placeholder: '🔍 חיפוש...', value: searchTerm, style: 'margin:10px 0;max-width:300px;width:100%;' });
    searchInp.addEventListener('input', function () {
      searchTerm = searchInp.value; App.render();
      var el = U.$('input[type=search]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    });
    root.appendChild(searchInp);
    root.appendChild(buildTable());
  }

  function buildTable() {
    var core = Store.core();
    var defs = fieldDefs(sub).filter(function (d) { return d.col; });
    var allRows = (core[sub] || []).filter(function (it) { return showArchive ? it.active === false : it.active !== false; });
    var rows = allRows;
    if (searchTerm) {
      var q = searchTerm.toLowerCase();
      rows = allRows.filter(function (it) {
        return defs.some(function (d) { return String(displayVal(d, it) || '').toLowerCase().indexOf(q) !== -1; });
      });
    }
    var countNote = searchTerm
      ? U.el('div', { class: 'muted', style: 'font-size:12.5px;margin:-4px 0 8px;', text: 'נמצאו ' + rows.length + ' מתוך ' + allRows.length })
      : null;

    if (!rows.length) {
      return U.el('div', null, [
        countNote,
        U.el('div', { class: 'card empty' },
          searchTerm ? 'לא נמצאו תוצאות לחיפוש.' : (showArchive ? 'הארכיון ריק.' : 'אין עדיין רשומות. לחצו "הוספה" או ייבאו מהתפריט ⋮.'))
      ]);
    }

    var sdef = sortKey ? defs.filter(function (d) { return d.key === sortKey; })[0] : null;
    if (sdef) rows = rows.slice().sort(function (a, b) { return cmpVal(a, b, sdef) * sortDir; });

    var extraCols = [];
    if (sub === 'chugim') extraCols.push('תלמידים');

    var thead = U.el('tr', null,
      defs.map(function (d) {
        var arrow = sortKey === d.key ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
        var th = U.el('th', { class: 'sortable', title: 'מיון לפי ' + d.label, text: d.label + arrow });
        th.addEventListener('click', function () {
          if (sortKey === d.key) sortDir = -sortDir; else { sortKey = d.key; sortDir = 1; }
          App.render();
        });
        return th;
      }).concat(extraCols.map(function (t) { return U.el('th', { text: t }); }))
        .concat([U.el('th', { text: '' })]));

    var tbody = rows.map(function (item) {
      var tds = defs.map(function (d) {
        if (d.key === 'classId' && item.classId) return U.el('td', null, [classBadge(item.classId)]);
        if (sub === 'students' && d.key === 'name') {
          return U.el('td', null, [U.el('button', { class: 'btn small secondary', style: 'font-weight:600;', title: 'כרטיס תלמיד', onclick: function () { openStudentCard(item); } }, item.name)]);
        }
        return U.el('td', { text: displayVal(d, item) });
      });
      if (sub === 'chugim') {
        var n = (item.studentIds || []).length;
        tds.push(U.el('td', null, [
          U.el('button', { class: 'btn small secondary', title: 'בחירת תלמידי החוג', onclick: function () { pickChugStudents(item); } }, '👥 ' + n)
        ]));
      }
      tds.push(U.el('td', { class: 'actions' }, [
        U.el('button', { class: 'btn small secondary', title: 'עריכה', onclick: function () { openForm(item); } }, '✏️'),
        showArchive
          ? U.el('button', { class: 'btn small', title: 'שחזור מהארכיון', onclick: function () { restore(item); } }, '♻')
          : U.el('button', { class: 'btn small secondary', title: 'העברה לארכיון', onclick: function () { archive(item); } }, '📦')
      ]));
      return U.el('tr', null, tds);
    });

    return U.el('div', null, [countNote, U.el('table', { class: 'grid' }, [U.el('thead', null, [thead]), U.el('tbody', null, tbody)])]);
  }

  // העברה לארכיון / שחזור — שומר את כל המידע ההיסטורי (לא מוחק)
  function archive(item) {
    Modal.confirm({ title: 'העברה לארכיון', text: 'להעביר את "' + item.name + '" לארכיון?\nהמידע יישמר וניתן לשחזר בכל רגע.', okLabel: 'העבר לארכיון' }, function () {
      item.active = false; Store.save('core'); App.render();
      U.toast('"' + item.name + '" הועבר לארכיון');
    });
  }
  function restore(item) { item.active = true; Store.save('core'); App.render(); U.toast('"' + item.name + '" שוחזר מהארכיון'); }

  // בחירת תלמידי חוג
  function pickChugStudents(chug) {
    global.PickStudents('תלמידי החוג — ' + chug.name, chug.studentIds || [], function (sel) {
      chug.studentIds = sel;
      Store.save('core'); App.render();
      U.toast('עודכנו ' + sel.length + ' תלמידים בחוג ' + chug.name);
    });
  }

  // ---------- כרטיס תלמיד מהיר ----------
  function openStudentCard(stu) {
    var st = Store.attStats(stu.id, 30);
    var lastConv = Store.lastConversation(stu.id);
    var streak = Store.absStreak(stu.id);
    function row(label, val) {
      return U.el('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);align-items:center;' },
        [U.el('span', { class: 'muted', text: label }), typeof val === 'string' ? U.el('span', { style: 'font-weight:600;', text: val }) : val]);
    }
    var body = U.el('div', null, [
      row('כיתה', className(stu.classId) || '—'),
      row('חדר', (stu.building ? stu.building + ' · ' : '') + (stu.room || '—')),
      row('טלפון תלמיד', stu.phone || '—'),
      row('הורה', (stu.parentName || '') + (stu.parentPhone ? ' · ' + stu.parentPhone : '') || '—'),
      row('סטטוס חינוכי', U.flagPill(stu.eduStatus && stu.eduStatus.level)),
      row('נוכחות 30 יום', st.pct == null ? 'אין נתונים' : st.pct + '% (' + st.present + '/' + st.total + ')'),
      streak >= 2 ? row('היעדרות רצופה', U.el('span', { class: 'tl tl-red', text: '⚠️ ' + streak + ' ערבים ברצף' })) : null,
      row('שיחה אחרונה', lastConv ? U.gregLabel(lastConv.date) + ' · ' + (lastConv.byName || '') : 'טרם נערכה'),
      stu.notes ? row('הערות', stu.notes) : null,
      (Store.isAdmin() && stu.mgrNote) ? row('🔒 הערת מנהל', stu.mgrNote) : null
    ]);
    Modal.open('כרטיס תלמיד — ' + stu.name, body, [
      { label: '🕒 ציר זמן', class: 'secondary', onClick: function (close) { close(); openStudentTimeline(stu); } },
      { label: 'עריכה', class: 'secondary', onClick: function (close) { close(); openForm(stu); } },
      { label: 'סגור' }
    ]);
  }

  // ---------- ציר זמן לתלמיד: היעדרויות + שיחות + עדכוני סטטוס, כרונולוגית ----------
  function openStudentTimeline(stu) {
    var events = [];
    // אירועי נוכחות (כל מה שאינו "נוכח")
    var att = Store.get().att;
    Object.keys(att).forEach(function (d) {
      var m = att[d].marks[stu.id];
      if (!m || m.st === 'present') return;
      var icons = { absent: '❌', home: '🏠', sick: '🤒' };
      events.push({ date: d, icon: icons[m.st] || '❔', text: U.attLabel(m.st) + (m.note ? ' — ' + m.note : ''), sub: 'סומן ע"י ' + (m.by || '') });
    });
    // שיחות אישיות
    (Store.get().edu.conversations || []).forEach(function (c) {
      if (c.studentId !== stu.id) return;
      events.push({ date: c.date, icon: '💬', flag: c.flag,
        text: 'שיחה אישית' + (c.summary ? ' — ' + c.summary : ''),
        sub: (c.byName || '') + (c.followUp ? (c.followUpDone ? ' · מעקב טופל ✓' : ' · מעקב פתוח ⚠️') : '') });
    });
    // עדכון הסטטוס הנוכחי
    if (stu.eduStatus && stu.eduStatus.at) {
      events.push({ date: String(stu.eduStatus.at).slice(0, 10), icon: '🚦', flag: stu.eduStatus.level,
        text: 'עדכון סטטוס חינוכי' + (stu.eduStatus.note ? ' — ' + stu.eduStatus.note : ''), sub: stu.eduStatus.by || '' });
    }
    events.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    events = events.slice(0, 40);

    var body = U.el('div', null, events.length ? events.map(function (ev) {
      return U.el('div', { style: 'display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start;' }, [
        U.el('span', { style: 'font-size:18px;flex:0 0 auto;', text: ev.icon }),
        U.el('div', { style: 'min-width:0;flex:1;' }, [
          U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, [
            U.el('b', { style: 'font-size:13px;', text: U.weekdayName(ev.date) + ' · ' + U.gregLabel(ev.date) }),
            ev.flag ? U.flagPill(ev.flag) : null
          ]),
          U.el('div', { style: 'font-size:14px;line-height:1.5;white-space:pre-wrap;', text: ev.text }),
          ev.sub ? U.el('div', { class: 'muted', style: 'font-size:11.5px;', text: ev.sub }) : null
        ])
      ]);
    }) : [U.el('div', { class: 'empty', text: 'אין עדיין אירועים — התלמיד נוכח תמיד ולא תועדו שיחות 🙂' })]);

    Modal.open('🕒 ציר זמן — ' + stu.name, body, [
      { label: '↩ חזרה לכרטיס', class: 'secondary', onClick: function (close) { close(); openStudentCard(stu); } },
      { label: 'סגור' }
    ]);
  }

  // ---------- טופס הוספה/עריכה גנרי ----------
  function openForm(item) {
    var defs = fieldDefs(sub);
    var editing = !!item;
    var model = {};
    defs.forEach(function (d) {
      model[d.key] = item ? item[d.key] : (d.def !== undefined ? d.def : (d.type === 'days' ? [] : ''));
    });
    if (editing) model.id = item.id;

    var inputs = {}, errEls = {}, dayChecks = {};
    var body = U.el('div', null, defs.map(function (d) {
      var input;
      if (d.type === 'select') {
        var opts = d.options.map(function (o, i) {
          var val = d.values ? d.values[i] : o;
          return U.el('option', { value: val }, o);
        });
        input = U.el('select', null, opts);
        input.value = model[d.key] || (d.values ? d.values[0] : d.options[0]);
      } else if (d.type === 'selectColl') {
        var collItems = (Store.core()[d.coll] || []).filter(function (x) { return x.active !== false; });
        var copts = [];
        if (d.optional || !d.required) copts.push(U.el('option', { value: '' }, '—'));
        collItems.forEach(function (c) { copts.push(U.el('option', { value: c.id }, c.name)); });
        input = U.el('select', null, copts);
        input.value = model[d.key] || '';
      } else if (d.type === 'days') {
        // בחירת ימי שבוע (ראשון–שישי)
        var wrap = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
        [0, 1, 2, 3, 4, 5].forEach(function (day) {
          var chk = U.el('input', { type: 'checkbox', checked: (model[d.key] || []).indexOf(day) !== -1 });
          dayChecks[day] = chk;
          wrap.appendChild(U.el('label', { style: 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:13.5px;border:1px solid var(--border);border-radius:8px;padding:5px 9px;margin:0;' }, [chk, U.el('span', { text: U.WEEKDAYS[day] })]));
        });
        input = wrap;
      } else {
        input = U.el('input', { type: 'text', value: model[d.key] == null ? '' : model[d.key] });
      }
      inputs[d.key] = input;
      var err = null;
      if (d.required) {
        err = U.el('div', { class: 'field-err' });
        errEls[d.key] = err;
        // ולידציה חיה — הסימון האדום נעלם ברגע שממלאים
        input.addEventListener('input', function () {
          if (String(input.value || '').trim() !== '') { input.classList.remove('invalid'); err.textContent = ''; }
        });
      }
      return U.el('div', { class: 'field' }, [
        U.el('label', { text: d.label + (d.required ? ' *' : '') }), input,
        d.hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: d.hint }) : null,
        err
      ]);
    }));

    function doSave(close) {
      // בעריכה — שומרים על שדות קיימים שאינם בטופס (כמו eduStatus/studentIds) כדי לא לאבד אותם
      var out = {};
      if (editing) { for (var key in item) { if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key]; } out.id = model.id; }
      var firstBad = null;
      defs.forEach(function (d) {
        var v;
        if (d.type === 'days') {
          v = [];
          Object.keys(dayChecks).forEach(function (day) { if (dayChecks[day].checked) v.push(parseInt(day, 10)); });
        } else {
          v = inputs[d.key].value;
        }
        var bad = d.required && (v === '' || v == null || String(v).trim() === '');
        if (d.required && errEls[d.key]) {
          inputs[d.key].classList.toggle('invalid', bad);
          errEls[d.key].textContent = bad ? 'שדה חובה' : '';
        }
        if (bad && !firstBad) firstBad = inputs[d.key];
        out[d.key] = v;
      });
      if (firstBad) { firstBad.focus(); return; }
      if (sub === 'staff' && out.email) out.email = String(out.email).trim().toLowerCase();
      Store.upsert(sub, out);
      close();
      App.render();
    }

    Modal.open((editing ? 'עריכת ' : 'הוספת ') + collTitle(sub), body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) { doSave(close); } }
    ]);
  }

  // ---------- בורר תלמידים כללי (מודאל בחירה מרובה עם חיפוש וסינון כיתה) ----------
  // PickStudents(title, selectedIds, onSave, opts?) ; opts.filter — פונקציית סינון על תלמיד
  global.PickStudents = function (title, selectedIds, onSave, opts) {
    opts = opts || {};
    var sel = {};
    (selectedIds || []).forEach(function (id) { sel[id] = true; });
    var all = (Store.core().students || []).filter(function (s) { return s.active !== false && (!opts.filter || opts.filter(s)); })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    var clsFilter = '';
    var listBox = U.el('div', { class: 'fadd-list' });
    var search = U.el('input', { type: 'text', class: 'fadd-search', placeholder: '🔎 חיפוש תלמיד...' });
    var counter = U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:6px;' });

    var classes = Store.core().classes || [];
    var clsTabs = U.el('div', { class: 'subtabs', style: 'margin-bottom:8px;' },
      [U.el('button', { class: 'active', onclick: function (e) { clsFilter = ''; setActive(e.target); build(); } }, 'הכל')]
        .concat(classes.map(function (c) {
          return U.el('button', { onclick: function (e) { clsFilter = c.id; setActive(e.target); build(); } }, c.name);
        })));
    function setActive(btn) {
      U.$all('button', clsTabs).forEach(function (b) { b.classList.toggle('active', b === btn); });
    }

    function updateCounter() { counter.textContent = 'נבחרו ' + Object.keys(sel).filter(function (k) { return sel[k]; }).length + ' תלמידים'; }

    function build() {
      U.clear(listBox);
      var ql = (search.value || '').trim().toLowerCase();
      var shown = all.filter(function (s) {
        if (clsFilter && s.classId !== clsFilter) return false;
        return !ql || (s.name || '').toLowerCase().indexOf(ql) >= 0;
      });
      if (!shown.length) { listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:10px;', text: 'לא נמצאו תלמידים' })); return; }
      shown.forEach(function (s) {
        var b = U.el('button', { class: 'fadd-item' + (sel[s.id] ? ' sel' : '') }, [
          U.el('span', null, [U.el('span', { text: s.name + '  ' }), classBadge(s.classId)]),
          U.el('span', { class: 'fadd-plus', text: sel[s.id] ? '✓' : '+' })
        ]);
        b.addEventListener('click', function () {
          sel[s.id] = !sel[s.id];
          b.classList.toggle('sel', sel[s.id]);
          b.querySelector('.fadd-plus').textContent = sel[s.id] ? '✓' : '+';
          updateCounter();
        });
        listBox.appendChild(b);
      });
    }
    search.addEventListener('input', build);
    updateCounter();
    build();

    Modal.open(title, U.el('div', null, [clsTabs, search, counter, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var ids = Object.keys(sel).filter(function (k) { return sel[k]; });
        close();
        onSave(ids);
      } }
    ]);
  };

  global.BaseView = { render: render, openStudentCard: openStudentCard };
})(window);
