/* =========================
   CONFIG（ここだけ編集）
   ========================= */

   const CONFIG = {
    owner: "JapaneseListeningHololive",
    repo:  "pdf-downloader",
    branch:"main",
  
    // ✅ 写真の通り「レッスンフォルダ群」はリポジトリ直下
    // 例：/一石二鳥/pdf/...
    basePath: "",
  
    // ✅ レッスンフォルダの中に pdf フォルダがある
    pdfSubdir: "pdf",
  
    // 任意：GitHub API レート制限が気になる場合だけ。使うなら fine-grained token を入れる
    // token: "ghp_xxx"
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
    const p = (path || "").trim();
    if (!p) return "";
    return p
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }
  
  function apiUrlForContents(path) {
    const p = encodePath(path);
    // ✅ root は /contents でOK（末尾スラッシュ不要）
    const base = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents`;
    const url = p ? `${base}/${p}` : base;
    return `${url}?ref=${encodeURIComponent(CONFIG.branch)}`;
  }
  
  function githubTreeUrl(path) {
    // GitHubのブラウズ用URL
    const p = (path || "").trim();
    if (!p) return `https://github.com/${CONFIG.owner}/${CONFIG.repo}/tree/${encodeURIComponent(CONFIG.branch)}`;
    const encoded = p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return `https://github.com/${CONFIG.owner}/${CONFIG.repo}/tree/${encodeURIComponent(CONFIG.branch)}/${encoded}`;
  }
  
  async function fetchJson(url) {
    const headers = {
      "Accept": "application/vnd.github+json",
    };
    if (CONFIG.token) headers["Authorization"] = `Bearer ${CONFIG.token}`;
  
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const hint =
        res.status === 403
          ? "\n\n※GitHub APIのレート制限の可能性があります（しばらく置いてから再読み込み、または token を設定）。"
          : "";
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}\n${t}${hint}`);
    }
    return await res.json();
  }
  
  function setStatus(msg) {
    elStatus.textContent = msg || "";
  }
  
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
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
      opt.value = l.path;     // "<lessonName>" or "basePath/<lesson>"
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
  
  async function forceDownload(url, filename) {
    // ✅ download属性が効かない環境でも確実に落とす（Blob方式）
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
  
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
  
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "file.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  
    URL.revokeObjectURL(objUrl);
  }
  
  function renderFiles(files, pdfFolderPath) {
    elList.innerHTML = "";
  
    if (!files.length) {
      elList.innerHTML = `<p class="muted">PDFが見つかりません（<code>${escapeHtml(pdfFolderPath)}</code> を確認してください）</p>`;
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
      right.className = "right";
  
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "PDF";
  
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "ダウンロード";
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "取得中…";
          const url = f.download_url || f.html_url;
          await forceDownload(url, f.name);
          btn.textContent = "ダウンロード";
        } catch (e) {
          console.error(e);
          alert("ダウンロードに失敗しました。PDFがリポジトリに存在するか確認してください。");
          btn.textContent = "ダウンロード";
        } finally {
          btn.disabled = false;
        }
      });
  
      const open = document.createElement("a");
      open.className = "btn ghost";
      open.href = f.html_url;
      open.target = "_blank";
      open.rel = "noreferrer";
      open.textContent = "GitHubで開く";
  
      right.appendChild(pill);
      right.appendChild(btn);
      right.appendChild(open);
  
      row.appendChild(meta);
      row.appendChild(right);
      elList.appendChild(row);
    }
  
    // GitHubでフォルダを開くリンク（PDFフォルダ）
    elOpenGithubFolder.href = githubTreeUrl(pdfFolderPath);
  }
  
  /* =========================
     Data loading
     ========================= */
  
  async function loadLessons() {
    setStatus("フォルダ一覧を取得中...");
    const rootPath = CONFIG.basePath; // "" ならroot
    const url = apiUrlForContents(rootPath);
    const data = await fetchJson(url);
  
    // ✅ root直下の「ディレクトリ」だけをレッスンとして扱う
    // （index.html / script.js / styles.css は file なので除外される）
    const lessons = (Array.isArray(data) ? data : [])
      .filter(x => x.type === "dir")
      .map(x => ({
        name: x.name,
        path: rootPath ? `${rootPath}/${x.name}` : x.name,
        html_url: x.html_url,
      }))
      .sort((a,b) => a.name.localeCompare(b.name, "ja"));
  
    allLessons = lessons;
    applyLessonFilter();
    setStatus(`フォルダ: ${lessons.length} 件`);
  
    // 初期は root を GitHubで開く
    elOpenGithubFolder.href = githubTreeUrl(rootPath);
  }
  
  function applyLessonFilter() {
    const q = (elSearch.value || "").trim();
    const filtered = q ? allLessons.filter(l => l.name.includes(q)) : allLessons;
  
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
      elList.innerHTML = `<p class="muted">フォルダを選択してください。</p>`;
      setStatus("");
      elOpenGithubFolder.href = githubTreeUrl(CONFIG.basePath);
      return;
    }
  
    elSelect.dataset.current = lessonPath;
  
    // ✅ 例： "一石二鳥/pdf"
    const pdfPath = `${lessonPath}/${CONFIG.pdfSubdir}`;
    setStatus(`PDF一覧取得中: ${pdfPath}`);
  
    try {
      const url = apiUrlForContents(pdfPath);
      const data = await fetchJson(url);
  
      const files = (Array.isArray(data) ? data : [])
        .filter(x => x.type === "file" && x.name.toLowerCase().endsWith(".pdf"))
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
      currentFiles = [];
      elList.innerHTML = `<p class="muted">読み込み失敗：${escapeHtml(String(e.message || e))}</p>
        <p class="muted">ヒント：<code>${escapeHtml(pdfPath)}</code> が存在するか確認してください。</p>`;
      setStatus("エラー");
      elOpenGithubFolder.href = githubTreeUrl(lessonPath);
    }
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
      prompt("コピーして使ってください", text);
    }
  }
  
  /* =========================
     Events / init
     ========================= */
  
  async function init() {
    await loadLessons();
  
    elSearch.addEventListener("input", applyLessonFilter);
    elSelect.addEventListener("change", () => loadPdfsForLesson(elSelect.value));
  
    elReload.addEventListener("click", async () => {
      await loadLessons();
      await loadPdfsForLesson(elSelect.value);
    });
  
    elCopyLinksBtn.addEventListener("click", copyLinks);
  
    // 初期メッセージ
    elList.innerHTML = `<p class="muted">フォルダを選択してください。</p>`;
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(e => {
      console.error(e);
      setStatus("初期化エラー");
      elList.innerHTML = `<p class="muted">初期化に失敗：${escapeHtml(String(e.message || e))}</p>`;
    });
  });
