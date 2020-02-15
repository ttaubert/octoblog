(function (doc, nav) {
  "use strict";

  var video, width, height, context;

  function initialize() {
    // The source video.
    video = doc.getElementById("v");
    width = video.width;
    height = video.height;

    // The target canvas.
    var canvas = doc.getElementById("c");
    context = canvas.getContext("2d");

    // Get the webcam's stream.
    nav.getUserMedia({video: true}, startStream, function () {});
  }

  function startStream(stream) {
    video.src = URL.createObjectURL(stream);
    video.play();

    // Ready! Let's start drawing.
    requestAnimationFrame(draw);
  }

  function draw() {
    var frame = readFrame();

    if (frame) {
      replaceGreen(frame.data);
      context.putImageData(frame, 0, 0);
    }

    // Wait for the next frame.
    requestAnimationFrame(draw);
  }

  function readFrame() {
    try {
      context.drawImage(video, 0, 0, width, height);
    } catch (e) {
      // The video may not be ready, yet.
      return null;
    }

    return context.getImageData(0, 0, width, height);
  }

  function replaceGreen(data) {
    var len = data.length;

    for (var i = 0, j = 0; j < len; i++, j += 4) {
      // Convert from RGB to HSL...
      var hsl = rgb2hsl(data[j], data[j + 1], data[j + 2]);
      var h = hsl[0], s = hsl[1], l = hsl[2];

      // ... and check if we have a somewhat green pixel.
      if (h >= 90 && h <= 160 && s >= 25 && s <= 90 && l >= 20 && l <= 75) {
        data[j + 3] = 0;
      }
    }
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    var min = Math.min(r, g, b);
    var max = Math.max(r, g, b);
    var delta = max - min;
    var h, s, l;

    if (max == min) {
      h = 0;
    } else if (r == max) {
      h = (g - b) / delta;
    } else if (g == max) {
      h = 2 + (b - r) / delta;
    } else if (b == max) {
      h = 4 + (r - g) / delta;
    }

    h = Math.min(h * 60, 360);

    if (h < 0) {
      h += 360;
    }

    l = (min + max) / 2;

    if (max == min) {
      s = 0;
    } else if (l <= 0.5) {
      s = delta / (max + min);
    } else {
      s = delta / (2 - max - min);
    }

    return [h, s * 100, l * 100];
  }

  addEventListener("DOMContentLoaded", initialize);
})(document, navigator);
