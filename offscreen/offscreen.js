// offscreen/offscreen.js
// Thu luồng âm thanh từ Tab Google Meet, phát lại ra loa để không bị mất tiếng,
// kiểm tra có tiếng người nói (VAD/RMS) và cắt thành từng file WebM độc lập gửi về Service Worker.

let mediaStream = null;
let audioContext = null;
let analyser = null;
let chunkTimer = null;
let isCapturing = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;

  if (message.type === "OFFSCREEN_START_RECORDING") {
    startRecording(message.streamId, message.chunkSeconds || 4)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (message.type === "OFFSCREEN_STOP_RECORDING") {
    stopRecording();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

async function startRecording(streamId, chunkSeconds = 4) {
  stopRecording();

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // QUAN TRỌNG: Nối stream ra destination để người dùng vẫn nghe thấy âm thanh cuộc họp bình thường
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  source.connect(audioContext.destination);

  isCapturing = true;
  recordLoop(chunkSeconds * 1000);
}

function recordLoop(durationMs) {
  if (!isCapturing || !mediaStream) return;

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  const recorder = new MediaRecorder(mediaStream, { mimeType });
  const chunks = [];
  let maxRms = 0;

  // Đo âm lượng trong suốt đoạn thu để bỏ qua đoạn im lặng
  const rmsInterval = setInterval(() => {
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    if (rms > maxRms) maxRms = rms;
  }, 150);

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = async () => {
    clearInterval(rmsInterval);
    // Chỉ gửi đi nếu có âm thanh thực sự (ngưỡng RMS > 0.008)
    if (chunks.length > 0 && maxRms > 0.008) {
      const blob = new Blob(chunks, { type: mimeType });
      try {
        const base64Audio = await blobToBase64(blob);
        chrome.runtime.sendMessage({
          type: "PROCESS_AUDIO_CHUNK",
          base64Audio,
          mimeType
        });
      } catch (err) {
        console.warn("[Offscreen] Lỗi chuyển đổi audio chunk:", err);
      }
    }
  };

  recorder.start();

  chunkTimer = setTimeout(() => {
    if (recorder.state === "recording") {
      recorder.stop();
    }
    if (isCapturing) {
      recordLoop(durationMs);
    }
  }, durationMs);
}

function stopRecording() {
  isCapturing = false;
  if (chunkTimer) {
    clearTimeout(chunkTimer);
    chunkTimer = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyser = null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result || "";
      const base64 = String(dataUrl).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
