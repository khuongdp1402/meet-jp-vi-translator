// content/caption-observer.js
// Bộ theo dõi Phụ đề Trực tiếp (Live Captions) Đa Ngôn Ngữ (EN / JA / VI) trên Google Meet:
// 1. Nhận diện chính xác vùng Phụ đề (Captions / Chú thích / 字幕), loại bỏ hoàn toàn thanh công cụ & nút bấm của Meet.
// 2. Tự động NGẮT CÂU THÔNG MINH THEO NGHĨA (Smart Semantic Segmentation):
//    - Không cần đợi người khác chen vào mới ngắt câu!
//    - Tự động tách câu ngay khi gặp dấu kết câu hợp lệ (tránh nhầm dấu chấm trong IP 192.168.x.x hoặc tên file resolv.conf).
//    - Tự động tách mệnh đề theo cấu trúc ngữ pháp Tiếng Nhật / Tiếng Anh / Tiếng Việt khi một người nói dài liên tục.
//    - Tự động chốt câu khi người nói dừng nhịp lấy hơi (~1.15s) sau một ý hoàn chỉnh.
// 3. Lưu ngữ cảnh đoạn phụ đề liền kề trên Google Meet (liveCaptionContext) để bộ dịch hiểu trọn vẹn mạch kỹ thuật IT Infra.

(function () {
  const CAPTION_CONTAINER_SELECTORS = [
    'div[role="region"][aria-label*="Captions" i]',
    'div[role="region"][aria-label*="Chú thích" i]',
    'div[role="region"][aria-label*="Phụ đề" i]',
    'div[role="region"][aria-label*="字幕" i]',
    'div[role="log"][aria-label*="Captions" i]',
    'div[role="log"][aria-label*="Chú thích" i]',
    'div[role="log"][aria-label*="Phụ đề" i]',
    'div[role="log"][aria-label*="字幕" i]',
    ".a4cQT",
    ".iOzk7"
  ];

  const SPEAKER_BLOCK_SELECTORS = [
    ".nMcdL",
    '[jsname="tgaKEf"]'
  ];

  const SPEAKER_NAME_SELECTORS = [
    ".NWpY1d",
    ".KcIKyf",
    ".zs7s8d",
    '[jsname="bN97Pc"]',
    "[data-sender-name]"
  ];

  const CAPTION_TEXT_SELECTORS = [
    ".ygicle",
    ".VbkSUe",
    '[jsname="tgaKEf"]',
    ".TBMuR",
    ".bh44bd",
    ".iTTPOb",
    ".CNusmb"
  ];

  // Các chuỗi icon ligature / nút điều khiển của Google Meet tuyệt đối không phải là phụ đề
  const UI_NOISE_PATTERNS = [
    /keyboard_arrow_(up|down|left|right)/i,
    /videocam(_off)?/i,
    /mic(_off|_none)?\b/i,
    /call_end/i,
    /more_vert/i,
    /back_hand/i,
    /translate_cc/i,
    /computer_arrow_up/i,
    /Turn (on|off) microphone/i,
    /Turn (on|off) camera/i,
    /Leave call/i,
    /Raise hand/i,
    /Backgrounds and effects/i,
    /Rời khỏi cuộc gọi/i,
    /Bật micrô|Tắt micrô/i,
    /Bật camera|Tắt camera/i
  ];

  const IGNORED_DOM_SUBTREES =
    'button, [role="button"], [role="tooltip"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="toolbar"], i, svg, .google-material-icons, .google-symbols, .material-icons-extended, [aria-hidden="true"], script, style';

  class MeetCaptionObserver {
    constructor({
      onLiveCaption,
      onTurnCheckpoint,
      onFinalCaption,
      onStatusChange,
      smartBreakEnabled = true,
      smartBreakPauseMs = 1150
    }) {
      this.onLiveCaption = onLiveCaption;
      this.onTurnCheckpoint = onTurnCheckpoint;
      this.onFinalCaption = onFinalCaption;
      this.onStatusChange = onStatusChange;

      this.smartBreakEnabled = smartBreakEnabled !== false;
      this.smartBreakPauseMs = Number(smartBreakPauseMs) || 1150;

      this.observer = null;
      this.scanInterval = null;
      this.customContainer = null;
      this.isRunning = false;

      // Lưu trạng thái từng DOM block phụ đề để chống lặp & chống mất chữ khi Meet cuộn dòng
      this.domBlockState = new WeakMap();
      this.blockCounter = 0;

      // Câu đang nói hiện tại (tự động ngắt theo nghĩa hoặc nhịp nghỉ)
      this.currentTurn = null;

      // Cửa sổ phụ đề gần nhất trên Google Meet để làm ngữ cảnh dịch sát nghĩa
      this.rollingMeetCaptions = [];
    }

    updateConfig({ smartBreakEnabled, smartBreakPauseMs } = {}) {
      if (typeof smartBreakEnabled === "boolean") {
        this.smartBreakEnabled = smartBreakEnabled;
      }
      if (smartBreakPauseMs !== undefined) {
        this.smartBreakPauseMs = Math.max(600, Number(smartBreakPauseMs) || 1150);
      }
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;

      this.observer = new MutationObserver(() => {
        this.handleMutations();
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      this.scanInterval = setInterval(() => {
        this.scanCaptionDOM();
      }, 350);

      this.onStatusChange?.({
        active: true,
        hasCaptionContainer: Boolean(this.findCaptionContainer())
      });
    }

    stop() {
      this.isRunning = false;
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      if (this.currentTurn) {
        this.finalizeCurrentTurn("stopped");
      }
      this.onStatusChange?.({ active: false, hasCaptionContainer: false });
    }

    /**
     * Chủ động ngắt câu hiện tại sang câu mới (khi người dùng bấm nút "Ngắt câu")
     */
    forceBreakTurn() {
      if (this.currentTurn && this.currentTurn.fullText) {
        this.finalizeCurrentTurn("manual_break");
        return true;
      }
      return false;
    }

    isValidCaptionContainer(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      if (el.closest?.("#meet-jp-vi-root")) return false;
      if (el.querySelector?.("video")) return false;

      if (
        el.querySelector?.(
          'button[aria-label*="Leave call" i], button[aria-label*="Rời khỏi cuộc gọi" i], button[data-is-muted], [role="toolbar"]'
        )
      ) {
        return false;
      }

      if (typeof el.getBoundingClientRect === "function" && typeof window.innerHeight === "number") {
        const rect = el.getBoundingClientRect();
        if (rect.height > window.innerHeight * 0.72) {
          return false;
        }
      }

      return true;
    }

    isUiNoiseText(text) {
      if (!text) return true;
      const trimmed = text.trim();
      if (!trimmed) return true;
      for (const regex of UI_NOISE_PATTERNS) {
        if (regex.test(trimmed)) return true;
      }
      return false;
    }

    extractCleanText(rootNode, excludeNode = null) {
      if (!rootNode) return "";
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode: (textNode) => {
          const parent = textNode.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (excludeNode && (parent === excludeNode || excludeNode.contains(parent))) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest(IGNORED_DOM_SUBTREES)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const parts = [];
      let current;
      while ((current = walker.nextNode())) {
        const val = (current.nodeValue || "").trim();
        if (val) parts.push(val);
      }

      return parts.join(" ").replace(/\s+/g, " ").trim();
    }

    enableManualPicker(onPicked) {
      const banner = document.createElement("div");
      banner.style.cssText =
        "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
        "background:#0f172a;color:#38bdf8;padding:10px 18px;border-radius:999px;" +
        "border:1px solid #38bdf8;font-family:sans-serif;font-size:14px;font-weight:600;" +
        "box-shadow:0 8px 24px rgba(0,0,0,0.45);cursor:pointer;";
      banner.textContent =
        "🎯 Hãy click trực tiếp vào dòng chữ Phụ đề (Captions) đang chạy trên Google Meet (Bấm ESC để hủy)";
      document.body.appendChild(banner);

      const cleanup = () => {
        banner.remove();
        document.removeEventListener("click", handleClick, true);
        document.removeEventListener("keydown", handleKey, true);
      };

      const handleKey = (e) => {
        if (e.key === "Escape") cleanup();
      };

      const handleClick = (e) => {
        if (e.target.closest("#meet-jp-vi-root")) return;
        e.preventDefault();
        e.stopPropagation();

        let target = e.target;
        let depth = 0;
        while (
          target &&
          target !== document.body &&
          target.parentElement &&
          depth < 5 &&
          this.isValidCaptionContainer(target.parentElement)
        ) {
          const role = target.getAttribute("role");
          if (
            role === "region" ||
            role === "log" ||
            target.classList.contains("a4cQT") ||
            target.classList.contains("iOzk7")
          ) {
            break;
          }
          target = target.parentElement;
          depth++;
        }

        if (!this.isValidCaptionContainer(target)) {
          cleanup();
          onPicked?.(
            null,
            "Vùng vừa chọn là thanh công cụ của Meet, không phải khung phụ đề! Hãy bật [CC] và click vào dòng chữ phụ đề."
          );
          return;
        }

        this.customContainer = target;
        cleanup();
        onPicked?.(target);
      };

      document.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleKey, true);
    }

    tryEnableMeetCaptions() {
      const ccSelectors = [
        'button[aria-label*="Turn on captions" i]',
        'button[aria-label*="Bật phụ đề" i]',
        'button[aria-label*="Bật chú thích" i]',
        'button[aria-label*="Chú thích" i][aria-pressed="false"]',
        'button[aria-label*="Captions" i][aria-pressed="false"]',
        'button[aria-label*="字幕をオンにする" i]',
        'button[aria-label*="字幕" i][aria-pressed="false"]',
        'button[jsname="r8qRAd"][aria-pressed="false"]',
        'button[jsname="r8qRAd"]'
      ];
      for (const sel of ccSelectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.closest("#meet-jp-vi-root")) {
          btn.click();
          return true;
        }
      }
      return false;
    }

    findCaptionContainer() {
      if (
        this.customContainer &&
        document.body.contains(this.customContainer) &&
        this.isValidCaptionContainer(this.customContainer)
      ) {
        return this.customContainer;
      }

      for (const selector of CAPTION_CONTAINER_SELECTORS) {
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
          if (el.offsetParent !== null && this.isValidCaptionContainer(el)) {
            return el;
          }
        }
      }

      const innerSelectors = [...SPEAKER_BLOCK_SELECTORS, ...CAPTION_TEXT_SELECTORS].join(",");
      const sampleInner = document.querySelector(innerSelectors);
      if (sampleInner && sampleInner.offsetParent !== null) {
        let parent = sampleInner.parentElement;
        let bestContainer = parent;
        for (let i = 0; i < 4 && parent && parent !== document.body; i++) {
          if (!this.isValidCaptionContainer(parent)) break;
          bestContainer = parent;
          if (parent.getAttribute("role") === "region" || parent.getAttribute("role") === "log") {
            break;
          }
          parent = parent.parentElement;
        }
        if (bestContainer && this.isValidCaptionContainer(bestContainer)) {
          return bestContainer;
        }
      }

      const regions = document.querySelectorAll(
        'div[role="region"], div[role="log"], div[aria-live="polite"]'
      );
      for (const reg of regions) {
        if (reg.offsetParent !== null && this.isValidCaptionContainer(reg)) {
          return reg;
        }
      }

      return null;
    }

    handleMutations() {
      if (!this.isRunning) return;
      this.scanCaptionDOM();
    }

    scanCaptionDOM() {
      const container = this.findCaptionContainer();
      this.onStatusChange?.({
        active: this.isRunning,
        hasCaptionContainer: Boolean(container)
      });

      if (!container) return;

      const blocks = this.extractSpeakerBlocks(container);
      if (blocks.length === 0) return;

      // Lưu ngữ cảnh toàn bộ đoạn phụ đề đang hiển thị trên Google Meet
      const visibleCaptionSnapshot = blocks
        .map((b) => `${b.speaker}: ${b.text}`)
        .join(" | ")
        .slice(-600);
      if (visibleCaptionSnapshot) {
        this.lastVisibleCaptionSnapshot = visibleCaptionSnapshot;
      }

      for (const { element, speaker, text } of blocks) {
        this.processDomBlock(element, speaker, text);
      }
    }

    getLiveCaptionContext() {
      const recentCommitted = this.rollingMeetCaptions.slice(-5).join(" / ");
      const visibleNow = this.lastVisibleCaptionSnapshot || "";
      return [recentCommitted, visibleNow].filter(Boolean).join(" || ").slice(-700);
    }

    extractSpeakerBlocks(container) {
      const results = [];

      const textNodes = container.querySelectorAll(CAPTION_TEXT_SELECTORS.join(","));
      if (textNodes.length > 0) {
        const groupedByBlockRoot = new Map();
        let lastKnownSpeaker = "";

        textNodes.forEach((textEl) => {
          const text = this.extractCleanText(textEl);
          if (!text || this.isUiNoiseText(text)) return;

          let walker = textEl.parentElement;
          let speaker = "";
          let matchedRoot = textEl.closest(".nMcdL") || null;

          for (let depth = 0; depth < 5 && walker && walker !== container; depth++) {
            for (const spSel of SPEAKER_NAME_SELECTORS) {
              const spEl = walker.querySelector(spSel);
              if (spEl && spEl !== textEl && !textEl.contains(spEl)) {
                const candidate =
                  spEl.getAttribute("data-sender-name") || this.extractCleanText(spEl);
                if (candidate && !this.isUiNoiseText(candidate)) {
                  speaker = candidate.split("\n")[0].trim();
                  if (!matchedRoot) matchedRoot = walker;
                  break;
                }
              }
            }
            if (speaker) break;
            walker = walker.parentElement;
          }

          if (speaker) {
            lastKnownSpeaker = speaker;
          }

          const keyEl = matchedRoot || textEl;
          const resolvedSpeaker =
            speaker || lastKnownSpeaker || this.currentTurn?.speaker || "Đồng nghiệp";

          if (groupedByBlockRoot.has(keyEl)) {
            const existing = groupedByBlockRoot.get(keyEl);
            if (!existing.text.includes(text)) {
              existing.text = `${existing.text} ${text}`.trim();
            }
            if (speaker && existing.speaker === "Đồng nghiệp") {
              existing.speaker = speaker;
            }
          } else {
            groupedByBlockRoot.set(keyEl, {
              element: keyEl,
              speaker: resolvedSpeaker,
              text
            });
          }
        });

        if (groupedByBlockRoot.size > 0) {
          return Array.from(groupedByBlockRoot.values());
        }
      }

      const candidateBlocks = container.querySelectorAll("div");
      const seenElements = new Set();

      candidateBlocks.forEach((div) => {
        if (seenElements.has(div)) return;
        const imgs = div.querySelectorAll("img");
        if (imgs.length !== 1) return;
        if (div.querySelector("button, [role='button'], video")) return;

        let speakerEl = null;
        for (const spSel of SPEAKER_NAME_SELECTORS) {
          const found = div.querySelector(spSel);
          if (found) {
            speakerEl = found;
            break;
          }
        }

        let speaker = speakerEl ? this.extractCleanText(speakerEl) : "";
        let captionText = "";

        if (speakerEl) {
          captionText = this.extractCleanText(div, speakerEl);
        } else {
          const lines = (div.innerText || "")
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !this.isUiNoiseText(l));
          if (lines.length >= 2 && lines[0].length < 40) {
            speaker = lines[0];
            captionText = lines.slice(1).join(" ").trim();
          }
        }

        if (
          captionText &&
          captionText !== speaker &&
          !this.isUiNoiseText(captionText) &&
          !this.isUiNoiseText(speaker || "Đồng nghiệp")
        ) {
          seenElements.add(div);
          results.push({
            element: div,
            speaker: speaker && speaker.length < 40 ? speaker : "Đồng nghiệp",
            text: captionText
          });
        }
      });

      if (results.length === 0 && this.customContainer === container) {
        const cleanRaw = this.extractCleanText(container);
        if (cleanRaw && !this.isUiNoiseText(cleanRaw)) {
          results.push({
            element: container,
            speaker: this.currentTurn?.speaker || "Đồng nghiệp",
            text: cleanRaw
          });
        }
      }

      return results;
    }

    processDomBlock(element, rawSpeaker, fullText) {
      const cleanRaw = (fullText || "").replace(/\s+/g, " ").trim();
      if (!cleanRaw || this.isUiNoiseText(cleanRaw)) return;

      const cleanSpeaker = this.normalizeSpeaker(rawSpeaker);
      if (this.isUiNoiseText(cleanSpeaker)) return;

      let domState = this.domBlockState.get(element);
      if (!domState) {
        domState = {
          speaker: cleanSpeaker,
          lastRawText: cleanRaw,
          accumulatedText: cleanRaw,
          committedOffset: 0
        };
        this.domBlockState.set(element, domState);
        this.handleSpeakerTurnUpdate(element, domState);
        return;
      }

      if (cleanRaw === domState.lastRawText) {
        return;
      }

      if (cleanSpeaker && cleanSpeaker !== "Đồng nghiệp") {
        domState.speaker = cleanSpeaker;
      }

      const prevAccumLen = domState.accumulatedText.length;
      domState.accumulatedText = this.mergeRollingText(
        domState.accumulatedText,
        domState.lastRawText,
        cleanRaw,
        domState.committedOffset
      );
      domState.lastRawText = cleanRaw;

      if (domState.committedOffset > domState.accumulatedText.length) {
        domState.committedOffset = Math.max(0, prevAccumLen);
      }

      this.handleSpeakerTurnUpdate(element, domState);
    }

    /**
     * Ghép chuỗi thông minh khi Google Meet cập nhật phụ đề, bảo toàn phần committedOffset ở đầu
     */
    mergeRollingText(accumulated, prevRaw, newRaw, committedOffset = 0) {
      if (!accumulated) return newRaw;
      if (newRaw === prevRaw) return accumulated;

      const lockedPrefix = committedOffset > 0 ? accumulated.slice(0, committedOffset) : "";
      const headPrefixLen = Math.max(0, accumulated.length - prevRaw.length);
      const preservedHead = headPrefixLen > 0 ? accumulated.slice(0, headPrefixLen) : "";

      let candidate = "";
      if (newRaw.startsWith(prevRaw)) {
        candidate = preservedHead + newRaw;
      } else {
        let commonPrefix = 0;
        const minLen = Math.min(prevRaw.length, newRaw.length);
        while (commonPrefix < minLen && prevRaw[commonPrefix] === newRaw[commonPrefix]) {
          commonPrefix++;
        }

        if (
          commonPrefix >= Math.floor(prevRaw.length * 0.55) ||
          prevRaw.length - commonPrefix <= 14
        ) {
          candidate = preservedHead + newRaw;
        } else {
          const maxOverlap = Math.min(accumulated.length, newRaw.length);
          let matchedOverlap = 0;
          for (let len = maxOverlap; len >= 4; len--) {
            if (accumulated.endsWith(newRaw.slice(0, len))) {
              matchedOverlap = len;
              break;
            }
          }
          if (matchedOverlap > 0) {
            candidate = accumulated + newRaw.slice(matchedOverlap);
          } else if (prevRaw.length < 15 && headPrefixLen === 0) {
            candidate = newRaw;
          } else {
            candidate = `${accumulated} ${newRaw}`.trim();
          }
        }
      }

      // Đảm bảo phần văn bản đã chốt (lockedPrefix) không bị lệch chỉ số committedOffset
      if (lockedPrefix && !candidate.startsWith(lockedPrefix)) {
        const tailAfterPrefix = candidate.slice(Math.min(candidate.length, lockedPrefix.length));
        return lockedPrefix + tailAfterPrefix;
      }

      return candidate;
    }

    /**
     * Kiểm tra xem văn bản có chứa ký tự Tiếng Nhật hay không
     */
    isJapaneseText(text) {
      return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text || "");
    }

    /**
     * Tìm điểm ngắt câu/mệnh đề thông minh theo ngữ nghĩa (Semantic Split Point)
     * khi người nói đang nói liên tục trên Google Meet mà không cần đợi người khác chen vào.
     * Trả về độ dài phần câu đầu đã hoàn chỉnh (0 nếu chưa nên ngắt).
     */
    findSemanticSplitIndex(text) {
      if (!text) return 0;
      const isJa = this.isJapaneseText(text);

      if (isJa) {
        // Yêu cầu câu đầu tối thiểu 12 ký tự và phần nói tiếp theo đã có ít nhất 6 ký tự (để ASR phần câu đầu đã ổn định)
        if (text.length < 22) return 0;

        // 1. Ưu tiên ngắt tại dấu chấm câu tiếng Nhật (。 ？ ！)
        const jaPunctRegex = /[。？！?!]+/g;
        let match;
        while ((match = jaPunctRegex.exec(text)) !== null) {
          const endIdx = match.index + match[0].length;
          const tailLen = text.slice(endIdx).trim().length;
          if (endIdx >= 10 && tailLen >= 5) {
            return endIdx;
          }
        }

        // 2. Nếu người nói không có dấu chấm trên Meet, tìm cấu trúc kết thúc mệnh đề tiếng Nhật
        // khi câu đã đủ dài (>= 38 ký tự)
        if (text.length >= 38) {
          const clauseEndRegex =
            /(?:ですけれども、?|ますけれども、?|ですが、?|ますので、?|ましたので、?|ますが、?|まして、|ておりまして、|なんですけど、?|なんですけれども、?|についてですが、?|と思います[。、\s]?|お願いします[。、\s]?|になります[。、\s]?|となります[。、\s]?|確認します[。、\s]?|でしょうか[。、\s]?|(?:です|ます|ました|でした)(?:ね|よ)?(?=[、\s]|(?:それで|そして|また|ただ|あと|次に|では|じゃあ|えっと|あの|はい|今|こちら|この|その)))/g;

          while ((match = clauseEndRegex.exec(text)) !== null) {
            const endIdx = match.index + match[0].length;
            const tailLen = text.slice(endIdx).trim().length;
            if (endIdx >= 24 && tailLen >= 8) {
              return endIdx;
            }
          }
        }

        // 3. Nếu câu quá dài (> 78 ký tự) mà vẫn chưa ngắt, ngắt tại dấu phẩy hoặc khoảng trắng tự nhiên
        if (text.length >= 78) {
          const fallbackRegex = /[、，\s]+/g;
          let bestIdx = 0;
          while ((match = fallbackRegex.exec(text)) !== null) {
            const endIdx = match.index + match[0].length;
            const tailLen = text.slice(endIdx).trim().length;
            if (endIdx >= 38 && endIdx <= 75 && tailLen >= 10) {
              bestIdx = endIdx;
            }
          }
          if (bestIdx > 0) return bestIdx;
        }

        return 0;
      }

      // --- Xử lý cho Tiếng Anh (EN) & Tiếng Việt (VI) ---
      if (text.length < 36) return 0;

      // 1. Dấu kết câu (. ? !) nhưng KHÔNG ngắt nhầm vào IP (192.168.1.1), số phiên bản (8.6) hoặc tên file (resolv.conf)
      const sentenceDotRegex = /([.?!]+)\s+(?=[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ0-9])/g;
      let match;
      while ((match = sentenceDotRegex.exec(text)) !== null) {
        const dotIdx = match.index;
        const beforeChar = dotIdx > 0 ? text[dotIdx - 1] : "";
        const afterStr = text.slice(dotIdx + match[0].length).trim();

        // Tránh ngắt sau từ viết tắt ngắn (Mr., vs., e.g., i.e.)
        const prevWord = text.slice(Math.max(0, dotIdx - 4), dotIdx).toLowerCase();
        if (/\b(mr|ms|dr|vs|eg|ie|no|st)$/i.test(prevWord)) continue;
        if (/\d/.test(beforeChar) && /^\d/.test(afterStr)) continue;

        const endIdx = dotIdx + match[1].length;
        if (endIdx >= 22 && afterStr.length >= 10) {
          return endIdx;
        }
      }

      // 2. Ngắt mệnh đề liên từ khi câu Tiếng Anh / Tiếng Việt dài (>= 95 ký tự)
      if (text.length >= 95) {
        const enViClauseRegex =
          /(?:,\s+(?=(?:and|but|so|because|which|however|therefore|nhưng|nên|vì vậy|do đó|tuy nhiên|ngoài ra|tiếp theo|bên cạnh đó)\b)|;\s+)/gi;
        while ((match = enViClauseRegex.exec(text)) !== null) {
          const endIdx = match.index + 1; // giữ dấu phẩy/chấm phẩy ở cuối mệnh đề đầu
          const tailLen = text.slice(match.index + match[0].length).trim().length;
          if (endIdx >= 45 && tailLen >= 16) {
            return endIdx;
          }
        }
      }

      // 3. Nếu câu quá dài (> 145 ký tự), ngắt tại dấu phẩy hợp lý
      if (text.length >= 145) {
        const commaRegex = /,\s+/g;
        let bestIdx = 0;
        while ((match = commaRegex.exec(text)) !== null) {
          const endIdx = match.index + 1;
          const tailLen = text.slice(match.index + match[0].length).trim().length;
          if (endIdx >= 60 && endIdx <= 135 && tailLen >= 18) {
            bestIdx = endIdx;
          }
        }
        if (bestIdx > 0) return bestIdx;
      }

      return 0;
    }

    /**
     * Kiểm tra xem câu hiện tại đã đủ trọn vẹn ý để tự động chốt khi người nói nghỉ nhịp (~1.15s) chưa
     */
    isReadyToCommitOnPause(text) {
      const clean = (text || "").trim();
      if (!clean) return false;

      const isJa = this.isJapaneseText(clean);
      if (isJa) {
        // Nếu quá ngắn (như "はい", "えっと", "あの") thì đợi người nói nói tiếp để ghép vào câu sau
        if (clean.length < 7) return false;
        // Nếu kết thúc bằng trợ từ nối lửng lơ rất ngắn (VD: "これは", "設定の") dưới 12 ký tự thì chờ thêm
        if (clean.length < 12 && /[はがのをにでとへもや]$/.test(clean)) {
          return false;
        }
        return true;
      }

      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length < 3 && clean.length < 15) {
        return false;
      }
      return true;
    }

    /**
     * Xử lý cập nhật phụ đề từ Google Meet với cơ chế Tự Động Ngắt Câu Thông Minh
     */
    handleSpeakerTurnUpdate(element, domState) {
      let uncommittedText = domState.accumulatedText.slice(domState.committedOffset).trim();
      if (!uncommittedText || this.isUiNoiseText(uncommittedText)) return;

      const speaker =
        domState.speaker && domState.speaker !== "Đồng nghiệp"
          ? domState.speaker
          : this.currentTurn?.speaker || domState.speaker || "Đồng nghiệp";

      // 1. Nếu có người khác lên tiếng -> Chốt ngay câu của người trước
      if (this.currentTurn && !this.isSameSpeaker(this.currentTurn.speaker, speaker)) {
        this.finalizeCurrentTurn("speaker_change");
      }

      // 2. Nếu bật chế độ Tự động ngắt nghĩa (Smart Break):
      // Kiểm tra xem trong đoạn uncommittedText của DOM block hiện tại đã có mệnh đề/câu hoàn chỉnh cần tách ra chưa
      if (this.smartBreakEnabled) {
        let safetyCounter = 0;
        while (safetyCounter < 3) {
          safetyCounter++;
          const splitIdx = this.findSemanticSplitIndex(uncommittedText);
          if (splitIdx <= 0) break;

          const completedClause = uncommittedText.slice(0, splitIdx).trim();
          const remainingTail = uncommittedText.slice(splitIdx).trim();
          if (!completedClause || !remainingTail) break;

          // Dịch chuyển committedOffset của DOM block này qua phần câu vừa hoàn tất
          const rawSlice = domState.accumulatedText.slice(domState.committedOffset);
          const posInRaw = rawSlice.indexOf(completedClause);
          if (posInRaw >= 0) {
            domState.committedOffset += posInRaw + completedClause.length;
            // Bỏ qua khoảng trắng hoặc dấu câu thừa ngay sau điểm cắt
            while (
              domState.committedOffset < domState.accumulatedText.length &&
              /[\s、，]/.test(domState.accumulatedText[domState.committedOffset])
            ) {
              domState.committedOffset++;
            }
          } else {
            domState.committedOffset += splitIdx;
          }

          // Đưa mệnh đề hoàn chỉnh vào currentTurn và chốt thành 1 câu hoàn chỉnh ngay lập tức
          this.ensureCurrentTurn(speaker);
          this.currentTurn.segments.set(element, completedClause);
          this.currentTurn.fullText = this.combineTurnSegments(this.currentTurn.segments);
          this.finalizeCurrentTurn("semantic_clause_break", element);

          uncommittedText = domState.accumulatedText.slice(domState.committedOffset).trim();
          if (!uncommittedText) return;
        }
      }

      this.ensureCurrentTurn(speaker);
      this.currentTurn.segments.set(element, uncommittedText);
      const combinedText = this.combineTurnSegments(this.currentTurn.segments);

      if (!combinedText || combinedText === this.currentTurn.lastEmittedText) {
        return;
      }

      this.currentTurn.fullText = combinedText;
      this.currentTurn.lastEmittedText = combinedText;

      const turnRef = this.currentTurn;
      const now = Date.now();
      const liveContext = this.getLiveCaptionContext();

      const emitLive = () => {
        if (!this.currentTurn || this.currentTurn.id !== turnRef.id) return;
        turnRef.lastLiveEmitAt = Date.now();
        this.onLiveCaption?.({
          id: turnRef.id,
          speaker: turnRef.speaker,
          ja: turnRef.fullText,
          time: turnRef.time,
          isSpeaking: true,
          liveCaptionContext: liveContext
        });
      };

      if (now - turnRef.lastLiveEmitAt >= 240) {
        if (turnRef.liveTimer) {
          clearTimeout(turnRef.liveTimer);
          turnRef.liveTimer = null;
        }
        emitLive();
      } else if (!turnRef.liveTimer) {
        turnRef.liveTimer = setTimeout(() => {
          turnRef.liveTimer = null;
          emitLive();
        }, 240 - (now - turnRef.lastLiveEmitAt));
      }

      if (turnRef.checkpointTimer) {
        clearTimeout(turnRef.checkpointTimer);
      }

      // 3. Khi người nói dừng nhịp (~1.15s):
      // - Nếu bật Smart Break và câu đã trọn ý -> Tự động chốt câu (onFinalCaption) để câu tiếp theo sang dòng mới!
      // - Nếu câu mới chỉ là từ đệm rất ngắn ("はい", "ええと"...) -> Gọi checkpoint dịch trước nhưng đợi thêm tối đa 2.5s để nối vào ý chính.
      turnRef.checkpointTimer = setTimeout(() => {
        if (!this.currentTurn || this.currentTurn.id !== turnRef.id) return;

        if (this.smartBreakEnabled && this.isReadyToCommitOnPause(turnRef.fullText)) {
          this.finalizeCurrentTurn("smart_pause_break");
          return;
        }

        this.onTurnCheckpoint?.({
          id: turnRef.id,
          speaker: turnRef.speaker,
          ja: turnRef.fullText,
          time: turnRef.time,
          isSpeaking: true,
          liveCaptionContext: this.getLiveCaptionContext()
        });

        // Nếu sau từ đệm ngắn mà người nói nghỉ luôn quá 2.5s nữa thì cũng chốt câu
        if (this.smartBreakEnabled) {
          turnRef.checkpointTimer = setTimeout(() => {
            if (!this.currentTurn || this.currentTurn.id !== turnRef.id) return;
            if (turnRef.fullText.trim()) {
              this.finalizeCurrentTurn("pause_timeout_break");
            }
          }, 1600);
        }
      }, this.smartBreakPauseMs);
    }

    ensureCurrentTurn(speaker) {
      if (!this.currentTurn) {
        this.blockCounter += 1;
        this.currentTurn = {
          id: `utt_${Date.now()}_${this.blockCounter}`,
          speaker: speaker || "Đồng nghiệp",
          time: this.formatTime(),
          segments: new Map(),
          fullText: "",
          lastEmittedText: "",
          lastLiveEmitAt: 0,
          liveTimer: null,
          checkpointTimer: null
        };
      } else if (
        this.currentTurn.speaker === "Đồng nghiệp" &&
        speaker &&
        speaker !== "Đồng nghiệp"
      ) {
        this.currentTurn.speaker = speaker;
      }
    }

    combineTurnSegments(segmentsMap) {
      let combined = "";
      for (const segText of segmentsMap.values()) {
        const cleanSeg = (segText || "").trim();
        if (!cleanSeg) continue;
        if (!combined) {
          combined = cleanSeg;
          continue;
        }
        if (combined.includes(cleanSeg)) {
          continue;
        }
        if (cleanSeg.startsWith(combined)) {
          combined = cleanSeg;
          continue;
        }
        let overlap = 0;
        const maxCheck = Math.min(combined.length, cleanSeg.length);
        for (let len = maxCheck; len >= 4; len--) {
          if (combined.endsWith(cleanSeg.slice(0, len))) {
            overlap = len;
            break;
          }
        }
        if (overlap > 0) {
          combined = `${combined}${cleanSeg.slice(overlap)}`.trim();
        } else {
          const needsSpace = !/[。、！？?!\s]$/.test(combined);
          combined = `${combined}${needsSpace ? " " : ""}${cleanSeg}`.trim();
        }
      }
      return combined;
    }

    /**
     * Chốt câu hiện tại và đưa vào lịch sử hội thoại
     * @param {string} reason Lý do ngắt câu
     * @param {Element|null} alreadyCommittedElement Nếu truyền vào, element đó đã được cập nhật committedOffset thủ công
     */
    finalizeCurrentTurn(reason = "smart_break", alreadyCommittedElement = null) {
      const turn = this.currentTurn;
      if (!turn) return;

      if (turn.liveTimer) {
        clearTimeout(turn.liveTimer);
        turn.liveTimer = null;
      }
      if (turn.checkpointTimer) {
        clearTimeout(turn.checkpointTimer);
        turn.checkpointTimer = null;
      }

      for (const [el] of turn.segments.entries()) {
        if (alreadyCommittedElement && el === alreadyCommittedElement) {
          continue;
        }
        const st = this.domBlockState.get(el);
        if (st) {
          st.committedOffset = st.accumulatedText.length;
        }
      }

      const finalText = (turn.fullText || "").trim();
      this.currentTurn = null;

      if (!finalText) return;

      this.rollingMeetCaptions.push(`${turn.speaker}: ${finalText}`);
      if (this.rollingMeetCaptions.length > 10) {
        this.rollingMeetCaptions.shift();
      }

      this.onFinalCaption?.({
        id: turn.id,
        speaker: turn.speaker,
        ja: finalText,
        time: turn.time,
        isSpeaking: false,
        reason,
        liveCaptionContext: this.getLiveCaptionContext()
      });
    }

    normalizeSpeaker(name) {
      return (name || "").replace(/\s+/g, " ").trim() || "Đồng nghiệp";
    }

    isSameSpeaker(speakerA, speakerB) {
      const a = this.normalizeSpeaker(speakerA).toLowerCase();
      const b = this.normalizeSpeaker(speakerB).toLowerCase();
      if (!a || !b) return true;
      if (a === b) return true;
      if (a === "đồng nghiệp" || b === "đồng nghiệp") return true;
      return false;
    }

    formatTime() {
      return new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
  }

  window.MeetCaptionObserver = MeetCaptionObserver;
})();
