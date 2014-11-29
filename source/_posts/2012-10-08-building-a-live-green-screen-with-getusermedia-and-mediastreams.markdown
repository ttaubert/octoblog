---
layout: post
title: "Building a live green screen with getUserMedia() and MediaStreams"
date: 2012-10-17 20:00
---

While recently watching a talk about the new WebRTC features I was reminded of
Paul Rouget's great
[green screen demo](https://developer.mozilla.org/samples/video/chroma-key/index.xhtml)
and thought that this would be a cool thing to have for live video as well.
Let us build a live green screen!

## The markup

{% codeblock lang:html %}
<body>
  <video id="v" width="320" height="240"></video>
  <canvas id="c" width="320" height="240"></canvas>
</body>
{% endcodeblock %}

Those are the parts we need. A <video\> element that plays the media stream
and a canvas we will use to read and transform image data.

## The JavaScript

{% codeblock lang:js %}
function initialize() {
  // Get the webcam's stream.
  navigator.getUserMedia({video: true}, startStream, function () {});
}

function startStream(stream) {
  video.src = URL.createObjectURL(stream);
  video.play();

  // Ready! Let's start drawing.
  requestAnimationFrame(draw);
}
{% endcodeblock %}

We call [navigator.getUserMedia()](https://developer.mozilla.org/en-US/docs/WebRTC/navigator.getUserMedia)
and pass *{video: true}* as the first argument which indicates that we want to
receive a video stream. We assign the MediaStream to the video's *.src* property
to connect it to the <video\> element.

The video starts playing (which means the camera will be activated and you will
see your webcam's live video) and we request an animation frame using the
[requestAnimationFrame() API](https://developer.mozilla.org/en-US/docs/DOM/window.requestAnimationFrame).
This is perfect for drawing to our canvas as the browser schedules the next
repaint and we will be called immediately before that happens. Now for the last
and most important part of our green screen:

{% codeblock lang:js %}
function draw() {
  var frame = readFrame();

  if (frame) {
    replaceGreen(frame.data);
    context.putImageData(frame, 0, 0);
  }

  // Wait for the next frame.
  requestAnimationFrame(draw);
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
{% endcodeblock %}

What happens here is actually quite simple: we read the current video frame and
extract its image data. We then iterate over all pixels in the frame and check
if we found a green one - if so its opacity byte is set to zero, which means
fully transparent. The manipulated image data is put back into the canvas and
we are done for now until the next animation frame is ready.

## The demo

Take a look at the [live demo](/demos/green-screen/), you will need a recent
Firefox/Chrome/Opera build. Make sure that getUserMedia() support is enabled
in your browser of choice. Hold a green object in front of the the camera and
try it out yourself. Your camera and light setup is probably very different
from mine so you might need to adjust the color check a little to make it work.
Alternatively, here is a screencast of the demo:

<iframe class="embed"
 src="http://player.vimeo.com/video/51593914?title=1&amp;byline=1&amp;portrait=1"
 width="500" height="191" frameborder="0"
 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>

## The end

This is an admittedly very simple example of a green screen but you can use
this little template to manipulate your webcam's live video stream and build all
kinds of fancy demos with it.
