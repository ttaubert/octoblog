let MotionDetector = {
  start: function () {
    this.video = document.getElementById("v");
    this.width = this.video.width;
    this.height = this.video.height;

    let canvas = document.getElementById("c");
    this.context = canvas.getContext("2d");
    this.context.fillStyle = "#000";

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

    this.markLightnessChanges(frame.data);
    this.context.putImageData(frame, 0, 0);
    this.requestAnimationFrame();
  },

  markLightnessChanges: function (frameData) {
    let lastLightnessData = this.lastLightnessData;
    let lightnessData = this.lastLightnessData = [];

    let len = frameData.length / 4;
    for (let i = 0; i < len; i++) {
      // Determine the current pixel's
      // lightness value and save it for later.
      let pixel = Array.slice(frameData, i * 4, i * 4 + 3);
      let lightness = this.determineLightness(pixel);
      lightnessData.push(lightness);

      // Check if the lightness has changed.
      let changed = lastLightnessData &&
                    Math.abs(lightness - lastLightnessData[i]) >= 15;

      // Changed pixels will be turned black,
      // everything else becomes transparent.
      if (changed) {
        frameData[i * 4] =
          frameData[i * 4 + 1] =
          frameData[i * 4 + 2] = 0;
      }
      frameData[i * 4 + 3] = 255 * changed;
    }
  },

  determineLightness: function ([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    let min = Math.min(r, g, b);
    let max = Math.max(r, g, b);
    return (min + max) * 50;
  }
};
