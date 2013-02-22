(function (win, nav) {
  "use strict";

  win.requestAnimationFrame = win.requestAnimationFrame ||
                              win.msRequestAnimationFrame ||
                              win.mozRequestAnimationFrame ||
                              win.webkitRequestAnimationFrame;

  nav.getUserMedia = nav.getUserMedia ||
                     nav.msGetUserMedia ||
                     nav.mozGetUserMedia ||
                     nav.webkitGetUserMedia;

})(window, navigator);
