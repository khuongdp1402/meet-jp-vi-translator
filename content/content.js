// content/content.js
// Điều phối trung tâm trên trang Google Meet:
// - Hỗ trợ đa ngôn ngữ: Tiếng Anh (EN), Tiếng Nhật (JA), Tiếng Việt (VI) chuyên sâu ngành IT Infrastructure.
// - Kết nối MeetCaptionObserver với cơ chế Tự Động Ngắt Câu Thông Minh Theo Nghĩa (Smart Semantic Break)
//   và truyền ngữ cảnh đoạn phụ đề trên Google Meet (liveCaptionContext) để dịch sát nghĩa.
// - Tự động lưu Lịch sử Cuộc họp (Auto-Save Persistent Sessions) theo mã phòng họp Google Meet,
//   cho phép xem danh sách tất cả các cuộc họp và nội dung tổng hợp cuộc họp đang/đã trao đổi những gì.

(function () {
  if (window.__MEET_JP_VI_INITIALIZED__) return;
  window.__MEET_JP_VI_INITIALIZED__ = true;

  let settings = {};
  let ui = null;
  let observer = null;
  const recentContext = []; // Lưu tối đa 12 câu hội thoại gần nhất làm ngữ cảnh cho AI
  const utteranceCache = new Map(); // id -> trạng thái đầy đủ của câu thoại

  // Thông tin phiên họp hiện tại để tự động lưu lịch sử
  let currentSessionId = "";
  let currentMeetCode = "";
  let currentMeetingTitle = "";
  let sessionStartTimeStr = "";
  let saveSessionTimer = null;

  // Quản lý gộp/ngắt câu cho chế độ Thu Audio AI
  let activeAudioTurnId = null;
  let lastAudioChunkAt = 0;

  // Biến phục vụ fallback thu âm trực tiếp trên tab
  let localAudioStream = null;
  let localAudioTimer = null;
  let localAudioActive = false;

  function detectMeetCodeAndTitle() {
    const path = (window.location.pathname || "").replace(/^\/+|\/+$/g, "");
    const codeMatch = path.match(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i);
    const meetCode = codeMatch ? codeMatch[0].toLowerCase() : path || "general-meet";

    let pageTitle = "";
    const titleEl =
      document.querySelector("[data-meeting-title]") ||
      document.querySelector(".u6vdEc") ||
      document.querySelector('[jsname="r4nke"]');
    if (titleEl) {
      pageTitle = (
        titleEl.getAttribute("data-meeting-title") ||
        titleEl.textContent ||
        ""
      ).trim();
    }
    if (!pageTitle && document.title) {
      pageTitle = document.title
        .replace(/^Meet\s*[-–—]\s*/i, "")
        .replace(/\s*[-–—]\s*Google Meet$/i, "")
        .trim();
    }

    const cleanTitle =
      pageTitle && pageTitle.toLowerCase() !== "google meet"
        ? pageTitle
        : `Họp IT Infra (${meetCode})`;

    const dateKey = new Date().toISOString().slice(0, 10);
    const sessionId = `meet_${dateKey}_${meetCode}`;

    return { sessionId, meetCode, title: cleanTitle };
  }

  async function init() {
    const meta = detectMeetCodeAndTitle();
    currentSessionId = meta.sessionId;
    currentMeetCode = meta.meetCode;
    currentMeetingTitle = meta.title;
    sessionStartTimeStr = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const res = await sendMessage({ type: "GET_SETTINGS" });
    settings = res?.settings || {
      enabled: true,
      captureMode: "captions",
      translationMode: "dual",
      sourceLang: "auto",
      targetLang: "vi",
      secondaryTargetLang: "ja",
      smartBreakEnabled: true,
      smartBreakPauseMs: 1150,
      aiProvider: "gemini",
      fontSize: 18,
      showRomajiOnSubtitles: true
    };

    ui = new window.MeetOverlayUI({
      onRequestEnableCaptions: () => {
        const clicked = observer?.tryEnableMeetCaptions();
        if (clicked) {
          ui.showToast(
            "Đã bật Phụ đề (Captions) trên Google Meet! Hãy kiểm tra ngôn ngữ phụ đề (Nhật / Anh / Việt)."
          );
        } else {
          ui.showToast(
            "Hãy bấm nút [CC] ở thanh công cụ bên dưới của Google Meet để bật phụ đề."
          );
        }
      },
      onToggleCaptureMode: async (nextMode) => {
        await switchCaptureMode(nextMode);
      },
      onPickCaptionRegion: () => {
        observer?.enableManualPicker((target, errMsg) => {
          if (errMsg || !target) {
            ui.showToast(
              errMsg || "Vùng vừa chọn không hợp lệ. Hãy bật [CC] và click vào dòng chữ phụ đề!"
            );
          } else {
            ui.showToast("Đã khóa vùng phụ đề tùy chỉnh thành công!");
          }
        });
      },
      onForceBreakTurn: () => {
        const brokeCaption = observer?.forceBreakTurn();
        activeAudioTurnId = null;
        if (brokeCaption) {
          ui.showToast("✂️ Đã ngắt câu hiện tại! Ý tiếp theo sẽ hiển thị ở dòng mới.");
        } else {
          ui.showToast("✂️ Sẵn sàng ghi câu nói tiếp theo vào dòng mới.");
        }
      },
      onUpdateSettings: async (partial) => {
        const prevCaptureMode = settings.captureMode;
        const saved = await sendMessage({ type: "SAVE_SETTINGS", settings: partial });
        if (saved?.settings) {
          settings = saved.settings;
          ui.updateSettings(settings);
          observer?.updateConfig({
            smartBreakEnabled: settings.smartBreakEnabled !== false,
            smartBreakPauseMs: settings.smartBreakPauseMs || 1150
          });
        }
        if (partial.captureMode && partial.captureMode !== prevCaptureMode) {
          await switchCaptureMode(partial.captureMode);
        }
      },
      onGenerateQuickReply: async (vietnameseText, tone, targetReplyLang = "ja") => {
        const replyRes = await sendMessage({
          type: "QUICK_REPLY",
          vietnameseText,
          targetReplyLang,
          tone,
          recentContext: recentContext.slice(-6)
        });
        if (!replyRes?.ok) {
          throw new Error(replyRes?.error || "Không thể tạo câu trả lời.");
        }
        return replyRes.result;
      },
      onSummarizeMeeting: async (transcript, attachedFile) => {
        const sumRes = await sendMessage({
          type: "SUMMARIZE_MEETING",
          transcript,
          attachedFile
        });
        if (!sumRes?.ok) {
          throw new Error(sumRes?.error || "Không thể tổng hợp cuộc họp.");
        }
        schedulePersistSession(true);
        return sumRes.summary;
      },
      onChatSummary: async ({ prompt, transcript, chatHistory, attachedFile }) => {
        const chatRes = await sendMessage({
          type: "CHAT_MEETING_SUMMARY",
          prompt,
          transcript,
          chatHistory,
          attachedFile
        });
        if (!chatRes?.ok) {
          throw new Error(chatRes?.error || "Không thể xử lý yêu cầu tóm tắt.");
        }
        schedulePersistSession(true);
        return chatRes.result;
      },
      onLoadMeetingSessions: async () => {
        const listRes = await sendMessage({
          type: "GET_MEETING_SESSIONS",
          includeTranscript: true
        });
        return listRes?.sessions || [];
      },
      onRenameMeetingSession: async (sessionId, newTitle) => {
        if (sessionId === currentSessionId) {
          currentMeetingTitle = newTitle;
        }
        const resRename = await sendMessage({
          type: "RENAME_MEETING_SESSION",
          sessionId,
          title: newTitle
        });
        return resRename?.session || null;
      },
      onDeleteMeetingSession: async (sessionId) => {
        const resDel = await sendMessage({
          type: "DELETE_MEETING_SESSION",
          sessionId
        });
        return resDel?.sessions || [];
      },
      onStartNewMeetingSession: async (customTitle) => {
        // Lưu chốt phiên hiện tại trước khi tạo phiên mới
        await persistCurrentSessionNow();
        const suffix = new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }).replace(/:/g, "");
        const dateKey = new Date().toISOString().slice(0, 10);
        currentSessionId = `meet_${dateKey}_${currentMeetCode}_${suffix}`;
        currentMeetingTitle =
          customTitle || `Họp IT Infra (${currentMeetCode} • ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})`;
        sessionStartTimeStr = new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit"
        });
        utteranceCache.clear();
        recentContext.length = 0;
        ui.resetCurrentSessionUI({
          sessionId: currentSessionId,
          meetCode: currentMeetCode,
          title: currentMeetingTitle
        });
      },
      onForceSaveSession: async () => {
        return await persistCurrentSessionNow();
      }
    });

    ui.mount(settings, {
      sessionId: currentSessionId,
      meetCode: currentMeetCode,
      title: currentMeetingTitle
    });

    // Khôi phục lịch sử của phòng họp hiện tại (nếu người dùng F5 tải lại trang) và tải danh sách lịch sử
    await restoreOrLoadHistory();

    observer = new window.MeetCaptionObserver({
      onLiveCaption: handleLiveCaption,
      onTurnCheckpoint: handleTurnCheckpoint,
      onFinalCaption: handleFinalCaption,
      onStatusChange: (captionStatus) => {
        ui.updateStatus({ captionStatus });
      },
      smartBreakEnabled: settings.smartBreakEnabled !== false,
      smartBreakPauseMs: settings.smartBreakPauseMs || 1150
    });

    observer.start();
  }

  async function restoreOrLoadHistory() {
    try {
      const [curRes, listRes] = await Promise.all([
        sendMessage({ type: "GET_MEETING_SESSION", sessionId: currentSessionId }),
        sendMessage({ type: "GET_MEETING_SESSIONS", includeTranscript: true })
      ]);

      const sessions = listRes?.sessions || [];
      ui.setSavedSessionsList(sessions);

      const savedCurrent = curRes?.session;
      if (savedCurrent && Array.isArray(savedCurrent.transcript) && savedCurrent.transcript.length > 0) {
        currentMeetingTitle = savedCurrent.title || currentMeetingTitle;
        for (const item of savedCurrent.transcript) {
          const cleanItem = { ...item, isSpeaking: false };
          utteranceCache.set(cleanItem.id, cleanItem);
        }
        recentContext.push(
          ...savedCurrent.transcript.slice(-10).map((t) => ({
            speaker: t.speaker,
            ja: t.ja,
            vi: t.vi,
            sourceLang: t.sourceLang || "ja",
            targetLang: t.targetLang || "vi"
          }))
        );
        ui.restoreSessionData(savedCurrent);
      }
    } catch (err) {
      console.warn("[MeetTranslator] Không thể khôi phục lịch sử phiên họp:", err);
    }
  }

  function schedulePersistSession(immediate = false) {
    if (saveSessionTimer) {
      clearTimeout(saveSessionTimer);
      saveSessionTimer = null;
    }
    if (immediate) {
      persistCurrentSessionNow();
      return;
    }
    saveSessionTimer = setTimeout(() => {
      saveSessionTimer = null;
      persistCurrentSessionNow();
    }, 1500);
  }

  async function persistCurrentSessionNow() {
    if (!ui) return null;
    const state = ui.getCurrentSessionState();
    if (!state.transcript || state.transcript.length === 0) {
      return null;
    }

    // Cập nhật lại tiêu đề cuộc họp nếu DOM của Meet vừa load xong tên phòng họp
    const detected = detectMeetCodeAndTitle();
    if (
      currentMeetingTitle.startsWith("Họp IT Infra (") &&
      detected.title &&
      !detected.title.startsWith("Họp IT Infra (")
    ) {
      currentMeetingTitle = detected.title;
    }

    const res = await sendMessage({
      type: "SAVE_MEETING_SESSION",
      session: {
        sessionId: currentSessionId,
        meetCode: currentMeetCode,
        title: state.title || currentMeetingTitle,
        startTime: sessionStartTimeStr,
        transcript: state.transcript,
        summaryMarkdown: state.summaryMarkdown,
        hasAiSummary: state.hasAiSummary,
        chatHistory: state.chatHistory,
        attachedFileName: state.attachedFileName
      }
    });

    if (res?.ok && res.session) {
      ui.upsertSavedSessionInList(res.session);
      return res.session;
    }
    return null;
  }

  function getOrCreateUtterance(id, speaker, ja, time, isSpeaking = true, liveCaptionContext = "") {
    let entry = utteranceCache.get(id);
    if (!entry) {
      entry = {
        id,
        speaker,
        ja,
        vi: "",
        romaji: "",
        note: "",
        sourceLang: settings.sourceLang === "auto" ? "" : settings.sourceLang,
        targetLang: settings.targetLang || "vi",
        time,
        isSpeaking,
        provider: "google-free",
        liveCaptionContext: liveCaptionContext || "",
        checkpointJa: "",
        checkpointVi: "",
        checkpointRomaji: "",
        lastFastSeq: 0,
        lastAiSeq: 0
      };
      utteranceCache.set(id, entry);
    } else {
      entry.speaker = speaker || entry.speaker;
      entry.ja = ja;
      entry.time = time || entry.time;
      entry.isSpeaking = isSpeaking;
      if (liveCaptionContext) {
        entry.liveCaptionContext = liveCaptionContext;
      }
    }
    return entry;
  }

  /**
   * 1) Khi người nói đang nói một câu (Live Caption update):
   *    - Hiển thị ngay câu gốc lên khung phụ đề (0ms delay)
   *    - Dịch nhanh bằng Google Translate + Chuẩn hóa thuật ngữ IT Infra
   */
  async function handleLiveCaption({
    id,
    speaker,
    ja,
    time,
    isSpeaking = true,
    liveCaptionContext = ""
  }) {
    const entry = getOrCreateUtterance(id, speaker, ja, time, isSpeaking, liveCaptionContext);

    ui.upsertSubtitle(entry);
    ui.upsertTranscript(entry);

    if (settings.translationMode === "ai") {
      return;
    }

    entry.lastFastSeq += 1;
    const currentSeq = entry.lastFastSeq;

    const hasValidPrefix =
      entry.checkpointJa &&
      entry.checkpointVi &&
      ja.startsWith(entry.checkpointJa);

    const textToTranslate = hasValidPrefix
      ? ja.slice(entry.checkpointJa.length).trim()
      : ja;

    if (!textToTranslate) {
      entry.vi = entry.checkpointVi;
      entry.romaji = entry.checkpointRomaji || entry.romaji;
      ui.upsertSubtitle(entry);
      ui.upsertTranscript(entry);
      return;
    }

    const fastRes = await sendMessage({
      type: "TRANSLATE_FAST",
      text: textToTranslate,
      sourceLang: settings.sourceLang || "auto",
      targetLang: settings.targetLang || "vi"
    });

    const latest = utteranceCache.get(id);
    if (!latest || latest.lastFastSeq !== currentSeq) {
      return;
    }

    if (fastRes?.ok && fastRes.result) {
      const fastVi = (fastRes.result.translatedText || "").trim();
      const fastRm = (fastRes.result.romaji || "").trim();
      latest.sourceLang = fastRes.result.sourceLang || latest.sourceLang || "ja";
      latest.targetLang = fastRes.result.targetLang || latest.targetLang || "vi";

      if (hasValidPrefix) {
        latest.vi = `${latest.checkpointVi} ${fastVi}`.trim();
        latest.romaji = `${latest.checkpointRomaji} ${fastRm}`.trim();
      } else {
        latest.vi = fastVi;
        latest.romaji = fastRm || latest.romaji;
      }

      ui.upsertSubtitle(latest);
      ui.upsertTranscript(latest);
      schedulePersistSession(false);
    }
  }

  /**
   * 2) Checkpoint khi câu nói tạm dừng ngắn:
   *    Nâng cấp bản dịch bằng AI dựa trên ngữ cảnh đoạn phụ đề trên Google Meet
   */
  async function handleTurnCheckpoint({
    id,
    speaker,
    ja,
    time,
    isSpeaking = true,
    liveCaptionContext = ""
  }) {
    const entry = getOrCreateUtterance(id, speaker, ja, time, isSpeaking, liveCaptionContext);
    await refineUtteranceTranslation(entry, { isFinal: false });
    schedulePersistSession(false);
  }

  /**
   * 3) Khi câu nói được tự động ngắt theo nghĩa / nhịp nghỉ / đổi người nói:
   *    Chốt câu hoàn chỉnh, dịch chuẩn IT Infra dựa trên ngữ cảnh phụ đề Google Meet, và lưu vào Lịch sử cuộc họp!
   */
  async function handleFinalCaption({
    id,
    speaker,
    ja,
    time,
    liveCaptionContext = ""
  }) {
    const entry = getOrCreateUtterance(id, speaker, ja, time, false, liveCaptionContext);
    entry.isSpeaking = false;

    await refineUtteranceTranslation(entry, { isFinal: true });

    recentContext.push({
      speaker: entry.speaker,
      ja: entry.ja,
      vi: entry.vi,
      sourceLang: entry.sourceLang || "ja",
      targetLang: entry.targetLang || "vi"
    });
    if (recentContext.length > 12) {
      recentContext.shift();
    }

    schedulePersistSession(true);
  }

  /**
   * Dịch chuẩn xác cho câu hội thoại dựa trên ngữ cảnh đoạn phụ đề trên Google Meet
   */
  async function refineUtteranceTranslation(entry, { isFinal = false }) {
    const fullJa = (entry.ja || "").trim();
    if (!fullJa) return;

    if (!entry.vi && settings.translationMode !== "ai") {
      const fastRes = await sendMessage({
        type: "TRANSLATE_FAST",
        text: fullJa,
        sourceLang: settings.sourceLang || "auto",
        targetLang: settings.targetLang || "vi"
      });
      if (fastRes?.ok && fastRes.result) {
        entry.vi = fastRes.result.translatedText;
        entry.romaji = fastRes.result.romaji || entry.romaji;
        entry.sourceLang = fastRes.result.sourceLang || entry.sourceLang || "ja";
        entry.targetLang = fastRes.result.targetLang || entry.targetLang || "vi";
      }
    }

    if (settings.translationMode === "google" || !settings.apiKey) {
      if (/[。？！.?!]$/.test(fullJa) || isFinal) {
        entry.checkpointJa = fullJa;
        entry.checkpointVi = entry.vi;
        entry.checkpointRomaji = entry.romaji;
      }
      ui.upsertSubtitle(entry);
      ui.upsertTranscript(entry);
      return;
    }

    if (entry.checkpointJa === fullJa && String(entry.provider || "").startsWith("ai-")) {
      ui.upsertSubtitle(entry);
      ui.upsertTranscript(entry);
      return;
    }

    entry.lastAiSeq += 1;
    const currentAiSeq = entry.lastAiSeq;

    const aiRes = await sendMessage({
      type: "TRANSLATE_AI",
      text: fullJa,
      speaker: entry.speaker,
      sourceLang: settings.sourceLang || "auto",
      targetLang: settings.targetLang || "vi",
      recentContext: recentContext.slice(-6),
      liveCaptionContext: entry.liveCaptionContext || observer?.getLiveCaptionContext() || ""
    });

    const latest = utteranceCache.get(entry.id);
    if (!latest || latest.lastAiSeq !== currentAiSeq) {
      return;
    }

    if (aiRes?.ok && aiRes.result?.translatedText) {
      const aiVi = aiRes.result.translatedText.trim();
      const aiRm = (aiRes.result.romaji || "").trim();

      latest.checkpointJa = fullJa;
      latest.checkpointVi = aiVi;
      latest.checkpointRomaji = aiRm || latest.romaji;
      latest.sourceLang = aiRes.result.sourceLang || latest.sourceLang || "ja";
      latest.targetLang = aiRes.result.targetLang || latest.targetLang || "vi";

      if (latest.ja.length > fullJa.length && latest.ja.startsWith(fullJa)) {
        const extraTailJa = latest.ja.slice(fullJa.length).trim();
        const tailFast = await sendMessage({
          type: "TRANSLATE_FAST",
          text: extraTailJa,
          sourceLang: settings.sourceLang || "auto",
          targetLang: settings.targetLang || "vi"
        });
        const extraVi = tailFast?.ok ? (tailFast.result?.translatedText || "").trim() : "";
        latest.vi = `${aiVi} ${extraVi}`.trim();
      } else {
        latest.vi = aiVi;
        latest.romaji = aiRm || latest.romaji;
      }

      latest.note = aiRes.result.note || latest.note || "";
      latest.provider = aiRes.result.provider || `ai-${settings.aiProvider}`;
    }

    ui.upsertSubtitle(latest);
    ui.upsertTranscript(latest);
  }

  /**
   * Chuyển đổi giữa Chế độ 1 (Bắt CC của Meet) và Chế độ 2 (Thu Audio Tab qua AI)
   */
  async function switchCaptureMode(nextMode) {
    if (nextMode === "audio") {
      if (!settings.apiKey) {
        ui.showToast(
          "Để dùng chế độ Thu Audio AI, hãy nhập Gemini hoặc Groq API Key ở tab Cấu hình AI nhé!"
        );
        ui.isDrawerOpen = true;
        ui.shadow.getElementById("sideDrawer")?.classList.add("open");
        ui.shadow.querySelector('.tab-btn[data-tab="settings"]')?.click();
        return;
      }

      const startRes = await sendMessage({ type: "START_TAB_AUDIO" });
      if (!startRes?.ok) {
        ui.showToast(`Lỗi bật Thu Audio: ${startRes?.error || "Không xác định"}`);
        return;
      }

      if (startRes.mode === "content-displayMedia-fallback") {
        try {
          await startLocalTabAudioCapture(settings.audioChunkSeconds || 4);
          settings.captureMode = "audio";
          await sendMessage({ type: "SAVE_SETTINGS", settings: { captureMode: "audio" } });
          ui.updateSettings(settings);
          ui.updateStatus({
            audioCapturing: true,
            statusMessage: "🔴 Đang thu Audio AI trực tiếp"
          });
          ui.showToast("Đã bật chế độ Thu Audio AI thành công!");
        } catch (err) {
          ui.showToast("Đã hủy chọn chia sẻ âm thanh Tab.");
        }
      } else {
        settings.captureMode = "audio";
        ui.updateSettings(settings);
        ui.updateStatus({
          audioCapturing: true,
          statusMessage: "🔴 Đang thu Audio AI (Offscreen)"
        });
        ui.showToast("Đã bật chế độ Thu Audio AI!");
      }
    } else {
      stopLocalTabAudioCapture();
      await sendMessage({ type: "STOP_TAB_AUDIO" });
      settings.captureMode = "captions";
      ui.updateSettings(settings);
      ui.updateStatus({ audioCapturing: false, statusMessage: "" });
      ui.showToast("Đã chuyển về chế độ Bắt Phụ đề (Live Captions) của Google Meet.");
    }
  }

  async function startLocalTabAudioCapture(chunkSeconds = 4) {
    stopLocalTabAudioCapture();

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: true
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Bạn nhớ tích chọn 'Share tab audio / Chia sẻ âm thanh của thẻ' nhé!");
    }

    stream.getVideoTracks().forEach((t) => t.stop());
    const audioOnlyStream = new MediaStream(audioTracks);

    localAudioStream = audioOnlyStream;
    localAudioActive = true;

    audioTracks[0].onended = () => {
      stopLocalTabAudioCapture();
      switchCaptureMode("captions");
    };

    const audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(audioOnlyStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);

    const recordNextChunk = () => {
      if (!localAudioActive || !localAudioStream) return;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(localAudioStream, { mimeType });
      const chunks = [];
      let maxRms = 0;

      const rmsInterval = setInterval(() => {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        if (rms > maxRms) maxRms = rms;
      }, 150);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        clearInterval(rmsInterval);
        if (chunks.length > 0 && maxRms > 0.008) {
          const blob = new Blob(chunks, { type: mimeType });
          const base64Audio = await blobToBase64(blob);
          sendMessage({
            type: "PROCESS_AUDIO_CHUNK",
            base64Audio,
            mimeType,
            recentContext: recentContext.slice(-6)
          });
        }
      };

      recorder.start();
      localAudioTimer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
        if (localAudioActive) recordNextChunk();
      }, chunkSeconds * 1000);
    };

    recordNextChunk();
  }

  function stopLocalTabAudioCapture() {
    localAudioActive = false;
    if (localAudioTimer) {
      clearTimeout(localAudioTimer);
      localAudioTimer = null;
    }
    if (localAudioStream) {
      localAudioStream.getTracks().forEach((t) => t.stop());
      localAudioStream = null;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED" && message.settings) {
      settings = message.settings;
      ui?.updateSettings(settings);
      observer?.updateConfig({
        smartBreakEnabled: settings.smartBreakEnabled !== false,
        smartBreakPauseMs: settings.smartBreakPauseMs || 1150
      });
    }

    if (message.type === "OPEN_HISTORY_MODAL") {
      ui?.openHistoryModal();
    }

    if (message.type === "AUDIO_TRANSCRIPT_RESULT" && message.payload) {
      const { ja, vi, romaji, sourceLang, targetLang, speakerChanged, provider } = message.payload;
      if (!ja) return;

      const now = Date.now();
      const timeStr = new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      // Với chế độ Smart Break, mỗi chunk câu hoàn chỉnh hoặc đổi người nói hoặc nghỉ > 5s sẽ ngắt thành câu riêng dễ đọc
      const shouldBreakAudioSentence =
        !activeAudioTurnId ||
        speakerChanged ||
        now - lastAudioChunkAt > 5000 ||
        (settings.smartBreakEnabled !== false && /[。？！.?!]$/.test(ja));

      if (shouldBreakAudioSentence) {
        if (activeAudioTurnId && utteranceCache.has(activeAudioTurnId)) {
          const prevEntry = utteranceCache.get(activeAudioTurnId);
          prevEntry.isSpeaking = false;
          ui?.upsertSubtitle(prevEntry);
          ui?.upsertTranscript(prevEntry);
        }
        activeAudioTurnId = `aud_${now}`;
      }
      lastAudioChunkAt = now;

      const existing = utteranceCache.get(activeAudioTurnId);
      const entry = existing
        ? {
            ...existing,
            ja: `${existing.ja} ${ja}`.trim(),
            vi: `${existing.vi} ${vi || ""}`.trim(),
            romaji: `${existing.romaji || ""} ${romaji || ""}`.trim(),
            sourceLang: sourceLang || existing.sourceLang || "ja",
            targetLang: targetLang || existing.targetLang || "vi",
            isSpeaking: false
          }
        : {
            id: activeAudioTurnId,
            speaker: "🎙️ Tab Audio",
            ja,
            vi,
            romaji,
            sourceLang: sourceLang || "ja",
            targetLang: targetLang || "vi",
            isSpeaking: false,
            provider: provider || "ai-audio",
            time: timeStr
          };

      utteranceCache.set(activeAudioTurnId, entry);
      ui?.upsertSubtitle(entry);
      ui?.upsertTranscript(entry);
      recentContext.push({
        speaker: entry.speaker,
        ja,
        vi,
        sourceLang: entry.sourceLang,
        targetLang: entry.targetLang
      });
      if (recentContext.length > 12) recentContext.shift();
      schedulePersistSession(true);
    }

    if (message.type === "AUDIO_CAPTURE_STOPPED") {
      stopLocalTabAudioCapture();
      ui?.updateStatus({ audioCapturing: false, statusMessage: "" });
    }
  });

  // Lưu lịch sử trước khi đóng tab hoặc reload
  window.addEventListener("beforeunload", () => {
    persistCurrentSessionNow();
  });

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { ok: false });
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || "";
        resolve(String(dataUrl).split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
