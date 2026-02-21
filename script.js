/* =========================
   CONFIG（ここだけ編集）
   ========================= */

// ✅ ここを自分のGitHubに合わせて変更してください
const CONFIG = {
    owner: "YOUR_GITHUB_NAME",      // 例: "namunamu"
    repo:  "YOUR_REPO_NAME",        // 例: "hololive_movie_japanese"
    branch:"main",                  // 例: "main" or "master"
  
    // PDFsが入っている「レッスンフォルダ群」の親パス（リポジトリ内）
    // 例: "make_movie/ヨコ動画/japanese_conversation_practice"
    basePath: "make_movie/ヨコ動画/japanese_conversation_practice",
  
    // 各レッスンフォルダの中で、PDFが入るサブフォルダ名（あなたのスクリプトは "pdf"）
    pdfSubdir: "pdf",
  };
  
  // 表示順を安定させたい場合の言語順（ファイル名が "1_日本語.pdf" みたいな前提）
  const LANG_ORDER_PREFIX = ["1_", "2_", "3_", "4_", "5_", "6_", "7_", "8_"];
  
  
  /* =========================
     DOM
     ========================= */
  const elSearch = document.getElementById("searchInput");
  const elSelect = document.getElementById("lessonSelect");
  const elList   = document.getElementById("fileList");
  const elStatus = document.getElementById("status");
  const elReload = document.getElementById("reloadBtn");
  const elOpenGithubFolder = document.getElementById("openGithubFolder");
  const elCopyLinksBtn = document.getElementById("copyLinksBtn");
  
  let allLessons = [];   // {name, path, html_url}
  let currentFiles = []; // {name, download_url, size, html_url}
  
  
  /* =========================
     GitHub API helpers
     ========================= */
  
  function encodePath(path) {
    // 日本語/空白/記号を安全にする（パス要素ごとにencode）
    return path.split("/").map(encodeURIComponent).join("/");
  }
  
  function apiUrlForContents(path) {
    const p = encodePath(path);
    return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${p}?ref=${encodeURIComponent(CONFIG.branch)}`;
  }
  
  function githubTreeUrl(path) {
    // GitHubのブラウズ用URL
    const p = path.split("/").map(encodeURIComponent).join("/");
    return `https://github.com/${CONFIG.owner}/${CONFIG.repo}/tree/${encodeURIComponent(CONFIG.branch)}/${p}`;
  }
  
  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}\n${t}`);
    }
    return await res.json();
  }
  
  function setStatus(msg) {
    elStatus.textContent = msg || "";
  }
  
  
  /* =========================
     UI rendering
     ========================= */
  
  function renderLessonSelect(lessons) {
    elSelect.innerHTML = "";
  
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = lessons.length ? "フォルダを選択..." : "フォルダが見つかりません";
    elSelect.appendChild(opt0);
  
    for (const l of lessons) {
      const opt = document.createElement("option");
      opt.value = l.path;     // basePath/<lesson>
      opt.textContent = l.name;
      elSelect.appendChild(opt);
    }
  }
  
  function humanBytes(bytes) {
    if (typeof bytes !== "number") return "";
    const units = ["B","KB","MB","GB"];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
  
  function sortFiles(files) {
    // 1_〜 8_〜 を優先、次に自然順
    const rank = (name) => {
      const idx = LANG_ORDER_PREFIX.findIndex(p => name.startsWith(p));
      return idx === -1 ? 999 : idx;
    };
    return [...files].sort((a,b) => {
      const ra = rank(a.name), rb = rank(b.name);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "ja");
    });
  }
  
  function renderFiles(files, lessonPath) {
    elList.innerHTML = "";
  
    if (!files.length) {
      elList.innerHTML = `<p class="muted">PDFが見つかりません（${CONFIG.pdfSubdir}/ を確認してください）</p>`;
      return;
    }
  
    const sorted = sortFiles(files);
    for (const f of sorted) {
      const row = document.createElement("div");
      row.className = "fileItem";
  
      const meta = document.createElement("div");
      meta.className = "fileMeta";
  
      const name = document.createElement("div");
      name.className = "fileName";
      name.textContent = f.name;
  
      const sub = document.createElement("div");
      sub.className = "fileSub";
      sub.textContent = `${humanBytes(f.size)} / ${CONFIG.owner}/${CONFIG.repo}`;
  
      meta.appendChild(name);
      meta.appendChild(sub);
  
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "10px";
      right.style.alignItems = "center";
  
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "PDF";
  
      const a = document.createElement("a");
      a.className = "btn";
      a.href = f.download_url || f.html_url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = f.name; // ブラウザによって効く/効かないはあるが害はない
      a.textContent = "ダウンロード";
  
      right.appendChild(pill);
      right.appendChild(a);
  
      row.appendChild(meta);
      row.appendChild(right);
      elList.appendChild(row);
    }
  
    // GitHubでフォルダを開くリンク
    elOpenGithubFolder.href = githubTreeUrl(lessonPath);
  }
  
  
  /* =========================
     Data loading
     ========================= */
  
  async function loadLessons() {
    setStatus("フォルダ一覧を取得中...");
    const url = apiUrlForContents(CONFIG.basePath);
    const data = await fetchJson(url);
  
    // basePath直下の「ディレクトリ」だけをレッスンとして扱う
    const lessons = (Array.isArray(data) ? data : [])
      .filter(x => x.type === "dir")
      .map(x => ({
        name: x.name,
        path: `${CONFIG.basePath}/${x.name}`,
        html_url: x.html_url,
      }))
      .sort((a,b) => a.name.localeCompare(b.name, "ja"));
  
    allLessons = lessons;
    applyLessonFilter(); // 検索反映
    setStatus(`フォルダ: ${lessons.length} 件`);
  }
  
  function applyLessonFilter() {
    const q = (elSearch.value || "").trim();
    const filtered = q
      ? allLessons.filter(l => l.name.includes(q))
      : allLessons;
  
    renderLessonSelect(filtered);
  
    // 検索後に選択が消えないように復元（可能なら）
    const current = elSelect.dataset.current || "";
    if (current && filtered.some(l => l.path === current)) {
      elSelect.value = current;
    } else {
      elSelect.value = "";
    }
  }
  
  async function loadPdfsForLesson(lessonPath) {
    if (!lessonPath) {
      currentFiles = [];
      renderFiles([], lessonPath);
      return;
    }
  
    elSelect.dataset.current = lessonPath;
  
    const pdfPath = `${lessonPath}/${CONFIG.pdfSubdir}`;
    setStatus(`PDF一覧取得中: ${pdfPath}`);
  
    try {
      const url = apiUrlForContents(pdfPath);
      const data = await fetchJson(url);
  
      const files = (Array.isArray(data) ? data : [])
        .filter(x => x.type === "file" && (x.name.toLowerCase().endsWith(".pdf")))
        .map(x => ({
          name: x.name,
          download_url: x.download_url,
          size: x.size,
          html_url: x.html_url,
        }));
  
      currentFiles = files;
      renderFiles(files, pdfPath);
      setStatus(`PDF: ${files.length} 件`);
    } catch (e) {
      // pdfフォルダが無い等
      currentFiles = [];
      elList.innerHTML = `<p class="muted">読み込み失敗：${escapeHtml(String(e.message || e))}</p>`;
      setStatus("エラー");
      elOpenGithubFolder.href = githubTreeUrl(lessonPath);
    }
  }
  
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  
  
  /* =========================
     Copy links
     ========================= */
  
  async function copyLinks() {
    if (!currentFiles.length) return;
  
    const lines = sortFiles(currentFiles).map(f => `${f.name}\t${f.download_url || f.html_url}`);
    const text = lines.join("\n");
  
    try {
      await navigator.clipboard.writeText(text);
      setStatus("リンクをコピーしました");
    } catch {
      // clipboard が使えない環境用フォールバック
      prompt("コピーして使ってください", text);
    }
  }
  
  
  /* =========================
     Events / init
     ========================= */
  
  async function init() {
    // CONFIGが未設定なら明示的に案内
    if (CONFIG.owner === "YOUR_GITHUB_NAME" || CONFIG.repo === "YOUR_REPO_NAME") {
      setStatus("script.js の CONFIG を自分のGitHubに合わせて編集してください");
      elSelect.innerHTML = `<option value="">CONFIG未設定</option>`;
      return;
    }
  
    // まずレッスン一覧
    await loadLessons();
  
    // イベント
    elSearch.addEventListener("input", applyLessonFilter);
    elSelect.addEventListener("change", () => loadPdfsForLesson(elSelect.value));
    elReload.addEventListener("click", async () => {
      await loadLessons();
      await loadPdfsForLesson(elSelect.value);
    });
    elCopyLinksBtn.addEventListener("click", copyLinks);
  
    // 初期は basePath を GitHubで開く
    elOpenGithubFolder.href = githubTreeUrl(CONFIG.basePath);
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(e => {
      setStatus("初期化エラー");
      elList.innerHTML = `<p class="muted">初期化に失敗：${escapeHtml(String(e.message || e))}</p>`;
    });
  });
