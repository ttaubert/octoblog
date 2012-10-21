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
    let lightnessData = this.getFrameLightnessData(frame.data);

    // Compare lightness values from the current
    // frame with those from the previous one.
    let changes = new Set();
    if (this.lastLightnessData) {
      changes = this.compareLightnessData(lightnessData, this.lastLightnessData);
    }

    this.markLightnessChanges(frame.data, changes);
    this.lastLightnessData = lightnessData;

    this.context.putImageData(frame, 0, 0);
    this.requestAnimationFrame();
  },

  getFrameLightnessData: function (frameData) {
    let data = [];

    // Iterate over all pixels in the current frame.
    for (let i = 0; i < frameData.length; i += 4) {
      let pixel = Array.slice(frameData, i, i + 3);
      data.push(this.determineLightness(pixel));
    }

    return data;
  },

  determineLightness: function ([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    let min = Math.min(r, g, b);
    let max = Math.max(r, g, b);
    return (min + max) * 50;
  },

  compareLightnessData: function (a, b) {
    let changes = new Set();

    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) >= 10) {
        changes.add(i);
      }
    }

    return changes;
  },

  markLightnessChanges: function (frameData, changes) {
    let len = frameData.length / 4;
    for (let i = 0; i < len; i++) {
      let changed = changes.has(i);
      if (changed) {
        frameData[i * 4 + 0] = frameData[i * 4 + 1] = frameData[i * 4 + 2] = 0;
      }
      frameData[i*4 + 3] = 255 * changed;
    }
  }
};
