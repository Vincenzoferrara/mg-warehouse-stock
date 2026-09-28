(function ($) {
  function toggleTransfer() {
    var op = String($('#mgws-operation').val() || '');
    if (op === 'transfer') {
      $('body').addClass('mgws-show-transfer');
    } else {
      $('body').removeClass('mgws-show-transfer');
    }
  }

  $(document).on('change', '#mgws-operation', toggleTransfer);
  $(function () {
    toggleTransfer();
  });
})(jQuery);
