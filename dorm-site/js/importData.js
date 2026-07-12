/* importData.js — ייבוא תלמידים: מקובץ הייצוא של אפליקציית החקלאות (JSON) או מאקסל */
(function (global) {
  'use strict';
  var U = global.U;

  // ---------- ייבוא מאפליקציית החקלאות ----------
  // קובץ הגיבוי של החקלאות מכיל students: [{ name, grade ('ט'/'י'/'יא'/'יב'), notes ('ט1'/'ט2'), active }]
  function openAgriImport() {
    var fileInput = U.el('input', { type: 'file', accept: '.json', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(reader.result);
          var students = (obj.students || []).filter(function (s) { return s && s.name && s.active !== false; });
          if (!students.length) { U.toast('לא נמצאו תלמידים פעילים בקובץ', 'error'); return; }
          openMappingDialog(students);
        } catch (e) { U.toast('קובץ לא תקין: ' + e.message, 'error'); }
      };
      reader.readAsText(f);
    });
    document.body.appendChild(fileInput);
    Modal.open('🌱 ייבוא תלמידים מאפליקציית החקלאות', U.el('div', null, [
      U.el('p', { style: 'margin-top:0;', text: 'באפליקציית החקלאות: הגדרות → גיבוי → "הורד גיבוי". את קובץ ה-JSON שהתקבל בוחרים כאן — והתלמידים ייובאו עם שיוך לכיתות.' }),
      U.el('p', { class: 'muted', style: 'font-size:13px;', text: 'תלמידים שכבר קיימים (לפי שם) ידולגו — אין חשש לכפילויות.' })
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: '📂 בחירת קובץ', onClick: function (close) { close(); fileInput.click(); } }
    ]);
  }

  // מיפוי שכבה+כיתה של החקלאות → כיתת פנימיה
  function openMappingDialog(students) {
    var classes = (Store.core().classes || []).filter(function (c) { return c.active !== false; });
    if (!classes.length) { U.toast('אין כיתות במערכת — הוסיפו כיתות קודם', 'error'); return; }

    // קיבוץ לפי (שכבה, כיתה מההערות): 'ט|ט1', 'י|', ...
    function keyOf(s) {
      var grade = String(s.grade || '').trim();
      var cls = String(s.notes || '').trim();
      return grade + (cls && cls !== grade ? '|' + cls : '');
    }
    function keyLabel(k) {
      var p = k.split('|');
      return p[1] ? ('שכבה ' + p[0] + ' · ' + p[1]) : ('שכבה ' + (p[0] || '—'));
    }
    var groups = {};
    students.forEach(function (s) {
      var k = keyOf(s);
      (groups[k] = groups[k] || []).push(s);
    });

    // ניחוש התאמה: לפי שם הכיתה בהערות (ט1→?), ואז לפי שם השכבה
    function guessClass(k) {
      var p = k.split('|');
      var cand = [p[1], p[0]].filter(Boolean);
      for (var i = 0; i < cand.length; i++) {
        var exact = classes.filter(function (c) { return c.name === cand[i]; })[0];
        if (exact) return exact.id;
      }
      // שכבה י ללא פיצול — ננחש את הכיתה הראשונה שמתחילה באות השכבה
      var starts = classes.filter(function (c) { return p[0] && c.name.indexOf(p[0]) === 0; })[0];
      return starts ? starts.id : classes[0].id;
    }

    var sels = {};
    var rows = Object.keys(groups).sort().map(function (k) {
      var sel = U.el('select', null, classes.map(function (c) { return U.el('option', { value: c.id }, c.name); }));
      sel.value = guessClass(k);
      sels[k] = sel;
      return U.el('div', { class: 'dash-row' }, [
        U.el('span', { style: 'font-weight:600;min-width:140px;', text: keyLabel(k) }),
        U.el('span', { class: 'tag', text: groups[k].length + ' תלמידים' }),
        U.el('span', { class: 'spacer' }),
        U.el('span', { class: 'muted', style: 'font-size:12.5px;', text: '→ כיתה:' }),
        sel
      ]);
    });

    Modal.open('שיוך לכיתות הפנימיה', U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin-top:0;font-size:13px;', text: 'נמצאו ' + students.length + ' תלמידים. בחרו לאיזו כיתת פנימיה להכניס כל קבוצה:' })
    ].concat(rows)), [
      { label: 'ביטול', class: 'secondary' },
      { label: '⬇ ייבוא התלמידים', onClick: function (close) {
        var existing = {};
        (Store.core().students || []).forEach(function (s) { existing[normName(s.name)] = true; });
        var added = 0, skipped = 0;
        Object.keys(groups).forEach(function (k) {
          var classId = sels[k].value;
          groups[k].forEach(function (s) {
            if (existing[normName(s.name)]) { skipped++; return; }
            existing[normName(s.name)] = true;
            Store.core().students.push({
              id: Store.uid(), name: String(s.name).trim(), classId: classId,
              phone: s.phone || '', active: true
            });
            added++;
          });
        });
        Store.save('core');
        close();
        App.render();
        U.toast('יובאו ' + added + ' תלמידים' + (skipped ? ' · ' + skipped + ' דולגו (כבר קיימים)' : ''));
      } }
    ]);
  }

  function normName(n) {
    return String(n || '').replace(/["'״׳.\-]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
  }

  // ---------- ייבוא מאקסל ----------
  var XL_COLS = ['שם התלמיד', 'כיתה', 'מבנה', 'חדר', 'טלפון תלמיד', 'שם הורה', 'טלפון הורה', 'הערות'];

  function downloadTemplate() {
    if (!global.XLSX) { U.toast('ספריית האקסל לא נטענה', 'error'); return; }
    var classes = (Store.core().classes || []);
    var example = ['ישראל ישראלי', classes.length ? classes[0].name : 'ט', 'מבנה א', '3', '050-0000000', 'אבי ישראלי', '050-1111111', ''];
    var ws = XLSX.utils.aoa_to_sheet([XL_COLS, example]);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'][0] = { RTL: true };
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
    XLSX.writeFile(wb, 'תבנית-תלמידים.xlsx');
  }

  function openExcelImport() {
    if (!global.XLSX) { U.toast('ספריית האקסל לא נטענה', 'error'); return; }
    var fileInput = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          importExcelRows(rows);
        } catch (e) { U.toast('קובץ לא תקין: ' + e.message, 'error'); }
      };
      reader.readAsArrayBuffer(f);
    });
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  function importExcelRows(rows) {
    if (!rows || rows.length < 2) { U.toast('הקובץ ריק', 'error'); return; }
    var header = rows[0].map(function (h) { return String(h || '').trim(); });
    var idx = {};
    XL_COLS.forEach(function (c) { idx[c] = header.indexOf(c); });
    if (idx['שם התלמיד'] === -1) { U.toast('חסרה עמודת "שם התלמיד" — השתמשו בתבנית מהתפריט', 'error'); return; }

    var classes = Store.core().classes || [];
    function classIdByName(name) {
      var c = classes.filter(function (x) { return x.name === String(name || '').trim(); })[0];
      return c ? c.id : (classes[0] ? classes[0].id : '');
    }
    var existing = {};
    (Store.core().students || []).forEach(function (s) { existing[normName(s.name)] = true; });

    var added = 0, skipped = 0;
    rows.slice(1).forEach(function (r) {
      var name = String(r[idx['שם התלמיד']] || '').trim();
      if (!name) return;
      if (existing[normName(name)]) { skipped++; return; }
      existing[normName(name)] = true;
      Store.core().students.push({
        id: Store.uid(), name: name,
        classId: classIdByName(idx['כיתה'] !== -1 ? r[idx['כיתה']] : ''),
        building: idx['מבנה'] !== -1 ? String(r[idx['מבנה']] || '') : '',
        room: idx['חדר'] !== -1 ? String(r[idx['חדר']] || '') : '',
        phone: idx['טלפון תלמיד'] !== -1 ? String(r[idx['טלפון תלמיד']] || '') : '',
        parentName: idx['שם הורה'] !== -1 ? String(r[idx['שם הורה']] || '') : '',
        parentPhone: idx['טלפון הורה'] !== -1 ? String(r[idx['טלפון הורה']] || '') : '',
        notes: idx['הערות'] !== -1 ? String(r[idx['הערות']] || '') : '',
        active: true
      });
      added++;
    });
    Store.save('core');
    App.render();
    U.toast('יובאו ' + added + ' תלמידים' + (skipped ? ' · ' + skipped + ' דולגו (כבר קיימים)' : ''));
  }

  global.ImportData = { openAgriImport: openAgriImport, openExcelImport: openExcelImport, downloadTemplate: downloadTemplate };
})(window);
