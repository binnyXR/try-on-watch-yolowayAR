import * as deepar from "deepar";
import platform from "platform";
import Carousel from "./carousel.js";
import { CircularProgressBar } from "./circularProgressBar.js";
import { stopRecording, startRecording, startRecordingiOS, stopRecordingiOS } from "./mp4CanvasRecorder.js";
import QRCode from "qrcode";

const VIDEO_TIME_LIMIT_SECONDS = 10;

// add the urls for your effects here
const effects = [
  {
    watchId: "000",
    trigger: "effect1",
    path: "Effects/TitoniF.deepar",
    name: "Titon Watch - Black",
  },
  {
    watchId: "001",
    trigger: "effect2",
    path: "Effects/Omega_f.deepar",
    name: "Omega Watch - Black",
  },
  {
    watchId: "003",
    trigger: "effect3",
    path: "Effects/Garamin.deepar",
    name: "Garmin Watch - Orange",
  },
];

async function main() {
  initialLoading();

  const loadingProgressBar = document.getElementById("loading-progress-bar");
  loadingProgressBar.style.width = "100%";

  const main = document.getElementById("main");
  main.style.visibility = "visible";

  let faceTracked = false;
  let currentCarouselIndex = 0;

  const canvas = document.getElementById("deepar-canvas");
  var appendSeconds = document.getElementById("seconds");
  const recordingStatus = document.getElementById("recording-status");
  const recordingStateCanvas = document.getElementById(
    "recording-status-canvas"
  );

  const pixelRatio = window.devicePixelRatio || 1; // avoid a blurry canvas on high DPI screens
  const width = Math.min(recordingStateCanvas.width * pixelRatio);
  const height = Math.min(recordingStateCanvas.height * pixelRatio);
  recordingStateCanvas.width = width;
  recordingStateCanvas.height = height;

  let seconds = 0;
  let isRecording = false;
  let recordingStarted;

  function setUiScreen(screen) {
    console.log("setUiScreen", screen);
    var loadingScreen = document.getElementById("loading");
    var arScreen = document.getElementById("ar-screen");
    const shareImageScreen = document.getElementById("share-image");
    const shareVideoScreen = document.getElementById("share-video");
    const permissionDeniedScreen = document.getElementById("permission-denied");

    const main = document.getElementById("main");
    if (main.style.visibility === "hidden") {
      return;
    }

    const switchScreens = (newScreen = "loading") => {
      loadingScreen.style.visibility =
        newScreen === "loading" ? "visible" : "hidden";
      arScreen.style.visibility =
        newScreen === "ar-screen" ? "visible" : "hidden";
      shareImageScreen.style.visibility =
        newScreen === "share-image" ? "visible" : "hidden";
      shareVideoScreen.style.visibility =
        newScreen === "share-video" ? "visible" : "hidden";
      permissionDeniedScreen.style.visibility =
        newScreen === "permission-denied" ? "visible" : "hidden";
    };

    switchScreens(screen);
  }
  setUiScreen("loading");

  let recordingStateCtx;
  let circularProgressBar;

  const initProgressBar = () => {
    recordingStateCtx = recordingStateCanvas.getContext("2d");
    recordingStateCtx.fillStyle = "#000";
    recordingStateCtx.fill();
    circularProgressBar = new CircularProgressBar(recordingStateCtx, {
      xPos: recordingStateCanvas.width / 2,
      yPos: recordingStateCanvas.height / 2,
      radius: recordingStateCanvas.width / 2 - 10,
      backgroundLineWidth: recordingStateCanvas.width / 10,
      lineWidth: recordingStateCanvas.width / 10,
      backgroundColor: "#000",
    });
    circularProgressBar.onchange = () => {
      recordingStateCtx.clearRect(
        0,
        0,
        recordingStateCanvas.width,
        recordingStateCanvas.height
      );
      circularProgressBar.draw();
    };
    circularProgressBar.draw();
  };

  var logoImg = document.getElementById("logo-img");

  initProgressBar();

  // watermarked canvas
  const watermarkedCanvas = document.getElementById("watermarked-canvas");
  const scale = window.devicePixelRatio; // avoid a blurry canvas on high DPI screens
  watermarkedCanvas.width = Math.floor(window.innerWidth * scale);
  watermarkedCanvas.height = Math.floor(window.innerHeight * scale);
  const watermarkCtx = watermarkedCanvas.getContext("2d");

  let deepAR = null;

  if (!deepAR) {
    try {
      const scale = window.devicePixelRatio; // avoid a blurry canvas on high DPI screens
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);

      // debugger;
      const url = new URL(window.location.href);
      const watchId = url.searchParams.get('watchId');
      const watch = effects.find(watch => watch.watchId == watchId);

      deepAR = await deepar.initialize({
        licenseKey: "352e69b9f4d55ad7f451ccd80570165f4a752f6647efe4aecd10c0a3e10f96c21f45505012db1f28",
        canvas,
        effect: watch.path,
        additionalOptions: {
          cameraConfig: {
            facingMode: "environment",
            cameraPermissionAsked: () => {
              cameraPermissionAskedEvent();
            },
            cameraPermissionGranted: () => {
              cameraPermissionGrantedEvent();
            },
          },
        },
      });

      window.effectPath = watch.path;
      window.effectName = watch.name;
      deepARInitialisedEvent(platform);

      const effectTitleElement = document.getElementById("effect-title");
      effectTitleElement.innerHTML = watch.name;

      setUiScreen("ar-screen");
      arLoadedEvent();
      trackUsage();




      deepAR.callbacks.onFaceTracked = function (face) {
        if (!faceTracked) {
          faceTracked = true;
          trackUsage();
        }
      };
    } catch (error) {
      console.log("error initialising deepAR");
      // permission not granted or some other issue
      setUiScreen("permission-denied");
      console.log("deepAR error", error);
      cameraPermissionDeniedEvent();
    }
  }

  deepAR.callbacks.__deeparRendered = function () {
    // this allows us to render graphics (like a logo) on top of the deepAR canvas for the video recording
    if (!isRecording) {
      return;
    }
    const milliseconds = Date.now() - recordingStarted;
    const seconds = Math.floor(milliseconds / 1000);
    window.videoRecordingDurationSeconds = seconds;
    appendSeconds.innerHTML = seconds;
    circularProgressBar.setPercent(milliseconds / 10000);

    if (seconds >= VIDEO_TIME_LIMIT_SECONDS && isRecording) {
      stopRecordingWithCallback();
    }

    watermarkCtx.drawImage(
      canvas,
      0,
      0,
      watermarkedCanvas.width,
      watermarkedCanvas.height
    );

    // get image from file
    if (logoImg) {
      var logoHeight = 20 * 3;
      var logoWidth = 128 * 3;
      watermarkCtx.drawImage(
        logoImg,
        watermarkedCanvas.width / 2 - logoWidth / 2,
        watermarkedCanvas.height - logoHeight * 4,
        logoWidth,
        logoHeight
      );
    }
  };

  async function handleSelectEffect(effect) {
    if (!deepAR) return;
    const effectTitleElement = document.getElementById("effect-title");
    effectTitleElement.innerHTML = effect.name;
    effectSelectedEvent(effect);
    window.effectPath = effect.path;
    window.effectName = effect.name;
    const loadingSpinner = document.getElementById("loading-spinner");
    if (loadingSpinner) loadingSpinner.style.display = "block";
    await deepAR.switchEffect(effectPath);
    if (loadingSpinner) loadingSpinner.style.display = "none";
  }

  const glassesCarousel = new Carousel("carousel");
  glassesCarousel.onChange = (value) => {
    // switch effects
    const effectsArray = Object.values(effects);

    const effectTitleElement = document.getElementById("effect-title");
    effectTitleElement.innerHTML = effects.effect1.name;

    if (value === currentCarouselIndex) return;

    if (value === effectsArray.length) {
      // open more info screen
      const infoLogo = document.getElementById("info-logo");
      infoLogo.style.display = "none";
      effectTitleElement.style.display = "none";
      const moreInfoScreen = document.getElementById("more-info-screen");
      moreInfoScreen.style.display = "block";
      moreInfoScreenEvent();
    } else {
      // close more info screen and switch effect
      const infoLogo = document.getElementById("info-logo");
      infoLogo.style.display = "block";
      effectTitleElement.style.display = "block";

      const moreInfoScreen = document.getElementById("more-info-screen");
      moreInfoScreen.style.display = "none";

      handleSelectEffect(effectsArray[value]);
    }

    currentCarouselIndex = value;
  };
  glassesCarousel.onActiveClick = async () => {
    // take a screenshot and share it
    const screenshotDataURL = await deepAR.takeScreenshot();

    takePhotoEvent();

    const screenshotImg = await loadImage(screenshotDataURL);

    var newScreenshotCanvas = document.createElement("canvas");

    const scale = window.devicePixelRatio; // avoid a blurry canvas on high DPI screens
    newScreenshotCanvas.width = Math.floor(window.innerWidth * scale);
    newScreenshotCanvas.height = Math.floor(window.innerHeight * scale);

    var context = newScreenshotCanvas.getContext("2d");
    context.drawImage(
      screenshotImg,
      0,
      0,
      newScreenshotCanvas.width,
      newScreenshotCanvas.height
    );

    // draw logos on here
    if (!!logoImg) {
      var logoHeight = 20 * 3;
      var logoWidth = 128 * 3;

      context.drawImage(
        logoImg,
        newScreenshotCanvas.width / 2 - logoWidth / 2,
        logoHeight * 3,
        logoWidth,
        logoHeight
      );
    }

    const imageContainer = document.getElementById("share-image-container");

    if (!imageContainer) {
      console.log("no image container");
      return;
    }

    while (imageContainer.firstChild) {
      imageContainer.removeChild(imageContainer.firstChild);
    }

    var img = new Image();
    img.src = newScreenshotCanvas.toDataURL("image/jpeg");
    img.style.margin = "auto";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.borderRadius = "12px";
    imageContainer.appendChild(img);

    window.screenshotCanvas = newScreenshotCanvas;

    setUiScreen("share-image");
    deepAR.setPaused(true);
  };

  const stopRecordingWithCallback = async () => {
    const downloadButton = document.getElementById("share-video-btn");
    const shareButtonText = document.getElementById("share-video-btn-text");
    const shareButtonLoader = document.getElementById("share-video-btn-loader");
    const shareButtonDownloadIcon = document.getElementById(
      "share-video-btn-download-icon"
    );
    const shareButtonSendIcon = document.getElementById(
      "share-video-btn-send-icon"
    );

    if (downloadButton) {
      if (shareButtonLoader) {
        shareButtonLoader.style.display = "block";
      }
      if (shareButtonText) {
        shareButtonText.textContent = "";
      }

      if (shareButtonDownloadIcon) {
        shareButtonDownloadIcon.style.display = "none";
      }

      if (shareButtonSendIcon) {
        shareButtonSendIcon.style.display = "none";
      }

      downloadButton.onclick = () => {};
    }

    endVideoRecordingEvent(window.videoRecordingDurationSeconds);

    isRecording = false;
    seconds = 0;
    window.videoRecordingDurationSeconds = 0;
    appendSeconds.innerHTML = seconds;
    initProgressBar();

    const browser = platform.name.toLowerCase();

    let mp4Blob;

    if (browser === "safari" || platform.os.family === "iOS") {
      const { recordedVideoBlob } =
        await stopRecordingiOS();
      mp4Blob = recordedVideoBlob;
    } else {
      mp4Blob = await stopRecording();
    }

    try {
      deepAR.setPaused(true);
      recordingStatus.style.display = "none";
      setUiScreen("share-video");

      const video = document.getElementById("player");
      const recordedVideoUrl = URL.createObjectURL(mp4Blob);
      video.src = recordedVideoUrl;

      if (downloadButton) {
        const webShareSupported = "canShare" in navigator;

        if (shareButtonLoader) {
          shareButtonLoader.style.display = "none";
        }
        if (shareButtonText) {
          shareButtonText.textContent = webShareSupported
            ? "Share"
            : "Download";
        }

        if (shareButtonDownloadIcon) {
          shareButtonDownloadIcon.style.display = webShareSupported
            ? "none"
            : "block";
        }

        if (shareButtonSendIcon) {
          shareButtonSendIcon.style.display = webShareSupported
            ? "block"
            : "none";
        }

        downloadButton.onclick = () => {
          shareOrDownload(mp4Blob, "deepar-ar-effect.mp4");
        };
      }
    } catch (err) {
      alert(err);
    }
  };

  glassesCarousel.onActiveHoldStart = async () => {
    const browser = platform.name.toLowerCase();
    if (!isRecording && browser !== "firefox") {
      recordingStarted = Date.now();

      if (browser === "safari" || platform.os.family === "iOS") {
        isRecording = true;
        startRecordingiOS(watermarkedCanvas);
      } else {
        await startRecording(
          canvas,
          deepAR,
          circularProgressBar
        );
      }

      recordingStatus.style.display = "flex";
      startVideoRecordingEvent();
    }
  };

  glassesCarousel.onActiveHoldEnd = async () => {
    console.log("active hold end");
    stopRecordingWithCallback();
  };

  const updateCanvasSize = () => {
    const scale = window.devicePixelRatio; // avoid a blurry canvas on high DPI screens
    var canvasWidth = Math.floor(window.innerWidth * scale);
    var canvasHeight = Math.floor(window.innerHeight * scale);

    const canvas = document.getElementById("deepar-canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  };
  window.addEventListener("resize", updateCanvasSize);

  const infoLogo = document.getElementById("info-logo");
  infoLogo.onclick = () => {

    const infoSlideIndex = Object.values(effects).length;

    glassesCarousel.setActiveSlide(infoSlideIndex);
    glassesCarousel.moveToActiveSlide();
    moreInfoScreenEvent();
  };

  const closeShareImage = document.getElementById("close-share-image");
  if (closeShareImage) {
    closeShareImage.onclick = () => {
      setUiScreen("ar-screen");
      deepAR.setPaused(false);
    };
  }

  const closeShareVideo = document.getElementById("close-share-video");
  if (closeShareVideo) {
    closeShareVideo.onclick = () => {
      setUiScreen("ar-screen");
      deepAR.setPaused(false);
      const video = document.getElementById("player");
      video.src = "";
      const shareVideoButton = document.getElementById("share-video-btn");
      if (shareVideoButton) {
        shareVideoButton.onclick = null;
      }
    };
  }

  const webShareSupported = "canShare" in navigator;

  const shareButtonText = document.getElementById("share-image-btn-text");
  if (shareButtonText) {
    shareButtonText.textContent = webShareSupported ? "Share" : "Download";
  }

  const shareButtonDownloadIcon = document.getElementById(
    "share-image-btn-download-icon"
  );
  if (shareButtonDownloadIcon) {
    shareButtonDownloadIcon.style.display = webShareSupported
      ? "none"
      : "block";
  }

  const shareButtonSendIcon = document.getElementById(
    "share-image-btn-send-icon"
  );
  if (shareButtonSendIcon) {
    shareButtonSendIcon.style.display = webShareSupported ? "block" : "none";
  }

  const shareButton = document.getElementById("share-image-btn");
  if (shareButton) {
    shareButton.onclick = () => {
      const canvas = window.screenshotCanvas;
      if (!canvas) {
        console.log("no canvas to download or share");
        return;
      }
      const fileName = "deep-ar-effect.jpg";
      canvas.toBlob((blob) => {
        shareOrDownload(blob, fileName);
      }, "image/jpeg");
    };
  }

  const shareOrDownload = async (blob, fileName) => {
    const webShareSupported = "canShare" in navigator;
    console.log("type: blob.type", blob.type);
    // Using the Web Share API.
    if (webShareSupported) {
      const data = {
        files: [
          new File([blob], fileName, {
            type: blob.type,
          }),
        ],
        // cannot add title or text to web share or some apps (like whatsapp) will consider it a text share and not show the image :()
        // title,
        // text,
      };
      if (navigator.canShare(data)) {
        shareStartedEvent(blob.type);
        try {
          await navigator.share(data);
          setUiScreen("ar-screen");
          deepAR.setPaused(false);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error(err.name, err.message);
          }
        } finally {
          shareCompletedEvent(blob.type);
          return;
        }
      }
    }
    // Fallback implementation.
    const a = document.createElement("a");
    a.download = fileName;
    a.style.display = "none";
    a.href = URL.createObjectURL(blob);
    a.addEventListener("click", () => {
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    });
    document.body.append(a);
    a.click();
    shareDownloadedEvent(blob.type);
  };

  if (platform.os.family === "Windows" || platform.os.family === "OS X") {
    console.log("platform.os.family", platform.os.family);
    await generateQRCode(window.location.href);
  }

  const welcomePopupWrapper = document.getElementById("welcome-popup-wrapper");
  if (welcomePopupWrapper) {
    welcomePopupWrapper.onclick = () => {
      welcomePopupWrapper.style.display = "none";
    };
    const welcomePopupCloseButton = document.getElementById(
      "welcome-popup-close-button"
    );
    if (welcomePopupCloseButton) {
      welcomePopupCloseButton.onclick = () => {
        welcomePopupWrapper.style.display = "none";
      };
    }
  }
}

window.onload = main;

async function generateQRCode(url) {
  const qrCodeCanvasContainer = document.getElementById(
    "qr-code-canvas-container"
  );
  const qrCodeCavas = document.getElementById("qr-code-canvas");

  try {
    await QRCode.toCanvas(qrCodeCavas, url, {
      scale: 10,
    });
    qrCodeCanvasContainer.style.display = "flex";
  } catch (error) {
    console.error(error);
  }
}

/**
 * Tracking events
 * These are just suggestions, feel free to add or remove events as you wish
 * */

export function trackEvent(event, props) {
  console.log("trackEvent", event, props);
  // you can send events to your favorite analytics tool here
}

export function initialLoading() {
  timing.initialLoadingEvent = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Initial UI Loaded", {
    Time: timing.initialLoadingEvent,
  });
}

export function deepARInitialisedEvent(platform) {
  timing.uiLoaded = (performance.now() - window.startTime) / 1000.0;
  var majorVersion = parseInt(platform.version.split(".")[0]);
  var pl = {
    os: platform.os.family,
    name: platform.name,
    version: platform.version,
    majorVersion: majorVersion,
  };
  trackEvent("DeepAR Initialized", {
    Time: timing.uiLoaded,
    Platform: JSON.stringify(pl),
  });
}

export function cameraPermissionAskedEvent() {
  timing.cameraPermissionAsked =
    (performance.now() - window.startTime) / 1000.0;
  trackEvent("Camera Permission Asked", {
    Time: timing.cameraPermissionAsked,
  });
}

export function cameraPermissionDeniedEvent() {
  timing.cameraPermissionDenied =
    (performance.now() - window.startTime) / 1000.0;
  trackEvent("Camera Permission Denied", {
    Time: timing.cameraPermissionDenied,
  });
}

export function cameraPermissionGrantedEvent() {
  timing.cameraPermissionGranted =
    (performance.now() - window.startTime) / 1000.0;
  trackEvent("Camera Permission Granted", {
    Time: timing.cameraPermissionGranted,
  });
}

export function effectSelectedEvent(effect) {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Effect Selected", {
    Time: timeNow,
    Effect: effect.name,
    Path: effect.path,
  });
}

export function takePhotoEvent() {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Photo Taken", {
    Time: timeNow,
    Effect: window.effectName,
  });
}

export function startVideoRecordingEvent() {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Start Video Recording", {
    Time: timeNow,
    Effect: window.effectName,
  });
}

export function endVideoRecordingEvent(duration) {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("End Video Recording", {
    Time: timeNow,
    Effect: window.effectName,
    Duration_Seconds: duration,
  });
}

export function shareStartedEvent(fileType) {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Share Started", {
    Time: timeNow,
    Effect: window.effectName,
    File_Type: fileType,
  });
}

export function shareCompletedEvent(fileType) {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Share Completed", {
    Time: timeNow,
    Effect: window.effectName,
    File_Type: fileType,
  });
}

export function shareDownloadedEvent(fileType) {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("Share Downloaded", {
    Time: timeNow,
    Effect: window.effectName,
    File_Type: fileType,
  });
}

export function arLoadedEvent() {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  timing.arLoaded = timeNow;
  trackEvent("AR Loaded", {
    Time: timeNow,
  });
}

export function moreInfoScreenEvent() {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("More Info Screen Viewed", {
    Time: timeNow,
  });
}

export function moreInfoTrayEvent() {
  var timeNow = (performance.now() - window.startTime) / 1000.0;
  trackEvent("More Info Tray Viewed", {
    Time: timeNow,
  });
}

var trackUsageEventNumber = 0;
var trackUsageEventInterval = 1000;

/**
 *  Tracks usage every 1 second
 */
export function trackUsage() {
  trackUsageEventNumber++;

  var timeout =
    trackUsageEventNumber * trackUsageEventInterval -
    (performance.now() - timing.arLoaded * 1000) -
    10;

  if (isNaN(timeout)) {
    timeout = 1000;
  }

  setTimeout(function () {
    var time = (trackUsageEventNumber * trackUsageEventInterval) / 1000;
    trackEvent("Usage", { Time: time });
    trackUsage();
  }, timeout || 1000);
}

export const loadImage = async (url) =>
  new Promise(async (resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", (err) => reject(err));
    image.setAttribute("crossorigin", "anonymous");
    image.crossOrigin = "Anonymous";
    image.src = url;
  });
