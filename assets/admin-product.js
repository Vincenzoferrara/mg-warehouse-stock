(function ($) {
  var suggestionCache = {};
  var warehousesCache = {};
  var enhancedInitTimer = null;
  var locUpdating = 0;

  var modalInited = false;
  var currentSubmit = null;

  function withLocUpdating(fn) {
    locUpdating += 1;
    try {
      return fn();
    } finally {
      locUpdating -= 1;
    }
  }

  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCtx() {
    var $root = $('#mgws-product');
    return {
      $root: $root,
      productId: parseInt($root.data('product-id'), 10) || 0,
      variationId: parseInt($('#mgws-variation').val(), 10) || 0,
      nonce: $('#mgws_product_nonce').val() || ''
    };
  }

  function toggleMgwsVisibility() {
    var $v = $('#_virtual');
    if (!$v.length) {
      return;
    }

    var isVirtual = $v.is(':checked');
    var $tab = $('.mgws_stock_tab');
    var $panel = $('#mgws_stock_data');

    if (isVirtual) {
      if ($tab.hasClass('active')) {
        var $first = $('.product_data_tabs li:visible').not($tab).first();
        if ($first.length) {
          $first.find('a').trigger('click');
        }
      }
      $tab.hide();
      $panel.hide();
      return;
    }

    $tab.show();
    $panel.show();
  }

  function setMsg(text, ok) {
    var cls = ok ? 'mgws-ok' : 'mgws-err';
    $('#mgws-product-msg').html('<span class="' + cls + '">' + esc(text) + '</span>');
  }

  function ensureModal() {
    if (modalInited) return;
    modalInited = true;
    var html = '';
    html += '<div id="mgws-modal" style="display:none;">';
    html += '  <div class="mgws-modal-backdrop"></div>';
    html += '  <div class="mgws-modal-dialog" role="dialog" aria-modal="true">';
    html += '    <div class="mgws-modal-header">';
    html += '      <h2 id="mgws-modal-title" style="margin:0;"></h2>';
    html += '      <button type="button" class="button-link" id="mgws-modal-close">Chiudi</button>';
    html += '    </div>';
    html += '    <div class="mgws-modal-body">';
    html += '      <label id="mgws-modal-label" for="mgws-modal-input" style="display:block; margin-bottom:6px;"></label>';
    html += '      <input type="text" id="mgws-modal-input" class="regular-text" />';
    html += '      <p><small id="mgws-modal-hint" class="description"></small></p>';
    html += '      <div id="mgws-modal-err" class="mgws-err" style="margin-top:6px;"></div>';
    html += '    </div>';
    html += '    <div class="mgws-modal-footer">';
    html += '      <button type="button" class="button button-primary" id="mgws-modal-ok">Salva</button>';
    html += '      <button type="button" class="button" id="mgws-modal-cancel">Annulla</button>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    $('body').append(html);

    $(document).on('click', '#mgws-modal-close, #mgws-modal-cancel, #mgws-modal .mgws-modal-backdrop', function () {
      closeModal();
    });
    $(document).on('click', '#mgws-modal-ok', function () {
      if (currentSubmit) currentSubmit();
    });
    $(document).on('keydown', function (e) {
      if ($('#mgws-modal').is(':visible') && e.key === 'Escape') {
        closeModal();
      }
    });
    $(document).on('keydown', '#mgws-modal-input', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentSubmit) currentSubmit();
      }
    });
  }

  function setupResizableVarTable() {
    var $table = $('#mgws-var-table');
    if (!$table.length) return;
    if ($table.data('mgws-resize')) return;
    $table.data('mgws-resize', 1);

    var $cols = $table.find('colgroup col');
    if (!$cols.length) return;

    var userId = parseInt($('#mgws-product').data('user-id'), 10) || 0;
    var siteLimit = parseInt($('#mgws-product').data('site-limit'), 10) || 0;
    var storageKey = 'mgws_var_table_cols:' + String(userId) + ':' + String(siteLimit);

    function loadWidths() {
      try {
        var raw = window.localStorage ? window.localStorage.getItem(storageKey) : null;
        if (!raw) return;
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        arr.forEach(function (w, i) {
          var n = parseInt(w, 10);
          if (!n || n < 40) return;
          if (i >= $cols.length) return;
          $cols.eq(i).css('width', n + 'px');
        });
      } catch (e) {
        // ignore
      }
    }

    function saveWidths() {
      try {
        if (!window.localStorage) return;
        var out = [];
        $cols.each(function () {
          var w = parseInt($(this).width(), 10) || 0;
          out.push(w);
        });
        window.localStorage.setItem(storageKey, JSON.stringify(out));
      } catch (e) {
        // ignore
      }
    }

    function resetWidths() {
      try {
        if (window.localStorage) window.localStorage.removeItem(storageKey);
      } catch (e) {
        // ignore
      }
      $cols.each(function () {
        $(this).css('width', '');
      });
    }

    loadWidths();

    $(document).on('click', '#mgws-var-reset-cols', function (e) {
      e.preventDefault();
      resetWidths();
    });

    // Add a resizer handle to each header cell except the last one.
    var $ths = $table.find('thead th');
    $ths.each(function (idx) {
      if (idx >= $cols.length - 1) return;
      var $th = $(this);
      if ($th.find('.mgws-col-resizer').length) return;
      $th.append('<span class="mgws-col-resizer" data-col="' + idx + '"></span>');
    });

    var startX = 0;
    var startW = 0;
    var colIdx = -1;
    var dragging = false;

    $(document).on('mousedown', '#mgws-var-table .mgws-col-resizer', function (e) {
      e.preventDefault();
      e.stopPropagation();
      colIdx = parseInt($(this).data('col'), 10);
      if (!(colIdx >= 0)) return;
      startX = e.pageX;
      var cur = $cols.eq(colIdx).width();
      startW = cur || $ths.eq(colIdx).outerWidth() || 120;
      dragging = true;
      $('body').addClass('mgws-col-dragging');
    });

    $(document).on('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.pageX - startX;
      var w = Math.max(60, startW + dx);
      $cols.eq(colIdx).css('width', w + 'px');
    });

    $(document).on('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      $('body').removeClass('mgws-col-dragging');
      saveWidths();
    });
  }

  function openModal(opts) {
    ensureModal();
    $('#mgws-modal-title').text(String(opts.title || ''));
    $('#mgws-modal-label').text(String(opts.label || ''));
    $('#mgws-modal-hint').text(String(opts.hint || ''));
    $('#mgws-modal-err').text('');
    $('#mgws-modal-input').val(String(opts.value || '')).attr('placeholder', String(opts.placeholder || '')).prop('disabled', false);
    $('#mgws-modal-ok').prop('disabled', false);

    currentSubmit = function () {
      var v = String($('#mgws-modal-input').val() || '').trim();
      if (!v) {
        $('#mgws-modal-err').text('Inserisci un valore');
        return;
      }
      $('#mgws-modal-input').prop('disabled', true);
      $('#mgws-modal-ok').prop('disabled', true);
      if (opts.onSubmit) {
        opts.onSubmit(v, function (errText) {
          if (errText) {
            $('#mgws-modal-err').text(String(errText));
            $('#mgws-modal-input').prop('disabled', false);
            $('#mgws-modal-ok').prop('disabled', false);
            $('#mgws-modal-input').focus();
            return;
          }
          closeModal();
        });
      }
    };

    $('#mgws-modal').show();
    window.setTimeout(function () {
      $('#mgws-modal-input').focus();
      $('#mgws-modal-input')[0].select();
    }, 30);
  }

  function closeModal() {
    $('#mgws-modal').hide();
    currentSubmit = null;
  }

  // (Levels/moves removed from product UI)

  function setSelectOptions($select, values, current) {
    var cur = (current !== undefined && current !== null) ? String(current) : String($select.val() || '');
    var list = (values || []).slice(0);
    if (cur && list.indexOf(cur) === -1) {
      list.unshift(cur);
    }

    var html = '<option value="">--</option>';
    list.forEach(function (v) {
      if (!v) return;
      html += '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    });
    $select.html(html);
    if (cur) {
      $select.val(cur);
    }

    // Update selectWoo/select2 UI if present.
    if ($select.hasClass('select2-hidden-accessible')) {
      $select.trigger('change.select2');
    } else {
      $select.trigger('change');
    }
  }

  function scheduleEnhancedInit() {
    if (enhancedInitTimer) {
      window.clearTimeout(enhancedInitTimer);
    }
    enhancedInitTimer = window.setTimeout(function () {
      enhancedInitTimer = null;
      if (window.jQuery && jQuery(document.body).trigger) {
        jQuery(document.body).trigger('wc-enhanced-select-init');
      }
    }, 60);
  }

  function setWarehouseOptions($select, warehouses, selectedId) {
    var opts = '<option value="0">--</option>';
    (warehouses || []).forEach(function (w) {
      opts += '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>';
    });
    $select.html(opts);
    if (selectedId) {
      $select.val(String(selectedId));
    }
    scheduleEnhancedInit();
  }

  function applySuggestionsToMain(sug) {
    // Default location group (source warehouse).
    var $room = $('#mgws-default-room');
    var $rack = $('#mgws-default-rack');
    var $shelf = $('#mgws-default-shelf');
    withLocUpdating(function () {
      setSelectOptions($room, (sug && sug.rooms) ? sug.rooms : [], $room.val());
    });
    updateGroupRacksShelves($room, $rack, $shelf, sug, false, false);
    setMainAddButtonsState();
  }

  function getRacksFor(sug, room) {
    var r = String(room || '');
    if (!r) {
      return [];
    }
    if (sug && sug.racks_by_room && sug.racks_by_room[r]) {
      return sug.racks_by_room[r];
    }
    return (sug && sug.racks) ? sug.racks : [];
  }

  function getShelvesFor(sug, room, rack) {
    var r = String(room || '');
    var k = String(rack || '');
    if (!r || !k) {
      return [];
    }
    if (sug && sug.shelves_by_room_rack && sug.shelves_by_room_rack[r] && sug.shelves_by_room_rack[r][k]) {
      return sug.shelves_by_room_rack[r][k];
    }
    return (sug && sug.shelves) ? sug.shelves : [];
  }

  function updateGroupRacksShelves($room, $rack, $shelf, sug, resetRackAndShelf, resetShelfOnly) {
    return withLocUpdating(function () {
    if (resetRackAndShelf) {
      $rack.val('');
      $shelf.val('');
    }
    if (resetShelfOnly) {
      $shelf.val('');
    }

    var roomVal = String($room.val() || '');
    if (!roomVal) {
      $rack.prop('disabled', true);
      $shelf.prop('disabled', true);
      setSelectOptions($rack, [], '');
      setSelectOptions($shelf, [], '');
      return;
    }

    $rack.prop('disabled', false);

    var rackVal = String($rack.val() || '');
    setSelectOptions($rack, getRacksFor(sug, roomVal), rackVal);

    rackVal = String($rack.val() || '');
    if (!rackVal) {
      $shelf.prop('disabled', true);
      setSelectOptions($shelf, [], '');
      return;
    }

    $shelf.prop('disabled', false);

    setSelectOptions($shelf, getShelvesFor(sug, roomVal, rackVal), String($shelf.val() || ''));
    });
  }

  function setMainAddButtonsState() {
    var room = String($('#mgws-default-room').val() || '');
    var rack = String($('#mgws-default-rack').val() || '');
    $('.mgws-add[data-target="mgws-default-rack"]').prop('disabled', !room);
    $('.mgws-add[data-target="mgws-default-shelf"]').prop('disabled', !(room && rack));
  }

  function setRowAddButtonsState($row) {
    var room = String($row.find('.mgws-var-room').val() || '');
    var rack = String($row.find('.mgws-var-rack').val() || '');
    $row.find('.mgws-add[data-target-class="mgws-var-rack"]').prop('disabled', !room);
    $row.find('.mgws-add[data-target-class="mgws-var-shelf"]').prop('disabled', !(room && rack));
  }

  function applySuggestionsToRow($row, sug) {
    var $room = $row.find('.mgws-var-room');
    var $rack = $row.find('.mgws-var-rack');
    var $shelf = $row.find('.mgws-var-shelf');

    var curRoom = $room.data('current') !== undefined ? String($room.data('current') || '') : String($room.val() || '');
    var curRack = $rack.data('current') !== undefined ? String($rack.data('current') || '') : String($rack.val() || '');
    var curShelf = $shelf.data('current') !== undefined ? String($shelf.data('current') || '') : String($shelf.val() || '');
    withLocUpdating(function () {
      setSelectOptions($room, (sug && sug.rooms) ? sug.rooms : [], curRoom);
    });
    $room.data('current', null);

    // Now apply dependent selects based on current selection.
    $rack.val(curRack);
    $shelf.val(curShelf);
    updateGroupRacksShelves($room, $rack, $shelf, sug, false, false);
    setRowAddButtonsState($row);

    $rack.data('current', null);
    $shelf.data('current', null);
  }

  function loadSuggestions(warehouseId, onDone) {
    var ctx = getCtx();
    var wid = parseInt(warehouseId, 10) || 0;
    if (!wid) {
      if (onDone) onDone({ rooms: [], racks: [], shelves: [] });
      return;
    }
    var key = String(wid);
    if (suggestionCache[key]) {
      if (onDone) onDone(suggestionCache[key]);
      return;
    }
    $.post(MGWS_PRODUCT.ajaxUrl, {
      action: 'mgws_get_location_suggestions',
      nonce: ctx.nonce,
      warehouse_id: wid
    }).done(function (resp) {
      if (!resp || !resp.success) {
        return;
      }
      suggestionCache[key] = resp.data;
      if (onDone) onDone(resp.data);
    });
  }

  function loadWarehouses(siteId, keepSelected, selectWarehouseId) {
    var ctx = getCtx();
    var sid = parseInt(siteId, 10) || 0;
    var $wh = $('#mgws-product-warehouse');
    var selected = keepSelected ? (parseInt($wh.val(), 10) || 0) : 0;

    if (warehousesCache[String(sid)]) {
      setWarehouseOptions($wh, warehousesCache[String(sid)], 0);
      if (selectWarehouseId) {
        $wh.val(String(selectWarehouseId));
      }
      if (selected) {
        $wh.val(String(selected));
      }

      var whId = parseInt($wh.val(), 10) || 0;
      loadSuggestions(whId, function (sug) {
        applySuggestionsToMain(sug);
      });
      return;
    }

    $wh.prop('disabled', true);
    $.post(MGWS_PRODUCT.ajaxUrl, {
      action: 'mgws_get_warehouses_for_site',
      nonce: ctx.nonce,
      site_id: sid
    }).done(function (resp) {
      $wh.prop('disabled', false);
      if (!resp || !resp.success) {
        return;
      }

      warehousesCache[String(sid)] = resp.data.warehouses || [];

      var opts = '<option value="0">-- seleziona --</option>';
      (warehousesCache[String(sid)] || []).forEach(function (w) {
        opts += '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>';
      });
      $wh.html(opts);

      if (selectWarehouseId) {
        $wh.val(String(selectWarehouseId));
      }

      if (selected) {
        $wh.val(String(selected));
      }

      scheduleEnhancedInit();

      var whId = parseInt($wh.val(), 10) || 0;
      loadSuggestions(whId, function (sug) {
        applySuggestionsToMain(sug);
      });
    });
  }

  function loadWarehousesForRow($row, selectWarehouseId) {
    var ctx = getCtx();
    var $site = $row.find('.mgws-var-site');
    var $wh = $row.find('.mgws-var-warehouse');
    var sid = parseInt($site.val(), 10) || 0;
    if (!sid) {
      $wh.html('<option value="0">--</option>');
      applySuggestionsToRow($row, { rooms: [], racks: [], shelves: [] });
      scheduleEnhancedInit();
      return;
    }

    if (warehousesCache[String(sid)]) {
      var prev = parseInt($wh.val(), 10) || 0;
      setWarehouseOptions($wh, warehousesCache[String(sid)], 0);
      if (selectWarehouseId) {
        $wh.val(String(selectWarehouseId));
      } else if (prev) {
        $wh.val(String(prev));
      }
      var whId = parseInt($wh.val(), 10) || 0;
      loadSuggestions(whId, function (sug) {
        applySuggestionsToRow($row, sug);
      });
      return;
    }

    $wh.prop('disabled', true);
    $.post(MGWS_PRODUCT.ajaxUrl, {
      action: 'mgws_get_warehouses_for_site',
      nonce: ctx.nonce,
      site_id: sid
    }).done(function (resp) {
      $wh.prop('disabled', false);
      if (!resp || !resp.success) {
        return;
      }
      warehousesCache[String(sid)] = resp.data.warehouses || [];
      var opts = '<option value="0">--</option>';
      (warehousesCache[String(sid)] || []).forEach(function (w) {
        opts += '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>';
      });
      var prev = parseInt($wh.val(), 10) || 0;
      $wh.html(opts);

      if (selectWarehouseId) {
        $wh.val(String(selectWarehouseId));
      }

      if (prev) {
        $wh.val(String(prev));
      }

      scheduleEnhancedInit();
      var whId = parseInt($wh.val(), 10) || 0;
      loadSuggestions(whId, function (sug) {
        applySuggestionsToRow($row, sug);
      });
    });
  }

  function handleAddButton($btn) {
    var ctx = getCtx();
    var action = String($btn.data('action') || '');
    var $row = $btn.closest('.mgws-var-row');

    if (action === 'create_site') {
      var name = window.prompt('Nome sede');
      if (!name) return;
      $.post(MGWS_PRODUCT.ajaxUrl, { action: 'mgws_create_site', nonce: ctx.nonce, name: name })
        .done(function (resp) {
          if (!resp || !resp.success) {
            setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
            return;
          }
          var s = resp.data.site;
          var targetClass = String($btn.data('target-class') || '');
          if ($row.length && targetClass) {
            // Update all site selects so the new site is available everywhere.
            $('.' + targetClass).each(function () {
              $(this).append('<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>');
              if ($(this).hasClass('select2-hidden-accessible')) {
                $(this).trigger('change.select2');
              } else {
                $(this).trigger('change');
              }
            });
            $row.find('.' + targetClass).val(String(s.id)).trigger('change');
          } else {
            var $site = $('#mgws-site');
            $site.append('<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>');
            $site.val(String(s.id)).trigger('change');
          }
          scheduleEnhancedInit();
        });
      return;
    }

    if (action === 'create_warehouse') {
      var siteId = 0;
      var siteSel = String($btn.data('site-select') || '');
      var targetClass = String($btn.data('target-class') || '');

      if ($row.length && siteSel) {
        siteId = parseInt($row.find(siteSel).val(), 10) || 0;
      } else if ($row.length) {
        siteId = parseInt($row.find('.mgws-var-site').val(), 10) || 0;
      } else {
        siteId = parseInt($('#mgws-site').val(), 10) || 0;
      }

      if (!siteId) {
        setMsg('Seleziona prima una sede', false);
        return;
      }
      var wname = window.prompt('Nome magazzino');
      if (!wname) return;
      $.post(MGWS_PRODUCT.ajaxUrl, { action: 'mgws_create_warehouse', nonce: ctx.nonce, site_id: siteId, name: wname })
        .done(function (resp) {
          if (!resp || !resp.success) {
            setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
            return;
          }
          var wid = resp.data && resp.data.warehouse ? parseInt(resp.data.warehouse.id, 10) || 0 : 0;
          if ($row.length && targetClass) {
            loadWarehousesForRow($row, wid);
          } else {
            loadWarehouses(siteId, false, wid);
          }
        });
      return;
    }

    if (action === 'add_location') {
      var field = String($btn.data('field') || '');
      var warehouseId = 0;
      var parentRoom = '';
      var parentRack = '';

      if ($row.length) {
        warehouseId = parseInt($row.find('.mgws-var-warehouse').val(), 10) || 0;
      } else {
        var whSelectId = String($btn.data('warehouse-select') || 'mgws-product-warehouse');
        warehouseId = parseInt($('#' + whSelectId).val(), 10) || 0;
      }

      if (!warehouseId) {
        setMsg('Seleziona prima un magazzino', false);
        return;
      }

      if (field === 'rack') {
        parentRoom = $row.length ? String($row.find('.mgws-var-room').val() || '') : String($('#mgws-default-room').val() || '');
        if (!parentRoom) {
          setMsg('Seleziona prima una stanza', false);
          return;
        }
      }
      if (field === 'shelf') {
        parentRoom = $row.length ? String($row.find('.mgws-var-room').val() || '') : String($('#mgws-default-room').val() || '');
        parentRack = $row.length ? String($row.find('.mgws-var-rack').val() || '') : String($('#mgws-default-rack').val() || '');
        if (!parentRoom || !parentRack) {
          setMsg('Seleziona prima stanza e scaffale', false);
          return;
        }
      }

      var label = (field === 'room') ? 'Stanza' : (field === 'rack') ? 'Scaffale' : 'Mensola';
      var extra = '';
      if (field === 'rack' && parentRoom) {
        extra = ' (Stanza: ' + parentRoom + ')';
      }
      if (field === 'shelf' && parentRoom && parentRack) {
        extra = ' (Stanza: ' + parentRoom + ' / Scaffale: ' + parentRack + ')';
      }
      var val = window.prompt('Nuovo ' + label + extra);
      if (!val) return;

      $.post(MGWS_PRODUCT.ajaxUrl, {
        action: 'mgws_add_location_value',
        nonce: ctx.nonce,
        warehouse_id: warehouseId,
        field: field,
        value: val,
        parent_room: parentRoom,
        parent_rack: parentRack
      }).done(function (resp) {
        if (!resp || !resp.success) {
          setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
          return;
        }
        suggestionCache[String(warehouseId)] = resp.data;
        if ($row.length) {
          if (field === 'room') {
            $row.find('.mgws-var-room').data('current', val);
          } else if (field === 'rack') {
            $row.find('.mgws-var-rack').data('current', val);
          } else if (field === 'shelf') {
            $row.find('.mgws-var-shelf').data('current', val);
          }
          applySuggestionsToRow($row, resp.data);
        } else {
          if (field === 'room') {
            $('#mgws-default-room').val(val);
            $('#mgws-default-rack').val('');
            $('#mgws-default-shelf').val('');
          } else if (field === 'rack') {
            $('#mgws-default-rack').val(val);
            $('#mgws-default-shelf').val('');
          } else if (field === 'shelf') {
            $('#mgws-default-shelf').val(val);
          }
          applySuggestionsToMain(resp.data);
        }
        scheduleEnhancedInit();
      });
    }
  }

  function filterVariationRows(text) {
    var q = String(text || '').toLowerCase().trim();
    $('.mgws-var-row').each(function () {
      var label = $(this).find('td').first().text().toLowerCase();
      if (!q || label.indexOf(q) !== -1) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  }

  function copyDefaultsToEmptyVariationRows() {
    var siteId = parseInt($('#mgws-site').val(), 10) || 0;
    var whId = parseInt($('#mgws-product-warehouse').val(), 10) || 0;
    var room = String($('#mgws-default-room').val() || '');
    var rack = String($('#mgws-default-rack').val() || '');
    var shelf = String($('#mgws-default-shelf').val() || '');

    $('.mgws-var-row').each(function () {
      var $row = $(this);

      // Site: only if editable and currently empty.
      var $site = $row.find('.mgws-var-site');
      if ($site.length && (parseInt($site.val(), 10) || 0) === 0 && siteId) {
        $site.val(String(siteId)).trigger('change');
      }

      // Warehouse: set only if empty.
      var $wh = $row.find('.mgws-var-warehouse');
      if ($wh.length && (parseInt($wh.val(), 10) || 0) === 0 && whId) {
        loadWarehousesForRow($row, whId);
      }

      // Location fields: set only if empty.
      var $r = $row.find('.mgws-var-room');
      var $ra = $row.find('.mgws-var-rack');
      var $s = $row.find('.mgws-var-shelf');

      if ($r.length && !$r.val() && room) {
        $r.data('current', room);
      }
      if ($ra.length && !$ra.val() && rack) {
        $ra.data('current', rack);
      }
      if ($s.length && !$s.val() && shelf) {
        $s.data('current', shelf);
      }

      var finalWhId = parseInt($row.find('.mgws-var-warehouse').val(), 10) || 0;
      if (finalWhId) {
        loadSuggestions(finalWhId, function (sug) {
          applySuggestionsToRow($row, sug);
        });
      }
    });

    scheduleEnhancedInit();
    setMsg('Valori copiati (solo UI). Salva il prodotto per confermare.', true);
  }

  $(function () {
    if (!$('#mgws-product').length) return;

    toggleMgwsVisibility();
    $(document).on('change', '#_virtual', function () {
      toggleMgwsVisibility();
    });

    var siteId = parseInt($('#mgws-site').val(), 10) || 0;
    if (siteId) {
      loadWarehouses(siteId, true);
    } else {
      var whId = parseInt($('#mgws-product-warehouse').val(), 10) || 0;
      loadSuggestions(whId, function (sug) {
        applySuggestionsToMain(sug);
      });
    }

    $('.mgws-var-row').each(function () {
      loadWarehousesForRow($(this));
    });

    setupResizableVarTable();

    // Initialize + button enabled/disabled states.
    setMainAddButtonsState();
    $('.mgws-var-row').each(function () {
      setRowAddButtonsState($(this));
    });

    scheduleEnhancedInit();
  });

  // (Levels/moves removed)
  // (Quick operations removed)
  $(document).on('change', '#mgws-site', function () {
    var siteId = parseInt($(this).val(), 10) || 0;
    loadWarehouses(siteId, false);
    // Reset location when changing site.
    $('#mgws-default-room').val('');
    $('#mgws-default-rack').val('');
    $('#mgws-default-shelf').val('');
  });
  $(document).on('change', '#mgws-product-warehouse', function () {
    var whId = parseInt($(this).val(), 10) || 0;
    loadSuggestions(whId, function (sug) {
      applySuggestionsToMain(sug);
    });
  });
  $(document).on('change', '#mgws-default-room', function () {
    if (locUpdating > 0) return;
    var whId = parseInt($('#mgws-product-warehouse').val(), 10) || 0;
    var sug = suggestionCache[String(whId)] || null;
    updateGroupRacksShelves($('#mgws-default-room'), $('#mgws-default-rack'), $('#mgws-default-shelf'), sug, true, false);
    setMainAddButtonsState();
  });
  $(document).on('change', '#mgws-default-rack', function () {
    if (locUpdating > 0) return;
    var whId = parseInt($('#mgws-product-warehouse').val(), 10) || 0;
    var sug = suggestionCache[String(whId)] || null;
    updateGroupRacksShelves($('#mgws-default-room'), $('#mgws-default-rack'), $('#mgws-default-shelf'), sug, false, true);
    setMainAddButtonsState();
  });

  // (Quick operations removed)
  $(document).on('change', '.mgws-var-site', function () {
    loadWarehousesForRow($(this).closest('.mgws-var-row'));
  });
  $(document).on('change', '.mgws-var-warehouse', function () {
    var $row = $(this).closest('.mgws-var-row');
    var whId = parseInt($(this).val(), 10) || 0;
    loadSuggestions(whId, function (sug) {
      applySuggestionsToRow($row, sug);
    });
  });
  $(document).on('change', '.mgws-var-room', function () {
    if (locUpdating > 0) return;
    var $row = $(this).closest('.mgws-var-row');
    var whId = parseInt($row.find('.mgws-var-warehouse').val(), 10) || 0;
    var sug = suggestionCache[String(whId)] || null;
    updateGroupRacksShelves($row.find('.mgws-var-room'), $row.find('.mgws-var-rack'), $row.find('.mgws-var-shelf'), sug, true, false);
    setRowAddButtonsState($row);
  });
  $(document).on('change', '.mgws-var-rack', function () {
    if (locUpdating > 0) return;
    var $row = $(this).closest('.mgws-var-row');
    var whId = parseInt($row.find('.mgws-var-warehouse').val(), 10) || 0;
    var sug = suggestionCache[String(whId)] || null;
    updateGroupRacksShelves($row.find('.mgws-var-room'), $row.find('.mgws-var-rack'), $row.find('.mgws-var-shelf'), sug, false, true);
    setRowAddButtonsState($row);
  });
  // Legacy per-field + buttons (kept if present).
  $(document).on('click', '.mgws-add', function () {
    handleAddButton($(this));
  });

  $(document).on('input', '#mgws-var-filter', function () {
    filterVariationRows($(this).val());
  });
  $(document).on('click', '#mgws-var-fill-empty', function () {
    copyDefaultsToEmptyVariationRows();
  });
  // (Quick operations removed)
})(jQuery);
