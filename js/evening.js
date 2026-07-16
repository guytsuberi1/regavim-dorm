/* evening.js — תכנית תעסוקת ערב: תבנית שבועית קבועה + שינויים חד-פעמיים לשבוע הנוכחי */
(function (global) {
  'use strict';
  var U = global.U;
  var weekStart = null; // ראשון של השבוע המוצג

  function dormDays() { return (Store.core().settings || {}).dormDays || [0, 1, 2, 3]; }
  function activities() { return (Store.core().settings || {}).eveningActivities || []; }

  function sundayOf(iso) {
    var d = U.fromISO(iso);
    return U.addDays(iso, -d.getDay());
  }

  function render(root) {
    var isAdmin = Store.isAdmin();
    if (!weekStart) weekStart = sundayOf(U.todayISO());

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🗓️ תכנית ערב' }),
      U.el('div', { class: 'spacer' })
    ]));

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      U.el('button', { class: view === 'week' ? 'active' : '', onclick: function () { view = 'week'; App.render(); } }, 'השבוע'),
      isAdmin ? U.el('button', { class: view === 'template' ? 'active' : '', onclick: function () { view = 'template'; App.render(); } }, 'תבנית קבועה') : null
    ]));

    if (view === 'template' && isAdmin) renderTemplate(root);
    else renderWeek(root);

    // מקרא
    root.appendChild(U.el('div', { class: 'att-legend', style: 'margin-top:14px;' }, activities().map(function (a) {
      return U.el('span', null, [U.el('span', { class: 'att-cell', style: 'background:' + a.color + ';' }), a.label]);
    }).concat([U.el('span', null, [U.el('span', { class: 'att-cell none' }), 'לא הוגדר'])])));
  }
  var view = 'week';

  // ---------- תבנית שבועית קבועה ----------
  function renderTemplate(root) {
    root.appendChild(U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'התכנית הקבועה שחוזרת על עצמה כל שבוע. שינוי חד-פעמי לשבוע מסוים עושים בלשונית "השבוע".' }));
    var tmpl = Store.core().settings.eveningTemplate || {};
    var classes = (Store.core().classes || []).filter(function (c) { return c.active !== false; });
    var days = dormDays();

    var thead = U.el('tr', null, [U.el('th', { text: 'כיתה' })].concat(days.map(function (wd) {
      return U.el('th', { text: U.WEEKDAYS[wd] });
    })));
    var rows = classes.map(function (c) {
      return U.el('tr', null, [U.el('td', { text: c.name })].concat(days.map(function (wd) {
        var sel = activitySelect((tmpl[String(wd)] || {})[c.id] || '');
        sel.addEventListener('change', function () {
          if (!tmpl[String(wd)]) tmpl[String(wd)] = {};
          tmpl[String(wd)][c.id] = sel.value;
          Store.save('core');
        });
        return U.el('td', null, [sel]);
      })));
    });
    root.appendChild(U.el('table', { class: 'grid' }, [U.el('thead', null, [thead]), U.el('tbody', null, rows)]));
  }

  // ---------- תכנית השבוע (עם שינויים חד-פעמיים) ----------
  function renderWeek(root) {
    var isAdmin = Store.isAdmin();
    var days = dormDays();
    var classes = (Store.core().classes || []).filter(function (c) { return c.active !== false; });
    var wEnd = U.addDays(weekStart, 6);

    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('button', { class: 'btn secondary ico', title: 'שבוע קודם', onclick: function () { weekStart = U.addDays(weekStart, -7); App.render(); } }, '→'),
      U.el('span', { class: 'range-chip' }, [U.el('span', { class: 'rc-ic', text: '📅' }), U.el('span', { text: U.gregLabel(weekStart) + ' – ' + U.gregLabel(wEnd) })]),
      U.el('button', { class: 'btn secondary ico', title: 'שבוע הבא', onclick: function () { weekStart = U.addDays(weekStart, 7); App.render(); } }, '←'),
      weekStart !== sundayOf(U.todayISO()) ? U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = sundayOf(U.todayISO()); App.render(); } }, '↩ השבוע' ) : null
    ]));

    var today = U.todayISO();
    var thead = U.el('tr', null, [U.el('th', { text: 'כיתה' })].concat(days.map(function (wd) {
      var date = U.addDays(weekStart, wd);
      var isToday = date === today;
      return U.el('th', { style: isToday ? 'background:var(--brand);color:#fff;' : '', text: U.WEEKDAYS[wd] + ' ' + U.gregLabel(date) });
    })));

    var rows = classes.map(function (c) {
      return U.el('tr', null, [U.el('td', { text: c.name })].concat(days.map(function (wd) {
        var date = U.addDays(weekStart, wd);
        var actId = Store.eveningActivityFor(date, c.id);
        var def = actId ? Store.activityDef(actId) : null;
        var over = ((Store.core().eveningPlan || {})[date] || {})[c.id] != null;
        var cell = U.el('td', null, [
          U.el('span', { class: 'ev-pill', style: def ? 'background:' + def.color + ';color:#fff;' : '', text: def ? def.label : '—' }),
          over ? U.el('span', { title: 'שינוי חד-פעמי', style: 'margin-inline-start:4px;', text: '✎' }) : null
        ]);
        if (isAdmin) {
          cell.style.cursor = 'pointer';
          cell.title = 'לחצו לשינוי חד-פעמי';
          cell.addEventListener('click', function () { openOverride(date, c); });
        }
        return cell;
      })));
    });
    root.appendChild(U.el('table', { class: 'grid' }, [U.el('thead', null, [thead]), U.el('tbody', null, rows)]));
    if (!isAdmin) root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12.5px;', text: 'התכנית נקבעת ע"י מנהל הפנימיה.' }));
  }

  function openOverride(date, c) {
    var cur = ((Store.core().eveningPlan || {})[date] || {})[c.id];
    var hasOver = cur != null;
    var sel = activitySelect(hasOver ? cur : (Store.eveningActivityFor(date, c.id) || ''), true);
    Modal.open('תכנית ערב · ' + c.name + ' · ' + U.weekdayName(date) + ' ' + U.gregLabel(date), U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'תעסוקה לערב זה' }), sel]),
      U.el('p', { class: 'muted', style: 'font-size:12.5px;', text: 'שינוי כאן חל רק על התאריך הזה. "חזרה לתבנית" מבטל את השינוי החד-פעמי.' })
    ]), [
      { label: 'ביטול', class: 'secondary' },
      hasOver ? { label: '↩ חזרה לתבנית', class: 'secondary', onClick: function (close) {
        var plan = Store.core().eveningPlan[date]; if (plan) { delete plan[c.id]; if (!Object.keys(plan).length) delete Store.core().eveningPlan[date]; }
        Store.save('core'); close(); App.render();
      } } : null,
      { label: 'שמירה', onClick: function (close) { Store.setEveningOverride(date, c.id, sel.value); close(); App.render(); } }
    ].filter(Boolean));
  }

  function activitySelect(val, withNone) {
    var opts = [U.el('option', { value: '' }, withNone ? '— (ללא/כרגיל)' : '—')];
    activities().forEach(function (a) { opts.push(U.el('option', { value: a.id }, a.label)); });
    var sel = U.el('select', null, opts);
    sel.value = val || '';
    return sel;
  }

  global.EveningView = { render: render };
})(window);
