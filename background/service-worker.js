// background/service-worker.js
import {
  translateFastGoogle,
  translateWithAI,
  generateQuickReply,
  summarizeMeetingTranscript,
  chatWithMeetingTranscript,
  transcribeAndTranslateAudioChunk,
  buildLiveMeetingDigest,
  buildSmartOfflineSummary,
  DEFAULT_IT_GLOSSARY
} from "./translators.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  captureMode: "captions", // "captions" (Mặc định: Bắt CC Meet) | "audio" (Thu âm thanh Tab qua AI)
  translationMode: "dual", // "dual" (Google Fast + AI chuẩn IT Infra) | "google" (Chỉ Google Free) | "ai" (Chỉ AI)
  sourceLang: "auto", // "auto" (Tự nhận diện EN/JA/VI) | "ja" | "en" | "vi"
  targetLang: "vi", // "vi" | "ja" | "en"
  secondaryTargetLang: "ja", // Ngôn ngữ đích phụ khi người nói nói trùng ngôn ngữ đích chính (VD: nói tiếng Việt -> dịch sang Nhật/Anh)
  smartBreakEnabled: true, // Tự động ngắt câu thông minh theo ý nghĩa & nhịp nghỉ (không đợi người khác chen vào)
  smartBreakPauseMs: 1150, // Nhịp nghỉ ngắn (ms) để tự động ngắt câu hoàn chỉnh
  aiProvider: "gemini", // "gemini" | "groq" | "openai"
  aiModel: "gemini-2.5-flash",
  apiKey: "",
  fontSize: 18,
  showRomajiOnSubtitles: true,
  autoEnableMeetCaptions: true,
  audioChunkSeconds: 4,
  customGlossary: DEFAULT_IT_GLOSSARY
};

const MAX_SAVED_SESSIONS = 50;
const MAX_TRANSCRIPT_PER_SESSION = 600;
let activeAudioTabId = null;

async function getSettings() {
  const stored = await chrome.storage.local.get("meetTranslatorSettings");
  return { ...DEFAULT_SETTINGS, ...(stored.meetTranslatorSettings || {}) };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ meetTranslatorSettings: updated });
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings: updated }).catch(() => {});
    }
  }
  return updated;
}

/**
 * Quản lý Lịch sử các cuộc họp (Meeting History Storage)
 */
async function getSavedSessions() {
  const stored = await chrome.storage.local.get("meetSavedSessions");
  return Array.isArray(stored.meetSavedSessions) ? stored.meetSavedSessions : [];
}

async function saveMeetingSession(sessionPayload = {}) {
  const sessions = await getSavedSessions();
  const sessionId = (sessionPayload.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("Thiếu sessionId để lưu lịch sử cuộc họp.");
  }

  const transcript = Array.isArray(sessionPayload.transcript)
    ? sessionPayload.transcript.slice(-MAX_TRANSCRIPT_PER_SESSION)
    : [];

  // Nếu chưa có câu thoại nào và phiên chưa từng tồn tại thì chưa cần ghi vào storage
  const existingIdx = sessions.findIndex((s) => s.sessionId === sessionId);
  if (transcript.length === 0 && existingIdx < 0 && !sessionPayload.summaryMarkdown) {
    return null;
  }

  const existing = existingIdx >= 0 ? sessions[existingIdx] : {};
  const digest = buildLiveMeetingDigest(transcript);
  const nowIso = new Date().toISOString();
  const nowDisplay = new Date().toLocaleString("vi-VN");

  // Nếu chưa có summary AI, tự động sinh bản tổng hợp thông minh để lúc nào mở lịch sử lên cũng đọc được ngay
  const autoSummary =
    sessionPayload.summaryMarkdown ||
    existing.summaryMarkdown ||
    (transcript.length > 0 ? buildSmartOfflineSummary(transcript) : "");

  const mergedSession = {
    sessionId,
    meetCode: sessionPayload.meetCode || existing.meetCode || "unknown",
    title:
      sessionPayload.title ||
      existing.title ||
      `Họp Meet (${sessionPayload.meetCode || " Phiên họp"})`,
    createdAt: existing.createdAt || nowIso,
    createdAtDisplay: existing.createdAtDisplay || nowDisplay,
    updatedAt: nowIso,
    updatedAtDisplay: nowDisplay,
    startTime: sessionPayload.startTime || existing.startTime || transcript[0]?.time || "--:--",
    lastTime:
      transcript[transcript.length - 1]?.time ||
      sessionPayload.lastTime ||
      existing.lastTime ||
      "--:--",
    utteranceCount: transcript.length,
    speakers: digest.speakers,
    headline: digest.headline,
    topics: digest.topics,
    techEntities: digest.techEntities,
    actionItems: digest.actionItems,
    languageStats: digest.languageStats,
    summaryMarkdown: autoSummary,
    hasAiSummary: Boolean(sessionPayload.hasAiSummary || existing.hasAiSummary),
    chatHistory: Array.isArray(sessionPayload.chatHistory)
      ? sessionPayload.chatHistory.slice(-30)
      : existing.chatHistory || [],
    attachedFileName: sessionPayload.attachedFileName || existing.attachedFileName || "",
    transcript
  };

  if (existingIdx >= 0) {
    sessions.splice(existingIdx, 1);
  }
  sessions.unshift(mergedSession);

  if (sessions.length > MAX_SAVED_SESSIONS) {
    sessions.length = MAX_SAVED_SESSIONS;
  }

  await chrome.storage.local.set({ meetSavedSessions: sessions });
  return mergedSession;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("meetTranslatorSettings");
  if (!stored.meetTranslatorSettings) {
    await chrome.storage.local.set({ meetTranslatorSettings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((res) => sendResponse({ ok: true, ...res }))
    .catch((err) => {
      console.error("[MeetTranslator SW Error]", err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true;
});

async function handleMessage(message, sender) {
  const settings = await getSettings();

  switch (message.type) {
    case "GET_SETTINGS": {
      return { settings, isAudioCapturing: Boolean(activeAudioTabId) };
    }

    case "SAVE_SETTINGS": {
      const updated = await saveSettings(message.settings || {});
      return { settings: updated };
    }

    case "TRANSLATE_FAST": {
      const {
        text,
        sourceLang = settings.sourceLang || "auto",
        targetLang = settings.targetLang || "vi"
      } = message;
      const res = await translateFastGoogle(text, sourceLang, targetLang, {
        secondaryTargetLang: settings.secondaryTargetLang || "ja"
      });
      return { result: res };
    }

    case "TRANSLATE_AI": {
      const {
        text,
        speaker,
        sourceLang = settings.sourceLang || "auto",
        targetLang = settings.targetLang || "vi",
        recentContext = [],
        liveCaptionContext = ""
      } = message;
      if (settings.translationMode === "google" || !settings.apiKey) {
        return { result: null };
      }
      const res = await translateWithAI({
        text,
        speaker,
        sourceLang,
        targetLang,
        recentContext,
        liveCaptionContext,
        settings
      });
      return { result: res };
    }

    case "QUICK_REPLY": {
      const {
        vietnameseText,
        targetReplyLang = "ja",
        tone = "teinei",
        recentContext = []
      } = message;
      const res = await generateQuickReply({
        vietnameseText,
        targetReplyLang,
        tone,
        recentContext,
        settings
      });
      return { result: res };
    }

    case "SUMMARIZE_MEETING": {
      const { transcript = [], attachedFile = null, customInstruction = "" } = message;
      const summary = await summarizeMeetingTranscript({
        transcript,
        attachedFile,
        customInstruction,
        settings
      });
      const digest = buildLiveMeetingDigest(transcript);
      return { summary, digest, isAI: Boolean(settings.apiKey) };
    }

    case "CHAT_MEETING_SUMMARY": {
      const { prompt, transcript = [], chatHistory = [], attachedFile = null } = message;
      const result = await chatWithMeetingTranscript({
        prompt,
        transcript,
        chatHistory,
        attachedFile,
        settings
      });
      return { result };
    }

    case "SAVE_MEETING_SESSION": {
      const saved = await saveMeetingSession(message.session || {});
      return { session: saved };
    }

    case "GET_MEETING_SESSIONS": {
      const sessions = await getSavedSessions();
      const includeTranscript = Boolean(message.includeTranscript);
      const list = sessions.map((s) =>
        includeTranscript
          ? s
          : {
              ...s,
              transcriptPreview: (s.transcript || []).slice(-5)
            }
      );
      return { sessions: list };
    }

    case "GET_MEETING_SESSION": {
      const sessions = await getSavedSessions();
      const { sessionId, meetCode } = message;
      let found = null;
      if (sessionId) {
        found = sessions.find((s) => s.sessionId === sessionId) || null;
      } else if (meetCode) {
        found = sessions.find((s) => s.meetCode === meetCode) || null;
      }
      return { session: found };
    }

    case "RENAME_MEETING_SESSION": {
      const { sessionId, title } = message;
      const sessions = await getSavedSessions();
      const idx = sessions.findIndex((s) => s.sessionId === sessionId);
      if (idx >= 0 && title) {
        sessions[idx].title = String(title).trim();
        sessions[idx].updatedAt = new Date().toISOString();
        await chrome.storage.local.set({ meetSavedSessions: sessions });
        return { session: sessions[idx] };
      }
      return { session: null };
    }

    case "DELETE_MEETING_SESSION": {
      const { sessionId } = message;
      const sessions = await getSavedSessions();
      const filtered = sessions.filter((s) => s.sessionId !== sessionId);
      await chrome.storage.local.set({ meetSavedSessions: filtered });
      return { sessions: filtered };
    }

    case "CLEAR_ALL_MEETING_SESSIONS": {
      await chrome.storage.local.set({ meetSavedSessions: [] });
      return { sessions: [] };
    }

    case "PROCESS_AUDIO_CHUNK": {
      const { base64Audio, mimeType, recentContext = [] } = message;
      const targetTabId = sender?.tab?.id || activeAudioTabId;
      const sttResult = await transcribeAndTranslateAudioChunk({
        base64Audio,
        mimeType,
        settings,
        recentContext
      });

      if (sttResult && sttResult.ja && targetTabId) {
        chrome.tabs
          .sendMessage(targetTabId, {
            type: "AUDIO_TRANSCRIPT_RESULT",
            payload: sttResult
          })
          .catch(() => {});
      }
      return { result: sttResult };
    }

    case "START_TAB_AUDIO": {
      const tabId = message.tabId || sender?.tab?.id;
      if (!tabId) {
        throw new Error("Không tìm thấy Tab Google Meet để thu âm thanh.");
      }
      if (!settings.apiKey) {
        throw new Error(
          "Vui lòng nhập Gemini hoặc Groq API Key trong phần Cài đặt trước khi bật chế độ Thu Audio AI."
        );
      }

      try {
        await startOffscreenTabCapture(tabId, settings.audioChunkSeconds || 4);
        activeAudioTabId = tabId;
        await saveSettings({ captureMode: "audio" });
        return { mode: "offscreen-tabCapture", tabId };
      } catch (err) {
        return {
          mode: "content-displayMedia-fallback",
          reason: err?.message || "Cần quyền thu âm trực tiếp trên tab"
        };
      }
    }

    case "STOP_TAB_AUDIO": {
      await stopOffscreenTabCapture();
      const prevTabId = activeAudioTabId;
      activeAudioTabId = null;
      await saveSettings({ captureMode: "captions" });
      if (prevTabId) {
        chrome.tabs.sendMessage(prevTabId, { type: "AUDIO_CAPTURE_STOPPED" }).catch(() => {});
      }
      return { stopped: true };
    }

    default:
      return {};
  }
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });
  if (existingContexts.length > 0) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Thu luồng âm thanh từ Google Meet để nhận diện giọng nói đa ngôn ngữ (EN/JA/VI)"
  });
}

async function startOffscreenTabCapture(tabId, chunkSeconds = 4) {
  await ensureOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId
  });
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "OFFSCREEN_START_RECORDING",
    streamId,
    chunkSeconds
  });
}

async function stopOffscreenTabCapture() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });
  if (existingContexts.length > 0) {
    await chrome.runtime
      .sendMessage({
        target: "offscreen",
        type: "OFFSCREEN_STOP_RECORDING"
      })
      .catch(() => {});
  }
}
