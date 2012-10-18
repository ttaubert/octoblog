let GreenScreen = {
  // Keep track of revealed pixels.
  revealed: new Set(),

  start: function () {
    this.video = document.getElementById("v");
    this.width = this.video.width;
    this.height = this.video.height;

    let canvas = document.getElementById("c");
    this.context = canvas.getContext("2d");

    // Get the video stream.
    navigator.mozGetUserMedia({video: true}, function (stream) {
      this.video.mozSrcObject = stream;
      this.video.play();
      this.requestAnimationFrame();
    }.bind(this), function err() {});
  },

  requestAnimationFrame: function () {
    mozRequestAnimationFrame(this.draw.bind(this));
  },

  draw: function () {
    this.context.drawImage(this.video, 0, 0, this.width, this.height);
    let frame = this.context.getImageData(0, 0, this.width, this.height);
    let len = frame.data.length / 4;

    // Iterate over all pixels in the current frame.
    for (let i = 0; i < len; i++) {
      // This pixel has already been revealed.
      if (this.revealed.has(i)) {
        frame.data[i * 4 + 3] = 0;
        continue;
      }

      let r = frame.data[i * 4 + 0];
      let g = frame.data[i * 4 + 1];
      let b = frame.data[i * 4 + 2];

      // Convert from RGB to HSL...
      let [h, s, l] = this.rgb2hsl(r, g, b);

      // ... and check if we have a somewhat green pixel.
      if (h >= 90 && h <= 160 && s >= 25 && s <= 90 && l >= 20 && l <= 75) {
        frame.data[i * 4 + 3] = 0;
        this.revealed.add(i);
      }
    }

    this.context.putImageData(frame, 0, 0);
    this.requestAnimationFrame();
  },

  rgb2hsl: function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let min = Math.min(r, g, b),
        max = Math.max(r, g, b),
        delta = max - min,
        h, s, l;

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
};
