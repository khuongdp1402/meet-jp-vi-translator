// background/translators.js
// Bộ máy Dịch Đa Ngôn Ngữ (EN ⇄ JA ⇄ VI) Chuyên Sâu Ngành IT Infrastructure & Cloud Migration:
// - Hỗ trợ tự động nhận diện ngôn ngữ (Tiếng Nhật / Tiếng Anh / Tiếng Việt) hoặc dịch theo cặp tùy chọn.
// - Tối ưu hóa sát nghĩa cho ngành IT Infra (Linux/RHEL, Windows Server, Active Directory, Network, Proxy, Firewall, VMware, Cloud KCPS/AWS/Azure, Live Migration, 現調, Parameter Sheet...).
// - Tự động sửa lỗi nhận diện giọng nói (ASR) trên phụ đề Google Meet và bám sát ngữ cảnh các câu phụ đề liền trước để dịch chính xác.
// - Tạo Bản Tổng Hợp Trực Tiếp (Live Digest) & AI Summary cho lịch sử các cuộc họp.

const fastCache = new Map();
const aiCache = new Map();
const MAX_CACHE_SIZE = 600;

/**
 * Từ điển chuyên ngành IT Infrastructure, Cloud, Network & Vận hành Hệ thống (JA - EN - VI)
 */
export const DEFAULT_IT_GLOSSARY = [
  // Quy trình Khảo sát & Di trú Hạ tầng (Migration & Survey)
  { ja: "現調", en: "current environment survey", romaji: "genchou", vi: "khảo sát hiện trạng (現調)" },
  { ja: "現行調査", en: "existing system investigation", romaji: "genkou chousa", vi: "khảo sát hệ thống hiện tại" },
  { ja: "現行環境", en: "current environment", romaji: "genkou kankyou", vi: "môi trường hiện tại" },
  { ja: "現行設定", en: "current configuration", romaji: "genkou settei", vi: "cấu hình hiện tại" },
  { ja: "移行後設定", en: "post-migration configuration", romaji: "ikougo settei", vi: "cấu hình sau di trú (migration)" },
  { ja: "パラメータシート", en: "parameter sheet", romaji: "parameeta shiito", vi: "bảng thông số cấu hình (Parameter Sheet)" },
  { ja: "パラメーターシート", en: "parameter sheet", romaji: "parameetaa shiito", vi: "bảng thông số cấu hình (Parameter Sheet)" },
  { ja: "ライブマイグレーション", en: "live migration", romaji: "raibu maigureeshon", vi: "Live Migration (di trú nóng không tắt máy)" },
  { ja: "コールドマイグレーション", en: "cold migration", romaji: "koorudo maigureeshon", vi: "Cold Migration (tắt máy để di trú)" },
  { ja: "切り替え", en: "cutover / switchover", romaji: "kirikae", vi: "chuyển đổi hệ thống (cutover)" },
  { ja: "切り戻し", en: "rollback / fallback", romaji: "kirimodoshi", vi: "khôi phục về ban đầu (rollback / 切り戻し)" },
  { ja: "証跡", en: "evidence / log screenshot", romaji: "shouseki", vi: "bằng chứng / ảnh chụp kết quả (証跡)" },
  { ja: "エビデンス", en: "evidence", romaji: "ebidensu", vi: "bằng chứng kết quả (evidence)" },
  { ja: "疎通確認", en: "connectivity check", romaji: "sotsuu kakunin", vi: "kiểm tra thông mạng (疎通確認)" },
  { ja: "死活監視", en: "health check / alive monitoring", romaji: "shikatsu kanshi", vi: "giám sát trạng thái sống (health check)" },
  { ja: "参照系コマンド", en: "read-only command", romaji: "sanshoukei komando", vi: "lệnh chỉ đọc (read-only command)" },
  { ja: "踏み台", en: "bastion / jump host", romaji: "fumidai", vi: "máy chủ trung gian (Jump Host / Bastion)" },
  { ja: "踏み台サーバ", en: "bastion server / jump server", romaji: "fumidai saaba", vi: "máy chủ trung gian (Jump Server)" },
  { ja: "本番環境", en: "production environment", romaji: "honban kankyou", vi: "môi trường Production (本番)" },
  { ja: "検証環境", en: "staging / verification environment", romaji: "kenshou kankyou", vi: "môi trường Test/Kiểm thử (検証)" },
  { ja: "冗長化", en: "redundancy / HA", romaji: "jouchouka", vi: "cấu hình dự phòng HA (冗長化)" },
  { ja: "負荷分散", en: "load balancing", romaji: "fuka bunsan", vi: "cân bằng tải (Load Balancing)" },
  { ja: "フェイルオーバー", en: "failover", romaji: "feiru oobaa", vi: "chuyển dự phòng tự động (Failover)" },
  { ja: "停止時間", en: "downtime", romaji: "teishi jikan", vi: "thời gian gián đoạn (downtime)" },
  { ja: "サービス影響", en: "service impact", romaji: "saabisu eikyou", vi: "ảnh hưởng tới dịch vụ" },

  // Network, DNS, Proxy, Firewall
  { ja: "名前解決", en: "name resolution / DNS resolution", romaji: "namae kaiketsu", vi: "phân giải tên miền (DNS resolution)" },
  { ja: "スタティックルート", en: "static route", romaji: "sutatikku ruuto", vi: "định tuyến tĩnh (Static Route)" },
  { ja: "デフォルトゲートウェイ", en: "default gateway", romaji: "deforuto geetowei", vi: "Default Gateway" },
  { ja: "サブネットマスク", en: "subnet mask", romaji: "sabunetto masuku", vi: "Subnet Mask" },
  { ja: "プレフィックス", en: "network prefix", romaji: "purefikkusu", vi: "Prefix mạng (CIDR)" },
  { ja: "プロキシサーバ", en: "proxy server", romaji: "purokishi saaba", vi: "máy chủ Proxy" },
  { ja: "プロキシ", en: "proxy", romaji: "purokishi", vi: "Proxy" },
  { ja: "ファイアウォール", en: "firewall", romaji: "faiawooru", vi: "tường lửa (Firewall)" },
  { ja: "時刻同期", en: "time synchronization (NTP)", romaji: "jikoku douki", vi: "đồng bộ thời gian (NTP / Chrony)" },
  { ja: "ネットワーク設定", en: "network configuration", romaji: "nettowaaku settei", vi: "cấu hình mạng (Network)" },
  { ja: "ボンディング", en: "NIC bonding / teaming", romaji: "bondingu", vi: "gộp card mạng (NIC Bonding)" },
  { ja: "ポート開放", en: "port opening", romaji: "pooto kaihou", vi: "mở port mạng" },

  // OS, Linux/RHEL, Windows Server, Storage, Security
  { ja: "ホスト名", en: "hostname", romaji: "hosuto mei", vi: "tên máy chủ (Hostname)" },
  { ja: "ディスク構成", en: "disk layout / storage configuration", romaji: "disuku kousei", vi: "cấu hình phân vùng ổ đĩa (Disk Layout)" },
  { ja: "マウントポイント", en: "mount point", romaji: "maunto pointo", vi: "điểm gắn kết phân vùng (Mount Point)" },
  { ja: "スワップ領域", en: "swap space", romaji: "suwappu ryouiki", vi: "vùng nhớ Swap" },
  { ja: "除外設定", en: "exclusion setting", romaji: "jogai settei", vi: "cấu hình loại trừ (exclude)" },
  { ja: "除外フォルダ", en: "excluded folder", romaji: "jogai foruda", vi: "thư mục loại trừ quét virus" },
  { ja: "ウイルス対策ソフト", en: "antivirus software", romaji: "uirusu taisaku sofuto", vi: "phần mềm diệt virus (Antivirus/EDR)" },
  { ja: "既定値", en: "default value", romaji: "kiteichi", vi: "giá trị mặc định (Default)" },
  { ja: "インストールパッケージ", en: "installed packages", romaji: "insutooru pakkeeji", vi: "danh sách gói cài đặt (Installed Packages)" },
  { ja: "サービス一覧", en: "service list", romaji: "saabisu ichiran", vi: "danh sách dịch vụ (Services)" },
  { ja: "アクティブディレクトリ", en: "Active Directory", romaji: "akutibu direkutori", vi: "Active Directory (AD)" },
  { ja: "ドメインコントローラー", en: "Domain Controller", romaji: "domein kontorooraa", vi: "Domain Controller (DC)" },

  // Tài liệu & Giao tiếp dự án IT Nhật
  { ja: "基本設計書", en: "basic design document", romaji: "kihon sekkeisho", vi: "tài liệu thiết kế cơ bản (Basic Design)" },
  { ja: "詳細設計書", en: "detailed design document", romaji: "shousai sekkeisho", vi: "tài liệu thiết kế chi tiết (Detailed Design)" },
  { ja: "手順書", en: "procedure manual / runbook", romaji: "tejunsho", vi: "tài liệu quy trình thao tác (Runbook/Procedure)" },
  { ja: "構成図", en: "architecture / network topology diagram", romaji: "kouseizu", vi: "sơ đồ kiến trúc / sơ đồ mạng (Topology)" },
  { ja: "進捗", en: "progress", romaji: "shinchoku", vi: "tiến độ" },
  { ja: "工数", en: "man-hours / effort", romaji: "kousuu", vi: "effort / thời gian làm (man-hour)" },
  { ja: "仕様", en: "specification", romaji: "shiyou", vi: "đặc tả (spec)" },
  { ja: "議事録", en: "meeting minutes", romaji: "gijiroku", vi: "biên bản cuộc họp (Gijiroku)" },
  { ja: "課題", en: "issue / challenge", romaji: "kadai", vi: "vấn đề cần xử lý (issue)" },
  { ja: "対応", en: "handling / response / action", romaji: "taiou", vi: "xử lý / thực hiện" },
  { ja: "確認", en: "confirmation / verification", romaji: "kakunin", vi: "kiểm tra / xác nhận" },
  { ja: "共有", en: "sharing", romaji: "kyouyuu", vi: "chia sẻ" },
  { ja: "納期", en: "delivery deadline", romaji: "nouki", vi: "hạn bàn giao (deadline)" },
  { ja: "認識合わせ", en: "alignment of understanding", romaji: "ninshiki awase", vi: "thống nhất cách hiểu" },
  { ja: "お疲れ様です", en: "Hello everyone / Thank you for your hard work", romaji: "otsukaresama desu", vi: "Chào mọi người ạ" },
  { ja: "よろしくお願いします", en: "Thank you in advance / Nice to work with you", romaji: "yoroshiku onegaishimasu", vi: "Nhờ mọi người hỗ trợ ạ" },
  { ja: "失礼します", en: "Excuse me / Goodbye", romaji: "shitsurei shimasu", vi: "Tôi xin phép (chào kết thúc họp)" }
];

/**
 * Bảng sửa lỗi nhận diện âm thanh (ASR Correction) thường gặp của Google Meet Live Captions
 * đối với các thuật ngữ IT Infrastructure tiếng Nhật và tiếng Anh
 */
const MEET_ASR_INFRA_CORRECTIONS = [
  { pattern: /幻聴|現況調査/g, replacement: "現調" },
  { pattern: /そつう確認|疎通かくにん/g, replacement: "疎通確認" },
  { pattern: /しょうせき|小石を(とる|取る|貼る)/g, replacement: "証跡を$1" },
  { pattern: /きりもどし|切戻し/g, replacement: "切り戻し" },
  { pattern: /じょうちょうか/g, replacement: "冗長化" },
  { pattern: /しかつ監視/g, replacement: "死活監視" },
  { pattern: /ふみだい|踏台/g, replacement: "踏み台" },
  { pattern: /エスイーリナックス|SE\s*リナックス/gi, replacement: "SELinux" },
  { pattern: /アイフィルター|アイフィルタ/g, replacement: "i-FILTER" },
  { pattern: /パックサーバー|パックサーバ/g, replacement: "PACサーバ" },
  { pattern: /エーディーサーバー|エーディーサーバ/g, replacement: "ADサーバ" },
  { pattern: /レッドハット/g, replacement: "Red Hat (RHEL)" },
  { pattern: /システムシーティーエル/g, replacement: "systemctl" },
  { pattern: /エヌエムシーエルアイ/g, replacement: "nmcli" },
  { pattern: /リゾルブドットコンフ|リゾルブコンフ/g, replacement: "resolv.conf" },
  { pattern: /アイピーブイシックス/g, replacement: "IPv6" },
  { pattern: /アイピーブイフォー/g, replacement: "IPv4" },
  { pattern: /ライブマイグレーション/g, replacement: "ライブマイグレーション (Live Migration)" }
];

/**
 * Sửa các bản dịch máy (Google Translate) bị dịch nghĩa đen sai lệch trong ngữ cảnh IT Infra
 */
const POST_TRANSLATION_INFRA_REFINEMENTS_VI = [
  { pattern: /\bảo giác thính giác\b/gi, replacement: "khảo sát hiện trạng (現調)" },
  { pattern: /\bđiều tra hiện trường\b/gi, replacement: "khảo sát hiện trạng server (現調)" },
  { pattern: /\bbằng chứng dấu vết\b|\bdấu vết\b/gi, replacement: "ảnh chụp bằng chứng (証跡)" },
  { pattern: /\bবàn đạp\b|\bbục giẫm\b/gi, replacement: "máy chủ trung gian (Jump Host)" },
  { pattern: /\bgiải quyết tên\b/gi, replacement: "phân giải tên miền (DNS)" },
  { pattern: /\bgiám sát sự sống và cái chết\b|\bgiám sát sống chết\b/gi, replacement: "giám sát trạng thái sống (Health Check)" },
  { pattern: /\bquay lại cắt\b|\bcắt ngược lại\b/gi, replacement: "rollback (khôi phục về ban đầu)" },
  { pattern: /\bdi cư trực tiếp\b|\bdi trú trực tiếp\b/gi, replacement: "Live Migration" },
  { pattern: /\btờ tham số\b|\bbảng tham số\b/gi, replacement: "Parameter Sheet (bảng thông số)" },
  { pattern: /\btuyến đường tĩnh\b|\blộ trình tĩnh\b/gi, replacement: "Static Route" },
  { pattern: /\bcổng mặc định\b/gi, replacement: "Default Gateway" }
];

function setCache(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, value);
}

/**
 * Nhận diện nhanh ngôn ngữ của đoạn phụ đề: "ja" (Nhật) | "vi" (Việt) | "en" (Anh)
 */
export function detectLanguage(text) {
  const clean = (text || "").trim();
  if (!clean) return "ja";

  // 1. Kiểm tra ký tự Hiragana, Katakana, Kanji -> Tiếng Nhật
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(clean)) {
    return "ja";
  }

  // 2. Kiểm tra dấu thanh & nguyên âm đặc trưng Tiếng Việt
  const viDiacritics =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (viDiacritics.test(clean)) {
    return "vi";
  }

  // Kiểm tra các từ tiếng Việt phổ biến khi không gõ dấu
  if (
    /\b(cua|nhung|trong|khong|duoc|chung ta|anh|chi|em|viec|nay|phan|kiem tra|xac nhan|he thong)\b/i.test(
      clean
    )
  ) {
    return "vi";
  }

  // 3. Mặc định chữ Latin không dấu -> Tiếng Anh
  return "en";
}

/**
 * Xác định ngôn ngữ đích hợp lý khi người dùng chọn sourceLang = "auto":
 * - Nếu người nói nói Tiếng Nhật (ja) hoặc Tiếng Anh (en) và targetLang là "vi" -> dịch sang "vi".
 * - Nếu người nói nói trùng với ngôn ngữ đích (VD: người Việt nói "vi" khi targetLang = "vi"),
 *   tự động dịch sang ngôn ngữ phụ (mặc định là "ja" hoặc "en") để câu nói vẫn được dịch hữu ích.
 */
export function resolveLanguagePair(text, requestedSource = "auto", requestedTarget = "vi", fallbackTarget = "ja") {
  const detected = detectLanguage(text);
  const sourceLang = requestedSource && requestedSource !== "auto" ? requestedSource : detected;
  let targetLang = requestedTarget || "vi";

  if (sourceLang === targetLang) {
    if (sourceLang === "vi") {
      targetLang = fallbackTarget && fallbackTarget !== "vi" ? fallbackTarget : "ja";
    } else if (sourceLang === "ja") {
      targetLang = "vi";
    } else if (sourceLang === "en") {
      targetLang = "vi";
    }
  }

  return { sourceLang, targetLang, detectedLang: detected };
}

/**
 * Chuẩn hóa văn bản phụ đề Google Meet trước khi dịch (khắc phục lỗi ASR cho từ vựng IT Infra)
 */
export function normalizeMeetCaptionForITInfra(text) {
  let out = (text || "").trim();
  if (!out) return "";
  for (const rule of MEET_ASR_INFRA_CORRECTIONS) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

/**
 * Hậu xử lý bản dịch tiếng Việt để đảm bảo thuật ngữ IT Infra chuẩn xác
 */
function refineTranslatedInfraVi(viText) {
  let out = (viText || "").trim();
  if (!out) return "";
  for (const rule of POST_TRANSLATION_INFRA_REFINEMENTS_VI) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

/**
 * Tầng 1: Dịch siêu tốc miễn phí bằng Google Translate endpoint (không cần API key)
 * Hỗ trợ EN ⇄ JA ⇄ VI + chuẩn hóa thuật ngữ IT Infra + ngữ cảnh phụ đề liền trước
 */
export async function translateFastGoogle(
  text,
  sourceLang = "auto",
  targetLang = "vi",
  options = {}
) {
  const rawText = (text || "").trim();
  if (!rawText) {
    return {
      translatedText: "",
      romaji: "",
      sourceLang: "ja",
      targetLang: targetLang || "vi",
      provider: "google-free"
    };
  }

  const normalizedText = normalizeMeetCaptionForITInfra(rawText);
  const pair = resolveLanguagePair(
    normalizedText,
    sourceLang,
    targetLang,
    options.secondaryTargetLang || "ja"
  );

  const cacheKey = `${pair.sourceLang}:${pair.targetLang}:${normalizedText}`;
  if (fastCache.has(cacheKey)) {
    return fastCache.get(cacheKey);
  }

  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(pair.sourceLang)}` +
    `&tl=${encodeURIComponent(pair.targetLang)}` +
    `&dt=t&dt=rm&q=${encodeURIComponent(normalizedText)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Google Translate HTTP ${response.status}`);
  }

  const data = await response.json();
  let translatedText = "";
  let romaji = "";
  const apiDetectedLang = (typeof data?.[2] === "string" && data[2]) || pair.sourceLang;

  if (Array.isArray(data) && Array.isArray(data[0])) {
    for (const segment of data[0]) {
      if (!Array.isArray(segment)) continue;
      if (typeof segment[0] === "string") {
        translatedText += segment[0];
      }
      if (pair.sourceLang === "ja" && typeof segment[3] === "string" && segment[3].trim()) {
        romaji += (romaji ? " " : "") + segment[3].trim();
      } else if (pair.targetLang === "ja" && typeof segment[2] === "string" && segment[2].trim()) {
        romaji += (romaji ? " " : "") + segment[2].trim();
      }
    }
  }

  let finalTranslated = translatedText.trim();
  if (pair.targetLang === "vi") {
    finalTranslated = refineTranslatedInfraVi(finalTranslated);
  }

  const result = {
    translatedText: finalTranslated,
    romaji: romaji.trim(),
    sourceLang: apiDetectedLang,
    targetLang: pair.targetLang,
    provider: "google-free"
  };

  setCache(fastCache, cacheKey, result);
  return result;
}

/**
 * Xây dựng danh sách từ điển IT Infra để nhúng vào prompt AI
 */
function buildGlossaryText(customGlossary = []) {
  const combined = [...DEFAULT_IT_GLOSSARY, ...(Array.isArray(customGlossary) ? customGlossary : [])];
  return combined
    .map((item) => {
      const enPart = item.en ? ` / EN: ${item.en}` : "";
      const rmPart = item.romaji ? ` (${item.romaji})` : "";
      return `- ${item.ja}${rmPart}${enPart} => ${item.vi}`;
    })
    .join("\n");
}

const LANG_NAMES = {
  ja: "Tiếng Nhật (Japanese)",
  en: "Tiếng Anh (English)",
  vi: "Tiếng Việt (Vietnamese)"
};

/**
 * Tầng 2: Dịch chuẩn ngữ cảnh ngành IT Infrastructure & Cloud Migration bằng AI (Gemini / Groq / OpenAI).
 * Dựa trực tiếp vào đoạn phụ đề đang hiển thị trên Google Meet (liveCaptionContext) và các câu liền trước (recentContext)
 * để dịch sát nghĩa, tự động khôi phục chủ ngữ bị lược bỏ và sửa lỗi nhận diện âm thanh của Meet.
 */
export async function translateWithAI({
  text,
  speaker = "Đồng nghiệp",
  sourceLang = "auto",
  targetLang = "vi",
  recentContext = [],
  liveCaptionContext = "",
  settings = {}
}) {
  const rawText = (text || "").trim();
  if (!rawText) return null;

  const provider = settings.aiProvider || "gemini";
  const apiKey = (settings.apiKey || "").trim();
  if (!apiKey) {
    return null;
  }

  const normalizedText = normalizeMeetCaptionForITInfra(rawText);
  const pair = resolveLanguagePair(
    normalizedText,
    sourceLang || settings.sourceLang || "auto",
    targetLang || settings.targetLang || "vi",
    settings.secondaryTargetLang || "ja"
  );

  const recentSig = recentContext
    .slice(-2)
    .map((c) => (c.ja || c.sourceText || "").slice(-40))
    .join("|");
  const cacheKey = `${provider}:${pair.sourceLang}:${pair.targetLang}:${speaker}:${normalizedText}:${recentSig}`;
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  const contextLines = recentContext
    .slice(-6)
    .map(
      (c, i) =>
        `#${i + 1} [${c.speaker || "Speaker"}] (${(c.sourceLang || "ja").toUpperCase()}): "${
          c.ja || c.sourceText || ""
        }" -> (${(c.targetLang || "vi").toUpperCase()}): "${c.vi || c.translatedText || ""}"`
    )
    .join("\n");

  const glossaryText = buildGlossaryText(settings.customGlossary);
  const srcName = LANG_NAMES[pair.sourceLang] || pair.sourceLang;
  const tgtName = LANG_NAMES[pair.targetLang] || pair.targetLang;

  const systemPrompt = `Bạn là Chuyên gia Phiên dịch Cabin cao cấp chuyên ngành Hạ tầng CNTT (IT Infrastructure, System Administration, Linux/RHEL, Windows Server, Active Directory, Network, Proxy, Firewall, VMware, Cloud AWS/Azure/KCPS, Server Migration) cho cuộc họp trên Google Meet.

Nhiệm vụ: Dịch câu phụ đề hiện tại từ ${srcName} sang ${tgtName} một cách SÁT NGHĨA KỸ THUẬT IT INFRA, tự nhiên, gãy gọn.

Quy tắc bắt buộc:
1. DỰA VÀO NGỮ CẢNH PHỤ ĐỀ GOOGLE MEET: Phụ đề tự động của Google Meet thường bị lỗi đồng âm (ASR errors) hoặc lược bỏ chủ ngữ (đặc biệt trong tiếng Nhật/Anh). Hãy đối chiếu với "Ngữ cảnh các câu liền trước" và "Đoạn phụ đề đang chạy trên Meet" để hiểu chính xác người nói đang nói về thông số nào, lệnh nào, file cấu hình nào hay server nào.
2. CHUẨN THUẬT NGỮ IT INFRASTRUCTURE:
   - Giữ nguyên hoặc dịch chuẩn xác các thuật ngữ hạ tầng: Parameter Sheet, Live Migration, Rollback (切り戻し), Cutover (切り替え), Khảo sát hiện trạng (現調), Bằng chứng/Screenshot (証跡/Evidence), Kiểm tra thông mạng (疎通確認), Giám sát sống còn/Health check (死活監視), Jump Host/Bastion (踏み台), HA/Redundancy (冗長化), DNS Name Resolution (名前解決), Static Route, Default Gateway, Subnet/Prefix, SELinux, Kdump, Swap, LVM, Mount point, Firewalld, Chrony/NTP, Proxy, PAC, Active Directory (AD), Production (本番), Staging/Test (検証)...
   - Giữ nguyên tên lệnh Linux/Windows, đường dẫn file, IP, tên cột Excel (VD: /etc/hosts, /etc/resolv.conf, /etc/dnf/dnf.conf, systemctl, nmcli, df -h, cột AG, cột AM, nhãn QA...).
3. Tham khảo từ điển chuyên ngành:
${glossaryText}
4. CHỈ trả về JSON hợp lệ theo đúng cấu trúc:
{
  "translated": "Bản dịch ${tgtName} chuẩn xác, sát nghĩa IT Infra, mạch lạc",
  "romaji": "Phiên âm Romaji nếu câu gốc hoặc câu đích là tiếng Nhật, ngược lại để chuỗi rỗng",
  "note": "Giải thích cực ngắn (1 dòng) thuật ngữ IT Infra hoặc từ viết tắt/lệnh vừa nhắc tới nếu quan trọng, nếu không cần thì để chuỗi rỗng",
  "detectedLang": "${pair.sourceLang}"
}`;

  const userPrompt = `${
    contextLines ? `=== NGỮ CẢNH CÁC CÂU HỘI THOẠI LIỀN TRƯỚC ===\n${contextLines}\n\n` : ""
  }${
    liveCaptionContext
      ? `=== ĐOẠN PHỤ ĐỀ LIÊN TỤC TRÊN GOOGLE MEET (ĐỂ THAM CHIẾU NGỮ CẢNH) ===\n"${liveCaptionContext.slice(-500)}"\n\n`
      : ""
  }=== CÂU CẦN DỊCH HIỆN TẠI (${speaker}) ===\n"${normalizedText}"`;

  const rawJson = await callLLMJson({
    provider,
    apiKey,
    model: settings.aiModel,
    systemPrompt,
    userPrompt
  });

  const translatedText = (rawJson.translated || rawJson.vi || "").trim();
  const result = {
    translatedText: pair.targetLang === "vi" ? refineTranslatedInfraVi(translatedText) : translatedText,
    romaji: (rawJson.romaji || "").trim(),
    note: (rawJson.note || "").trim(),
    sourceLang: rawJson.detectedLang || pair.sourceLang,
    targetLang: pair.targetLang,
    provider: `ai-${provider}`
  };

  if (result.translatedText) {
    setCache(aiCache, cacheKey, result);
  }
  return result;
}

/**
 * Hỗ trợ trả lời nhanh đa ngôn ngữ (Quick Reply):
 * Người dùng gõ ý bằng Tiếng Việt (hoặc Tiếng Anh) -> tạo câu trả lời chuẩn IT Infra bằng Tiếng Nhật (JA) hoặc Tiếng Anh (EN)
 */
export async function generateQuickReply({
  vietnameseText,
  targetReplyLang = "ja",
  tone = "teinei",
  recentContext = [],
  settings = {}
}) {
  const cleanInput = (vietnameseText || "").trim();
  if (!cleanInput) {
    throw new Error("Vui lòng nhập nội dung bạn muốn nói.");
  }

  const replyLang = targetReplyLang === "en" ? "en" : "ja";
  const apiKey = (settings.apiKey || "").trim();
  const provider = settings.aiProvider || "gemini";

  if (apiKey) {
    try {
      const toneDesc =
        replyLang === "en"
          ? tone === "keigo"
            ? "Tiếng Anh công sở trang trọng, lịch sự (Formal Professional English) khi nói với khách hàng hoặc Manager"
            : tone === "chat"
            ? "Tiếng Anh ngắn gọn, rõ ràng để gửi vào khung Chat của Google Meet"
            : "Tiếng Anh giao tiếp kỹ thuật IT Infra tự nhiên, rõ ràng trong cuộc họp team"
          : tone === "keigo"
          ? "Kính ngữ tiếng Nhật trang trọng (Sonkeigo/Kenjougo) dùng khi nói với sếp, PM hoặc khách hàng (KDDI/Enterprise)"
          : tone === "chat"
          ? "Văn phong tiếng Nhật ngắn gọn, chuẩn công sở để dán vào ô Chat của Google Meet"
          : "Tiếng Nhật lịch sự tiêu chuẩn (Desu/Masu - Teineigo) tự nhiên khi trao đổi kỹ thuật IT Infra";

      const contextLines = recentContext
        .slice(-4)
        .map((c) => `${c.speaker || "Đồng nghiệp"}: ${c.ja || c.sourceText || ""} (${c.vi || ""})`)
        .join("\n");

      const systemPrompt = `Bạn là trợ lý giao tiếp cuộc họp IT Infrastructure (EN / JA / VI) trên Google Meet.
Hãy chuyển ý của người dùng sang ${replyLang === "en" ? "Tiếng Anh (English)" : "Tiếng Nhật (Japanese)"} chuẩn thuật ngữ IT Infra theo phong cách: ${toneDesc}.
Trả về đúng định dạng JSON hợp lệ:
{
  "japanese": "Câu ${replyLang === "en" ? "Tiếng Anh" : "Tiếng Nhật"} hoàn chỉnh tự nhiên dùng để bật mic nói hoặc gửi chat",
  "romaji": "${
    replyLang === "en"
      ? "Hướng dẫn nhấn trọng âm / cách đọc nhanh các từ kỹ thuật quan trọng"
      : "Phiên âm Romaji tách từng cụm từ dễ đọc theo ngay lập tức (kèm dấu ngắt nhịp /)"
  }",
  "pronunciationTip": "Gợi ý ngữ cảnh sử dụng hoặc lưu ý ngắn gọn",
  "alternativeChat": "Phiên bản viết gọn lịch sự để copy dán vào khung chat Google Meet",
  "backTranslation": "Nghĩa tiếng Việt sát của câu vừa tạo",
  "lang": "${replyLang}"
}`;

      const userPrompt = `${
        contextLines ? `Ngữ cảnh cuộc họp vừa rồi:\n${contextLines}\n\n` : ""
      }Ý tôi muốn nói: "${cleanInput}"`;

      const aiRes = await callLLMJson({
        provider,
        apiKey,
        model: settings.aiModel,
        systemPrompt,
        userPrompt
      });

      if (aiRes && aiRes.japanese) {
        return {
          japanese: aiRes.japanese,
          romaji: aiRes.romaji || "",
          pronunciationTip: aiRes.pronunciationTip || "",
          alternativeChat: aiRes.alternativeChat || aiRes.japanese,
          backTranslation: aiRes.backTranslation || cleanInput,
          lang: replyLang,
          provider: `ai-${provider}`
        };
      }
    } catch (err) {
      console.warn("[MeetTranslator] AI QuickReply lỗi, chuyển sang Google Translate fallback:", err);
    }
  }

  const gtRes = await translateFastGoogle(cleanInput, "auto", replyLang);
  let targetText = gtRes.translatedText;
  let romajiText = gtRes.romaji;

  if (replyLang === "ja" && !romajiText && targetText) {
    try {
      const rmLookup = await translateFastGoogle(targetText, "ja", "vi");
      romajiText = rmLookup.romaji || "";
    } catch (_) {
      // ignore
    }
  }

  const politeChat =
    replyLang === "en"
      ? targetText
      : tone === "keigo"
      ? `恐れ入りますが、${targetText} よろしくお願いいたします。`
      : `${targetText} よろしくお願いします。`;

  return {
    japanese: targetText,
    romaji:
      replyLang === "en"
        ? "(Câu tiếng Anh giao tiếp kỹ thuật - Bấm 'Nghe đọc mẫu' để nghe phát âm)"
        : romajiText || "(Nhập AI API Key để có hướng dẫn tách nhịp Romaji chi tiết hơn)",
    pronunciationTip: "Mẹo: Bạn có thể bấm nút Điền vào Chat Meet hoặc bật mic đọc trực tiếp.",
    alternativeChat: politeChat,
    backTranslation: cleanInput,
    lang: replyLang,
    provider: "google-free"
  };
}

/**
 * Phân tích tự động & tức thì (0ms) nội dung cuộc họp đang trao đổi những gì (Live Meeting Digest)
 * Phục vụ hiển thị trong Danh sách Lịch sử Cuộc họp và Thẻ Tóm tắt Nhanh ngay cả khi chưa gọi AI.
 */
export function buildLiveMeetingDigest(transcript = []) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return {
      headline: "Chưa có nội dung trao đổi",
      topics: [],
      techEntities: [],
      recentHighlights: [],
      actionItems: [],
      speakers: [],
      languageStats: { ja: 0, en: 0, vi: 0 }
    };
  }

  const speakers = [...new Set(transcript.map((t) => t.speaker || "Đồng nghiệp"))];
  const languageStats = { ja: 0, en: 0, vi: 0 };

  const TOPIC_DETECTORS = [
    {
      name: "Khảo sát Server & OS (Linux/RHEL/Windows)",
      pattern: /(rhel|linux|windows server|os|hostname|hostnamectl|kernel|swap|swapon|df -h|lsblk|lvm|mount|ディスク|ホスト名|メモリ|kdump|selinux|getenforce|dnf|yum|locale|timedatectl)/i
    },
    {
      name: "Cấu hình Mạng, DNS & Định tuyến (Network/DNS)",
      pattern: /(network|ip|subnet|prefix|gateway|static route|スタティックルート|nmcli|ifcfg|resolv\.conf|hosts|dns|名前解決|ipv6|vlan|bonding|疎通|ping|port)/i
    },
    {
      name: "Proxy, Firewall & Bảo mật (Security/Proxy)",
      pattern: /(proxy|プロキシ|i-filter|pac|firewall|firewalld|fortigate|iptables|ssh|sshd_config|sudoers|root|antivirus|ウイルス|edr|ssl|tls|vpn|踏み台|bastion)/i
    },
    {
      name: "Di trú Hệ thống & Parameter Sheet (Migration)",
      pattern: /(migration|マイグレーション|現調|現行|パラメータシート|parameter sheet|kcps|aws|azure|vmware|vsphere|切り替え|切り戻し|rollback|証跡|エビデンス|qa)/i
    },
    {
      name: "Active Directory, User & Dịch vụ (AD/Services)",
      pattern: /(active directory|adサーバ|ad01|domain|group|passwd|user|ユーザ|systemctl|service|chrony|ntp|時刻同期)/i
    },
    {
      name: "Tiến độ, Phân công & Kế hoạch (Schedule/Tasks)",
      pattern: /(進捗|納期|deadline|schedule|予定|午後|明日|来週|確認|対応|レビュー|review|ticket|task|báo cáo|tiến độ|kế hoạch)/i
    }
  ];

  const fullCombinedText = transcript
    .map((t) => {
      const lang = t.sourceLang || detectLanguage(t.ja || t.sourceText || "");
      if (languageStats[lang] !== undefined) languageStats[lang] += 1;
      return `${t.ja || t.sourceText || ""} ${t.vi || t.translatedText || ""}`;
    })
    .join("\n");

  const matchedTopics = TOPIC_DETECTORS.filter((d) => d.pattern.test(fullCombinedText)).map(
    (d) => d.name
  );

  // Trích xuất các thực thể kỹ thuật (IP, file path, command, server name, sheet column)
  const techMatches = new Set();
  const entityRegex =
    /(\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b|\/etc\/[a-z0-9._/-]+|\/mnt\/[a-z0-9._/-]+|\/var\/[a-z0-9._/-]+|\b(?:RHEL|CentOS|Ubuntu|Windows Server)\s*\d*(?:\.\d+)?\b|\b(?:systemctl|nmcli|hostnamectl|timedatectl|getenforce|swapon|chronyc|df -h|lsblk|ip route|i-FILTER|SELinux|firewalld|KCPS\d?|FortiGate|Active Directory)\b|\bcột\s+[A-Z]{1,2}\d*\b|\bQA\b)/gi;

  let m;
  while ((m = entityRegex.exec(fullCombinedText)) !== null) {
    if (techMatches.size < 18) {
      techMatches.add(m[0]);
    }
  }

  // Lọc các câu liên quan đến quyết định / công việc cần làm
  const actionPattern =
    /(確認|対応|納期|明日|今日|来週|今週|まで|お願い|修正|課題|残し|追加|xác nhận|kiểm tra|xử lý|deadline|hạn|ngày mai|hôm nay|tuần sau|nhờ|cần làm|sẽ làm|giữ nguyên|bổ sung|please|need to|will check|action item|todo)/i;
  const actionItems = transcript
    .filter((t) => actionPattern.test(t.ja || "") || actionPattern.test(t.vi || ""))
    .slice(-6)
    .map((t) => ({
      time: t.time || "",
      speaker: t.speaker || "Đồng nghiệp",
      text: t.vi || t.ja || ""
    }));

  const recentHighlights = transcript.slice(-5).map((t) => ({
    time: t.time || "",
    speaker: t.speaker || "Đồng nghiệp",
    vi: t.vi || t.ja || "",
    ja: t.ja || ""
  }));

  const headline =
    matchedTopics.length > 0
      ? `Đang thảo luận: ${matchedTopics.slice(0, 2).join(" & ")}${
          matchedTopics.length > 2 ? ` (+${matchedTopics.length - 2} chủ đề)` : ""
        }`
      : `Cuộc họp (${transcript.length} câu thoại • ${speakers.join(", ")})`;

  return {
    headline,
    topics: matchedTopics,
    techEntities: Array.from(techMatches),
    recentHighlights,
    actionItems,
    speakers,
    languageStats
  };
}

/**
 * Định dạng lịch sử hội thoại để đưa vào Prompt AI
 */
function formatTranscriptForLLM(transcript = [], maxItems = 200) {
  return transcript
    .slice(-maxItems)
    .map((item, idx) => {
      const srcLang = (item.sourceLang || "ja").toUpperCase();
      const tgtLang = (item.targetLang || "vi").toUpperCase();
      return `#${idx + 1} [${item.time || ""}] ${item.speaker || "Đồng nghiệp"}:\n- ${srcLang}: ${
        item.ja || item.sourceText || ""
      }\n- ${tgtLang}: ${item.vi || item.translatedText || ""}`;
    })
    .join("\n\n");
}

/**
 * Tạo bản tổng hợp thông minh ngay cả khi chưa nhập API Key (Chế độ Offline Smart IT Infra)
 */
export function buildSmartOfflineSummary(transcript = [], customPrompt = "", attachedFile = null) {
  const digest = buildLiveMeetingDigest(transcript);
  const firstTime = transcript[0]?.time || "--:--";
  const lastTime = transcript[transcript.length - 1]?.time || "--:--";

  const bySpeaker = new Map();
  for (const item of transcript) {
    const sp = item.speaker || "Đồng nghiệp";
    if (!bySpeaker.has(sp)) bySpeaker.set(sp, []);
    bySpeaker.get(sp).push(item);
  }

  const cleanPrompt = (customPrompt || "").trim().toLowerCase();
  let matchedByPrompt = [];
  if (cleanPrompt) {
    const matchedSpeaker = digest.speakers.find((sp) => cleanPrompt.includes(sp.toLowerCase()));
    if (matchedSpeaker) {
      matchedByPrompt = bySpeaker.get(matchedSpeaker) || [];
    } else {
      const keywords = cleanPrompt
        .replace(/[.,?!;:()]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 2 &&
            ![
              "tóm",
              "tắt",
              "tổng",
              "hợp",
              "cuộc",
              "họp",
              "các",
              "những",
              "cho",
              "tôi",
              "vừa",
              "nói",
              "phần",
              "theo",
              "yêu",
              "cầu"
            ].includes(w)
        );
      if (keywords.length > 0) {
        matchedByPrompt = transcript.filter((t) => {
          const hay = `${t.speaker} ${t.ja} ${t.vi}`.toLowerCase();
          return keywords.some((kw) => hay.includes(kw));
        });
      }
    }
  }

  const lines = [];
  lines.push(`## 📌 1. Tổng quan nội dung cuộc họp đang trao đổi (${firstTime} → ${lastTime})`);
  lines.push(`- **Tóm tắt chủ đề:** **${digest.headline}**`);
  lines.push(
    `- **Tổng số câu thoại:** ${transcript.length} câu (🇯🇵 JA: ${digest.languageStats.ja} | 🇬🇧 EN: ${digest.languageStats.en} | 🇻🇳 VI: ${digest.languageStats.vi})`
  );
  lines.push(`- **Người tham gia (${digest.speakers.length}):** ${digest.speakers.join(", ")}`);

  if (digest.topics.length > 0) {
    lines.push(`- **Các mảng kỹ thuật IT Infra được bàn tới:** ${digest.topics.join(" • ")}`);
  }
  if (digest.techEntities.length > 0) {
    lines.push(
      `- **Thông số / Lệnh / Server xuất hiện:** \`${digest.techEntities.join("`, `")}\``
    );
  }
  if (attachedFile?.name) {
    lines.push(`- **Tài liệu đính kèm đang đối chiếu:** \`${attachedFile.name}\``);
  }
  if (customPrompt) {
    lines.push(`- **Yêu cầu tổng hợp:** *"${customPrompt}"*`);
  }
  lines.push("");

  if (cleanPrompt && matchedByPrompt.length > 0) {
    lines.push(`## 🎯 Kết quả lọc theo yêu cầu của bạn (${matchedByPrompt.length} câu)`);
    matchedByPrompt.slice(-15).forEach((t) => {
      lines.push(`- **[${t.time}] ${t.speaker}:** ${t.vi || t.ja}`);
      lines.push(`  *(Gốc: ${t.ja})*`);
    });
    lines.push("");
  }

  lines.push(`## 👤 2. Nội dung trao đổi theo từng người nói`);
  for (const [sp, items] of bySpeaker.entries()) {
    const recentSp = items.slice(-5);
    lines.push(`### 🗣️ ${sp} (${items.length} câu phát biểu)`);
    recentSp.forEach((t) => {
      lines.push(`- **[${t.time}]** ${t.vi || "(Đang dịch...)"}`);
      lines.push(`  *Gốc: ${t.ja}*`);
    });
    lines.push("");
  }

  lines.push(`## 🚀 3. Các điểm xác nhận kỹ thuật / Việc cần làm (${digest.actionItems.length})`);
  if (digest.actionItems.length === 0) {
    lines.push(`- Chưa phát hiện từ khóa giao việc hoặc deadline cụ thể trong các câu vừa qua.`);
  } else {
    digest.actionItems.forEach((item) => {
      lines.push(`- ✅ **[${item.time}] ${item.speaker}:** ${item.text}`);
    });
  }
  lines.push("");

  lines.push(`## 🕒 4. Diễn biến trao đổi mới nhất`);
  transcript.slice(-8).forEach((t) => {
    lines.push(`- **[${t.time}] ${t.speaker}:** ${t.vi || t.ja}`);
  });
  lines.push("");
  lines.push(
    `> 💡 *Mẹo: Nhập Gemini / Groq API Key (miễn phí tại aistudio.google.com) trong tab Cấu hình AI để AI tự động phân tích chuyên sâu toàn bộ thông số IT Infra và trả lời mọi câu hỏi về cuộc họp.*`
  );

  return lines.join("\n");
}

/**
 * Tóm tắt biên bản cuộc họp (Meeting Summary) chuyên sâu ngành IT Infra
 */
export async function summarizeMeetingTranscript({
  transcript = [],
  attachedFile = null,
  customInstruction = "",
  settings = {}
}) {
  if (!transcript.length && !attachedFile?.content) {
    throw new Error("Chưa có dữ liệu hội thoại hoặc tài liệu để tổng hợp.");
  }

  const apiKey = (settings.apiKey || "").trim();
  const provider = settings.aiProvider || "gemini";

  if (!apiKey) {
    return buildSmartOfflineSummary(transcript, customInstruction, attachedFile);
  }

  const formattedTranscript = formatTranscriptForLLM(transcript, 180);
  const fileContext = attachedFile?.content
    ? `\n\n[TÀI LIỆU ĐÍNH KÈM TRONG CUỘC HỌP: ${attachedFile.name}]\n${String(attachedFile.content).slice(0, 12000)}\n`
    : "";

  const systemPrompt = `Bạn là Kỹ sư trưởng Hạ tầng (Lead Infrastructure BrSE) kiêm Thư ký cuộc họp đa ngôn ngữ (Anh - Nhật - Việt).
Dựa trên toàn bộ lịch sử hội thoại trong cuộc họp Google Meet dưới đây (và tài liệu đính kèm nếu có), hãy lập BẢN TỔNG HỢP CUỘC HỌP CHI TIẾT (Markdown) giúp người đọc nắm bắt ngay cuộc họp đang trao đổi những gì:

1. 📌 **Cuộc họp đang trao đổi về nội dung gì? (Executive Summary)**: Mục tiêu chính, dự án/hệ thống/server nào đang được khảo sát hoặc thảo luận.
2. 🖥️ **Chi tiết các hạng mục Kỹ thuật / IT Infra đã trao đổi**: Tổng hợp rõ các thông số OS, Network, DNS, Proxy, Firewall, AD, VM, Parameter Sheet, lệnh kiểm tra hoặc cấu hình mà các bên vừa bàn luận.
3. 👤 **Ý chính theo từng người tham gia (Speaker Breakdown)**: Mỗi người đã trình bày, giải thích hoặc yêu cầu những gì.
4. ✅ **Các quyết định & Thống nhất đã chốt (Decisions Made)**.
5. 🚀 **Action Items & Việc cần làm tiếp theo**: Ai làm gì, cần xác nhận (QA) điểm nào, deadline khi nào.${
    customInstruction ? `\n6. 🎯 **Yêu cầu bổ sung từ người dùng**: ${customInstruction}` : ""
  }`;

  const rawText = await callLLMText({
    provider,
    apiKey,
    model: settings.aiModel,
    systemPrompt,
    userPrompt: `Lịch sử hội thoại cuộc họp (${transcript.length} câu thoại):\n${formattedTranscript}${fileContext}`
  });

  return rawText;
}

/**
 * Chat tương tác với AI để hỏi đáp hoặc yêu cầu Summary tùy chỉnh về cuộc họp
 */
export async function chatWithMeetingTranscript({
  prompt,
  transcript = [],
  chatHistory = [],
  attachedFile = null,
  settings = {}
}) {
  const cleanPrompt = (prompt || "").trim();
  if (!cleanPrompt) {
    throw new Error("Vui lòng nhập yêu cầu tóm tắt hoặc câu hỏi của bạn.");
  }

  if (!transcript.length && !attachedFile?.content) {
    throw new Error("Chưa có nội dung hội thoại nào trong cuộc họp để phân tích.");
  }

  const apiKey = (settings.apiKey || "").trim();
  const provider = settings.aiProvider || "gemini";

  if (!apiKey) {
    return {
      answer: buildSmartOfflineSummary(transcript, cleanPrompt, attachedFile),
      provider: "offline-smart"
    };
  }

  const formattedTranscript = formatTranscriptForLLM(transcript, 180);
  const fileContext = attachedFile?.content
    ? `\n\n=== TÀI LIỆU FILE ĐÍNH KÈM (${attachedFile.name}) ===\n${String(attachedFile.content).slice(0, 12000)}\n`
    : "";

  const historyText = chatHistory
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Người dùng" : "Trợ lý AI"}: ${m.content}`)
    .join("\n\n");

  const systemPrompt = `Bạn là Trợ lý AI Phân tích & Tổng hợp Cuộc họp IT Infrastructure trực tiếp trên Google Meet (Hỗ trợ Tiếng Anh, Tiếng Nhật, Tiếng Việt).
Người dùng đang xem lại hoặc đang ở trong cuộc họp và hỏi bạn về nội dung cuộc họp.
Quy tắc:
- Trả lời chính xác, sát ngữ cảnh kỹ thuật IT Infra (Server, Linux/RHEL, Windows, AD, Network, Proxy, Firewall, Cloud Migration, Parameter Sheet...) dựa trên dữ liệu Lịch sử cuộc họp.
- Trình bày bằng Markdown rõ ràng, có tiêu đề, gạch đầu dòng, in đậm các thông số kỹ thuật, tên người nói và mốc thời gian.
- Nếu người dùng yêu cầu viết biên bản Gijiroku tiếng Nhật hoặc tiếng Anh, hãy trình bày song ngữ chuyên nghiệp.`;

  const userPrompt = `=== DỮ LIỆU HỘI THOẠI CUỘC HỌP (${transcript.length} câu thoại) ===
${formattedTranscript || "(Chưa có câu thoại nào)"}
${fileContext}
${historyText ? `\n=== LỊCH SỬ CHAT TRƯỚC ĐÓ ===\n${historyText}\n` : ""}
=== YÊU CẦU HIỆN TẠI CỦA NGƯỜI DÙNG ===
${cleanPrompt}`;

  const rawText = await callLLMText({
    provider,
    apiKey,
    model: settings.aiModel,
    systemPrompt,
    userPrompt
  });

  return {
    answer: (rawText || "").trim(),
    provider: `ai-${provider}`
  };
}

/**
 * Chế độ 2: Nhận diện giọng nói từ chunk âm thanh (Audio Capture) hỗ trợ EN / JA / VI
 */
export async function transcribeAndTranslateAudioChunk({
  base64Audio,
  mimeType = "audio/webm",
  settings = {},
  recentContext = []
}) {
  const apiKey = (settings.apiKey || "").trim();
  const provider = settings.aiProvider || "gemini";
  const targetLang = settings.targetLang || "vi";

  if (!apiKey) {
    throw new Error(
      "Chế độ Thu Âm Thanh (Audio AI) cần API Key (khuyên dùng Gemini API Key miễn phí từ Google AI Studio hoặc Groq API Key)."
    );
  }

  if (provider === "gemini") {
    const model = settings.aiModel || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const prompt = `Nghe đoạn âm thanh này từ cuộc họp IT Infrastructure trên Google Meet (người nói có thể dùng Tiếng Nhật, Tiếng Anh hoặc Tiếng Việt).
Nếu chỉ là tiếng ồn, im lặng hoặc không có lời nói có nghĩa, hãy trả về: {"ja": "", "vi": "", "romaji": "", "sourceLang": "ja", "speakerChanged": false}.
Nếu có lời nói, hãy ghi lại chính xác câu gốc vào "ja", ghi mã ngôn ngữ ("ja", "en", hoặc "vi") vào "sourceLang", dịch chuẩn thuật ngữ IT Infra sang ${
      LANG_NAMES[targetLang] || "Tiếng Việt"
    } vào "vi", ghi phiên âm vào "romaji" (nếu là tiếng Nhật), và nếu nhận thấy giọng người nói khác với câu trước thì đặt "speakerChanged": true.
CHỈ trả về JSON hợp lệ: {"ja": "...", "vi": "...", "romaji": "...", "sourceLang": "ja", "speakerChanged": false}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType.split(";")[0] || "audio/webm",
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Audio API lỗi (${response.status}): ${errText.slice(0, 180)}`);
    }

    const data = await response.json();
    const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = safeParseJson(contentText);
    return {
      ja: (parsed.ja || "").trim(),
      vi: (parsed.vi || "").trim(),
      romaji: (parsed.romaji || "").trim(),
      sourceLang: parsed.sourceLang || detectLanguage(parsed.ja || ""),
      targetLang,
      speakerChanged: Boolean(parsed.speakerChanged),
      provider: "gemini-audio"
    };
  }

  // Groq hoặc OpenAI Whisper API
  const whisperUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
  const whisperModel = provider === "groq" ? "whisper-large-v3-turbo" : "whisper-1";

  const binaryStr = atob(base64Audio);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const audioBlob = new Blob([bytes], { type: mimeType || "audio/webm" });

  const formData = new FormData();
  formData.append("file", audioBlob, "chunk.webm");
  formData.append("model", whisperModel);
  if (settings.sourceLang && settings.sourceLang !== "auto") {
    formData.append("language", settings.sourceLang);
  }
  formData.append("response_format", "json");

  const sttRes = await fetch(whisperUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!sttRes.ok) {
    const errText = await sttRes.text();
    throw new Error(`Whisper STT lỗi (${sttRes.status}): ${errText.slice(0, 180)}`);
  }

  const sttData = await sttRes.json();
  const sourceText = (sttData.text || "").trim();
  if (!sourceText) {
    return { ja: "", vi: "", romaji: "", provider: `${provider}-whisper` };
  }

  const fast = await translateFastGoogle(sourceText, settings.sourceLang || "auto", targetLang, {
    secondaryTargetLang: settings.secondaryTargetLang || "ja"
  });
  let viText = fast.translatedText;
  let romaji = fast.romaji;

  try {
    const aiTrans = await translateWithAI({
      text: sourceText,
      speaker: "Tab Audio",
      sourceLang: fast.sourceLang,
      targetLang: fast.targetLang,
      recentContext,
      settings
    });
    if (aiTrans?.translatedText) {
      viText = aiTrans.translatedText;
      romaji = aiTrans.romaji || romaji;
    }
  } catch (_) {
    // Giữ bản dịch Google Translate nếu AI lỗi
  }

  return {
    ja: sourceText,
    vi: viText,
    romaji,
    sourceLang: fast.sourceLang,
    targetLang: fast.targetLang,
    provider: `${provider}-whisper`
  };
}

/**
 * Helper gọi LLM trả về JSON
 */
async function callLLMJson({ provider, apiKey, model, systemPrompt, userPrompt }) {
  const rawText = await callLLMText({
    provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    jsonMode: true
  });
  return safeParseJson(rawText);
}

async function callLLMText({
  provider,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  jsonMode = false
}) {
  if (provider === "gemini") {
    const chosenModel = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      chosenModel
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const generationConfig = {
      temperature: 0.15
    };
    if (jsonMode) {
      generationConfig.responseMimeType = "application/json";
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 180)}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const isGroq = provider === "groq";
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const chosenModel = model || (isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

  const payload = {
    model: chosenModel,
    temperature: 0.15,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider.toUpperCase()} API HTTP ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

function safeParseJson(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch (_) {
    const match = str.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        return {};
      }
    }
    return {};
  }
}
