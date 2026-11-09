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
  let healWatchdogTimer = null;
  let isHealingInProgress = false;

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
      },
      onHealUntranslated: async () => {
        return await healUntranslatedEntries({
          includeAllSavedSessions: true,
          forceAllEmpty: true
        });
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

    // Watchdog định kỳ 3.5s: Tự động phát hiện và dịch bù bất kỳ câu nào bị kẹt ở "Đang dịch..." quá 2.5s
    if (healWatchdogTimer) clearInterval(healWatchdogTimer);
    healWatchdogTimer = setInterval(() => {
      healUntranslatedEntries({ includeAllSavedSessions: false, forceAllEmpty: false });
    }, 3500);
  }

  function isUntranslatedValue(viText) {
    const clean = (viText || "").trim();
    return (
      !clean ||
      clean === "Đang dịch..." ||
      clean === "(Đang dịch...)" ||
      clean === "Translating..."
    );
  }

  /**
   * Tự động kiểm tra và dịch bù toàn bộ các câu bị kẹt ở trạng thái "Đang dịch..."
   * trong cả phiên họp đang diễn ra lẫn danh sách lịch sử cuộc họp đã lưu.
   */
  async function healUntranslatedEntries({
    includeAllSavedSessions = false,
    forceAllEmpty = false
  } = {}) {
    if (isHealingInProgress || !ui) return 0;
    isHealingInProgress = true;
    let healedCount = 0;

    try {
      const now = Date.now();
      let currentSessionChanged = false;

      // 1. Dịch bù các câu trong phiên họp ĐANG DIỄN RA (transcriptList & subtitleItems)
      const currentList = ui.transcriptList || [];
      for (const item of currentList) {
        const srcText = (item.ja || "").trim();
        if (!srcText || !isUntranslatedValue(item.vi)) continue;

        const cached = utteranceCache.get(item.id);
        const createdAt = cached?.updatedAtMs || item.updatedAtMs || 0;
        // Nếu câu đang nói mới xuất hiện < 2.2s và chưa bấm nút ép dịch bù thì chờ luồng chính
        if (!forceAllEmpty && item.isSpeaking && createdAt > 0 && now - createdAt < 2200) {
          continue;
        }

        const fastRes = await sendMessage({
          type: "TRANSLATE_FAST",
          text: srcText,
          sourceLang: settings.sourceLang || "auto",
          targetLang: settings.targetLang || "vi"
        });

        if (fastRes?.ok && fastRes.result?.translatedText) {
          const translated = fastRes.result.translatedText.trim();
          const romaji = (fastRes.result.romaji || item.romaji || "").trim();
          const sLang = fastRes.result.sourceLang || item.sourceLang || "ja";
          const tLang = fastRes.result.targetLang || item.targetLang || "vi";

          item.vi = translated;
          item.romaji = romaji;
          item.sourceLang = sLang;
          item.targetLang = tLang;

          if (cached) {
            cached.vi = translated;
            cached.romaji = romaji;
            cached.sourceLang = sLang;
            cached.targetLang = tLang;
          }

          const subItem = (ui.subtitleItems || []).find((x) => x.id === item.id);
          if (subItem) {
            subItem.vi = translated;
            subItem.romaji = romaji;
            subItem.sourceLang = sLang;
            subItem.targetLang = tLang;
          }

          healedCount += 1;
          currentSessionChanged = true;
        }
      }

      // Kiểm tra thêm trong subtitleItems phòng trường hợp có câu chưa vào transcriptList
      for (const subItem of ui.subtitleItems || []) {
        const srcText = (subItem.ja || "").trim();
        if (!srcText || !isUntranslatedValue(subItem.vi)) continue;
        if (!forceAllEmpty && subItem.isSpeaking && subItem.updatedAtMs && now - subItem.updatedAtMs < 2200) {
          continue;
        }

        const fastRes = await sendMessage({
          type: "TRANSLATE_FAST",
          text: srcText,
          sourceLang: settings.sourceLang || "auto",
          targetLang: settings.targetLang || "vi"
        });

        if (fastRes?.ok && fastRes.result?.translatedText) {
          subItem.vi = fastRes.result.translatedText.trim();
          subItem.romaji = (fastRes.result.romaji || subItem.romaji || "").trim();
          subItem.sourceLang = fastRes.result.sourceLang || subItem.sourceLang || "ja";
          subItem.targetLang = fastRes.result.targetLang || subItem.targetLang || "vi";
          ui.upsertTranscript(subItem);
          healedCount += 1;
          currentSessionChanged = true;
        }
      }

      if (currentSessionChanged) {
        ui.renderSubtitles();
        ui.renderTranscriptList();
        ui.renderLiveDigestCard();
        if (ui.isFileModalOpen) {
          ui.renderLiveFileModalContent();
        }
        await persistCurrentSessionNow();
      }

      // 2. Dịch bù các phiên họp đã lưu trong chrome.storage.local (meetSavedSessions)
      if (includeAllSavedSessions && Array.isArray(ui.savedSessions)) {
        for (const sess of ui.savedSessions) {
          if (!sess || sess.sessionId === currentSessionId || !Array.isArray(sess.transcript)) {
            continue;
          }
          let sessChanged = false;
          for (const t of sess.transcript) {
            const srcText = (t.ja || "").trim();
            if (!srcText || !isUntranslatedValue(t.vi)) continue;

            const fastRes = await sendMessage({
              type: "TRANSLATE_FAST",
              text: srcText,
              sourceLang: settings.sourceLang || "auto",
              targetLang: settings.targetLang || "vi"
            });

            if (fastRes?.ok && fastRes.result?.translatedText) {
              t.vi = fastRes.result.translatedText.trim();
              t.romaji = (fastRes.result.romaji || t.romaji || "").trim();
              t.sourceLang = fastRes.result.sourceLang || t.sourceLang || "ja";
              t.targetLang = fastRes.result.targetLang || t.targetLang || "vi";
              sessChanged = true;
              healedCount += 1;
            }
          }

          if (sessChanged) {
            const saveRes = await sendMessage({
              type: "SAVE_MEETING_SESSION",
              session: sess
            });
            if (saveRes?.ok && saveRes.session) {
              ui.upsertSavedSessionInList(saveRes.session);
            }
          }
        }

        if (healedCount > 0 && ui.isFileModalOpen) {
          ui.renderLiveFileModalContent();
        }
      }
    } catch (err) {
      console.warn("[MeetTranslator] Lỗi khi dịch bù lịch sử:", err);
    } finally {
      isHealingInProgress = false;
    }

    return healedCount;
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

      // Tự động kiểm tra và dịch bù ngay các câu bị thiếu bản dịch ("Đang dịch...") trong cuộc họp đang diễn ra & lịch sử
      setTimeout(async () => {
        const healed = await healUntranslatedEntries({
          includeAllSavedSessions: true,
          forceAllEmpty: true
        });
        if (healed > 0) {
          ui?.showToast(`✅ Đã tự động dịch bù ${healed} câu còn thiếu trong lịch sử cuộc họp!`);
        }
      }, 300);
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
        updatedAtMs: Date.now(),
        isSpeaking,
        provider: "google-free",
        liveCaptionContext: liveCaptionContext || "",
        checkpointJa: "",
        checkpointVi: "",
        checkpointRomaji: "",
        fastInFlight: false,
        pendingFastJa: "",
        lastFastTranslatedJa: "",
        lastFastSeq: 0,
        lastAiSeq: 0
      };
      utteranceCache.set(id, entry);
    } else {
      entry.speaker = speaker || entry.speaker;
      entry.ja = ja;
      entry.time = time || entry.time;
      entry.updatedAtMs = Date.now();
      entry.isSpeaking = isSpeaking;
      if (liveCaptionContext) {
        entry.liveCaptionContext = liveCaptionContext;
      }
    }
    return entry;
  }

  /**
   * Thực thi dịch nhanh (TRANSLATE_FAST) theo cơ chế Single-Flight Queue trên từng câu thoại:
   * - Không bao giờ vứt bỏ kết quả dịch đang bay về khiến câu bị treo ở "Đang dịch..."
   * - Nếu trong lúc đang chờ mạng mà người nói nói thêm từ mới, tự động dịch tiếp phần mới ngay khi request trước vừa xong.
   */
  async function runFastTranslationQueue(entryId) {
    const entry = utteranceCache.get(entryId);
    if (!entry) return;

    if (entry.fastInFlight) {
      entry.pendingFastJa = entry.ja;
      return;
    }

    entry.fastInFlight = true;
    try {
      while (true) {
        const current = utteranceCache.get(entryId);
        if (!current) break;

        const targetJa = (current.pendingFastJa || current.ja || "").trim();
        current.pendingFastJa = "";

        if (!targetJa) break;
        if (current.lastFastTranslatedJa === targetJa && !isUntranslatedValue(current.vi)) {
          break;
        }

        const hasValidPrefix =
          current.checkpointJa &&
          current.checkpointVi &&
          targetJa.startsWith(current.checkpointJa);

        const textToTranslate = hasValidPrefix
          ? targetJa.slice(current.checkpointJa.length).trim()
          : targetJa;

        if (!textToTranslate) {
          current.vi = current.checkpointVi;
          current.romaji = current.checkpointRomaji || current.romaji;
          current.lastFastTranslatedJa = targetJa;
          ui.upsertSubtitle(current);
          ui.upsertTranscript(current);
          break;
        }

        const fastRes = await sendMessage({
          type: "TRANSLATE_FAST",
          text: textToTranslate,
          sourceLang: settings.sourceLang || "auto",
          targetLang: settings.targetLang || "vi"
        });

        const latest = utteranceCache.get(entryId);
        if (!latest) break;

        if (fastRes?.ok && fastRes.result) {
          const fastVi = (fastRes.result.translatedText || "").trim();
          const fastRm = (fastRes.result.romaji || "").trim();
          latest.sourceLang = fastRes.result.sourceLang || latest.sourceLang || "ja";
          latest.targetLang = fastRes.result.targetLang || latest.targetLang || "vi";

          // Chỉ ghi đè nếu câu chưa được AI chốt ở độ dài lớn hơn hoặc bằng
          const alreadyAiAtSameLen =
            latest.checkpointJa === latest.ja && String(latest.provider || "").startsWith("ai-");

          if (!alreadyAiAtSameLen || isUntranslatedValue(latest.vi)) {
            if (hasValidPrefix) {
              latest.vi = `${latest.checkpointVi} ${fastVi}`.trim();
              latest.romaji = `${latest.checkpointRomaji} ${fastRm}`.trim();
            } else {
              latest.vi = fastVi;
              latest.romaji = fastRm || latest.romaji;
            }
          }

          latest.lastFastTranslatedJa = targetJa;
          ui.upsertSubtitle(latest);
          ui.upsertTranscript(latest);
          schedulePersistSession(false);
        }

        // Nếu trong lúc chờ mạng mà người nói đã nói thêm chữ mới -> lặp tiếp 1 vòng để cập nhật trọn câu
        if (latest.pendingFastJa && latest.pendingFastJa !== targetJa) {
          continue;
        }
        if (latest.ja !== targetJa) {
          latest.pendingFastJa = latest.ja;
          continue;
        }
        break;
      }
    } finally {
      const latest = utteranceCache.get(entryId);
      if (latest) {
        latest.fastInFlight = false;
      }
    }
  }

  /**
   * 1) Khi người nói đang nói một câu (Live Caption update):
   *    - Hiển thị ngay câu gốc lên khung phụ đề (0ms delay)
   *    - Dịch nhanh bằng Google Translate Multi-Endpoint + Chuẩn hóa thuật ngữ IT Infra
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

    if (settings.translationMode === "ai" && settings.apiKey) {
      return;
    }

    await runFastTranslationQueue(id);
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

    // Đảm bảo câu luôn có bản dịch nhanh ngay lập tức trước khi gọi AI (hoặc khi không dùng AI)
    if (
      (isUntranslatedValue(entry.vi) || entry.lastFastTranslatedJa !== fullJa) &&
      (settings.translationMode !== "ai" || !settings.apiKey)
    ) {
      const fastRes = await sendMessage({
        type: "TRANSLATE_FAST",
        text: fullJa,
        sourceLang: settings.sourceLang || "auto",
        targetLang: settings.targetLang || "vi"
      });
      if (fastRes?.ok && fastRes.result?.translatedText) {
        entry.vi = fastRes.result.translatedText.trim();
        entry.romaji = fastRes.result.romaji || entry.romaji;
        entry.sourceLang = fastRes.result.sourceLang || entry.sourceLang || "ja";
        entry.targetLang = fastRes.result.targetLang || entry.targetLang || "vi";
        entry.lastFastTranslatedJa = fullJa;
        // Cập nhật giao diện ngay lập tức để không bao giờ bị treo ở "Đang dịch..."
        ui.upsertSubtitle(entry);
        ui.upsertTranscript(entry);
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

    if (entry.checkpointJa === fullJa && String(entry.provider || "").startsWith("ai-") && !isUntranslatedValue(entry.vi)) {
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
    if (!latest) return;

    if (aiRes?.ok && aiRes.result?.translatedText) {
      // Nếu đã có một lượt gọi AI mới hơn hoàn tất thì không ghi đè lùi
      if (latest.lastAiSeq !== currentAiSeq && !isUntranslatedValue(latest.vi)) {
        return;
      }

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
    } else if (isUntranslatedValue(latest.vi)) {
      // Fallback sang TRANSLATE_FAST nếu chế độ "Chỉ AI" gặp lỗi API/Quota để câu không bị kẹt ở "Đang dịch..."
      const fallbackFast = await sendMessage({
        type: "TRANSLATE_FAST",
        text: latest.ja || fullJa,
        sourceLang: settings.sourceLang || "auto",
        targetLang: settings.targetLang || "vi"
      });
      if (fallbackFast?.ok && fallbackFast.result?.translatedText) {
        latest.vi = fallbackFast.result.translatedText.trim();
        latest.romaji = fallbackFast.result.romaji || latest.romaji;
        latest.sourceLang = fallbackFast.result.sourceLang || latest.sourceLang || "ja";
        latest.targetLang = fallbackFast.result.targetLang || latest.targetLang || "vi";
      }
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
