(function ($) {
  var modalInited = false;
  var currentSubmit = null;

  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setMsg(text, ok) {
    var cls = ok ? 'mgws-ok' : 'mgws-err';
    $('#mgws-master-msg').html(text ? ('<span class="' + cls + '">' + esc(text) + '</span>') : '');
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

  function ctx() {
    return {
      nonce: $('#mgws_admin_nonce').val() || '',
      siteLimit: parseInt($('#mgws-master').data('site-limit'), 10) || 0
    };
  }

  function captureOpenState() {
    var state = {
      openKeys: []
    };

    $('#mgws-master-tree details').each(function () {
      var $d = $(this);
      if (!$d.prop('open')) return;

      var cls = String($d.attr('class') || '');
      if (cls.indexOf('mgws-wh-links') !== -1) {
        var wid = String($d.data('warehouse-id') || '');
        if (wid) state.openKeys.push('whlinks:' + wid);
        return;
      }

      var $whLinks = $d.closest('details.mgws-wh-links');
      if ($whLinks.length) {
        var wwid = String($whLinks.data('warehouse-id') || '');
        if (!wwid) return;
        if (cls.indexOf('mgws-room') !== -1) {
          var wr = String($d.data('room') || '');
          if (wr) state.openKeys.push('wh:' + wwid + ':room:' + wr);
          return;
        }
        if (cls.indexOf('mgws-rack') !== -1) {
          var wrr = String($d.closest('details.mgws-room').data('room') || '');
          var wra = String($d.data('rack') || '');
          if (wrr && wra) state.openKeys.push('wh:' + wwid + ':room:' + wrr + ':rack:' + wra);
          return;
        }
        return;
      }

      var $siteNode = $d.closest('.mgws-node[data-site-id]');
      var sid = String($siteNode.data('site-id') || '');
      if (!sid) return;

      if (cls.indexOf('mgws-room') !== -1) {
        var room = String($d.data('room') || '');
        if (room) state.openKeys.push('site:' + sid + ':room:' + room);
        return;
      }
      if (cls.indexOf('mgws-rack') !== -1) {
        var pr = String($d.closest('details.mgws-room').data('room') || '');
        var rack = String($d.data('rack') || '');
        if (pr && rack) state.openKeys.push('site:' + sid + ':room:' + pr + ':rack:' + rack);
        return;
      }
    });

    return state;
  }

  function restoreOpenState(state) {
    state = state || { openKeys: [] };
    var keys = {};
    (state.openKeys || []).forEach(function (k) { keys[String(k)] = true; });

    // Close all first, then re-open.
    $('#mgws-master-tree details').prop('open', false);

    Object.keys(keys).forEach(function (k) {
      if (k.indexOf('whlinks:') === 0) {
        var wid = k.substring('whlinks:'.length);
        $('#mgws-master-tree details.mgws-wh-links[data-warehouse-id="' + wid + '"]').prop('open', true);
        return;
      }
      if (k.indexOf('wh:') === 0) {
        // wh:<wid>:room:<room> OR wh:<wid>:room:<room>:rack:<rack>
        var parts = k.split(':');
        var wwid = parts[1] || '';
        var room = parts[3] || '';
        var rack = parts[5] || '';
        var $wh = $('#mgws-master-tree details.mgws-wh-links[data-warehouse-id="' + wwid + '"]');
        $wh.prop('open', true);
        if (room) {
          $wh.find('details.mgws-room[data-room="' + room.replace(/\"/g, '\\"') + '"]').prop('open', true);
        }
        if (room && rack) {
          $wh.find('details.mgws-room[data-room="' + room.replace(/\"/g, '\\"') + '"] details.mgws-rack[data-rack="' + rack.replace(/\"/g, '\\"') + '"]').prop('open', true);
        }
        return;
      }
      if (k.indexOf('site:') === 0) {
        // site:<sid>:room:<room> OR site:<sid>:room:<room>:rack:<rack>
        var p = k.split(':');
        var sid = p[1] || '';
        var room2 = p[3] || '';
        var rack2 = p[5] || '';
        var $site = $('#mgws-master-tree .mgws-node[data-site-id="' + sid + '"]');
        if (room2) {
          $site.find('details.mgws-room[data-room="' + room2.replace(/\"/g, '\\"') + '"]').prop('open', true);
        }
        if (room2 && rack2) {
          $site.find('details.mgws-room[data-room="' + room2.replace(/\"/g, '\\"') + '"] details.mgws-rack[data-rack="' + rack2.replace(/\"/g, '\\"') + '"]').prop('open', true);
        }
      }
    });
  }

  function roomsFromTree(tree) {
    if (!tree || !tree.rooms) return [];
    return Object.keys(tree.rooms || {}).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function racksFromTree(tree, room) {
    if (!tree || !tree.rooms || !tree.rooms[room] || !tree.rooms[room].racks) return [];
    return Object.keys(tree.rooms[room].racks || {}).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function shelvesFromTree(tree, room, rack) {
    if (!tree || !tree.rooms || !tree.rooms[room] || !tree.rooms[room].racks || !tree.rooms[room].racks[rack]) return [];
    var arr = tree.rooms[room].racks[rack].shelves || [];
    return (arr || []).slice(0).sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function renderWarehouseLinksEditor(siteId, wh) {
    var whTree = wh.wh_tree || { rooms: {} };
    var roomsCount = wh.wh_counts && wh.wh_counts.rooms ? wh.wh_counts.rooms : 0;
    var racksCount = wh.wh_counts && wh.wh_counts.racks ? wh.wh_counts.racks : 0;
    var shelvesCount = wh.wh_counts && wh.wh_counts.shelves ? wh.wh_counts.shelves : 0;

    var html = '';
    html += '<details class="mgws-wh-links" data-warehouse-id="' + esc(wh.id) + '" style="margin-top:10px;">';
    html += '<summary><span class="mgws-summary-title">Ubicazioni collegate al magazzino</span>';
    html += '<span class="mgws-chip">' + esc(roomsCount) + ' stanze</span>';
    html += '<span class="mgws-chip">' + esc(racksCount) + ' scaffali</span>';
    html += '<span class="mgws-chip">' + esc(shelvesCount) + ' mensole</span>';
    html += '</summary>';

    if (roomsCount === 0) {
      html += '<p><small>Nessun collegamento impostato: in questo stato il magazzino vede comunque tutte le ubicazioni della sede. Se vuoi limitarlo, collega almeno una stanza/scaffale/mensola.</small></p>';
    }

    html += '<div class="mgws-row" style="margin-top:8px;">';
    html += '<span class="mgws-inline">'
      + '<label>Stanza</label>'
      + '<select class="wc-enhanced-select" data-role="wh-link-room" data-site-id="' + esc(siteId) + '" data-warehouse-id="' + esc(wh.id) + '" style="min-width:220px;"></select>'
      + '</span>';
    html += '<span class="mgws-inline">'
      + '<label>Scaffale</label>'
      + '<select class="wc-enhanced-select" data-role="wh-link-rack" data-site-id="' + esc(siteId) + '" data-warehouse-id="' + esc(wh.id) + '" style="min-width:220px;" disabled></select>'
      + '</span>';
    html += '<span class="mgws-inline">'
      + '<label>Mensola</label>'
      + '<select class="wc-enhanced-select" data-role="wh-link-shelf" data-site-id="' + esc(siteId) + '" data-warehouse-id="' + esc(wh.id) + '" style="min-width:220px;" disabled></select>'
      + '</span>';
    html += '<span class="mgws-inline">'
      + '<label>Collega</label>'
      + '<select class="wc-enhanced-select" data-role="wh-link-scope" data-warehouse-id="' + esc(wh.id) + '" style="min-width:220px;">'
      + '<option value="room_all">Stanza intera</option>'
      + '<option value="rack_all">Scaffale intero</option>'
      + '<option value="shelf_one">Solo mensola</option>'
      + '</select>'
      + '<button type="button" class="button button-primary" data-action="wh-link" data-site-id="' + esc(siteId) + '" data-warehouse-id="' + esc(wh.id) + '">Collega</button>'
      + '</span>';
    html += '</div>';

    html += '<div class="mgws-tree" style="margin-top:10px;">' + renderWarehouseLinksTree(siteId, wh.id, whTree) + '</div>';
    html += '</details>';
    return html;
  }

  function renderWarehouseLinksTree(siteId, warehouseId, whTree) {
    whTree = whTree || { rooms: {} };
    var rooms = whTree.rooms || {};
    var roomNames = Object.keys(rooms || {}).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (roomNames.length === 0) {
      return '<p><small>Nessuna ubicazione collegata.</small></p>';
    }

    var html = '';
    roomNames.forEach(function (room) {
      var rd = rooms[room] || {};
      var roomAll = false;
      html += '<details class="mgws-room" data-room="' + esc(room) + '">';
      html += '<summary>';
      html += '<span class="mgws-summary-title">Stanza: ' + esc(room) + (roomAll ? ' (tutto)' : '') + '</span>';
      html += '<button type="button" class="button button-link-delete" data-action="wh-unlink" data-scope="room_all" data-warehouse-id="' + esc(warehouseId) + '" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '">Rimuovi</button>';
      html += '</summary>';
      if (!roomAll) {
        var racks = (rd.racks || {});
        var rackNames = Object.keys(racks || {}).sort(function (a, b) {
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        if (rackNames.length === 0) {
          html += '<p><small>Nessuno scaffale collegato.</small></p>';
        }
        rackNames.forEach(function (rack) {
          var rk = racks[rack] || {};
          var rackAll = false;
          var shelves = rk.shelves || [];
          html += '<details class="mgws-rack" data-rack="' + esc(rack) + '">';
          html += '<summary>';
          html += '<span class="mgws-summary-title">Scaffale: ' + esc(rack) + (rackAll ? ' (tutto)' : '') + '</span>';
          html += '<button type="button" class="button button-link-delete" data-action="wh-unlink" data-scope="rack_all" data-warehouse-id="' + esc(warehouseId) + '" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '" data-rack="' + esc(rack) + '">Rimuovi</button>';
          html += '</summary>';
          if (!rackAll) {
            if (shelves && shelves.length) {
              html += '<div class="mgws-shelves">';
              shelves.forEach(function (sh) {
                html += '<span class="mgws-chip">' + esc(sh)
                  + ' <button type="button" class="button-link button-link-delete" data-action="wh-unlink" data-scope="shelf_one" data-warehouse-id="' + esc(warehouseId) + '" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '" data-rack="' + esc(rack) + '" data-shelf="' + esc(sh) + '" style="margin-left:6px;">x</button>'
                  + '</span>';
              });
              html += '</div>';
            } else {
              html += '<p><small>Nessuna mensola collegata.</small></p>';
            }
          }
          html += '</details>';
        });
      }
      html += '</details>';
    });
    return html;
  }

  function renderTree(tree) {
    if (!tree || !tree.sites || tree.sites.length === 0) {
      return '<p>Nessuna sede/magazzino configurato.</p>';
    }

    var html = '';
    // Cache site tree for warehouse link selects.
    window.__mgwsSiteTrees = window.__mgwsSiteTrees || {};

    tree.sites.forEach(function (s) {
      window.__mgwsSiteTrees[String(s.id)] = s.tree || { rooms: {} };

      html += '<div class="mgws-node" data-site-id="' + esc(s.id) + '">';
      html += '<div class="mgws-node-header">';
      html += '<h2 class="mgws-title">Sede: ' + esc(s.name) + '</h2>';
      html += '<span class="mgws-chip">' + esc((s.warehouses || []).length) + ' magazzini</span>';
      html += '<button type="button" class="button" data-action="add-warehouse" data-site-id="' + esc(s.id) + '">+ Magazzino</button>';
      html += '<button type="button" class="button" data-action="add-room" data-site-id="' + esc(s.id) + '">+ Stanza</button>';
      html += '<button type="button" class="button button-link-delete" data-action="del-site" data-site-id="' + esc(s.id) + '">Elimina sede</button>';
      html += '</div>';

      html += '<div class="mgws-tree">' + renderWarehouseTree(s.tree, s.id) + '</div>';

      (s.warehouses || []).forEach(function (w) {
        html += '<div class="mgws-node" style="margin-top:10px;" data-warehouse-id="' + esc(w.id) + '">';
        html += '<div class="mgws-node-header">';
        html += '<h3 class="mgws-title">Magazzino: ' + esc(w.name) + '</h3>';
        html += '<span class="mgws-chip">Sede: ' + esc(s.name) + '</span>';
        html += '<button type="button" class="button button-link-delete" data-action="del-warehouse" data-warehouse-id="' + esc(w.id) + '">Elimina magazzino</button>';
        html += '</div>';
        html += renderWarehouseLinksEditor(s.id, w);
        html += '</div>';
      });

      html += '</div>';
    });
    return html;
  }

  function renderWarehouseTree(tree, siteId) {
    if (!tree || !tree.rooms) {
      return '<p><small>Nessuna ubicazione salvata.</small></p>';
    }
    var rooms = tree.rooms;
    var roomNames = Object.keys(rooms || {});
    if (roomNames.length === 0) {
      return '<p><small>Nessuna ubicazione salvata.</small></p>';
    }
    roomNames.sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    var html = '';
    roomNames.forEach(function (room) {
      var racks = (rooms[room] && rooms[room].racks) ? rooms[room].racks : {};
      var rackNames = Object.keys(racks || {});
      rackNames.sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
      html += '<details class="mgws-room" data-room="' + esc(room) + '">';
      html += '<summary>';
      html += '<span class="mgws-summary-title">Stanza: ' + esc(room) + '</span>';
      html += '<span class="mgws-chip">' + esc(rackNames.length) + ' scaffali</span>';
      html += '<button type="button" class="button" data-action="add-rack" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '">+ Scaffale</button>';
      html += '<button type="button" class="button button-link-delete" data-action="del-room" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '">Elimina</button>';
      html += '</summary>';

      if (rackNames.length === 0) {
        html += '<p><small>Nessuno scaffale.</small></p>';
      }

      rackNames.forEach(function (rack) {
        var shelves = (racks[rack] && racks[rack].shelves) ? racks[rack].shelves : [];
        html += '<details class="mgws-rack" data-rack="' + esc(rack) + '">';
        html += '<summary>';
        html += '<span class="mgws-summary-title">Scaffale: ' + esc(rack) + '</span>';
        html += '<span class="mgws-chip">' + esc((shelves || []).length) + ' mensole</span>';
        html += '<button type="button" class="button" data-action="add-shelf" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '" data-rack="' + esc(rack) + '">+ Mensola</button>';
        html += '<button type="button" class="button button-link-delete" data-action="del-rack" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '" data-rack="' + esc(rack) + '">Elimina</button>';
        html += '</summary>';
        if (shelves && shelves.length) {
          html += '<div class="mgws-shelves">';
          shelves.forEach(function (sh) {
            html += '<span class="mgws-chip">' + esc(sh) + ' <button type="button" class="button-link button-link-delete" data-action="del-shelf" data-site-id="' + esc(siteId) + '" data-room="' + esc(room) + '" data-rack="' + esc(rack) + '" data-shelf="' + esc(sh) + '" style="margin-left:6px;">x</button></span>';
          });
          html += '</div>';
        } else {
          html += '<p><small>Nessuna mensola.</small></p>';
        }
        html += '</details>';
      });

      html += '</details>';
    });
    return html;
  }

  function load() {
    var c = ctx();
    var prevOpen = captureOpenState();
    $('#mgws-master-tree').html('<p>Caricamento...</p>');
    setMsg('', true);
    $.post(MGWS_MASTER.ajaxUrl, { action: 'mgws_admin_get_tree', nonce: c.nonce })
      .done(function (resp) {
        if (!resp || !resp.success) {
          setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
          $('#mgws-master-tree').html('');
          return;
        }
        $('#mgws-master-tree').html(renderTree(resp.data));
        if (window.jQuery && jQuery(document.body).trigger) {
          jQuery(document.body).trigger('wc-enhanced-select-init');
        }

        // Populate warehouse link selects.
        initWarehouseLinkSelects();

        // Keep the tree open state.
        restoreOpenState(prevOpen);
      })
      .fail(function () {
        setMsg('Errore richiesta', false);
        $('#mgws-master-tree').html('');
      });
  }

  function initWarehouseLinkSelects() {
    var siteTrees = window.__mgwsSiteTrees || {};
    $('select[data-role="wh-link-room"]').each(function () {
      var $room = $(this);
      var siteId = String($room.data('site-id') || '');
      var tree = siteTrees[siteId] || { rooms: {} };
      var opts = '<option value="">--</option>';
      roomsFromTree(tree).forEach(function (r) {
        opts += '<option value="' + esc(r) + '">' + esc(r) + '</option>';
      });
      $room.html(opts);
    });
  }

  function createSite() {
    var c = ctx();
    if (c.siteLimit > 0) {
      setMsg('Utente limitato a una sede: non puo creare nuove sedi', false);
      return;
    }
    openModal({
      title: 'Nuova sede',
      label: 'Nome sede',
      placeholder: 'Es. Milano',
      hint: 'Crea una nuova sede.',
      onSubmit: function (name, done) {
        $.post(MGWS_MASTER.ajaxUrl, { action: 'mgws_create_site', nonce: c.nonce, name: name })
          .done(function (resp) {
            if (!resp || !resp.success) {
              done((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore');
              return;
            }
            setMsg('Sede creata', true);
            load();
            done('');
          })
          .fail(function () {
            done('Errore richiesta');
          });
      }
    });
  }

  function createWarehouse(siteId) {
    var c = ctx();
    var sid = parseInt(siteId, 10) || 0;
    if (!sid) {
      setMsg('Sede non valida', false);
      return;
    }
    openModal({
      title: 'Nuovo magazzino',
      label: 'Nome magazzino',
      placeholder: 'Es. Magazzino Centrale',
      hint: 'Verrà creato dentro la sede selezionata.',
      onSubmit: function (name, done) {
        $.post(MGWS_MASTER.ajaxUrl, { action: 'mgws_create_warehouse', nonce: c.nonce, site_id: sid, name: name })
          .done(function (resp) {
            if (!resp || !resp.success) {
              done((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore');
              return;
            }
            setMsg('Magazzino creato', true);
            load();
            done('');
          })
          .fail(function () {
            done('Errore richiesta');
          });
      }
    });
  }

  function addLocation(id, field, parentRoom, parentRack, isSiteId) {
    var c = ctx();
    var targetId = parseInt(id, 10) || 0;
    if (!targetId) return;
    var label = (field === 'room') ? 'Stanza' : (field === 'rack') ? 'Scaffale' : 'Mensola';
    var hint = '';
    if (field === 'rack' && parentRoom) hint = 'Stanza: ' + parentRoom;
    if (field === 'shelf' && parentRoom && parentRack) hint = 'Stanza: ' + parentRoom + ' / Scaffale: ' + parentRack;
    openModal({
      title: 'Nuovo ' + label,
      label: label,
      placeholder: 'Inserisci ' + label.toLowerCase(),
      hint: hint,
      onSubmit: function (val, done) {
        $.post(MGWS_MASTER.ajaxUrl, {
          action: 'mgws_add_location_value',
          nonce: c.nonce,
          warehouse_id: isSiteId ? 0 : targetId,
          site_id: isSiteId ? targetId : 0,
          field: field,
          value: val,
          parent_room: parentRoom || '',
          parent_rack: parentRack || ''
        }).done(function (resp) {
          if (!resp || !resp.success) {
            done((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore');
            return;
          }
          setMsg('Salvato', true);
          load();
          done('');
        }).fail(function () {
          done('Errore richiesta');
        });
      }
    });
  }

  function addDelete(field, siteId, value, parentRoom, parentRack) {
    var c = ctx();
    var sid = parseInt(siteId, 10) || 0;
    if (!sid) return;
    var label = (field === 'room') ? 'stanza' : (field === 'rack') ? 'scaffale' : 'mensola';

    // No name typing: simple confirm.
    var msg = 'Eliminare ' + label + ' "' + value + '"?';
    if (!window.confirm(msg)) {
      return;
    }

    setMsg('Eliminazione...', true);
    $.post(MGWS_MASTER.ajaxUrl, {
      action: 'mgws_delete_location_value',
      nonce: c.nonce,
      site_id: sid,
      warehouse_id: 0,
      field: field,
      value: value,
      parent_room: parentRoom || '',
      parent_rack: parentRack || ''
    }).done(function (resp) {
      if (!resp || !resp.success) {
        var m = (resp && resp.data && resp.data.message) ? resp.data.message : 'Errore';
        window.alert(m);
        setMsg('', true);
        return;
      }
      setMsg('Eliminato', true);
      load();
    }).fail(function () {
      setMsg('Errore richiesta', false);
    });
  }

  $(function () {
    if (!$('#mgws-master').length) return;
    load();
  });

  $(document).on('click', '#mgws-master-reload', load);
  $(document).on('click', '#mgws-master-add-site', createSite);
  $(document).on('click', '#mgws-master-expand', function () {
    $('#mgws-master-tree details').prop('open', true);
  });
  $(document).on('click', '#mgws-master-collapse', function () {
    $('#mgws-master-tree details').prop('open', false);
  });

  $(document).on('input', '#mgws-master-filter', function () {
    var q = String($(this).val() || '').toLowerCase().trim();
    if (!q) {
      $('#mgws-master-tree .mgws-node').show();
      $('#mgws-master-tree details').show();
      return;
    }
    $('#mgws-master-tree .mgws-node').each(function () {
      var text = $(this).text().toLowerCase();
      $(this).toggle(text.indexOf(q) !== -1);
    });
  });

  $(document).on('click', 'button[data-action="add-warehouse"]', function () {
    createWarehouse($(this).data('site-id'));
  });

  $(document).on('change', 'select[data-role="wh-link-room"]', function () {
    var siteId = String($(this).data('site-id') || '');
    var wid = String($(this).data('warehouse-id') || '');
    var room = String($(this).val() || '');
    var tree = (window.__mgwsSiteTrees || {})[siteId] || { rooms: {} };
    var $rack = $('select[data-role="wh-link-rack"][data-warehouse-id="' + wid + '"]');
    var $shelf = $('select[data-role="wh-link-shelf"][data-warehouse-id="' + wid + '"]');
    if (!room) {
      $rack.prop('disabled', true).html('<option value="">--</option>');
      $shelf.prop('disabled', true).html('<option value="">--</option>');
      return;
    }
    var rackOpts = '<option value="">--</option>';
    racksFromTree(tree, room).forEach(function (rk) {
      rackOpts += '<option value="' + esc(rk) + '">' + esc(rk) + '</option>';
    });
    $rack.prop('disabled', false).html(rackOpts);
    $shelf.prop('disabled', true).html('<option value="">--</option>');
  });

  $(document).on('change', 'select[data-role="wh-link-rack"]', function () {
    var $rack = $(this);
    var wid = String($rack.data('warehouse-id') || '');
    var siteId = String($rack.data('site-id') || '');
    var room = String($('select[data-role="wh-link-room"][data-warehouse-id="' + wid + '"]').val() || '');
    var rack = String($rack.val() || '');
    var tree = (window.__mgwsSiteTrees || {})[siteId] || { rooms: {} };
    var $shelf = $('select[data-role="wh-link-shelf"][data-warehouse-id="' + wid + '"]');
    if (!room || !rack) {
      $shelf.prop('disabled', true).html('<option value="">--</option>');
      return;
    }
    var shelfOpts = '<option value="">--</option>';
    shelvesFromTree(tree, room, rack).forEach(function (sh) {
      shelfOpts += '<option value="' + esc(sh) + '">' + esc(sh) + '</option>';
    });
    $shelf.prop('disabled', false).html(shelfOpts);
  });

  $(document).on('click', 'button[data-action="wh-link"]', function () {
    var c = ctx();
    var siteId = parseInt($(this).data('site-id'), 10) || 0;
    var wid = parseInt($(this).data('warehouse-id'), 10) || 0;
    var $room = $('select[data-role="wh-link-room"][data-warehouse-id="' + wid + '"]');
    var $rack = $('select[data-role="wh-link-rack"][data-warehouse-id="' + wid + '"]');
    var $shelf = $('select[data-role="wh-link-shelf"][data-warehouse-id="' + wid + '"]');
    var room = String($room.val() || '');
    var rack = String($rack.val() || '');
    var shelf = String($shelf.val() || '');
    var scope = 'shelf_one';

    if (!wid || !siteId || !room) {
      setMsg('Seleziona almeno una stanza', false);
      return;
    }
    if (!rack || !shelf) {
      setMsg('Seleziona scaffale e mensola', false);
      return;
    }

    setMsg('Salvataggio collegamento...', true);
    $.post(MGWS_MASTER.ajaxUrl, {
      action: 'mgws_link_warehouse_location',
      nonce: c.nonce,
      warehouse_id: wid,
      room: room,
      rack: rack,
      shelf: shelf,
      scope: scope
    }).done(function (resp) {
      if (!resp || !resp.success) {
        setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
        return;
      }
      setMsg('Collegato', true);
      load();
    }).fail(function () {
      setMsg('Errore richiesta', false);
    });
  });

  $(document).on('click', 'button[data-action="wh-unlink"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var c = ctx();
    var wid = parseInt($(this).data('warehouse-id'), 10) || 0;
    var room = String($(this).data('room') || '');
    var rack = String($(this).data('rack') || '');
    var shelf = String($(this).data('shelf') || '');
    var scope = String($(this).data('scope') || '');
    if (!wid || !room || !scope) return;
    if (!window.confirm('Rimuovere collegamento?')) return;
    setMsg('Rimozione...', true);
    $.post(MGWS_MASTER.ajaxUrl, {
      action: 'mgws_unlink_warehouse_location',
      nonce: c.nonce,
      warehouse_id: wid,
      room: room,
      rack: rack,
      shelf: shelf,
      scope: scope
    }).done(function (resp) {
      if (!resp || !resp.success) {
        setMsg((resp && resp.data && resp.data.message) ? resp.data.message : 'Errore', false);
        return;
      }
      setMsg('Rimosso', true);
      load();
    }).fail(function () {
      setMsg('Errore richiesta', false);
    });
  });

  $(document).on('click', 'button[data-action="del-warehouse"]', function () {
    var c = ctx();
    var wid = parseInt($(this).data('warehouse-id'), 10) || 0;
    if (!wid) return;
    if (!window.confirm('Eliminare questo magazzino?')) return;
    setMsg('Eliminazione...', true);
    $.post(MGWS_MASTER.ajaxUrl, { action: 'mgws_delete_warehouse', nonce: c.nonce, warehouse_id: wid })
      .done(function (resp) {
        if (!resp || !resp.success) {
          var m = (resp && resp.data && resp.data.message) ? resp.data.message : 'Errore';
          if (String(m).indexOf('Impossibile eliminare') === 0) {
            window.alert(m);
            setMsg('', true);
            return;
          }
          setMsg(m, false);
          return;
        }
        setMsg('Magazzino eliminato', true);
        load();
      })
      .fail(function () {
        setMsg('Errore richiesta', false);
      });
  });

  $(document).on('click', 'button[data-action="del-site"]', function () {
    var c = ctx();
    var sid = parseInt($(this).data('site-id'), 10) || 0;
    if (!sid) return;
    if (!window.confirm('Eliminare questa sede?')) return;
    setMsg('Eliminazione...', true);
    $.post(MGWS_MASTER.ajaxUrl, { action: 'mgws_delete_site', nonce: c.nonce, site_id: sid })
      .done(function (resp) {
        if (!resp || !resp.success) {
          var m = (resp && resp.data && resp.data.message) ? resp.data.message : 'Errore';
          if (String(m).indexOf('Impossibile eliminare') === 0) {
            window.alert(m);
            setMsg('', true);
            return;
          }
          setMsg(m, false);
          return;
        }
        setMsg('Sede eliminata', true);
        load();
      })
      .fail(function () {
        setMsg('Errore richiesta', false);
      });
  });

  $(document).on('click', 'button[data-action="add-room"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    addLocation($(this).data('site-id'), 'room', '', '', true);
  });
  $(document).on('click', 'button[data-action="add-rack"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    addLocation($(this).data('site-id'), 'rack', String($(this).data('room') || ''), '', true);
  });
  $(document).on('click', 'button[data-action="add-shelf"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    addLocation($(this).data('site-id'), 'shelf', String($(this).data('room') || ''), String($(this).data('rack') || ''), true);
  });

  $(document).on('click', 'button[data-action="del-room"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var sid = $(this).data('site-id');
    var room = String($(this).data('room') || '');
    if (!room) return;
    addDelete('room', sid, room, '', '');
  });
  $(document).on('click', 'button[data-action="del-rack"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var sid = $(this).data('site-id');
    var room = String($(this).data('room') || '');
    var rack = String($(this).data('rack') || '');
    if (!room || !rack) return;
    addDelete('rack', sid, rack, room, '');
  });
  $(document).on('click', 'button[data-action="del-shelf"]', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var sid = $(this).data('site-id');
    var room = String($(this).data('room') || '');
    var rack = String($(this).data('rack') || '');
    var shelf = String($(this).data('shelf') || '');
    if (!room || !rack || !shelf) return;
    addDelete('shelf', sid, shelf, room, rack);
  });
})(jQuery);
