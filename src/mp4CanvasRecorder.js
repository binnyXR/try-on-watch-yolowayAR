import * as Mp4Muxer from "mp4-muxer";

const _state = {
  isRecording: false,
  frames: [],
  lastTimestampUs: 0,
  videoFramePushedCallback: null,
  muxer: null,
  encoder: null,
  deepAR: null,
};

function checkWebCodecsAvailable() {
  return "VideoEncoder" in window;
}

/**
 * Records video from a canvas element as webm and converts it to mp4 on the fly for better sharing.
 */
export async function startRecording(canvas, deepAR, circularProgressBar) {
  if (!checkWebCodecsAvailable()) {
    throw new Error("VideoEncoder API not available in this browser.");
  }

  let w = canvas.width;
  let h = canvas.height;

  // scale down video
  const LIMIT = 1820;
  if (w > h) {
    let ratio = 1.0;
    if (w > LIMIT) {
      ratio = LIMIT / w;
      w = LIMIT;
      h = Math.round(h * ratio);
    }
  } else if (h > w) {
    let ratio = 1.0;
    if (h > LIMIT) {
      ratio = LIMIT / h;
      h = LIMIT;
      w = Math.round(w * ratio);
    }
  }

  w = w % 2 === 0 ? w : w - 1;
  h = h % 2 === 0 ? h : h - 1;

  _state.muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: "avc",
      width: w,
      height: h,
    },
    firstTimestampBehavior: "offset",
  });

  const init = {
    error: (e) => {
      console.error(e);
    },
    output: (chunk, metadata) => {
      _state.muxer.addVideoChunk(chunk, metadata);
    },
  };

  const config = {
    codec: "avc1.4d002a", // An MPEG-4 file containing AVC (H.264) video, Main Profile, Level 4.2.
    width: w,
    height: h,
    bitrate: 4_000_000, // 4 Mbps
    framerate: 30,
  };

  const { supported } = await VideoEncoder.isConfigSupported(config);
  if (!supported) {
    console.log("config:");
    console.log(config);
    throw new Error("Encoder config not supported.");
  }

  _state.encoder = new VideoEncoder(init);
  _state.encoder.configure(config);

  console.log(`Video resolution will be ${w}x${h}.`);

  const watermarkedCanvas = document.getElementById("watermarked-canvas");
  watermarkedCanvas.width = canvas.width;
  watermarkedCanvas.height = canvas.height;

  var appendSeconds = document.getElementById("seconds");
  const logoImg = document.getElementById("logo-img");

  const recordingStarted = Date.now();

  let lastRenderTimestampMs = performance.now();
  deepAR.callbacks.__deeparRendered = function () {
    const currentRenderTimestampMs = performance.now();
    const deltaTimeMs = currentRenderTimestampMs - lastRenderTimestampMs;
    lastRenderTimestampMs = currentRenderTimestampMs;

    if (_state.isRecording) {
      const timestampUs = _state.lastTimestampUs + deltaTimeMs * 1000;

      const milliseconds = Date.now() - recordingStarted;
      const seconds = Math.floor(milliseconds / 1000);
      window.videoRecordingDurationSeconds = seconds;
      appendSeconds.innerHTML = seconds;
      circularProgressBar.setPercent(milliseconds / 10000);

      const context = watermarkedCanvas.getContext("2d");

      context.drawImage(
        canvas,
        0,
        0,
        watermarkedCanvas.width,
        watermarkedCanvas.height
      );

      var logoHeight = 20 * 3;
      var logoWidth = 128 * 3;

      // get image from file
      if (logoImg) {
        context.drawImage(
          logoImg,
          watermarkedCanvas.width / 2 - logoWidth / 2,
          logoHeight * 3,
          logoWidth,
          logoHeight
        );
      }

      const videoFrame = new VideoFrame(watermarkedCanvas, {
        timestamp: timestampUs,
      });
      _state.frames.push(videoFrame);
      _state.lastTimestampUs = timestampUs;
      if (_state.videoFramePushedCallback) {
        _state.videoFramePushedCallback();
      }
    }
  };

  _state.deepAR = deepAR;
  encode();
}

/**
 * Stops recording and returns the recorded video as a Blob.
 */
export async function stopRecording() {
  if (!_state.isRecording) {
    throw new Error(
      "Cannot finish video recording because recording was not started!"
    );
  }

  _state.isRecording = false;
  await _state.encoder.flush();
  _state.muxer.finalize();
  _state.lastTimestampUs = 0;
  _state.videoFramePushedCallback = null;
  _state.deepAR.callbacks.__deeparRendered = undefined;
  _state.deepAR = null;

  const mp4Video = new Blob([_state.muxer.target.buffer], {
    type: "video/mp4",
  });
  _state.muxer = null;
  _state.encoder = null;
  return mp4Video;
}

async function encode() {
  let frameCounter = 0;
  _state.isRecording = true;
  while (_state.isRecording || _state.frames.length > 0) {
    if (_state.frames.length === 0) {
      const videoFramePushedPromise = new Promise((resolve) => {
        _state.videoFramePushedCallback = resolve;
      });
      await videoFramePushedPromise;
      _state.videoFramePushedCallback = null;
    }
    const frame = _state.frames.shift();
    frameCounter++;
    const isKeyFrame = frameCounter % 150 === 0;
    await _state.encoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close();
  }
}

const iosVideoCaptureState = {
  isRecording: false,
  options: {},
  mediaRecorder: null,
  chunks: [],
};

/**
 * Records video from a canvas element as mp4.
 */
export function startRecordingiOS(canvas) {
  if (iosVideoCaptureState.isRecording) {
    throw new Error("Video recording already started!");
  }

  try {
    iosVideoCaptureState.isRecording = true;
    if (iosVideoCaptureState.mediaRecorder == null) {
      const mediaRecorderOptions = {
        mimeType: "video/mp4",
      };
      iosVideoCaptureState.mediaRecorder = new MediaRecorder(
        canvas.captureStream(),
        mediaRecorderOptions
      );
      iosVideoCaptureState.options = Object.assign({}, mediaRecorderOptions);
      iosVideoCaptureState.mediaRecorder.ondataavailable = (e) => {
        iosVideoCaptureState.chunks.push(e.data);
      };
    }
    iosVideoCaptureState.mediaRecorder.start();
  } catch (error) {
    iosVideoCaptureState.isRecording = false;
    console.log("Error starting the recording", error);
  }
}

/**
 * Stops recording and returns the recorded video as a Blob.
 */
export async function stopRecordingiOS() {
  if (!iosVideoCaptureState.isRecording) {
    throw new Error("Video recording not started!");
  }
  return new Promise((resolve) => {
    iosVideoCaptureState.mediaRecorder.onstop = (e) => {
      const chunks = iosVideoCaptureState.chunks;
      iosVideoCaptureState.chunks = [];
      iosVideoCaptureState.isRecording = false;
      resolve({
        recordedVideoBlob: new Blob(chunks, {
          type: iosVideoCaptureState.options.mimeType,
        }),
        recordedVideoMimeType: iosVideoCaptureState.options.mimeType,
      });
    };
    iosVideoCaptureState.mediaRecorder.stop();
  });
}
