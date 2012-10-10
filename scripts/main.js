jQuery(function() {
  $('.embed').each(function (i, embed) {
    var $embed = $(embed);
    var aspect = $embed.attr("width") / $embed.attr("height");
    $embed.attr({width: "", height: ""});

    function resize() {
      $embed.height($embed.width() / aspect);
    }

    $(window).resize(resize);
    resize();
  });
});
