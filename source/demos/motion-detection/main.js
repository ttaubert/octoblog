(function (doc, nav) {
  "use strict";

  var video, width, height, context, buffer1, buffer2, bufsize;

  function initialize() {
    // The source video.
    video = doc.getElementById("v");
    width = video.width;
    height = video.height;

    // The target canvas.
    var canvas = doc.getElementById("c");
    context = canvas.getContext("2d");

    // Prepare two buffers to store lightness data.
    bufsize = width * height;
    buffer1 = new Int8Array(bufsize);
    buffer2 = new Int8Array(bufsize);

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
      markLightnessChanges(frame.data);
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

  function markLightnessChanges(data) {
    var last = buffer1, current = buffer2;

    for (var i = 0, j = 0; i < bufsize; i++, j += 4) {
      // Determine lightness value.
      current[i] = lightnessValue(data[j], data[j + 1], data[j + 2]);

      // Set color to black.
      data[j] = data[j + 1] = data[j + 2] = 0;

      // Full opacity for changes.
      data[j + 3] = 255 * (Math.abs(current[i] - last[i]) >= 15);
    }

    // Swap buffers.
    buffer1 = current, buffer2 = last;
  }

  function lightnessValue(r, g, b) {
    return (Math.min(r, g, b) + Math.max(r, g, b)) / 255 * 50;
  }

  addEventListener("DOMContentLoaded", initialize);
})(document, navigator);
