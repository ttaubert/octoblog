---
layout: post
title: "Building a live green screen with getUserMedia() and MediaStreams"
date: 2012-10-08 14:24
---

While recently watching a talk about the new WebRTC features I was reminded of
Paul Rouget's great
[green screen demo](https://developer.mozilla.org/samples/video/chroma-key/index.xhtml)
and thought that this would be a cool thing to have for live video as well.
Let's build a live green screen!

## The markup

{% codeblock lang:html %}
<body onload="GreenScreen.start()">
  <video id="v" width="320" height="240"></video>
  <canvas id="c" width="320" height="240"></canvas>
</body>
{% endcodeblock %}

Those are the parts we need. A \<video\> element that plays the media stream
and a canvas we'll use to read and transform image data.

## The JavaScript

{% codeblock lang:js %}
let GreenScreen = {
  start: function () {
    // Get the video stream.
    navigator.mozGetUserMedia({video: true}, function (stream) {
      this.video.mozSrcObject = stream;
      this.video.play();
      this.requestAnimationFrame();
    }.bind(this), function err() {});
  },
{% endcodeblock %}

We call getUserMedia() and pass *{video: true}* as the first argument which
indicates that we want to receive a video stream. We assign the MediaStream
to the video's *.src* property to connect it with the \<video\> element.

The video starts playing (which means the camera will be activated and you will
see your webcam's live video) and we request an animation frame using the
[requestAnimationFrame() API](https://developer.mozilla.org/en-US/docs/DOM/window.requestAnimationFrame):

{% codeblock lang:js %}
  requestAnimationFrame: function () {
    mozRequestAnimationFrame(this.draw.bind(this));
  },
{% endcodeblock %}

requestAnimationFrame() is perfect for updating/ drawing to our canvas as the
browser schedules the next repaint and we will be called immediately before
that happens. Now for the last and most important part of our green screen:

{% codeblock lang:js %}
  draw: function () {
    this.context.drawImage(this.video, 0, 0, this.width, this.height);
    let frame = this.context.getImageData(0, 0, this.width, this.height);
    let len = frame.data.length / 4;

    // Iterate over all pixels in the current frame.
    for (let i = 0; i < len; i++) {
      let r = frame.data[i * 4 + 0];
      let g = frame.data[i * 4 + 1];
      let b = frame.data[i * 4 + 2];

      // Convert from RGB to HSL...
      let [h, s, l] = this.rgb2hsl(r, g, b);

      // ... and check if we have a somewhat yellow pixel.
      if (h > 30 && h < 90 && s > 30) {
        frame.data[i * 4 + 3] = 0;
      }
    }

    this.context.putImageData(frame, 0, 0);
    this.requestAnimationFrame();
  },
{% endcodeblock %}

What happens here is actually quite simple: we draw the current video frame
to our canvas and extract its image data. We then iterate over all pixels in
the frame and check if we found a yellow pixel - if so its opacity byte is set
to zero, which means fully transparent. The manipulated image data is put back
into the canvas and we're done for now until the next animation frame is ready.

## The demo

Take a look a the [live demo](/demos/green-screen/). You'll need Firefox 18
and thus Nightly or Aurora as of the time of writing. Make sure that
*media.navigator.enabled* is set to *true*. Hold a yellow object in front of the
the camera and try it out yourself. Your light setup might be very different
from mine so you might need to adjust the color check a little bit to make it
work.

<iframe class="embed" width="560" height="315" frameborder="0"
        src="http://www.youtube.com/embed/dhcGNN9r1D4"></iframe>

## The end

This is an admittedly very simple example of a green screen but you can use
this framework to manipulate your webcam's live video stream and build all
kinds of fancy stuff with it.
