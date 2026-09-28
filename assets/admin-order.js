(function ($) {
  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderTree(data) {
    var html = '';
    if (!data.sites || data.sites.length === 0) {
      return '<p>Nessuna disponibilita trovata (qty >= 1).</p>';
    }
    data.sites.forEach(function (site) {
      html += '<div class="mgws-site" data-site-id="' + esc(site.site_id) + '">';
      html += '<div class="mgws-site-title">' + esc(site.site_name) + '</div>';
      site.warehouses.forEach(function (wh) {
        html += '<div class="mgws-warehouse" data-warehouse-id="' + esc(wh.warehouse_id) + '">';
        html += '<div><strong>' + esc(wh.warehouse_name) + '</strong></div>';
        wh.cards.forEach(function (card) {
          var cardKey = card.card_key;
          var warn = card.available_total_qty < card.required_qty;
          html += '<div class="mgws-card" data-card-key="' + esc(cardKey) + '" data-product-id="' + esc(card.product_id) + '" data-variation-id="' + esc(card.variation_id) + '">';
          html += '<div class="mgws-card-title">' + esc(card.title) + '</div>';
          html += '<div>Richiesti: <strong class="mgws-required">' + esc(card.required_qty) + '</strong> | Disponibili totali: <strong>' + esc(card.available_total_qty) + '</strong> | In questo magazzino: <strong>' + esc(card.available_in_warehouse_qty) + '</strong>';
          if (warn) {
            html += ' <span class="mgws-warning">(Insufficiente)</span>';
          }
          html += '</div>';

          html += '<table class="mgws-locations">';
          html += '<thead><tr><th>Posizione</th><th>Disponibile</th><th>Priorita</th><th>Preleva</th></tr></thead>';
          html += '<tbody>';
          card.locations.forEach(function (loc, idx) {
            html += '<tr class="mgws-loc" data-card-key="' + esc(cardKey) + '" data-site-id="' + esc(site.site_id) + '" data-warehouse-id="' + esc(wh.warehouse_id) + '" data-room="' + esc(loc.room) + '" data-rack="' + esc(loc.rack) + '" data-shelf="' + esc(loc.shelf) + '" data-available="' + esc(loc.qty) + '">';
            html += '<td>' + esc(loc.label) + '</td>';
            html += '<td>' + esc(loc.qty) + '</td>';
            html += '<td><input type="number" min="0" step="1" class="mgws-priority" value="' + (idx + 1) + '" style="width:72px" /></td>';
            html += '<td><input type="number" min="0" step="1" class="mgws-pick" value="0" style="width:72px" /></td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          html += '<p style="margin:6px 0 0;"><button type="button" class="button mgws-autofill" data-card-key="' + esc(cardKey) + '">Auto</button> <span class="mgws-card-status" data-card-key="' + esc(cardKey) + '"></span></p>';
          html += '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    });
    return html;
  }

  function recompute() {
    var totalsRequired = 0;
    var totalsAllocated = 0;
    var cards = {};

    $('.mgws-card').each(function () {
      var $c = $(this);
      var cardKey = $c.data('card-key');
      var required = parseInt($c.find('.mgws-required').text(), 10) || 0;
      cards[cardKey] = cards[cardKey] || { required: required, allocated: 0 };
      totalsRequired += required;
    });

    $('.mgws-loc').each(function () {
      var $row = $(this);
      var cardKey = $row.data('card-key');
      var pick = parseInt($row.find('.mgws-pick').val(), 10) || 0;
      var available = parseInt($row.data('available'), 10) || 0;
      if (pick < 0) pick = 0;
      if (pick > available) {
        pick = available;
        $row.find('.mgws-pick').val(String(pick));
      }
      if (cards[cardKey]) {
        cards[cardKey].allocated += pick;
        totalsAllocated += pick;
      }
    });

    Object.keys(cards).forEach(function (k) {
      var c = cards[k];
      var remaining = Math.max(0, c.required - c.allocated);
      var txt = 'Allocati: ' + c.allocated + ' | Mancano: ' + remaining;
      if (remaining > 0) {
        txt = '<span class="mgws-warning">' + esc(txt) + '</span>';
      } else {
        txt = esc(txt);
      }
      $('.mgws-card-status[data-card-key="' + k.replace(/"/g, '\\"') + '"]').html(txt);
    });

    var remainingAll = Math.max(0, totalsRequired - totalsAllocated);
    $('#mgws-totals').html(
      'Totale richiesti: <strong>' + totalsRequired + '</strong> | Totale prelevati: <strong>' + totalsAllocated + '</strong> | Mancano: <strong>' + remainingAll + '</strong>'
    );

    $('#mgws-commit').prop('disabled', totalsRequired === 0);
  }

  function autofill(cardKey) {
    var $rows = $('.mgws-loc[data-card-key="' + cardKey.replace(/"/g, '\\"') + '"]');
    if ($rows.length === 0) return;

    var required = 0;
    $('.mgws-card[data-card-key="' + cardKey.replace(/"/g, '\\"') + '"]').each(function () {
      var r = parseInt($(this).find('.mgws-required').text(), 10) || 0;
      required = Math.max(required, r);
    });

    $rows.find('.mgws-pick').val('0');

    var rowsArr = $rows.get().map(function (el) {
      var $el = $(el);
      return {
        el: el,
        prio: parseInt($el.find('.mgws-priority').val(), 10) || 0,
        available: parseInt($el.data('available'), 10) || 0
      };
    });
    rowsArr.sort(function (a, b) {
      if (a.prio === b.prio) return b.available - a.available;
      return a.prio - b.prio;
    });

    var remaining = required;
    rowsArr.forEach(function (r) {
      if (remaining <= 0) return;
      var take = Math.min(remaining, r.available);
      $(r.el).find('.mgws-pick').val(String(take));
      remaining -= take;
    });

    recompute();
  }

  function buildPayload() {
    var cards = {};
    $('.mgws-card').each(function () {
      var $c = $(this);
      var cardKey = $c.data('card-key');
      if (cards[cardKey]) return;
      cards[cardKey] = {
        product_id: parseInt($c.data('product-id'), 10) || 0,
        variation_id: parseInt($c.data('variation-id'), 10) || 0,
        allocations: []
      };
    });

    $('.mgws-loc').each(function () {
      var $row = $(this);
      var cardKey = $row.data('card-key');
      var pick = parseInt($row.find('.mgws-pick').val(), 10) || 0;
      if (pick <= 0) return;
      var prio = parseInt($row.find('.mgws-priority').val(), 10) || 0;
      cards[cardKey].allocations.push({
        site_id: parseInt($row.data('site-id'), 10) || 0,
        warehouse_id: parseInt($row.data('warehouse-id'), 10) || 0,
        room: String($row.data('room') || ''),
        rack: String($row.data('rack') || ''),
        shelf: String($row.data('shelf') || ''),
        use_qty: pick,
        priority: prio
      });
    });

    return {
      allow_partial: true,
      cards: Object.keys(cards).map(function (k) { return cards[k]; })
    };
  }

  $(document).on('click', '#mgws-load-tree', function () {
    var $root = $('#mgws-accept');
    var orderId = parseInt($root.data('order-id'), 10) || 0;
    var nonce = $('#mgws_accept_nonce').val();
    $('#mgws-msg').text('Caricamento...');
    $('#mgws-commit').prop('disabled', true);
    $.post(MGWS.ajaxUrl, { action: 'mgws_get_accept_tree', order_id: orderId, nonce: nonce })
      .done(function (resp) {
        if (!resp || !resp.success) {
          $('#mgws-msg').text(resp && resp.data && resp.data.message ? resp.data.message : 'Errore');
          return;
        }
        $('#mgws-tree').html(renderTree(resp.data));
        $('#mgws-msg').text('');
        recompute();
      })
      .fail(function () {
        $('#mgws-msg').text('Errore richiesta');
      });
  });

  $(document).on('click', '.mgws-autofill', function () {
    var cardKey = String($(this).data('card-key') || '');
    if (!cardKey) return;
    autofill(cardKey);
  });

  $(document).on('change keyup', '.mgws-pick, .mgws-priority', function () {
    recompute();
  });

  $(document).on('click', '#mgws-commit', function () {
    var $root = $('#mgws-accept');
    var orderId = parseInt($root.data('order-id'), 10) || 0;
    var nonce = $('#mgws_accept_nonce').val();
    var payload = buildPayload();

    var totalsText = $('#mgws-totals').text();
    var match = totalsText.match(/Mancano:\s*(\d+)/);
    var remaining = match ? parseInt(match[1], 10) : 0;
    if (remaining > 0) {
      if (!window.confirm('Prodotto non del tutto disponibile. Vuoi continuare?')) {
        return;
      }
    }

    $('#mgws-msg').text('Salvataggio...');
    $('#mgws-commit').prop('disabled', true);
    $.post(MGWS.ajaxUrl, { action: 'mgws_commit_accept', order_id: orderId, nonce: nonce, payload: JSON.stringify(payload) })
      .done(function (resp) {
        if (!resp || !resp.success) {
          $('#mgws-msg').text(resp && resp.data && resp.data.message ? resp.data.message : 'Errore');
          $('#mgws-commit').prop('disabled', false);
          return;
        }
        $('#mgws-msg').text(resp.data && resp.data.message ? resp.data.message : 'OK');
        window.location.reload();
      })
      .fail(function () {
        $('#mgws-msg').text('Errore richiesta');
        $('#mgws-commit').prop('disabled', false);
      });
  });
})(jQuery);
