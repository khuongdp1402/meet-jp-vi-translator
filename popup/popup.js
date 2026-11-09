// popup/popup.js
const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openai: "gpt-4o-mini"
};

let currentSettings = {};
let isAudioCapturing = false;
let savedSessions = [];
let selectedSession = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [settingsRes, sessionsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    chrome.runtime.sendMessage({ type: "GET_MEETING_SESSIONS", includeTranscript: true })
  ]);

  currentSettings = settingsRes?.settings || {};
  isAudioCapturing = Boolean(settingsRes?.isAudioCapturing);
  savedSessions = sessionsRes?.sessions || [];

  populateForm(currentSettings);
  renderSessionList();
  bindEvents();
});

function populateForm(s) {
  setCaptureModeUI(s.captureMode || "captions");
  document.getElementById("sourceLang").value = s.sourceLang || "auto";
  document.getElementById("targetLang").value = s.targetLang || "vi";
  document.getElementById("smartBreakEnabled").checked = s.smartBreakEnabled !== false;
  document.getElementById("translationMode").value = s.translationMode || "dual";
  document.getElementById("aiProvider").value = s.aiProvider || "gemini";
  document.getElementById("aiModel").value =
    s.aiModel || DEFAULT_MODELS[s.aiProvider || "gemini"];
  document.getElementById("apiKey").value = s.apiKey || "";
  document.getElementById("fontSize").value = s.fontSize || 18;
  document.getElementById("showRomajiOnSubtitles").checked =
    s.showRomajiOnSubtitles !== false;
  updateAudioBtnText();
}

function renderSessionList() {
  const countEl = document.getElementById("sessionCount");
  const listEl = document.getElementById("sessionList");
  if (countEl) countEl.textContent = String(savedSessions.length);
  if (!listEl) return;

  if (savedSessions.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; color:#94a3b8; padding:24px 10px; line-height:1.5;">
        📭 Chưa có cuộc họp nào được lưu.<br/>
        Khi bạn tham gia phòng họp Google Meet và bật phụ đề, toàn bộ nội dung trao đổi & bản tổng hợp sẽ tự động lưu tại đây!
      </div>
    `;
    return;
  }

  listEl.innerHTML = savedSessions
    .map((s, idx) => {
      const topicStr =
        Array.isArray(s.topics) && s.topics.length > 0
          ? s.topics.join(" • ")
          : s.headline || "Cuộc họp Google Meet";
      const techStr =
        Array.isArray(s.techEntities) && s.techEntities.length > 0
          ? `<div style="margin-top:3px; color:#fde047; font-family:monospace; font-size:10.5px;">⚙️ ${escapeHtml(
              s.techEntities.slice(0, 6).join(", ")
            )}</div>`
          : "";

      return `
        <div class="session-item" data-idx="${idx}">
          <div class="session-item-head">
            <span class="session-item-title">📁 ${escapeHtml(s.title || s.meetCode)}</span>
            <span class="session-item-badge">${s.utteranceCount || 0} câu</span>
          </div>
          <div class="session-item-meta">
            🕒 ${escapeHtml(s.updatedAtDisplay || "")} • 👥 ${escapeHtml(
        (s.speakers || []).join(", ") || "Đồng nghiệp"
      )}
          </div>
          <div class="session-item-digest">
            <strong>📌 Đang/Đã trao đổi:</strong> ${escapeHtml(topicStr)}
            ${techStr}
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".session-item").forEach((el) => {
    el.addEventListener("click", () => {
      const session = savedSessions[Number(el.dataset.idx)];
      if (session) {
        openSessionDetail(session);
      }
    });
  });
}

function buildSessionFullText(s) {
  const lines = [
    `# BIÊN BẢN & TỔNG HỢP CUỘC HỌP: ${s.title || s.meetCode}`,
    `- Mã phòng họp: ${s.meetCode || ""}`,
    `- Thời gian: ${s.updatedAtDisplay || ""}`,
    `- Người tham gia: ${(s.speakers || []).join(", ") || "Đồng nghiệp"}`,
    `- Tổng số câu thoại: ${s.utteranceCount || (s.transcript || []).length}`,
    ""
  ];

  if (s.topics && s.topics.length > 0) {
    lines.push(`## 📌 CHỦ ĐỀ TRAO ĐỔI CHÍNH`);
    lines.push(s.topics.map((t) => `- ${t}`).join("\n"));
    lines.push("");
  }

  if (s.techEntities && s.techEntities.length > 0) {
    lines.push(`## ⚙️ THÔNG SỐ / LỆNH / SERVER ĐƯỢC NHẮC TỚI`);
    lines.push(s.techEntities.join(", "));
    lines.push("");
  }

  if (s.summaryMarkdown) {
    lines.push(`## 📋 BẢN TỔNG HỢP CHI TIẾT`);
    lines.push(s.summaryMarkdown);
    lines.push("");
  }

  lines.push(`## 🗣️ CHI TIẾT HỘI THOẠI (${(s.transcript || []).length} CÂU)`);
  (s.transcript || []).forEach((t, i) => {
    lines.push(
      `#${i + 1} [${t.time || ""}] ${t.speaker || "Đồng nghiệp"} (${(
        t.sourceLang || "ja"
      ).toUpperCase()} -> ${(t.targetLang || "vi").toUpperCase()}):`
    );
    lines.push(`  Gốc: ${t.ja || ""}`);
    lines.push(`  Dịch: ${t.vi || ""}`);
    lines.push("");
  });

  return lines.join("\n");
}

function openSessionDetail(session) {
  selectedSession = session;
  document.getElementById("historyListView").style.display = "none";
  document.getElementById("sessionDetailView").style.display = "block";
  document.getElementById("detailTitle").textContent = session.title || session.meetCode;
  document.getElementById("detailMeta").textContent = `${
    session.updatedAtDisplay || ""
  } • ${session.utteranceCount || 0} câu thoại • ${(session.speakers || []).join(", ")}`;
  document.getElementById("detailContent").textContent = buildSessionFullText(session);
}

function setCaptureModeUI(mode) {
  currentSettings.captureMode = mode;
  document.getElementById("modeCaptions").classList.toggle("active", mode === "captions");
  document.getElementById("modeAudio").classList.toggle("active", mode === "audio");
  document.getElementById("audioControlRow").style.display =
    mode === "audio" ? "block" : "none";
}

function updateAudioBtnText() {
  const btn = document.getElementById("btnToggleTabAudio");
  if (isAudioCapturing) {
    btn.textContent = "⏹️ Dừng thu Audio Tab";
  } else {
    btn.textContent = "🔴 Bắt đầu thu Audio Tab hiện tại";
  }
}

function bindEvents() {
  // Chuyển tab trong Popup
  document.querySelectorAll(".popup-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".popup-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tab}`)?.classList.add("active");
    });
  });

  document.getElementById("btnBackToList").addEventListener("click", () => {
    selectedSession = null;
    document.getElementById("sessionDetailView").style.display = "none";
    document.getElementById("historyListView").style.display = "block";
  });

  document.getElementById("btnDetailCopy").addEventListener("click", () => {
    if (!selectedSession) return;
    navigator.clipboard.writeText(buildSessionFullText(selectedSession));
    document.getElementById("btnDetailCopy").textContent = "✅ Đã Copy";
    setTimeout(() => {
      document.getElementById("btnDetailCopy").textContent = "📋 Copy";
    }, 1500);
  });

  document.getElementById("btnDetailDownloadMd").addEventListener("click", () => {
    if (!selectedSession) return;
    const content = buildSessionFullText(selectedSession);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bien-Ban-${selectedSession.meetCode || "Meet"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnClearAllHistory").addEventListener("click", async () => {
    if (!confirm("Bạn có chắc muốn xóa toàn bộ danh sách lịch sử cuộc họp đã lưu?")) return;
    await chrome.runtime.sendMessage({ type: "CLEAR_ALL_MEETING_SESSIONS" });
    savedSessions = [];
    renderSessionList();
  });

  document.getElementById("modeCaptions").addEventListener("click", () => {
    setCaptureModeUI("captions");
  });

  document.getElementById("modeAudio").addEventListener("click", () => {
    setCaptureModeUI("audio");
  });

  document.getElementById("aiProvider").addEventListener("change", (e) => {
    const provider = e.target.value;
    document.getElementById("aiModel").value = DEFAULT_MODELS[provider] || "";
  });

  document.getElementById("btnToggleTabAudio").addEventListener("click", async () => {
    await saveFormSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (isAudioCapturing) {
      await chrome.runtime.sendMessage({ type: "STOP_TAB_AUDIO" });
      isAudioCapturing = false;
      setCaptureModeUI("captions");
      updateAudioBtnText();
      showStatus("Đã dừng thu Audio.");
      return;
    }

    if (!activeTab?.id) {
      showStatus("Không tìm thấy tab đang mở.", true);
      return;
    }

    const startRes = await chrome.runtime.sendMessage({
      type: "START_TAB_AUDIO",
      tabId: activeTab.id
    });

    if (!startRes?.ok) {
      showStatus(startRes?.error || "Không thể bắt đầu thu Audio.", true);
      return;
    }

    isAudioCapturing = true;
    updateAudioBtnText();
    showStatus("Đang thu & dịch Audio trực tiếp từ Tab!");
  });

  document.getElementById("btnSave").addEventListener("click", async () => {
    await saveFormSettings();
    showStatus("✅ Đã lưu cài đặt và áp dụng cho Google Meet!");
  });
}

async function saveFormSettings() {
  const updated = {
    sourceLang: document.getElementById("sourceLang").value,
    targetLang: document.getElementById("targetLang").value,
    smartBreakEnabled: document.getElementById("smartBreakEnabled").checked,
    captureMode: currentSettings.captureMode || "captions",
    translationMode: document.getElementById("translationMode").value,
    aiProvider: document.getElementById("aiProvider").value,
    aiModel: document.getElementById("aiModel").value.trim(),
    apiKey: document.getElementById("apiKey").value.trim(),
    fontSize: Number(document.getElementById("fontSize").value) || 18,
    showRomajiOnSubtitles: document.getElementById("showRomajiOnSubtitles").checked
  };

  const res = await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: updated
  });
  if (res?.settings) {
    currentSettings = res.settings;
  }
}

function showStatus(msg, isError = false) {
  const el = document.getElementById("statusMsg");
  el.style.color = isError ? "#f87171" : "#4ade80";
  el.textContent = msg;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
