// content/ui-overlay.js
// Giao diện Shadow DOM hiển thị trực tiếp trên Google Meet:
// 1. Floating Subtitle Box Đa Ngôn Ngữ (EN ⇄ JA ⇄ VI) chuẩn ngành IT Infrastructure:
//    - Tự động ngắt câu thông minh theo nghĩa & nhịp nghỉ (không đợi người khác chen vào).
//    - Hỗ trợ cuộn (Scroll) xem lại lịch sử câu dịch ngay trên khung phụ đề.
// 2. Live Meeting Digest ("Cuộc họp đang trao đổi những gì?"):
//    - Tự động nhận diện chủ đề IT Infra, các thông số/lệnh/server vừa nhắc tới, và các đầu việc cần xác nhận (Action Items / QA).
// 3. Quản lý Danh sách Lịch sử Cuộc họp (Meeting History Manager):
//    - Tự động lưu mọi cuộc họp vào bộ nhớ trình duyệt, xem lại danh sách các cuộc họp, đọc nội dung tổng hợp và xuất file .MD / .DOC.

(function () {
  const QUICK_PHRASES = [
    {
      label: "🙇 Chào đầu giờ",
      ja: "お疲れ様です。よろしくお願いいたします。",
      romaji: "O-tsukare-sama desu. Yoroshiku o-negai itashimasu.",
      en: "Hello everyone. Thank you for joining today's meeting, I look forward to working with you.",
      vi: "Chào mọi người ạ. Rất mong mọi người giúp đỡ trong buổi họp hôm nay."
    },
    {
      label: "✅ Đã rõ / Tiếp nhận",
      ja: "承知いたしました。こちらで対応いたします。",
      romaji: "Shouchi itashimashita. Kochira de taiou itashimasu.",
      en: "Understood. I will handle this on our side.",
      vi: "Tôi đã nắm rõ rồi ạ. Phía tôi sẽ tiến hành xử lý."
    },
    {
      label: "🖥️ Xin đợi kiểm tra Server/Sheet",
      ja: "少々お待ちいただけますでしょうか。今パラメータと設定値を確認しております。",
      romaji: "Shoushou o-machi itadakemasu deshou ka. Ima parameeta to setteichi wo kakunin shite orimasu.",
      en: "Could you please wait a moment? I am checking the server parameters and configuration values right now.",
      vi: "Anh/chị vui lòng đợi một chút ạ. Tôi đang kiểm tra lại thông số cấu hình."
    },
    {
      label: "📸 Nhờ chụp bổ sung ảnh/log (証跡)",
      ja: "すみません、こちらの項目の証跡（スクリーンショット）がまだないようですので、確認をお願いできますでしょうか？",
      romaji: "Sumimasen, kochira no koumoku no shouseki ga mada nai you desu node, kakunin wo o-negai dekimasu deshou ka?",
      en: "Excuse me, it seems the evidence screenshot for this item is missing. Could you please check and capture it?",
      vi: "Xin lỗi, hạng mục này hiện chưa có ảnh chụp kết quả (証跡), nhờ anh/chị kiểm tra giúp được không ạ?"
    },
    {
      label: "🔁 Nhờ nhắc lại chậm hơn",
      ja: "すみません、少し聞き取れなかったので、もう一度ゆっくりお願いできますか？",
      romaji: "Sumimasen, sukoshi kikitorenakatta node, mou ichido yukkuri o-negai dekimasu ka?",
      en: "Sorry, I couldn't catch that clearly. Could you please repeat it a bit more slowly?",
      vi: "Xin lỗi, tôi nghe chưa rõ lắm, nhờ anh/chị nói lại chậm hơn một chút được không ạ?"
    },
    {
      label: "🙏 Chào kết thúc họp (失礼します)",
      ja: "本日はありがとうございました。お疲れ様でした。失礼いたします。",
      romaji: "Honjitsu wa arigatou gozaimashita. O-tsukare-sama deshita. Shitsurei itashimasu.",
      en: "Thank you very much for today's meeting. Have a great rest of your day. Goodbye!",
      vi: "Cảm ơn mọi người vì buổi họp hôm nay ạ. Tôi xin phép rời phòng họp!"
    }
  ];

  const SUMMARY_QUICK_PROMPTS = [
    {
      label: "📌 Cuộc họp đang bàn gì?",
      prompt: "Hãy tóm tắt ngắn gọn cuộc họp này đang trao đổi về những nội dung gì, các hạng mục kỹ thuật IT Infra nào đang được khảo sát/thảo luận và kết luận hiện tại."
    },
    {
      label: "🖥️ Thông số IT Infra & Server",
      prompt: "Liệt kê chi tiết toàn bộ các thông số kỹ thuật IT Infra (OS, Disk, Network, IP, DNS, Proxy, Firewall, AD, Parameter Sheet, lệnh kiểm tra) đã được nhắc tới trong cuộc họp."
    },
    {
      label: "🚀 Action Items & QA",
      prompt: "Liệt kê tất cả các công việc cần làm (Action Items), các mục cần hỏi khách hàng (QA), người phụ trách và deadline trong cuộc họp."
    },
    {
      label: "👤 Theo từng người nói",
      prompt: "Tóm tắt chi tiết những ý chính mà từng người tham gia đã phát biểu trong cuộc họp."
    },
    {
      label: "🇯🇵 Xuất Gijiroku (Nhật - Việt)",
      prompt: "Viết biên bản cuộc họp (議事録 - Gijiroku) song ngữ Tiếng Nhật (chuẩn công sở IT) và Tiếng Việt đầy đủ."
    },
    {
      label: "🇬🇧 Xuất Minutes (Anh - Việt)",
      prompt: "Viết biên bản cuộc họp (Meeting Minutes) song ngữ Tiếng Anh (chuẩn IT Infrastructure) và Tiếng Việt."
    }
  ];

  const LANG_BADGE = {
    ja: "🇯🇵 JA",
    en: "🇬🇧 EN",
    vi: "🇻🇳 VI"
  };

  class MeetOverlayUI {
    constructor(callbacks = {}) {
      this.callbacks = callbacks;
      this.host = null;
      this.shadow = null;
      this.settings = {
        fontSize: 18,
        showRomajiOnSubtitles: true,
        captureMode: "captions",
        translationMode: "dual",
        sourceLang: "auto",
        targetLang: "vi",
        secondaryTargetLang: "ja",
        smartBreakEnabled: true,
        smartBreakPauseMs: 1150,
        aiProvider: "gemini",
        apiKey: ""
      };

      this.currentSessionMeta = {
        sessionId: "",
        meetCode: "",
        title: "Họp IT Infra hiện tại"
      };

      this.isMinimized = false;
      this.isSubtitleExpanded = false;
      this.isSubtitleScrolledUp = false;
      this.isDrawerOpen = false;
      this.isFileModalOpen = false;
      this.activeTab = "digest"; // "digest" | "history" | "reply" | "settings"
      this.selectedTone = "teinei";
      this.replyTargetLang = "ja"; // "ja" | "en"

      // Dữ liệu của phiên họp ĐANG DIỄN RA
      this.subtitleItems = [];
      this.transcriptList = [];
      this.latestSummaryMarkdown = "";
      this.hasAiSummary = false;
      this.lastSummaryTime = "";
      this.summaryChatHistory = [];
      this.attachedFile = null;

      // Danh sách tất cả các cuộc họp đã lưu & Phiên họp đang được chọn để xem trong Modal
      this.savedSessions = [];
      this.viewingSessionId = null; // null = đang xem cuộc họp hiện tại; chuỗi khác = đang xem cuộc họp trong lịch sử

      this.captionStatus = { active: true, hasCaptionContainer: false };
      this.audioCapturing = false;
    }

    mount(initialSettings = {}, sessionMeta = {}) {
      this.settings = { ...this.settings, ...initialSettings };
      this.currentSessionMeta = { ...this.currentSessionMeta, ...sessionMeta };
      if (document.getElementById("meet-jp-vi-root")) {
        return;
      }

      this.host = document.createElement("div");
      this.host.id = "meet-jp-vi-root";
      document.body.appendChild(this.host);

      this.shadow = this.host.attachShadow({ mode: "open" });
      this.render();
      this.bindEvents();
    }

    updateSettings(newSettings = {}) {
      this.settings = { ...this.settings, ...newSettings };
      this.applyDynamicStyles();
      this.updateHeaderStatus();
      this.syncSettingsForm();
    }

    updateStatus({ captionStatus, audioCapturing, statusMessage }) {
      if (captionStatus) this.captionStatus = captionStatus;
      if (typeof audioCapturing === "boolean") this.audioCapturing = audioCapturing;
      if (statusMessage !== undefined) this.statusMessage = statusMessage;
      this.updateHeaderStatus();
    }

    getCurrentSessionState() {
      return {
        sessionId: this.currentSessionMeta.sessionId,
        meetCode: this.currentSessionMeta.meetCode,
        title: this.currentSessionMeta.title,
        transcript: this.transcriptList,
        summaryMarkdown: this.latestSummaryMarkdown,
        hasAiSummary: this.hasAiSummary,
        chatHistory: this.summaryChatHistory,
        attachedFileName: this.attachedFile?.name || ""
      };
    }

    restoreSessionData(savedSession) {
      if (!savedSession) return;
      this.currentSessionMeta = {
        sessionId: savedSession.sessionId || this.currentSessionMeta.sessionId,
        meetCode: savedSession.meetCode || this.currentSessionMeta.meetCode,
        title: savedSession.title || this.currentSessionMeta.title
      };
      this.transcriptList = Array.isArray(savedSession.transcript)
        ? savedSession.transcript.map((t) => ({ ...t, isSpeaking: false }))
        : [];
      this.subtitleItems = this.transcriptList.slice(-200);
      this.latestSummaryMarkdown = savedSession.summaryMarkdown || "";
      this.hasAiSummary = Boolean(savedSession.hasAiSummary);
      this.summaryChatHistory = Array.isArray(savedSession.chatHistory)
        ? savedSession.chatHistory
        : [];

      this.renderSubtitles();
      this.renderTranscriptList();
      this.renderLiveDigestCard();
      this.renderHistoryList();
      this.renderChatMessages();
      if (this.isFileModalOpen) {
        this.renderLiveFileModalContent();
      }
    }

    resetCurrentSessionUI(newMeta = {}) {
      this.currentSessionMeta = { ...this.currentSessionMeta, ...newMeta };
      this.viewingSessionId = null;
      this.subtitleItems = [];
      this.transcriptList = [];
      this.latestSummaryMarkdown = "";
      this.hasAiSummary = false;
      this.lastSummaryTime = "";
      this.summaryChatHistory = [];
      this.renderSubtitles();
      this.renderTranscriptList();
      this.renderLiveDigestCard();
      this.renderHistoryList();
      this.renderChatMessages();
      this.renderLiveFileModalContent();
    }

    setSavedSessionsList(sessions = []) {
      this.savedSessions = Array.isArray(sessions) ? sessions : [];
      this.renderHistoryList();
    }

    upsertSavedSessionInList(sessionObj) {
      if (!sessionObj || !sessionObj.sessionId) return;
      const idx = this.savedSessions.findIndex((s) => s.sessionId === sessionObj.sessionId);
      if (idx >= 0) {
        this.savedSessions.splice(idx, 1);
      }
      this.savedSessions.unshift(sessionObj);
      this.renderHistoryList();
    }

    /**
     * Cập nhật hoặc thêm mới 1 câu hội thoại vào khung phụ đề nổi
     */
    upsertSubtitle(item) {
      const idx = this.subtitleItems.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        this.subtitleItems[idx] = { ...this.subtitleItems[idx], ...item };
      } else {
        this.subtitleItems.forEach((x) => {
          x.isSpeaking = false;
        });
        this.subtitleItems.push(item);
        if (this.subtitleItems.length > 300) {
          this.subtitleItems.shift();
        }
      }
      this.renderSubtitles();
    }

    /**
     * Thêm hoặc cập nhật câu hội thoại vào bảng Transcript & Tóm tắt trực tiếp
     */
    upsertTranscript(item) {
      const idx = this.transcriptList.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        this.transcriptList[idx] = { ...this.transcriptList[idx], ...item };
      } else {
        this.transcriptList.forEach((x) => {
          x.isSpeaking = false;
        });
        this.transcriptList.push(item);
      }
      this.renderTranscriptList();
      this.renderLiveDigestCard();
      if (this.isFileModalOpen && !this.viewingSessionId) {
        this.renderLiveFileModalContent();
      }
    }

    /**
     * Phân tích nhanh nội dung cuộc họp đang trao đổi những gì ngay tại Client
     */
    computeClientDigest(transcript = []) {
      if (!Array.isArray(transcript) || transcript.length === 0) {
        return {
          headline: "Chưa có dữ liệu hội thoại",
          topics: [],
          techEntities: [],
          actionItems: [],
          speakers: []
        };
      }

      const speakers = [...new Set(transcript.map((t) => t.speaker || "Đồng nghiệp"))];
      const fullText = transcript.map((t) => `${t.ja || ""} ${t.vi || ""}`).join("\n");

      const TOPIC_RULES = [
        {
          name: "🖥️ Server & OS (Linux/RHEL/Windows)",
          re: /(rhel|linux|windows|hostname|hostnamectl|kernel|swap|df -h|lsblk|lvm|mount|ディスク|ホスト名|メモリ|kdump|selinux|getenforce|dnf|yum|locale|timedatectl)/i
        },
        {
          name: "🌐 Network, DNS & Routing",
          re: /(network|ip|subnet|prefix|gateway|static route|スタティックルート|nmcli|ifcfg|resolv\.conf|hosts|dns|名前解決|ipv6|vlan|bonding|疎通|ping|port)/i
        },
        {
          name: "🛡️ Proxy, Firewall & Security",
          re: /(proxy|プロキシ|i-filter|pac|firewall|firewalld|fortigate|ssh|sshd_config|sudoers|antivirus|ウイルス|edr|vpn|踏み台|bastion)/i
        },
        {
          name: "☁️ Di trú Hạ tầng & Parameter Sheet",
          re: /(migration|マイグレーション|現調|現行|パラメータシート|parameter sheet|kcps|aws|azure|vmware|切り替え|切り戻し|rollback|証跡|エビデンス|qa)/i
        },
        {
          name: "🔑 Active Directory, User & Services",
          re: /(active directory|adサーバ|ad01|domain|group|passwd|user|ユーザ|systemctl|service|chrony|ntp|時刻同期)/i
        },
        {
          name: "📅 Tiến độ, Phân công & Kế hoạch",
          re: /(進捗|納期|deadline|schedule|予定|午後|明日|来週|確認|対応|レビュー|review|ticket|task|báo cáo|tiến độ|kế hoạch)/i
        }
      ];

      const topics = TOPIC_RULES.filter((r) => r.re.test(fullText)).map((r) => r.name);

      const techSet = new Set();
      const entityRe =
        /(\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b|\/etc\/[a-z0-9._/-]+|\/mnt\/[a-z0-9._/-]+|\/var\/[a-z0-9._/-]+|\b(?:RHEL|CentOS|Ubuntu|Windows Server)\s*\d*(?:\.\d+)?\b|\b(?:systemctl|nmcli|hostnamectl|timedatectl|getenforce|swapon|chronyc|df -h|lsblk|ip route|i-FILTER|SELinux|firewalld|KCPS\d?|FortiGate|Active Directory)\b|\bcột\s+[A-Z]{1,2}\d*\b|\bQA\b)/gi;
      let m;
      while ((m = entityRe.exec(fullText)) !== null) {
        if (techSet.size < 16) techSet.add(m[0]);
      }

      const actionRe =
        /(確認|対応|納期|明日|今日|来週|お願い|修正|課題|残し|追加|xác nhận|kiểm tra|xử lý|deadline|hạn|ngày mai|hôm nay|tuần sau|nhờ|cần làm|sẽ làm|giữ nguyên|bổ sung|please|need to|will check|action item)/i;
      const actionItems = transcript
        .filter((t) => actionRe.test(t.ja || "") || actionRe.test(t.vi || ""))
        .slice(-5);

      const headline =
        topics.length > 0
          ? topics.slice(0, 2).join(" • ")
          : `Đang trao đổi (${transcript.length} câu • ${speakers.join(", ")})`;

      return {
        headline,
        topics,
        techEntities: Array.from(techSet),
        actionItems,
        speakers
      };
    }

    render() {
      this.shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #f8fafc;
          }
          * {
            box-sizing: border-box;
          }

          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          ::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.4);
            border-radius: 6px;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(56, 189, 248, 0.45);
            border-radius: 6px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(56, 189, 248, 0.8);
          }

          /* Khung phụ đề nổi Đa Ngôn Ngữ (EN / JA / VI) */
          .floating-box {
            position: fixed;
            bottom: 82px;
            left: 50%;
            transform: translateX(-50%);
            width: min(900px, 95vw);
            background: rgba(15, 23, 42, 0.93);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 16px;
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.65);
            z-index: 2147483640;
            transition: opacity 0.2s ease;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .floating-box.minimized .subtitle-body,
          .floating-box.minimized .scroll-resume-bar {
            display: none !important;
          }

          .box-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(30, 41, 59, 0.94);
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
            cursor: move;
            user-select: none;
            gap: 8px;
            flex-wrap: wrap;
          }
          .brand-group {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
          .brand-badge {
            background: linear-gradient(135deg, #0ea5e9, #6366f1);
            color: #fff;
            font-weight: 700;
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 6px;
            letter-spacing: 0.3px;
          }
          .lang-pair-select {
            background: rgba(15, 23, 42, 0.88);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.38);
            border-radius: 7px;
            padding: 3px 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            outline: none;
          }
          .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11.5px;
            padding: 3px 9px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(148, 163, 184, 0.25);
            color: #e2e8f0;
            cursor: pointer;
          }
          .status-pill.ok {
            border-color: rgba(34, 197, 94, 0.5);
            color: #86efac;
          }
          .status-pill.warn {
            border-color: rgba(250, 204, 21, 0.55);
            color: #fde047;
          }
          .status-pill.audio {
            border-color: rgba(244, 63, 94, 0.6);
            color: #fda4af;
          }
          .turn-count-pill {
            font-size: 11px;
            color: #94a3b8;
            background: rgba(15, 23, 42, 0.65);
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid rgba(148, 163, 184, 0.2);
          }

          .toolbar-actions {
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
          }
          .tool-btn {
            background: rgba(51, 65, 85, 0.78);
            color: #e2e8f0;
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 8px;
            padding: 4px 8px;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
          }
          .tool-btn:hover {
            background: rgba(71, 85, 105, 0.95);
            border-color: #38bdf8;
            color: #fff;
          }
          .tool-btn:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          .tool-btn.active {
            background: rgba(14, 165, 233, 0.25);
            border-color: #38bdf8;
            color: #38bdf8;
          }
          .tool-btn.primary {
            background: linear-gradient(135deg, #0284c7, #4f46e5);
            border-color: transparent;
            color: #fff;
            font-weight: 600;
          }
          .tool-btn.primary:hover {
            filter: brightness(1.1);
          }
          .tool-btn.accent {
            background: linear-gradient(135deg, #7c3aed, #db2777);
            border-color: transparent;
            color: #fff;
            font-weight: 600;
          }
          .tool-btn.accent:hover {
            filter: brightness(1.1);
          }

          .subtitle-body {
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
            gap: 9px;
            min-height: 86px;
            max-height: 255px;
            overflow-y: auto;
            overscroll-behavior: contain;
            transition: max-height 0.2s ease;
          }
          .floating-box.expanded .subtitle-body {
            max-height: 440px;
          }

          .scroll-resume-bar {
            display: none;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: linear-gradient(90deg, rgba(2, 132, 199, 0.95), rgba(79, 70, 229, 0.95));
            color: #fff;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 12px;
            cursor: pointer;
            border-top: 1px solid rgba(56, 189, 248, 0.4);
            text-align: center;
          }
          .scroll-resume-bar.visible {
            display: flex;
          }

          .empty-hint {
            text-align: center;
            color: #94a3b8;
            font-size: 13px;
            padding: 8px 0;
            line-height: 1.5;
          }
          .utt-item {
            padding: 8px 12px;
            border-radius: 10px;
            background: rgba(30, 41, 59, 0.62);
            border-left: 3px solid #38bdf8;
            transition: background 0.15s ease;
          }
          .utt-item.history {
            opacity: 0.87;
            border-left-color: #64748b;
            background: rgba(30, 41, 59, 0.44);
          }
          .utt-item.history:hover {
            opacity: 1;
            background: rgba(30, 41, 59, 0.75);
          }
          .utt-item.current {
            border-left: 4px solid #38bdf8;
            background: rgba(30, 41, 59, 0.9);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          }
          .utt-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 11.5px;
            color: #94a3b8;
            gap: 8px;
            flex-wrap: wrap;
          }
          .speaker-name {
            font-weight: 700;
            color: #38bdf8;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .lang-tag {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 4px;
            background: rgba(15, 23, 42, 0.8);
            color: #cbd5e1;
            border: 1px solid rgba(148, 163, 184, 0.25);
          }
          .speaking-live-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10.5px;
            font-weight: 600;
            padding: 1px 7px;
            border-radius: 999px;
            background: rgba(34, 197, 94, 0.18);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.4);
          }
          .engine-tag {
            font-size: 10.5px;
            padding: 1px 6px;
            border-radius: 4px;
            background: rgba(56, 189, 248, 0.15);
            color: #7dd3fc;
          }
          .engine-tag.ai {
            background: rgba(168, 85, 247, 0.22);
            color: #d8b4fe;
          }
          .ja-line {
            color: #e2e8f0;
            font-size: calc(var(--sub-font-size, 18px) * 0.84);
            line-height: 1.45;
            margin-bottom: 3px;
            word-break: break-word;
            white-space: pre-wrap;
          }
          .romaji-line {
            color: #fbbf24;
            font-size: calc(var(--sub-font-size, 18px) * 0.72);
            font-style: italic;
            margin-bottom: 3px;
            line-height: 1.38;
            word-break: break-word;
          }
          .vi-line {
            color: #4ade80;
            font-size: var(--sub-font-size, 18px);
            font-weight: 600;
            line-height: 1.45;
            word-break: break-word;
            white-space: pre-wrap;
          }
          .note-line {
            margin-top: 5px;
            font-size: 11.5px;
            color: #e9d5ff;
            background: rgba(88, 28, 135, 0.3);
            border-left: 2px solid #c084fc;
            padding: 3px 8px;
            border-radius: 5px;
          }

          /* Bảng Side Drawer 4 Tab */
          .side-drawer {
            position: fixed;
            top: 14px;
            right: 14px;
            bottom: 82px;
            width: min(480px, 96vw);
            background: rgba(15, 23, 42, 0.97);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(56, 189, 248, 0.38);
            border-radius: 16px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
            z-index: 2147483641;
            display: none;
            flex-direction: column;
            overflow: hidden;
          }
          .side-drawer.open {
            display: flex;
          }
          .drawer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(30, 41, 59, 0.94);
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          }
          .drawer-title {
            font-size: 13px;
            font-weight: 700;
            color: #f8fafc;
          }
          .drawer-tabs {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            background: rgba(15, 23, 42, 0.94);
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          }
          .tab-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            padding: 9px 4px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.15s;
          }
          .tab-btn.active {
            color: #38bdf8;
            border-bottom-color: #38bdf8;
            background: rgba(56, 189, 248, 0.08);
          }

          .tab-panel {
            display: none;
            flex: 1;
            overflow-y: auto;
            padding: 12px 14px;
            flex-direction: column;
            gap: 11px;
          }
          .tab-panel.active {
            display: flex;
          }

          .section-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: #94a3b8;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          /* Thẻ Live Digest: Cuộc họp đang trao đổi những gì */
          .digest-box {
            background: linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 12px;
            padding: 11px 12px;
            display: flex;
            flex-direction: column;
            gap: 7px;
          }
          .digest-headline {
            font-size: 13px;
            font-weight: 700;
            color: #38bdf8;
            line-height: 1.4;
          }
          .chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
          }
          .topic-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 999px;
            background: rgba(14, 165, 233, 0.16);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #bae6fd;
          }
          .entity-badge {
            font-size: 11px;
            font-family: monospace;
            padding: 2px 7px;
            border-radius: 5px;
            background: rgba(51, 65, 85, 0.85);
            color: #fde047;
            border: 1px solid rgba(250, 204, 21, 0.3);
          }

          /* Danh sách Lịch sử các cuộc họp */
          .session-card {
            background: rgba(30, 41, 59, 0.78);
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 12px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            transition: all 0.15s ease;
          }
          .session-card:hover {
            border-color: #38bdf8;
            background: rgba(30, 41, 59, 0.95);
          }
          .session-card.current-live {
            border-left: 4px solid #22c55e;
            border-color: rgba(34, 197, 94, 0.45);
          }
          .session-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
          }
          .session-title {
            font-size: 13px;
            font-weight: 700;
            color: #f8fafc;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
          .session-meta {
            font-size: 11px;
            color: #94a3b8;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .session-summary-preview {
            font-size: 12px;
            color: #cbd5e1;
            background: rgba(15, 23, 42, 0.65);
            padding: 6px 9px;
            border-radius: 8px;
            border-left: 2px solid #38bdf8;
            line-height: 1.45;
          }
          .session-actions {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            margin-top: 2px;
          }

          /* Quick Reply */
          .phrase-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
          .phrase-chip {
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.22);
            color: #e2e8f0;
            padding: 7px 9px;
            border-radius: 8px;
            font-size: 11.5px;
            text-align: left;
            cursor: pointer;
            transition: all 0.15s;
          }
          .phrase-chip:hover {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.14);
          }
          .tone-group {
            display: flex;
            gap: 6px;
          }
          .tone-btn, .reply-lang-btn {
            flex: 1;
            padding: 6px 8px;
            font-size: 11.5px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(30, 41, 59, 0.7);
            color: #cbd5e1;
            cursor: pointer;
          }
          .tone-btn.active, .reply-lang-btn.active {
            background: rgba(14, 165, 233, 0.25);
            border-color: #38bdf8;
            color: #38bdf8;
            font-weight: 600;
          }
          .reply-textarea {
            width: 100%;
            min-height: 62px;
            background: rgba(15, 23, 42, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 10px;
            color: #fff;
            padding: 8px 10px;
            font-size: 12.5px;
            resize: vertical;
            outline: none;
            font-family: inherit;
          }
          .reply-textarea:focus {
            border-color: #38bdf8;
          }
          .reply-result-card {
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 12px;
            padding: 11px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .reply-ja {
            font-size: 15.5px;
            font-weight: 700;
            color: #f8fafc;
            line-height: 1.45;
          }
          .reply-romaji-box {
            background: rgba(245, 158, 11, 0.14);
            border: 1px dashed rgba(251, 191, 36, 0.5);
            border-radius: 8px;
            padding: 7px 10px;
          }
          .reply-romaji-title {
            font-size: 10.5px;
            text-transform: uppercase;
            color: #fbbf24;
            font-weight: 700;
            margin-bottom: 3px;
          }
          .reply-romaji-text {
            font-size: 13.5px;
            color: #fde68a;
            font-weight: 600;
            line-height: 1.45;
          }
          .reply-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }

          /* Khung xem File Tổng Hợp trực tiếp trong Drawer */
          .file-card {
            background: rgba(2, 6, 23, 0.75);
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .file-card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 11px;
            background: rgba(30, 41, 59, 0.9);
            border-bottom: 1px solid rgba(148, 163, 184, 0.2);
            gap: 6px;
            flex-wrap: wrap;
          }
          .file-name-tag {
            font-size: 11.5px;
            font-weight: 700;
            color: #38bdf8;
          }
          .file-card-body {
            padding: 9px 11px;
            max-height: 190px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.55;
            color: #e2e8f0;
          }

          .md-view h1, .md-view h2, .md-view h3, .md-view h4 {
            color: #38bdf8;
            margin: 8px 0 4px 0;
            line-height: 1.35;
          }
          .md-view h2 { font-size: 13.5px; border-bottom: 1px solid rgba(148,163,184,0.18); padding-bottom: 3px; }
          .md-view h3 { font-size: 12.5px; color: #f8fafc; }
          .md-view p { margin: 4px 0; }
          .md-view ul { margin: 4px 0; padding-left: 18px; }
          .md-view li { margin-bottom: 3px; }
          .md-view strong { color: #fde047; }
          .md-view em { color: #94a3b8; }
          .md-view blockquote {
            margin: 6px 0;
            padding: 6px 10px;
            border-left: 3px solid #a855f7;
            background: rgba(88, 28, 135, 0.2);
            border-radius: 6px;
            font-size: 11.5px;
          }
          .md-view code {
            background: rgba(51, 65, 85, 0.8);
            padding: 1px 5px;
            border-radius: 4px;
            font-family: monospace;
            color: #7dd3fc;
          }

          .chat-box-container {
            display: flex;
            flex-direction: column;
            gap: 7px;
            background: rgba(30, 41, 59, 0.55);
            border: 1px solid rgba(168, 85, 247, 0.35);
            border-radius: 12px;
            padding: 9px;
          }
          .quick-prompt-row {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
          }
          .prompt-chip {
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(168, 85, 247, 0.35);
            color: #e9d5ff;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 999px;
            cursor: pointer;
            transition: all 0.15s;
          }
          .prompt-chip:hover {
            background: rgba(168, 85, 247, 0.25);
            border-color: #c084fc;
            color: #fff;
          }
          .chat-messages {
            max-height: 190px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding-right: 3px;
          }
          .chat-msg {
            padding: 7px 10px;
            border-radius: 10px;
            font-size: 12px;
            line-height: 1.5;
          }
          .chat-msg.user {
            background: rgba(2, 132, 199, 0.28);
            border: 1px solid rgba(56, 189, 248, 0.4);
            align-self: flex-end;
            max-width: 92%;
            color: #f0f9ff;
          }
          .chat-msg.assistant {
            background: rgba(15, 23, 42, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.25);
            align-self: stretch;
            color: #e2e8f0;
          }
          .chat-msg-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 10.5px;
            color: #94a3b8;
            margin-bottom: 4px;
            gap: 6px;
          }
          .chat-msg-actions {
            display: flex;
            gap: 5px;
            margin-top: 6px;
            flex-wrap: wrap;
          }
          .chat-input-row {
            display: flex;
            gap: 6px;
            align-items: flex-end;
          }
          .chat-input {
            flex: 1;
            min-height: 38px;
            max-height: 85px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(148, 163, 184, 0.35);
            border-radius: 9px;
            color: #fff;
            padding: 7px 9px;
            font-size: 12px;
            resize: vertical;
            outline: none;
            font-family: inherit;
          }
          .chat-input:focus {
            border-color: #c084fc;
          }

          .transcript-list {
            flex: 1;
            min-height: 140px;
            max-height: 290px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding-right: 4px;
          }
          .transcript-entry {
            background: rgba(30, 41, 59, 0.65);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-left: 3px solid #38bdf8;
            border-radius: 9px;
            padding: 7px 10px;
            font-size: 12px;
          }
          .transcript-entry-head {
            display: flex;
            justify-content: space-between;
            color: #38bdf8;
            font-weight: 600;
            font-size: 11px;
            margin-bottom: 3px;
          }
          .transcript-entry-ja {
            color: #cbd5e1;
            margin-bottom: 3px;
            line-height: 1.4;
            white-space: pre-wrap;
          }
          .transcript-entry-vi {
            color: #4ade80;
            font-weight: 600;
            line-height: 1.4;
            white-space: pre-wrap;
          }

          /* CỬA SỔ LỚN XEM DANH SÁCH LỊCH SỬ CUỘC HỌP & NỘI DUNG TỔNG HỢP */
          .file-viewer-modal {
            position: fixed;
            top: 38px;
            left: 50%;
            transform: translateX(-50%);
            width: min(1040px, 96vw);
            height: min(84vh, 760px);
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border: 1px solid rgba(56, 189, 248, 0.5);
            border-radius: 16px;
            box-shadow: 0 25px 65px rgba(0, 0, 0, 0.78);
            z-index: 2147483645;
            display: none;
            flex-direction: column;
            overflow: hidden;
          }
          .file-viewer-modal.open {
            display: flex;
          }
          .file-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 16px;
            background: rgba(30, 41, 59, 0.96);
            border-bottom: 1px solid rgba(148, 163, 184, 0.22);
            cursor: move;
            user-select: none;
            gap: 10px;
            flex-wrap: wrap;
          }
          .file-modal-body {
            flex: 1;
            display: grid;
            grid-template-columns: 260px 1.25fr 0.95fr;
            overflow: hidden;
          }
          @media (max-width: 900px) {
            .file-modal-body {
              grid-template-columns: 1fr;
            }
          }
          .file-modal-sidebar {
            padding: 12px;
            overflow-y: auto;
            border-right: 1px solid rgba(148, 163, 184, 0.18);
            background: rgba(2, 6, 23, 0.75);
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .sidebar-session-item {
            padding: 8px 10px;
            border-radius: 9px;
            background: rgba(30, 41, 59, 0.65);
            border: 1px solid rgba(148, 163, 184, 0.2);
            cursor: pointer;
            transition: all 0.15s;
          }
          .sidebar-session-item:hover {
            border-color: #38bdf8;
          }
          .sidebar-session-item.active {
            background: rgba(14, 165, 233, 0.2);
            border-color: #38bdf8;
          }
          .file-modal-doc-pane {
            padding: 14px 18px;
            overflow-y: auto;
            border-right: 1px solid rgba(148, 163, 184, 0.18);
            background: rgba(2, 6, 23, 0.45);
          }
          .file-modal-chat-pane {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 9px;
            overflow: hidden;
            background: rgba(15, 23, 42, 0.88);
          }
          .file-modal-chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-right: 4px;
          }

          /* Settings */
          .field-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .field-group label {
            font-size: 11.5px;
            color: #cbd5e1;
            font-weight: 600;
          }
          .field-input, .field-select {
            background: rgba(15, 23, 42, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 8px;
            color: #fff;
            padding: 7px 9px;
            font-size: 12.5px;
          }
          .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #0ea5e9;
            color: #fff;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 12.5px;
            font-weight: 600;
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
            z-index: 2147483647;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
          }
          .toast.show {
            opacity: 1;
          }
        </style>

        <!-- 1. KHUNG PHỤ ĐỀ NỔI ĐA NGÔN NGỮ (EN ⇄ JA ⇄ VI) CHUẨN IT INFRA -->
        <div class="floating-box" id="floatingBox">
          <div class="box-header" id="dragHandle">
            <div class="brand-group">
              <span class="brand-badge">EN•JA•VI | IT Infra</span>
              <select class="lang-pair-select" id="quickSourceLang" title="Ngôn ngữ người nói trên Google Meet">
                <option value="auto">🌐 Tự nhận diện (EN/JA/VI)</option>
                <option value="ja">🇯🇵 Tiếng Nhật (JA)</option>
                <option value="en">🇬🇧 Tiếng Anh (EN)</option>
                <option value="vi">🇻🇳 Tiếng Việt (VI)</option>
              </select>
              <span style="color:#94a3b8; font-size:11px;">➔</span>
              <select class="lang-pair-select" id="quickTargetLang" title="Ngôn ngữ bản dịch hiển thị">
                <option value="vi">🇻🇳 Dịch sang Việt</option>
                <option value="ja">🇯🇵 Dịch sang Nhật</option>
                <option value="en">🇬🇧 Dịch sang Anh</option>
              </select>
              <span class="status-pill" id="statusPill" title="Bấm để tự động bật phụ đề Google Meet">
                ⏳ Đang kết nối...
              </span>
              <span class="turn-count-pill" id="subtitleTurnCount" title="Tổng số câu đã tự động ngắt và lưu">
                0 câu
              </span>
            </div>
            <div class="toolbar-actions">
              <button class="tool-btn active" id="btnToggleSmartBreak" title="Bật/tắt Tự động ngắt câu thông minh theo ý nghĩa & nhịp nghỉ (không đợi người khác chen vào)">
                🧠 Tự ngắt câu
              </button>
              <button class="tool-btn" id="btnForceBreakTurn" title="Ngắt ngay câu hiện tại sang dòng mới">
                ✂️ Ngắt câu
              </button>
              <button class="tool-btn" id="btnModeSwitch" title="Chuyển đổi giữa Bắt Phụ Đề Meet và Thu Âm Thanh AI">
                📝 CC Meet
              </button>
              <button class="tool-btn" id="btnPickRegion" title="Click chọn khung phụ đề thủ công nếu Google đổi giao diện">
                🎯 Chọn CC
              </button>
              <button class="tool-btn" id="btnToggleRomaji" title="Bật/tắt dòng phiên âm Romaji trên phụ đề">
                Romaji
              </button>
              <button class="tool-btn" id="btnExpandSubBox" title="Mở rộng / Thu gọn chiều cao vùng cuộn phụ đề">
                ↕️ Cao hơn
              </button>
              <button class="tool-btn" id="btnFontDec" title="Giảm cỡ chữ">A-</button>
              <button class="tool-btn" id="btnFontInc" title="Tăng cỡ chữ">A+</button>
              <button class="tool-btn accent" id="btnOpenFileModal" title="Xem Danh sách Lịch sử các cuộc họp & Nội dung tổng hợp cuộc họp đang trao đổi những gì">
                📚 Lịch sử & Tổng hợp
              </button>
              <button class="tool-btn primary" id="btnOpenDrawer" title="Mở bảng Tóm tắt trực tiếp, Lịch sử & Trả lời nhanh">
                💬 Bảng Trợ Lý
              </button>
              <button class="tool-btn" id="btnMinimize" title="Thu gọn / Mở rộng khung phụ đề">_</button>
            </div>
          </div>

          <div class="subtitle-body" id="subtitleBody">
            <div class="empty-hint" id="emptyHint">
              💡 Hãy bật <b>Phụ đề (Captions: Nhật / Anh / Việt)</b> trên Google Meet.<br/>
              Hệ thống sẽ <b>tự động ngắt câu thông minh theo ý nghĩa & nhịp nghỉ</b> (không đợi người khác chen vào), bám sát ngữ cảnh phụ đề Meet để <b>dịch chuẩn thuật ngữ IT Infra</b> và <b>tự động lưu vào Lịch sử cuộc họp</b>!
            </div>
          </div>

          <div class="scroll-resume-bar" id="scrollResumeBar">
            ⬇️ Bạn đang cuộn xem lại câu trước • Bấm vào đây để nhảy xuống câu đang nói mới nhất
          </div>
        </div>

        <!-- 2. CỬA SỔ LỚN: DANH SÁCH LỊCH SỬ CÁC CUỘC HỌP + NỘI DUNG TỔNG HỢP + CHAT AI -->
        <div class="file-viewer-modal" id="fileViewerModal">
          <div class="file-modal-header" id="fileModalDragHandle">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="brand-badge">📚 HISTORY & SUMMARY</span>
              <strong style="font-size:13.5px; color:#f8fafc;" id="liveFileTitle">
                Tổng Hợp & Lịch Sử Cuộc Họp
              </strong>
              <span style="font-size:11.5px; color:#94a3b8;" id="liveFileStats">
                (Tự động lưu lịch sử)
              </span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <button class="tool-btn primary" id="btnModalRefreshSummary" title="Tổng hợp chi tiết nội dung cuộc họp đang chọn">
                ✨ Cập nhật Tổng hợp
              </button>
              <button class="tool-btn accent" id="btnModalHealUntranslated" title="Dịch bù ngay tất cả các câu đang bị kẹt ở 'Đang dịch...' trong lịch sử cuộc họp">
                🔄 Dịch bù câu thiếu
              </button>
              <button class="tool-btn" id="btnModalNewSession" title="Tạo một bản ghi phiên họp mới trong danh sách lịch sử">
                ➕ Phiên họp mới
              </button>
              <button class="tool-btn" id="btnModalAttachFile" title="Đính kèm file tài liệu/agenda (.md, .txt, .csv, .json) để đối chiếu">
                📎 Nạp File
              </button>
              <button class="tool-btn" id="btnModalDownloadMd" title="Tải Biên Bản Tổng Hợp định dạng Markdown (.md)">
                📥 Tải .MD
              </button>
              <button class="tool-btn" id="btnModalDownloadDoc" title="Tải Biên Bản mở bằng Microsoft Word (.doc)">
                📄 Tải .DOC
              </button>
              <button class="tool-btn" id="btnModalCopyAll" title="Copy toàn bộ nội dung cuộc họp đang xem">
                📋 Copy
              </button>
              <button class="tool-btn" id="btnCloseFileModal">✕ Đóng</button>
            </div>
          </div>

          <div class="file-modal-body">
            <!-- Cột 1: Danh sách các cuộc họp đã lưu -->
            <div class="file-modal-sidebar">
              <div class="section-label">
                <span>📚 Danh sách cuộc họp (<span id="modalSessionCount">1</span>)</span>
              </div>
              <div id="modalSessionList" style="display:flex; flex-direction:column; gap:7px;"></div>
            </div>

            <!-- Cột 2: Nội dung Tổng hợp cuộc họp đang trao đổi những gì + Chi tiết câu thoại -->
            <div class="file-modal-doc-pane md-view" id="fileModalDocPane"></div>

            <!-- Cột 3: Chat với AI để hỏi đáp & yêu cầu Summary tùy chỉnh -->
            <div class="file-modal-chat-pane">
              <div class="section-label">
                <span>🤖 Hỏi AI về cuộc họp đang chọn</span>
                <span style="font-size:10.5px; color:#c084fc;">IT Infra Assistant</span>
              </div>

              <div class="quick-prompt-row" id="modalQuickPrompts"></div>

              <div class="file-modal-chat-messages" id="modalChatMessages"></div>

              <div class="chat-input-row">
                <textarea
                  class="chat-input"
                  id="modalChatInput"
                  placeholder="Hỏi bất kỳ nội dung gì về cuộc họp này (VD: Cuộc họp đang bàn những thông số server nào? Có mục QA nào cần lưu ý?)..."
                ></textarea>
                <button class="tool-btn primary" id="btnModalSendChat" style="padding:10px 12px;">
                  ➤ Gửi
                </button>
              </div>
            </div>
          </div>
        </div>

        <input type="file" id="hiddenFileInput" accept=".md,.txt,.csv,.json,.log" style="display:none;" />

        <!-- 3. SIDE DRAWER 4 TAB: ĐANG TRAO ĐỔI GÌ | LỊCH SỬ HỌP | TRẢ LỜI NHANH | CẤU HÌNH -->
        <div class="side-drawer" id="sideDrawer">
          <div class="drawer-header">
            <span class="drawer-title">🌐 Trợ Lý Họp IT Infra (EN ⇄ JA ⇄ VI)</span>
            <div style="display:flex; gap:6px;">
              <button class="tool-btn accent" id="btnDrawerOpenFileModal" title="Mở cửa sổ lớn xem Danh sách Lịch sử & Tổng hợp">
                📖 Mở Cửa Sổ Lớn
              </button>
              <button class="tool-btn" id="btnCloseDrawer">✕</button>
            </div>
          </div>

          <div class="drawer-tabs">
            <button class="tab-btn active" data-tab="digest">📌 Đang bàn gì (<span id="transcriptCount">0</span>)</button>
            <button class="tab-btn" data-tab="history">📚 Lịch sử (<span id="historyTabCount">0</span>)</button>
            <button class="tab-btn" data-tab="reply">💬 Trả lời</button>
            <button class="tab-btn" data-tab="settings">⚙️ Cài đặt</button>
          </div>

          <!-- TAB 1: CUỘC HỌP ĐANG TRAO ĐỔI NHỮNG GÌ & BIÊN BẢN TRỰC TIẾP -->
          <div class="tab-panel active" id="panel-digest">
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
              <button class="tool-btn primary" id="btnSummarizeMeeting">✨ Tổng hợp chi tiết ngay</button>
              <button class="tool-btn accent" id="btnHealUntranslated" title="Tự động dịch bù các câu bị kẹt ở Đang dịch...">🔄 Dịch bù câu thiếu</button>
              <button class="tool-btn accent" id="btnExpandFileFromTab">📖 Xem lớn</button>
              <button class="tool-btn" id="btnExportMd">📥 .MD</button>
              <button class="tool-btn" id="btnExportDoc">📄 .DOC</button>
              <button class="tool-btn" id="btnCopyTranscript">📋 Copy</button>
              <button class="tool-btn" id="btnAttachFileFromTab" title="Đính kèm file tài liệu">📎 File</button>
            </div>

            <!-- Thẻ Tóm tắt Tự động: Cuộc họp đang trao đổi những gì -->
            <div class="digest-box" id="liveDigestBox">
              <div class="section-label" style="margin-bottom:0;">
                <span>📌 Tóm tắt nhanh: Cuộc họp đang trao đổi gì?</span>
                <span style="color:#4ade80; font-size:10px;">● Auto-Updated</span>
              </div>
              <div class="digest-headline" id="digestHeadline">Chưa có câu thoại nào được ghi nhận.</div>
              <div class="chip-list" id="digestTopics"></div>
              <div class="chip-list" id="digestEntities"></div>
            </div>

            <!-- Khung Bản Tổng Hợp Chi Tiết -->
            <div class="file-card">
              <div class="file-card-header">
                <span class="file-name-tag" id="drawerFileNameTag">📄 Bản Tổng Hợp Nội Dung Cuộc Họp</span>
                <button class="tool-btn" id="btnCopySummaryOnly" style="padding:2px 7px; font-size:11px;">📋 Copy Tóm tắt</button>
              </div>
              <div class="file-card-body md-view" id="summaryBox">
                <div class="empty-hint" style="padding:4px 0;">
                  Bấm <b>"✨ Tổng hợp chi tiết ngay"</b> hoặc chọn gợi ý ở khung Chat bên dưới để tạo biên bản tổng hợp đầy đủ.
                </div>
              </div>
            </div>

            <!-- Khu vực Chat yêu cầu Summary -->
            <div class="chat-box-container">
              <div class="section-label">
                <span>💬 Hỏi AI / Yêu cầu tóm tắt cuộc họp</span>
                <span style="font-size:10px; color:#c084fc;">Enter để gửi</span>
              </div>
              <div class="quick-prompt-row" id="drawerQuickPrompts"></div>
              <div class="chat-messages" id="drawerChatMessages"></div>
              <div class="chat-input-row">
                <textarea
                  class="chat-input"
                  id="drawerChatInput"
                  placeholder="VD: Cuộc họp đang trao đổi những thông số nào? Tóm tắt ý của anh Kamimura..."
                ></textarea>
                <button class="tool-btn primary" id="btnDrawerSendChat" style="padding:8px 10px;">
                  ➤ Gửi
                </button>
              </div>
            </div>

            <div class="section-label">
              <span>🗣️ Danh sách câu thoại đã ngắt nghĩa</span>
              <span style="font-size:10.5px; color:#38bdf8;">Mới nhất ở trên</span>
            </div>
            <div class="transcript-list" id="transcriptList">
              <div class="empty-hint">Chưa có câu thoại nào.</div>
            </div>
          </div>

          <!-- TAB 2: DANH SÁCH LỊCH SỬ CÁC CUỘC HỌP ĐÃ LƯU -->
          <div class="tab-panel" id="panel-history">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
              <div class="section-label" style="margin:0;">
                <span>📚 Danh sách các cuộc họp đã lưu</span>
              </div>
              <div style="display:flex; gap:5px;">
                <button class="tool-btn primary" id="btnStartNewSession">➕ Tạo phiên họp mới</button>
                <button class="tool-btn" id="btnRefreshHistory">🔄 Làm mới</button>
              </div>
            </div>
            <div style="font-size:11.5px; color:#94a3b8; line-height:1.4;">
              Mọi cuộc họp đều được <b>lưu tự động</b> theo thời gian thực. Bấm vào bất kỳ cuộc họp nào để xem lại <b>nội dung tổng hợp cuộc họp đó đã trao đổi những gì</b> và toàn bộ lời thoại.
            </div>
            <div id="drawerHistoryList" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>

          <!-- TAB 3: HỖ TRỢ TRẢ LỜI NHANH (TIẾNG NHẬT & TIẾNG ANH IT INFRA) -->
          <div class="tab-panel" id="panel-reply">
            <div>
              <div class="section-label">🌐 Ngôn ngữ bạn muốn dùng để phát biểu / chat</div>
              <div class="tone-group">
                <button class="reply-lang-btn active" data-reply-lang="ja">🇯🇵 Trả lời bằng Tiếng Nhật</button>
                <button class="reply-lang-btn" data-reply-lang="en">🇬🇧 Trả lời bằng Tiếng Anh</button>
              </div>
            </div>

            <div>
              <div class="section-label">⚡ Mẫu câu IT Infra cấp tốc (Click để dùng ngay)</div>
              <div class="phrase-grid" id="quickPhraseGrid"></div>
            </div>

            <div>
              <div class="section-label">🎯 Phong cách giao tiếp</div>
              <div class="tone-group">
                <button class="tone-btn active" data-tone="teinei">Lịch sự chuẩn (Team)</button>
                <button class="tone-btn" data-tone="keigo">Trang trọng (Sếp/KH)</button>
                <button class="tone-btn" data-tone="chat">Ngắn gọn (Chat Meet)</button>
              </div>
            </div>

            <div>
              <div class="section-label">✍️ Nhập ý bạn muốn nói bằng Tiếng Việt hoặc Anh (Enter để dịch)</div>
              <textarea
                class="reply-textarea"
                id="replyInput"
                placeholder="VD: Thông số SELinux ở mục 1.3 hiện chưa có ảnh chụp màn hình, nhờ anh kiểm tra và chạy lệnh getenforce giúp ạ..."
              ></textarea>
              <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                <button class="tool-btn primary" id="btnGenerateReply">
                  ✨ Tạo câu trả lời chuẩn IT Infra + Phiên âm
                </button>
              </div>
            </div>

            <div class="reply-result-card" id="replyResultCard" style="display:none;">
              <div class="section-label" id="replyProviderTag">🇯🇵 Câu gợi ý</div>
              <div class="reply-ja" id="replyJaText"></div>

              <div class="reply-romaji-box">
                <div class="reply-romaji-title">🗣️ Cách đọc / Phiên âm (Bật mic đọc luôn):</div>
                <div class="reply-romaji-text" id="replyRomajiText"></div>
              </div>

              <div style="font-size:12px; color:#94a3b8;" id="replyTipText"></div>

              <div class="reply-actions">
                <button class="tool-btn primary" id="btnInsertMeetChat">
                  📨 Điền vào Chat Meet
                </button>
                <button class="tool-btn" id="btnCopyJa">📋 Copy câu</button>
                <button class="tool-btn" id="btnSpeakJa">🔊 Nghe đọc mẫu</button>
              </div>
            </div>
          </div>

          <!-- TAB 4: CẤU HÌNH ĐA NGÔN NGỮ & AI IT INFRA -->
          <div class="tab-panel" id="panel-settings">
            <div class="field-group">
              <label>Ngôn ngữ phụ đề thu nhận (Source Language):</label>
              <select class="field-select" id="cfgSourceLang">
                <option value="auto">🌐 Tự động nhận diện (Tiếng Nhật / Tiếng Anh / Tiếng Việt)</option>
                <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
                <option value="en">🇬🇧 Tiếng Anh (English)</option>
                <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
              </select>
            </div>

            <div class="field-group">
              <label>Ngôn ngữ đích hiển thị chính (Target Language):</label>
              <select class="field-select" id="cfgTargetLang">
                <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
                <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
                <option value="en">🇬🇧 Tiếng Anh (English)</option>
              </select>
            </div>

            <div class="field-group">
              <label>Khi người nói nói Tiếng Việt thì tự dịch sang:</label>
              <select class="field-select" id="cfgSecondaryTargetLang">
                <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
                <option value="en">🇬🇧 Tiếng Anh (English)</option>
              </select>
            </div>

            <div class="field-group">
              <label>Chế độ ngắt câu thông minh (Smart Semantic Break):</label>
              <select class="field-select" id="cfgSmartBreak">
                <option value="true">🧠 Tự động ngắt câu theo ý nghĩa & nhịp nghỉ (~1.1s) - Khuyên dùng</option>
                <option value="false">🗣️ Chỉ ngắt khi đổi người nói hoặc bấm nút Ngắt câu</option>
              </select>
            </div>

            <div class="field-group">
              <label>Cơ chế thu nhận trên Google Meet:</label>
              <select class="field-select" id="cfgCaptureMode">
                <option value="captions">📝 Bắt Live Captions của Google Meet (Chuẩn xác, có tên người nói)</option>
                <option value="audio">🎙️ Thu âm thanh trực tiếp từ Tab (Audio AI)</option>
              </select>
            </div>

            <div class="field-group">
              <label>Chế độ dịch (Translation Engine):</label>
              <select class="field-select" id="cfgTranslationMode">
                <option value="dual">⚡ Kép: Google Translate (Tức thì) + AI (Chuẩn ngữ cảnh IT Infra)</option>
                <option value="google">🌐 Chỉ dùng Google Translate + Từ điển IT Infra (Miễn phí 100%)</option>
                <option value="ai">✨ Chỉ dùng AI (Cần API Key)</option>
              </select>
            </div>

            <div class="field-group">
              <label>Nhà cung cấp AI:</label>
              <select class="field-select" id="cfgAiProvider">
                <option value="gemini">Google Gemini (gemini-2.5-flash)</option>
                <option value="groq">Groq Cloud (Llama 3.3 70B + Whisper Turbo)</option>
                <option value="openai">OpenAI (GPT-4o-mini + Whisper-1)</option>
              </select>
            </div>

            <div class="field-group">
              <label>API Key (Tùy chọn cho chế độ Kép, bắt buộc cho Thu Audio):</label>
              <input
                type="password"
                class="field-input"
                id="cfgApiKey"
                placeholder="Dán Gemini / Groq / OpenAI API Key vào đây..."
              />
            </div>

            <div class="field-group">
              <label>Từ điển IT Infra bổ sung (Mỗi dòng: Thuật ngữ gốc = Nghĩa):</label>
              <textarea
                class="reply-textarea"
                id="cfgGlossary"
                placeholder="VD:&#10;現調 = khảo sát hiện trạng (現調)&#10;疎通確認 = kiểm tra thông mạng"
              ></textarea>
            </div>

            <button class="tool-btn primary" id="btnSaveSettings" style="justify-content:center; padding:9px;">
              💾 Lưu cấu hình
            </button>
          </div>
        </div>

        <div class="toast" id="toast"></div>
      `;

      this.renderQuickPhrases();
      this.renderQuickPromptChips();
      this.renderChatMessages();
      this.applyDynamicStyles();
      this.updateHeaderStatus();
      this.syncSettingsForm();
      this.renderLiveDigestCard();
      this.renderHistoryList();
      this.renderLiveFileModalContent();
    }

    renderQuickPhrases() {
      const grid = this.shadow.getElementById("quickPhraseGrid");
      if (!grid) return;
      grid.innerHTML = QUICK_PHRASES.map(
        (p, idx) =>
          `<button class="phrase-chip" data-idx="${idx}" title="${this.escapeHtml(p.vi)}">${this.escapeHtml(
            p.label
          )}</button>`
      ).join("");

      grid.querySelectorAll(".phrase-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const item = QUICK_PHRASES[Number(btn.dataset.idx)];
          if (!item) return;
          const isEn = this.replyTargetLang === "en";
          this.showReplyResult({
            japanese: isEn ? item.en : item.ja,
            romaji: isEn ? "(Đọc trực tiếp câu tiếng Anh bên trên)" : item.romaji,
            pronunciationTip: `Nghĩa: ${item.vi}`,
            alternativeChat: isEn ? item.en : item.ja,
            lang: this.replyTargetLang,
            provider: "preset"
          });
        });
      });
    }

    renderQuickPromptChips() {
      const html = SUMMARY_QUICK_PROMPTS.map(
        (item, idx) =>
          `<button class="prompt-chip" data-idx="${idx}" title="${this.escapeHtml(item.prompt)}">${this.escapeHtml(
            item.label
          )}</button>`
      ).join("");

      const drawerPrompts = this.shadow.getElementById("drawerQuickPrompts");
      const modalPrompts = this.shadow.getElementById("modalQuickPrompts");
      if (drawerPrompts) drawerPrompts.innerHTML = html;
      if (modalPrompts) modalPrompts.innerHTML = html;

      this.shadow.querySelectorAll(".prompt-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const item = SUMMARY_QUICK_PROMPTS[Number(chip.dataset.idx)];
          if (item) {
            this.handleSendSummaryChat(item.prompt);
          }
        });
      });
    }

    applyDynamicStyles() {
      const box = this.shadow?.getElementById("floatingBox");
      if (!box) return;
      box.style.setProperty("--sub-font-size", `${this.settings.fontSize || 18}px`);

      const romajiBtn = this.shadow.getElementById("btnToggleRomaji");
      if (romajiBtn) {
        romajiBtn.classList.toggle("active", Boolean(this.settings.showRomajiOnSubtitles));
      }

      const smartBreakBtn = this.shadow.getElementById("btnToggleSmartBreak");
      if (smartBreakBtn) {
        const enabled = this.settings.smartBreakEnabled !== false;
        smartBreakBtn.classList.toggle("active", enabled);
        smartBreakBtn.textContent = enabled ? "🧠 Tự ngắt câu" : "🗣️ Gộp theo lượt";
      }

      const quickSrc = this.shadow.getElementById("quickSourceLang");
      const quickTgt = this.shadow.getElementById("quickTargetLang");
      if (quickSrc) quickSrc.value = this.settings.sourceLang || "auto";
      if (quickTgt) quickTgt.value = this.settings.targetLang || "vi";

      this.renderSubtitles();
    }

    updateHeaderStatus() {
      const statusPill = this.shadow?.getElementById("statusPill");
      const modeBtn = this.shadow?.getElementById("btnModeSwitch");
      if (!statusPill || !modeBtn) return;

      if (this.settings.captureMode === "audio" || this.audioCapturing) {
        modeBtn.textContent = "🎙️ Thu Audio AI";
        modeBtn.classList.add("active");
        statusPill.className = "status-pill audio";
        statusPill.textContent = this.statusMessage || "🔴 Đang thu & dịch Audio trực tiếp";
      } else {
        modeBtn.textContent = "📝 CC Meet";
        modeBtn.classList.remove("active");
        if (this.captionStatus?.hasCaptionContainer) {
          statusPill.className = "status-pill ok";
          statusPill.textContent = "🟢 Đang dịch CC Meet (Tự ngắt nghĩa IT Infra)";
        } else {
          statusPill.className = "status-pill warn";
          statusPill.textContent = "🟡 Bấm để bật Phụ đề (CC) trên Meet";
        }
      }
    }

    renderSubtitles() {
      const body = this.shadow?.getElementById("subtitleBody");
      const turnCountEl = this.shadow?.getElementById("subtitleTurnCount");
      const resumeBar = this.shadow?.getElementById("scrollResumeBar");
      if (!body) return;

      if (turnCountEl) {
        turnCountEl.textContent = `${this.subtitleItems.length} câu`;
      }

      if (this.subtitleItems.length === 0) {
        body.innerHTML = `
          <div class="empty-hint">
            💡 ${
              this.settings.captureMode === "audio"
                ? "Đang lắng nghe âm thanh từ cuộc họp Google Meet (EN / JA / VI)..."
                : "Hãy bật <b>Phụ đề (Captions: Tiếng Nhật / Anh / Việt)</b> trên Google Meet. Phụ đề sẽ được <b>tự động ngắt câu theo ý nghĩa</b>, dịch sát thuật ngữ <b>IT Infra</b> và tự động lưu vào Lịch sử cuộc họp."
            }
          </div>
        `;
        if (resumeBar) resumeBar.classList.remove("visible");
        return;
      }

      const prevScrollTop = body.scrollTop;

      body.innerHTML = this.subtitleItems
        .map((item, idx) => {
          const isLatest = idx === this.subtitleItems.length - 1;
          const isAI = String(item.provider || "").startsWith("ai-");
          const engineLabel = isAI ? "✨ AI IT Infra" : "⚡ IT Infra Fast";
          const showRomaji = this.settings.showRomajiOnSubtitles && item.romaji;
          const srcBadge = LANG_BADGE[item.sourceLang || "ja"] || "🌐";
          const tgtBadge = LANG_BADGE[item.targetLang || "vi"] || "🇻🇳 VI";

          return `
            <div class="utt-item ${isLatest ? "current" : "history"}" data-id="${this.escapeHtml(item.id)}">
              <div class="utt-meta">
                <span class="speaker-name">
                  🗣️ #${idx + 1} ${this.escapeHtml(item.speaker || "Đồng nghiệp")}
                  <span class="lang-tag">${srcBadge} ➔ ${tgtBadge}</span>
                  ${
                    item.isSpeaking
                      ? `<span class="speaking-live-badge">🎙️ Đang nói...</span>`
                      : ""
                  }
                </span>
                <span class="engine-tag ${isAI ? "ai" : ""}">${engineLabel} • ${this.escapeHtml(item.time || "")}</span>
              </div>
              <div class="ja-line">${this.escapeHtml(item.ja || "")}</div>
              ${
                showRomaji
                  ? `<div class="romaji-line">${this.escapeHtml(item.romaji)}</div>`
                  : ""
              }
              <div class="vi-line">${
                item.vi
                  ? this.escapeHtml(item.vi)
                  : '<span style="color:#94a3b8;font-weight:400;">Đang dịch...</span>'
              }</div>
              ${
                item.note
                  ? `<div class="note-line">💡 IT Infra: ${this.escapeHtml(item.note)}</div>`
                  : ""
              }
            </div>
          `;
        })
        .join("");

      if (this.isSubtitleScrolledUp) {
        body.scrollTop = prevScrollTop;
        if (resumeBar) resumeBar.classList.add("visible");
      } else {
        body.scrollTop = body.scrollHeight;
        if (resumeBar) resumeBar.classList.remove("visible");
      }
    }

    /**
     * Render thẻ "Cuộc họp đang trao đổi gì?" theo thời gian thực
     */
    renderLiveDigestCard() {
      const headlineEl = this.shadow?.getElementById("digestHeadline");
      const topicsEl = this.shadow?.getElementById("digestTopics");
      const entitiesEl = this.shadow?.getElementById("digestEntities");
      if (!headlineEl || !topicsEl || !entitiesEl) return;

      const digest = this.computeClientDigest(this.transcriptList);
      headlineEl.textContent = digest.headline;

      if (digest.topics.length > 0) {
        topicsEl.innerHTML = digest.topics
          .map((t) => `<span class="topic-badge">${this.escapeHtml(t)}</span>`)
          .join("");
      } else {
        topicsEl.innerHTML = "";
      }

      if (digest.techEntities.length > 0) {
        entitiesEl.innerHTML = digest.techEntities
          .map((e) => `<span class="entity-badge">${this.escapeHtml(e)}</span>`)
          .join("");
      } else {
        entitiesEl.innerHTML = "";
      }
    }

    renderTranscriptList() {
      const countEl = this.shadow?.getElementById("transcriptCount");
      const listEl = this.shadow?.getElementById("transcriptList");
      if (countEl) countEl.textContent = String(this.transcriptList.length);
      if (!listEl) return;

      if (this.transcriptList.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">Chưa có câu thoại nào được ghi nhận.</div>`;
        return;
      }

      const prevScrollTop = listEl.scrollTop;
      const wasAtTop = prevScrollTop <= 20;

      listEl.innerHTML = this.transcriptList
        .slice()
        .reverse()
        .map((t, revIdx) => {
          const turnNum = this.transcriptList.length - revIdx;
          const srcBadge = LANG_BADGE[t.sourceLang || "ja"] || "🌐";
          const tgtBadge = LANG_BADGE[t.targetLang || "vi"] || "🇻🇳 VI";
          return `
            <div class="transcript-entry">
              <div class="transcript-entry-head">
                <span>#${turnNum} • 🗣️ ${this.escapeHtml(t.speaker || "Đồng nghiệp")} (${srcBadge}➔${tgtBadge}) ${
                  t.isSpeaking ? '<b style="color:#4ade80;">(Đang nói...)</b>' : ""
                }</span>
                <span>${this.escapeHtml(t.time || "")}</span>
              </div>
              <div class="transcript-entry-ja">${this.escapeHtml(t.ja || "")}</div>
              <div class="transcript-entry-vi">${this.escapeHtml(t.vi || "Đang dịch...")}</div>
            </div>
          `;
        })
        .join("");

      if (!wasAtTop) {
        listEl.scrollTop = prevScrollTop;
      }
    }

    /**
     * Render Danh sách Lịch sử các cuộc họp ở cả Tab Lịch sử (Side Drawer) và Sidebar của Cửa sổ lớn (Modal)
     */
    renderHistoryList() {
      const drawerList = this.shadow?.getElementById("drawerHistoryList");
      const modalSidebarList = this.shadow?.getElementById("modalSessionList");
      const tabCount = this.shadow?.getElementById("historyTabCount");
      const modalCount = this.shadow?.getElementById("modalSessionCount");

      // Luôn đảm bảo phiên hiện tại xuất hiện ở đầu danh sách nếu đã có hội thoại
      const currentDigest = this.computeClientDigest(this.transcriptList);
      const currentSessionEntry = {
        sessionId: this.currentSessionMeta.sessionId,
        meetCode: this.currentSessionMeta.meetCode,
        title: this.currentSessionMeta.title,
        updatedAtDisplay: "Đang diễn ra trực tiếp",
        utteranceCount: this.transcriptList.length,
        speakers: currentDigest.speakers,
        headline: currentDigest.headline,
        topics: currentDigest.topics,
        techEntities: currentDigest.techEntities,
        summaryMarkdown: this.latestSummaryMarkdown,
        transcript: this.transcriptList,
        isCurrentLive: true
      };

      const otherSessions = this.savedSessions.filter(
        (s) => s.sessionId !== this.currentSessionMeta.sessionId
      );
      const allSessions = [currentSessionEntry, ...otherSessions];

      if (tabCount) tabCount.textContent = String(allSessions.length);
      if (modalCount) modalCount.textContent = String(allSessions.length);

      if (drawerList) {
        drawerList.innerHTML = allSessions
          .map((s) => {
            const isCurrent = s.sessionId === this.currentSessionMeta.sessionId;
            const topicText =
              Array.isArray(s.topics) && s.topics.length > 0
                ? s.topics.join(" • ")
                : s.headline || "Chưa có tóm tắt chủ đề";
            const entitiesText =
              Array.isArray(s.techEntities) && s.techEntities.length > 0
                ? `<div style="margin-top:4px; font-family:monospace; font-size:11px; color:#fde047;">⚙️ ${this.escapeHtml(
                    s.techEntities.slice(0, 8).join(", ")
                  )}</div>`
                : "";

            return `
              <div class="session-card ${isCurrent ? "current-live" : ""}" data-session-id="${this.escapeHtml(
                s.sessionId
              )}">
                <div class="session-card-head">
                  <div class="session-title">
                    ${isCurrent ? '<span style="color:#4ade80;">🟢 [Đang họp]</span>' : "📁"}
                    <span>${this.escapeHtml(s.title || s.meetCode)}</span>
                  </div>
                  <span style="font-size:11px; color:#38bdf8; font-weight:700;">${
                    s.utteranceCount || 0
                  } câu</span>
                </div>
                <div class="session-meta">
                  <span>🕒 ${this.escapeHtml(s.updatedAtDisplay || "")}</span>
                  <span>👥 ${this.escapeHtml((s.speakers || []).join(", ") || "Chưa rõ")}</span>
                </div>
                <div class="session-summary-preview">
                  <strong>📌 Nội dung trao đổi:</strong> ${this.escapeHtml(topicText)}
                  ${entitiesText}
                </div>
                <div class="session-actions">
                  <button class="tool-btn primary btn-view-session" data-id="${this.escapeHtml(
                    s.sessionId
                  )}">
                    📖 Xem Tổng hợp & Hội thoại
                  </button>
                  <button class="tool-btn btn-rename-session" data-id="${this.escapeHtml(
                    s.sessionId
                  )}" data-title="${this.escapeHtml(s.title || "")}">
                    ✏️ Đổi tên
                  </button>
                  <button class="tool-btn btn-export-session-md" data-id="${this.escapeHtml(
                    s.sessionId
                  )}">
                    📥 Tải .MD
                  </button>
                  ${
                    !isCurrent
                      ? `<button class="tool-btn btn-delete-session" data-id="${this.escapeHtml(
                          s.sessionId
                        )}" style="color:#fda4af;">🗑️</button>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("");

        drawerList.querySelectorAll(".btn-view-session").forEach((btn) => {
          btn.addEventListener("click", () => {
            const sid = btn.dataset.id;
            this.viewingSessionId = sid === this.currentSessionMeta.sessionId ? null : sid;
            this.openFileModal();
          });
        });

        drawerList.querySelectorAll(".btn-rename-session").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = btn.dataset.id;
            const oldTitle = btn.dataset.title || "";
            const newTitle = window.prompt("Nhập tên dễ nhớ cho cuộc họp này:", oldTitle);
            if (!newTitle || !newTitle.trim()) return;
            if (sid === this.currentSessionMeta.sessionId) {
              this.currentSessionMeta.title = newTitle.trim();
            }
            await this.callbacks.onRenameMeetingSession?.(sid, newTitle.trim());
            const updatedList = await this.callbacks.onLoadMeetingSessions?.();
            if (updatedList) this.setSavedSessionsList(updatedList);
            this.showToast("Đã cập nhật tên cuộc họp!");
          });
        });

        drawerList.querySelectorAll(".btn-export-session-md").forEach((btn) => {
          btn.addEventListener("click", () => {
            const sid = btn.dataset.id;
            this.viewingSessionId = sid === this.currentSessionMeta.sessionId ? null : sid;
            this.exportMeetingFile("md");
          });
        });

        drawerList.querySelectorAll(".btn-delete-session").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = btn.dataset.id;
            const nextList = await this.callbacks.onDeleteMeetingSession?.(sid);
            if (nextList) this.setSavedSessionsList(nextList);
            if (this.viewingSessionId === sid) {
              this.viewingSessionId = null;
              this.renderLiveFileModalContent();
            }
            this.showToast("Đã xóa phiên họp khỏi lịch sử.");
          });
        });
      }

      if (modalSidebarList) {
        const activeSid = this.viewingSessionId || this.currentSessionMeta.sessionId;
        modalSidebarList.innerHTML = allSessions
          .map((s) => {
            const isCurrent = s.sessionId === this.currentSessionMeta.sessionId;
            const isSelected = s.sessionId === activeSid;
            return `
              <div class="sidebar-session-item ${isSelected ? "active" : ""}" data-id="${this.escapeHtml(
                s.sessionId
              )}">
                <div style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:3px;">
                  ${isCurrent ? "🟢 " : "📁 "}${this.escapeHtml(s.title || s.meetCode)}
                </div>
                <div style="font-size:10.5px; color:#94a3b8; margin-bottom:3px;">
                  ${this.escapeHtml(s.updatedAtDisplay || "")} • <b style="color:#38bdf8;">${
              s.utteranceCount || 0
            } câu</b>
                </div>
                <div style="font-size:11px; color:#cbd5e1; line-height:1.35;">
                  ${this.escapeHtml(s.headline || "Chưa có nội dung")}
                </div>
              </div>
            `;
          })
          .join("");

        modalSidebarList.querySelectorAll(".sidebar-session-item").forEach((itemEl) => {
          itemEl.addEventListener("click", () => {
            const sid = itemEl.dataset.id;
            this.viewingSessionId = sid === this.currentSessionMeta.sessionId ? null : sid;
            this.renderHistoryList();
            this.renderLiveFileModalContent();
            this.renderChatMessages();
          });
        });
      }
    }

    /**
     * Lấy đối tượng phiên họp đang được chọn để hiển thị/tổng hợp/xuất file
     */
    getActiveViewingSession() {
      if (!this.viewingSessionId || this.viewingSessionId === this.currentSessionMeta.sessionId) {
        const digest = this.computeClientDigest(this.transcriptList);
        return {
          sessionId: this.currentSessionMeta.sessionId,
          meetCode: this.currentSessionMeta.meetCode,
          title: this.currentSessionMeta.title,
          updatedAtDisplay: new Date().toLocaleString("vi-VN"),
          transcript: this.transcriptList,
          summaryMarkdown: this.latestSummaryMarkdown,
          chatHistory: this.summaryChatHistory,
          speakers: digest.speakers,
          headline: digest.headline,
          topics: digest.topics,
          techEntities: digest.techEntities,
          actionItems: digest.actionItems,
          isCurrentLive: true
        };
      }

      const found = this.savedSessions.find((s) => s.sessionId === this.viewingSessionId);
      if (found) {
        const digest = this.computeClientDigest(found.transcript || []);
        return {
          ...found,
          speakers: found.speakers || digest.speakers,
          headline: found.headline || digest.headline,
          topics: found.topics || digest.topics,
          techEntities: found.techEntities || digest.techEntities,
          actionItems: found.actionItems || digest.actionItems,
          isCurrentLive: false
        };
      }

      this.viewingSessionId = null;
      return this.getActiveViewingSession();
    }

    /**
     * Xây dựng nội dung Markdown đầy đủ của Cuộc họp đang chọn (Tổng hợp nội dung đang trao đổi + Toàn văn hội thoại)
     */
    buildCompiledMeetingFileMarkdown(targetSession = null) {
      const session = targetSession || this.getActiveViewingSession();
      const transcript = session.transcript || [];
      const speakers = session.speakers || [];

      const lines = [
        `# 📄 BIÊN BẢN & TỔNG HỢP CUỘC HỌP: ${session.title || "Google Meet"}`,
        `- **Mã phòng họp:** \`${session.meetCode || "meet"}\``,
        `- **Thời gian cập nhật:** ${session.updatedAtDisplay || new Date().toLocaleString("vi-VN")}`,
        `- **Tổng số câu thoại:** ${transcript.length} câu`,
        `- **Người tham gia (${speakers.length}):** ${speakers.join(", ") || "Chưa ghi nhận"}`
      ];

      if (session.topics && session.topics.length > 0) {
        lines.push(`- **Chủ đề đang trao đổi:** ${session.topics.join(" • ")}`);
      }
      if (session.techEntities && session.techEntities.length > 0) {
        lines.push(`- **Thông số / Lệnh / Server xuất hiện:** \`${session.techEntities.join("`, `")}\``);
      }
      if (this.attachedFile?.name && session.isCurrentLive) {
        lines.push(`- **File tài liệu đính kèm:** \`${this.attachedFile.name}\``);
      }
      lines.push("");

      lines.push(`## 📌 PHẦN I: NỘI DUNG TỔNG HỢP CUỘC HỌP ĐANG TRAO ĐỔI NHỮNG GÌ?`);
      if (session.summaryMarkdown) {
        lines.push(session.summaryMarkdown);
      } else if (transcript.length > 0) {
        lines.push(`### 🎯 Tóm tắt nhanh các điểm đang thảo luận`);
        lines.push(`- **Trọng tâm:** ${session.headline || "Đang thảo luận kỹ thuật"}`);
        if (session.actionItems && session.actionItems.length > 0) {
          lines.push(`- **Các câu xác nhận / Công việc cần chú ý:**`);
          session.actionItems.forEach((a) => {
            lines.push(`  - **[${a.time || ""}] ${a.speaker || ""}:** ${a.vi || a.text || a.ja || ""}`);
          });
        }
        lines.push(
          `> 💡 *Bấm nút **"✨ Cập nhật Tổng hợp"** ở phía trên để tổng hợp đầy đủ theo từng người nói và từng hạng mục IT Infra.*`
        );
      } else {
        lines.push(`*(Chưa có dữ liệu hội thoại trong phiên họp này)*`);
      }
      lines.push("");

      if (this.attachedFile?.content && session.isCurrentLive) {
        lines.push(`## 📎 PHẦN II: TÀI LIỆU ĐÍNH KÈM (${this.attachedFile.name})`);
        lines.push(String(this.attachedFile.content).slice(0, 4000));
        lines.push("");
      }

      lines.push(
        `## 🗣️ PHẦN ${
          this.attachedFile?.content && session.isCurrentLive ? "III" : "II"
        }: CHI TIẾT LỊCH SỬ HỘI THOẠI ĐÃ NGẮT CÂU (${transcript.length} CÂU)`
      );
      if (transcript.length === 0) {
        lines.push(`*(Chưa có câu thoại nào được ghi nhận)*`);
      } else {
        transcript.forEach((t, idx) => {
          const srcBadge = LANG_BADGE[t.sourceLang || "ja"] || "Gốc";
          const tgtBadge = LANG_BADGE[t.targetLang || "vi"] || "Dịch";
          lines.push(
            `### #${idx + 1} [${t.time || ""}] ${t.speaker || "Đồng nghiệp"}${
              t.isSpeaking ? " *(Đang nói...)*" : ""
            }`
          );
          lines.push(`- **${srcBadge}:** ${t.ja || ""}`);
          lines.push(`- **${tgtBadge}:** ${t.vi || "(Đang dịch...)"}`);
          if (t.note) {
            lines.push(`- **💡 Thuật ngữ IT Infra:** ${t.note}`);
          }
          lines.push("");
        });
      }

      return lines.join("\n");
    }

    renderLiveFileModalContent() {
      const docPane = this.shadow?.getElementById("fileModalDocPane");
      const titleEl = this.shadow?.getElementById("liveFileTitle");
      const statsEl = this.shadow?.getElementById("liveFileStats");
      const summaryBox = this.shadow?.getElementById("summaryBox");

      const activeSession = this.getActiveViewingSession();

      if (titleEl) {
        titleEl.textContent = `${activeSession.isCurrentLive ? "🟢 [Đang họp] " : "📁 [Lịch sử] "}${
          activeSession.title || "Cuộc họp Google Meet"
        }`;
      }

      if (statsEl) {
        statsEl.textContent = `${(activeSession.transcript || []).length} câu thoại • ${
          activeSession.updatedAtDisplay || ""
        }`;
      }

      if (summaryBox && this.latestSummaryMarkdown) {
        summaryBox.innerHTML = this.renderMarkdownToHtml(this.latestSummaryMarkdown);
      }

      if (docPane) {
        const fullMd = this.buildCompiledMeetingFileMarkdown(activeSession);
        const prevScroll = docPane.scrollTop;
        docPane.innerHTML = this.renderMarkdownToHtml(fullMd);
        docPane.scrollTop = prevScroll;
      }
    }

    renderChatMessages() {
      const drawerList = this.shadow?.getElementById("drawerChatMessages");
      const modalList = this.shadow?.getElementById("modalChatMessages");
      const activeSession = this.getActiveViewingSession();
      const history = activeSession.chatHistory || this.summaryChatHistory || [];

      const emptyHtml = `
        <div class="empty-hint" style="font-size:11.5px; padding:6px 0;">
          💬 Bấm chọn 1 chủ đề gợi ý phía trên hoặc đặt câu hỏi bất kỳ để xem cuộc họp đang trao đổi về những gì!
        </div>
      `;

      if (history.length === 0) {
        if (drawerList) drawerList.innerHTML = emptyHtml;
        if (modalList) modalList.innerHTML = emptyHtml;
        return;
      }

      const html = history
        .map((msg, idx) => {
          if (msg.role === "user") {
            return `
              <div class="chat-msg user">
                <div class="chat-msg-head">
                  <span>🧑 Yêu cầu của bạn</span>
                  <span>${this.escapeHtml(msg.time || "")}</span>
                </div>
                <div>${this.escapeHtml(msg.content)}</div>
              </div>
            `;
          }

          return `
            <div class="chat-msg assistant">
              <div class="chat-msg-head">
                <span style="color:#c084fc; font-weight:700;">✨ Tổng hợp (${this.escapeHtml(
                  msg.provider || "AI"
                )})</span>
                <span>${this.escapeHtml(msg.time || "")}</span>
              </div>
              <div class="md-view">${this.renderMarkdownToHtml(msg.content)}</div>
              <div class="chat-msg-actions">
                <button class="tool-btn primary btn-pin-summary" data-idx="${idx}" style="padding:3px 8px; font-size:11px;">
                  📌 Ghim làm Bản Tổng Hợp
                </button>
                <button class="tool-btn btn-copy-chat-msg" data-idx="${idx}" style="padding:3px 8px; font-size:11px;">
                  📋 Copy
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      [drawerList, modalList].forEach((container) => {
        if (!container) return;
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;

        container.querySelectorAll(".btn-pin-summary").forEach((btn) => {
          btn.addEventListener("click", () => {
            const msg = history[Number(btn.dataset.idx)];
            if (!msg) return;
            if (activeSession.isCurrentLive) {
              this.latestSummaryMarkdown = msg.content;
              this.lastSummaryTime = msg.time;
              this. callbacks.onForceSaveSession?.();
            } else {
              activeSession.summaryMarkdown = msg.content;
            }
            this.renderLiveFileModalContent();
            this.showToast("Đã cập nhật kết quả này vào Bản Tổng Hợp cuộc họp!");
          });
        });

        container.querySelectorAll(".btn-copy-chat-msg").forEach((btn) => {
          btn.addEventListener("click", () => {
            const msg = history[Number(btn.dataset.idx)];
            if (!msg) return;
            navigator.clipboard.writeText(msg.content);
            this.showToast("Đã copy nội dung tóm tắt!");
          });
        });
      });
    }

    openFileModal() {
      this.isFileModalOpen = true;
      const modal = this.shadow?.getElementById("fileViewerModal");
      if (modal) {
        modal.classList.add("open");
      }
      this.renderHistoryList();
      this.renderLiveFileModalContent();
      this.renderChatMessages();
    }

    openHistoryModal() {
      this.openFileModal();
    }

    closeFileModal() {
      this.isFileModalOpen = false;
      const modal = this.shadow?.getElementById("fileViewerModal");
      if (modal) {
        modal.classList.remove("open");
      }
    }

    async triggerFullSummary() {
      const activeSession = this.getActiveViewingSession();
      const targetTranscript = activeSession.transcript || [];

      const btnTab = this.shadow?.getElementById("btnSummarizeMeeting");
      const btnModal = this.shadow?.getElementById("btnModalRefreshSummary");
      if (btnTab) {
        btnTab.disabled = true;
        btnTab.textContent = "⏳ Đang tổng hợp...";
      }
      if (btnModal) {
        btnModal.disabled = true;
        btnModal.textContent = "⏳ Đang tổng hợp...";
      }

      try {
        const summary = await this.callbacks.onSummarizeMeeting?.(
          targetTranscript,
          activeSession.isCurrentLive ? this.attachedFile : null
        );
        const summaryText = summary || "Không có nội dung tóm tắt.";
        if (activeSession.isCurrentLive) {
          this.latestSummaryMarkdown = summaryText;
          this.hasAiSummary = Boolean(this.settings.apiKey);
          this.lastSummaryTime = new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
          });
          await this.callbacks.onForceSaveSession?.();
        } else {
          activeSession.summaryMarkdown = summaryText;
        }
        this.renderLiveFileModalContent();
        this.renderHistoryList();
        this.showToast("Đã cập nhật Bản Tổng Hợp cuộc họp thành công!");
      } catch (err) {
        this.showToast(`Lỗi tổng hợp: ${err.message || err}`);
      } finally {
        if (btnTab) {
          btnTab.disabled = false;
          btnTab.textContent = "✨ Tổng hợp chi tiết ngay";
        }
        if (btnModal) {
          btnModal.disabled = false;
          btnModal.textContent = "✨ Cập nhật Tổng hợp";
        }
      }
    }

    async handleSendSummaryChat(customPromptText) {
      const drawerInput = this.shadow?.getElementById("drawerChatInput");
      const modalInput = this.shadow?.getElementById("modalChatInput");
      const promptText = (
        customPromptText !== undefined
          ? customPromptText
          : (this.isFileModalOpen ? modalInput?.value : drawerInput?.value) ||
            drawerInput?.value ||
            modalInput?.value ||
            ""
      ).trim();

      if (!promptText) return;

      if (customPromptText === undefined) {
        if (drawerInput) drawerInput.value = "";
        if (modalInput) modalInput.value = "";
      }

      const activeSession = this.getActiveViewingSession();
      const targetTranscript = activeSession.transcript || [];
      const targetChatHistory = activeSession.isCurrentLive
        ? this.summaryChatHistory
        : activeSession.chatHistory || (activeSession.chatHistory = []);

      const nowTime = new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit"
      });

      targetChatHistory.push({
        role: "user",
        content: promptText,
        time: nowTime
      });
      this.renderChatMessages();

      const btnDrawer = this.shadow?.getElementById("btnDrawerSendChat");
      const btnModal = this.shadow?.getElementById("btnModalSendChat");
      if (btnDrawer) {
        btnDrawer.disabled = true;
        btnDrawer.textContent = "⏳...";
      }
      if (btnModal) {
        btnModal.disabled = true;
        btnModal.textContent = "⏳...";
      }

      try {
        const res = await this.callbacks.onChatSummary?.({
          prompt: promptText,
          transcript: targetTranscript,
          chatHistory: targetChatHistory.slice(0, -1),
          attachedFile: activeSession.isCurrentLive ? this.attachedFile : null
        });

        const answer = res?.answer || "Không nhận được phản hồi.";
        const replyTime = new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit"
        });

        targetChatHistory.push({
          role: "assistant",
          content: answer,
          provider: res?.provider || "AI",
          time: replyTime
        });

        if (activeSession.isCurrentLive) {
          this.latestSummaryMarkdown = answer;
          this.lastSummaryTime = replyTime;
          await this.callbacks.onForceSaveSession?.();
        } else {
          activeSession.summaryMarkdown = answer;
        }

        this.renderChatMessages();
        this.renderLiveFileModalContent();
      } catch (err) {
        targetChatHistory.push({
          role: "assistant",
          content: `⚠️ **Lỗi:** ${err.message || err}`,
          provider: "System",
          time: nowTime
        });
        this.renderChatMessages();
      } finally {
        if (btnDrawer) {
          btnDrawer.disabled = false;
          btnDrawer.textContent = "➤ Gửi";
        }
        if (btnModal) {
          btnModal.disabled = false;
          btnModal.textContent = "➤ Gửi";
        }
      }
    }

    exportMeetingFile(format = "md") {
      const activeSession = this.getActiveViewingSession();
      if (!(activeSession.transcript || []).length && !activeSession.summaryMarkdown) {
        this.showToast("Chưa có dữ liệu cuộc họp để xuất file.");
        return;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const safeCode = (activeSession.meetCode || "meet").replace(/[^a-z0-9-_]/gi, "-");
      const mdContent = this.buildCompiledMeetingFileMarkdown(activeSession);

      if (format === "doc") {
        const htmlDoc = `
          <html xmlns:o="urn:schemas-microsoft-com:office:office"
                xmlns:w="urn:schemas-microsoft-com:office:word"
                xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8" />
            <title>Biên Bản Cuộc Họp (${safeCode} - ${dateStr})</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b; }
              h1 { color: #0284c7; }
              h2 { color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 18px; }
              h3 { color: #334155; margin-bottom: 4px; }
              blockquote { background: #f1f5f9; border-left: 4px solid #6366f1; padding: 8px 12px; }
            </style>
          </head>
          <body>
            ${this.renderMarkdownToHtml(mdContent)}
          </body>
          </html>
        `;
        const blob = new Blob(["\ufeff", htmlDoc], { type: "application/msword;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Bien-Ban-Meet-${safeCode}-${dateStr}.doc`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast("Đã tải xuống File Tổng Hợp định dạng Word (.doc)!");
        return;
      }

      const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bien-Ban-Meet-${safeCode}-${dateStr}.md`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast("Đã tải xuống File Tổng Hợp (.md)!");
    }

    showReplyResult(res) {
      const card = this.shadow.getElementById("replyResultCard");
      const jaEl = this.shadow.getElementById("replyJaText");
      const rmEl = this.shadow.getElementById("replyRomajiText");
      const tipEl = this.shadow.getElementById("replyTipText");
      const tagEl = this.shadow.getElementById("replyProviderTag");

      this.currentReplyResult = res;
      card.style.display = "flex";
      jaEl.textContent = res.japanese || "";
      rmEl.textContent = res.romaji || "";
      tipEl.textContent = res.pronunciationTip || "";
      const isEn = res.lang === "en" || this.replyTargetLang === "en";
      tagEl.textContent = isEn
        ? "🇬🇧 Câu Tiếng Anh chuẩn IT Infra gợi ý"
        : "🇯🇵 Câu Tiếng Nhật chuẩn IT Infra gợi ý";
    }

    syncSettingsForm() {
      if (!this.shadow) return;
      const srcEl = this.shadow.getElementById("cfgSourceLang");
      const tgtEl = this.shadow.getElementById("cfgTargetLang");
      const secTgtEl = this.shadow.getElementById("cfgSecondaryTargetLang");
      const smartEl = this.shadow.getElementById("cfgSmartBreak");
      const capEl = this.shadow.getElementById("cfgCaptureMode");
      const transEl = this.shadow.getElementById("cfgTranslationMode");
      const provEl = this.shadow.getElementById("cfgAiProvider");
      const keyEl = this.shadow.getElementById("cfgApiKey");
      const glossEl = this.shadow.getElementById("cfgGlossary");

      if (srcEl) srcEl.value = this.settings.sourceLang || "auto";
      if (tgtEl) tgtEl.value = this.settings.targetLang || "vi";
      if (secTgtEl) secTgtEl.value = this.settings.secondaryTargetLang || "ja";
      if (smartEl) smartEl.value = String(this.settings.smartBreakEnabled !== false);
      if (capEl) capEl.value = this.settings.captureMode || "captions";
      if (transEl) transEl.value = this.settings.translationMode || "dual";
      if (provEl) provEl.value = this.settings.aiProvider || "gemini";
      if (keyEl) keyEl.value = this.settings.apiKey || "";
      if (glossEl && Array.isArray(this.settings.customGlossary)) {
        glossEl.value = this.settings.customGlossary.map((g) => `${g.ja} = ${g.vi}`).join("\n");
      }
    }

    bindEvents() {
      const floatingBox = this.shadow.getElementById("floatingBox");
      const dragHandle = this.shadow.getElementById("dragHandle");
      const subtitleBody = this.shadow.getElementById("subtitleBody");
      const scrollResumeBar = this.shadow.getElementById("scrollResumeBar");
      const fileViewerModal = this.shadow.getElementById("fileViewerModal");
      const fileModalDragHandle = this.shadow.getElementById("fileModalDragHandle");

      this.makeDraggable(floatingBox, dragHandle);
      this.makeDraggable(fileViewerModal, fileModalDragHandle);

      subtitleBody.addEventListener("scroll", () => {
        const distanceFromBottom =
          subtitleBody.scrollHeight - subtitleBody.scrollTop - subtitleBody.clientHeight;
        this.isSubtitleScrolledUp = distanceFromBottom > 42;
        scrollResumeBar.classList.toggle("visible", this.isSubtitleScrolledUp);
      });

      scrollResumeBar.addEventListener("click", () => {
        this.isSubtitleScrolledUp = false;
        subtitleBody.scrollTop = subtitleBody.scrollHeight;
        scrollResumeBar.classList.remove("visible");
      });

      // Đổi nhanh ngôn ngữ Nguồn / Đích ngay trên thanh nổi
      this.shadow.getElementById("quickSourceLang").addEventListener("change", (e) => {
        this.callbacks.onUpdateSettings?.({ sourceLang: e.target.value });
        this.showToast(`Đã chuyển ngôn ngữ nguồn: ${e.target.selectedOptions[0].text}`);
      });

      this.shadow.getElementById("quickTargetLang").addEventListener("change", (e) => {
        this.callbacks.onUpdateSettings?.({ targetLang: e.target.value });
        this.showToast(`Đã chuyển ngôn ngữ dịch: ${e.target.selectedOptions[0].text}`);
      });

      // Bật/tắt chế độ Tự động ngắt câu thông minh (Smart Break)
      this.shadow.getElementById("btnToggleSmartBreak").addEventListener("click", () => {
        const next = this.settings.smartBreakEnabled === false;
        this.callbacks.onUpdateSettings?.({ smartBreakEnabled: next });
        this.showToast(
          next
            ? "🧠 Đã bật: Tự động ngắt câu thông minh theo ý nghĩa & nhịp nghỉ!"
            : "🗣️ Đã chuyển sang: Gộp câu theo lượt người nói."
        );
      });

      this.shadow.getElementById("statusPill").addEventListener("click", () => {
        this.callbacks.onRequestEnableCaptions?.();
      });

      this.shadow.getElementById("btnModeSwitch").addEventListener("click", () => {
        const nextMode = this.settings.captureMode === "audio" ? "captions" : "audio";
        this.callbacks.onToggleCaptureMode?.(nextMode);
      });

      this.shadow.getElementById("btnPickRegion").addEventListener("click", () => {
        this.callbacks.onPickCaptionRegion?.();
      });

      this.shadow.getElementById("btnForceBreakTurn").addEventListener("click", () => {
        this.callbacks.onForceBreakTurn?.();
      });

      this.shadow.getElementById("btnToggleRomaji").addEventListener("click", () => {
        const next = !this.settings.showRomajiOnSubtitles;
        this.callbacks.onUpdateSettings?.({ showRomajiOnSubtitles: next });
      });

      const expandSubBtn = this.shadow.getElementById("btnExpandSubBox");
      expandSubBtn.addEventListener("click", () => {
        this.isSubtitleExpanded = !this.isSubtitleExpanded;
        floatingBox.classList.toggle("expanded", this.isSubtitleExpanded);
        expandSubBtn.classList.toggle("active", this.isSubtitleExpanded);
        expandSubBtn.textContent = this.isSubtitleExpanded ? "↕️ Thu vừa" : "↕️ Cao hơn";
      });

      this.shadow.getElementById("btnFontDec").addEventListener("click", () => {
        const next = Math.max(13, (this.settings.fontSize || 18) - 2);
        this.callbacks.onUpdateSettings?.({ fontSize: next });
      });
      this.shadow.getElementById("btnFontInc").addEventListener("click", () => {
        const next = Math.min(32, (this.settings.fontSize || 18) + 2);
        this.callbacks.onUpdateSettings?.({ fontSize: next });
      });

      this.shadow.getElementById("btnMinimize").addEventListener("click", () => {
        this.isMinimized = !this.isMinimized;
        floatingBox.classList.toggle("minimized", this.isMinimized);
      });

      this.shadow.getElementById("btnOpenFileModal").addEventListener("click", async () => {
        if (this.isFileModalOpen) {
          this.closeFileModal();
        } else {
          const list = await this.callbacks.onLoadMeetingSessions?.();
          if (list) this.setSavedSessionsList(list);
          this.openFileModal();
          if (!this.latestSummaryMarkdown && this.transcriptList.length > 0 && !this.viewingSessionId) {
            this.triggerFullSummary();
          }
        }
      });

      this.shadow.getElementById("btnDrawerOpenFileModal").addEventListener("click", () => {
        this.openFileModal();
      });
      this.shadow.getElementById("btnExpandFileFromTab").addEventListener("click", () => {
        this.viewingSessionId = null;
        this.openFileModal();
      });
      this.shadow.getElementById("btnCloseFileModal").addEventListener("click", () => {
        this.closeFileModal();
      });

      // Tạo phiên họp mới trong lịch sử
      const handleNewSession = async () => {
        const customTitle = window.prompt(
          "Nhập tên cho phiên họp mới (để trống sẽ tự đặt theo giờ hiện tại):",
          ""
        );
        if (customTitle === null) return;
        await this.callbacks.onStartNewMeetingSession?.(customTitle.trim());
        const list = await this.callbacks.onLoadMeetingSessions?.();
        if (list) this.setSavedSessionsList(list);
        this.showToast("Đã lưu phiên cũ và bắt đầu phiên họp mới!");
      };
      this.shadow.getElementById("btnStartNewSession").addEventListener("click", handleNewSession);
      this.shadow.getElementById("btnModalNewSession").addEventListener("click", handleNewSession);

      this.shadow.getElementById("btnRefreshHistory").addEventListener("click", async () => {
        await this.callbacks.onForceSaveSession?.();
        const list = await this.callbacks.onLoadMeetingSessions?.();
        if (list) this.setSavedSessionsList(list);
        this.showToast("Đã làm mới danh sách lịch sử cuộc họp!");
      });

      const sideDrawer = this.shadow.getElementById("sideDrawer");
      this.shadow.getElementById("btnOpenDrawer").addEventListener("click", () => {
        this.isDrawerOpen = !this.isDrawerOpen;
        sideDrawer.classList.toggle("open", this.isDrawerOpen);
      });
      this.shadow.getElementById("btnCloseDrawer").addEventListener("click", () => {
        this.isDrawerOpen = false;
        sideDrawer.classList.remove("open");
      });

      this.shadow.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const tab = btn.dataset.tab;
          this.shadow.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
          this.shadow.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
          btn.classList.add("active");
          this.shadow.getElementById(`panel-${tab}`)?.classList.add("active");
          if (tab === "history") {
            const list = await this.callbacks.onLoadMeetingSessions?.();
            if (list) this.setSavedSessionsList(list);
          }
        });
      });

      // Chọn ngôn ngữ trả lời nhanh (JA / EN)
      this.shadow.querySelectorAll(".reply-lang-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.replyTargetLang = btn.dataset.replyLang || "ja";
          this.shadow.querySelectorAll(".reply-lang-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
      });

      this.shadow.querySelectorAll(".tone-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectedTone = btn.dataset.tone;
          this.shadow.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
      });

      const triggerReply = async () => {
        const input = this.shadow.getElementById("replyInput");
        const genBtn = this.shadow.getElementById("btnGenerateReply");
        const text = (input.value || "").trim();
        if (!text) return;

        genBtn.disabled = true;
        genBtn.textContent = "⏳ Đang tạo câu trả lời...";
        try {
          const res = await this.callbacks.onGenerateQuickReply?.(
            text,
            this.selectedTone,
            this.replyTargetLang
          );
          if (res) {
            this.showReplyResult(res);
          }
        } catch (err) {
          this.showToast(`Lỗi: ${err.message || err}`);
        } finally {
          genBtn.disabled = false;
          genBtn.textContent = "✨ Tạo câu trả lời chuẩn IT Infra + Phiên âm";
        }
      };

      this.shadow.getElementById("btnGenerateReply").addEventListener("click", triggerReply);
      this.shadow.getElementById("replyInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          triggerReply();
        }
      });

      this.shadow.getElementById("btnCopyJa").addEventListener("click", () => {
        const text = this.currentReplyResult?.japanese || "";
        if (!text) return;
        navigator.clipboard.writeText(text);
        this.showToast("Đã copy câu trả lời!");
      });

      this.shadow.getElementById("btnSpeakJa").addEventListener("click", () => {
        const text = this.currentReplyResult?.japanese || "";
        if (!text || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = this.replyTargetLang === "en" ? "en-US" : "ja-JP";
        utter.rate = 0.94;
        window.speechSynthesis.speak(utter);
      });

      this.shadow.getElementById("btnInsertMeetChat").addEventListener("click", () => {
        const text =
          this.currentReplyResult?.alternativeChat || this.currentReplyResult?.japanese || "";
        if (!text) return;
        const inserted = this.tryInsertIntoMeetChat(text);
        navigator.clipboard.writeText(text);
        if (inserted) {
          this.showToast("Đã điền vào ô Chat của Google Meet (và copy vào Clipboard)!");
        } else {
          this.showToast("Đã copy câu trả lời! Hãy mở khung Chat của Meet và bấm Ctrl+V / Cmd+V.");
        }
      });

      this.shadow.getElementById("btnSummarizeMeeting").addEventListener("click", () => {
        this.viewingSessionId = null;
        this.triggerFullSummary();
      });
      this.shadow.getElementById("btnModalRefreshSummary").addEventListener("click", () => {
        this.triggerFullSummary();
      });

      const handleManualHeal = async () => {
        const btn1 = this.shadow.getElementById("btnHealUntranslated");
        const btn2 = this.shadow.getElementById("btnModalHealUntranslated");
        if (btn1) {
          btn1.disabled = true;
          btn1.textContent = "⏳ Đang dịch bù...";
        }
        if (btn2) {
          btn2.disabled = true;
          btn2.textContent = "⏳ Đang dịch bù...";
        }
        try {
          const healed = (await this.callbacks.onHealUntranslated?.()) || 0;
          if (healed > 0) {
            this.showToast(`✅ Đã dịch bù thành công ${healed} câu thoại trong lịch sử cuộc họp!`);
          } else {
            this.showToast("✅ Tất cả các câu thoại trong lịch sử cuộc họp đều đã có bản dịch đầy đủ!");
          }
        } catch (err) {
          this.showToast(`Lỗi khi dịch bù: ${err.message || err}`);
        } finally {
          if (btn1) {
            btn1.disabled = false;
            btn1.textContent = "🔄 Dịch bù câu thiếu";
          }
          if (btn2) {
            btn2.disabled = false;
            btn2.textContent = "🔄 Dịch bù câu thiếu";
          }
        }
      };

      this.shadow.getElementById("btnHealUntranslated")?.addEventListener("click", handleManualHeal);
      this.shadow.getElementById("btnModalHealUntranslated")?.addEventListener("click", handleManualHeal);

      const hiddenFileInput = this.shadow.getElementById("hiddenFileInput");
      const triggerFilePicker = () => hiddenFileInput.click();
      this.shadow.getElementById("btnAttachFileFromTab").addEventListener("click", triggerFilePicker);
      this.shadow.getElementById("btnModalAttachFile").addEventListener("click", triggerFilePicker);

      hiddenFileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          this.attachedFile = {
            name: file.name,
            content: String(reader.result || ""),
            size: file.size,
            updatedAt: new Date().toLocaleTimeString("vi-VN")
          };
          const tag = this.shadow.getElementById("drawerFileNameTag");
          if (tag) {
            tag.textContent = `📄 Bản Tổng Hợp (📎 ${file.name})`;
          }
          this.renderLiveFileModalContent();
          this.showToast(`Đã nạp file "${file.name}" vào cuộc họp!`);
        };
        reader.readAsText(file, "utf-8");
        hiddenFileInput.value = "";
      });

      this.shadow.getElementById("btnDrawerSendChat").addEventListener("click", () => {
        this.viewingSessionId = null;
        this.handleSendSummaryChat();
      });
      this.shadow.getElementById("drawerChatInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.viewingSessionId = null;
          this.handleSendSummaryChat();
        }
      });

      this.shadow.getElementById("btnModalSendChat").addEventListener("click", () => {
        this.handleSendSummaryChat();
      });
      this.shadow.getElementById("modalChatInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSendSummaryChat();
        }
      });

      this.shadow.getElementById("btnExportMd").addEventListener("click", () => {
        this.viewingSessionId = null;
        this.exportMeetingFile("md");
      });
      this.shadow.getElementById("btnModalDownloadMd").addEventListener("click", () => {
        this.exportMeetingFile("md");
      });
      this.shadow.getElementById("btnExportDoc").addEventListener("click", () => {
        this.viewingSessionId = null;
        this.exportMeetingFile("doc");
      });
      this.shadow.getElementById("btnModalDownloadDoc").addEventListener("click", () => {
        this.exportMeetingFile("doc");
      });

      this.shadow.getElementById("btnCopySummaryOnly").addEventListener("click", () => {
        const content = this.latestSummaryMarkdown || this.buildCompiledMeetingFileMarkdown();
        navigator.clipboard.writeText(content);
        this.showToast("Đã copy nội dung bản tổng hợp!");
      });

      const copyFullFile = () => {
        const content = this.buildCompiledMeetingFileMarkdown();
        navigator.clipboard.writeText(content);
        this.showToast("Đã copy toàn bộ nội dung cuộc họp!");
      };
      this.shadow.getElementById("btnCopyTranscript").addEventListener("click", copyFullFile);
      this.shadow.getElementById("btnModalCopyAll").addEventListener("click", copyFullFile);

      // Lưu cấu hình ở Tab 4
      this.shadow.getElementById("btnSaveSettings").addEventListener("click", () => {
        const sourceLang = this.shadow.getElementById("cfgSourceLang").value;
        const targetLang = this.shadow.getElementById("cfgTargetLang").value;
        const secondaryTargetLang = this.shadow.getElementById("cfgSecondaryTargetLang").value;
        const smartBreakEnabled = this.shadow.getElementById("cfgSmartBreak").value === "true";
        const captureMode = this.shadow.getElementById("cfgCaptureMode").value;
        const translationMode = this.shadow.getElementById("cfgTranslationMode").value;
        const aiProvider = this.shadow.getElementById("cfgAiProvider").value;
        const apiKey = this.shadow.getElementById("cfgApiKey").value.trim();
        const rawGloss = this.shadow.getElementById("cfgGlossary").value;

        const customGlossary = rawGloss
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.includes("="))
          .map((line) => {
            const [ja, ...rest] = line.split("=");
            return { ja: ja.trim(), vi: rest.join("=").trim() };
          })
          .filter((item) => item.ja && item.vi);

        this.callbacks.onUpdateSettings?.({
          sourceLang,
          targetLang,
          secondaryTargetLang,
          smartBreakEnabled,
          captureMode,
          translationMode,
          aiProvider,
          apiKey,
          customGlossary
        });
        this.showToast("Đã lưu cấu hình thành công!");
      });
    }

    makeDraggable(boxEl, handleEl) {
      if (!boxEl || !handleEl) return;
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      handleEl.addEventListener("mousedown", (e) => {
        if (
          e.target.closest("button") ||
          e.target.closest("select") ||
          e.target.closest("#statusPill")
        ) {
          return;
        }
        isDragging = true;
        const rect = boxEl.getBoundingClientRect();
        boxEl.style.transform = "none";
        boxEl.style.bottom = "auto";
        boxEl.style.left = `${rect.left}px`;
        boxEl.style.top = `${rect.top}px`;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;
      });

      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        boxEl.style.left = `${Math.max(8, initialLeft + dx)}px`;
        boxEl.style.top = `${Math.max(8, initialTop + dy)}px`;
      });

      window.addEventListener("mouseup", () => {
        isDragging = false;
      });
    }

    renderMarkdownToHtml(md) {
      if (!md) return "";
      const escaped = this.escapeHtml(md);
      const lines = escaped.split("\n");
      const out = [];
      let inList = false;

      const formatInline = (text) =>
        text
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`([^`]+)`/g, "<code>$1</code>");

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          continue;
        }

        if (line.startsWith("### ")) {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          out.push(`<h3>${formatInline(line.slice(4))}</h3>`);
        } else if (line.startsWith("## ")) {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          out.push(`<h2>${formatInline(line.slice(3))}</h2>`);
        } else if (line.startsWith("# ")) {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          out.push(`<h1>${formatInline(line.slice(2))}</h1>`);
        } else if (line.startsWith("&gt; ") || line.startsWith("> ")) {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          const quoteContent = line.replace(/^(&gt;|>)\s*/, "");
          out.push(`<blockquote>${formatInline(quoteContent)}</blockquote>`);
        } else if (/^[-*]\s+/.test(line)) {
          if (!inList) {
            out.push("<ul>");
            inList = true;
          }
          out.push(`<li>${formatInline(line.replace(/^[-*]\s+/, ""))}</li>`);
        } else {
          if (inList) {
            out.push("</ul>");
            inList = false;
          }
          out.push(`<p>${formatInline(line)}</p>`);
        }
      }

      if (inList) {
        out.push("</ul>");
      }
      return out.join("\n");
    }

    tryInsertIntoMeetChat(text) {
      const selectors = [
        'textarea[aria-label*="Send a message" i]',
        'textarea[aria-label*="Gửi tin nhắn" i]',
        'textarea[aria-label*="メッセージを送信" i]',
        'textarea[jsname="YPqjbf"]',
        'div[contenteditable="true"][role="textbox"]'
      ];
      for (const sel of selectors) {
        const input = document.querySelector(sel);
        if (input) {
          input.focus();
          if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
            input.value = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            input.textContent = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return true;
        }
      }
      return false;
    }

    showToast(msg) {
      const toast = this.shadow?.getElementById("toast");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 2800);
    }

    escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
  }

  window.MeetOverlayUI = MeetOverlayUI;
})();
