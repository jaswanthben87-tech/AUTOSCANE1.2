(() => {
  if (window.__askGeminiAutoScanInstalled) return;
  window.__askGeminiAutoScanInstalled = true;
  let host, shadow, currentServer = "https://scan-lime.vercel.app", loadedModel = "", supportsSettingsApi = true, busy = false, minimized = false, panelHidden = false, settingsOpen = false;
  const $ = (s) => shadow.querySelector(s);

  function ensurePanel() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = "ask-gemini-autoscan-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:20px;bottom:20px;";
    host.style.display = panelHidden ? "none" : "block";
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box} .panel{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#18202b;background:rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);width:min(390px,calc(100vw - 24px));max-height:min(76vh,680px);border:1px solid rgba(219,225,232,.72);border-radius:16px;box-shadow:0 14px 44px #0003;display:flex;flex-direction:column;overflow:hidden}
      .head{display:flex;align-items:center;gap:9px;padding:12px 13px;background:rgba(247,249,252,.12);border-bottom:1px solid rgba(231,235,240,.6);cursor:move;user-select:none}.brand{font-weight:750;flex:1;font-size:14px}.btn{border:0;border-radius:8px;padding:7px 10px;background:#edf1f6;color:#202938;cursor:pointer;font:inherit}.btn.primary{background:#2563eb;color:white}.btn:disabled{opacity:.55;cursor:wait}.body{padding:13px;overflow:auto;overscroll-behavior:contain}.status{display:flex;gap:8px;align-items:center;color:#596579;font-size:12px;margin-bottom:12px}.dot{width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0}.dot.ok{background:#16a34a}.dot.bad{background:#dc2626}.spin{border:2px solid #dbeafe;border-top-color:#2563eb;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}} h4{margin:12px 0 5px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#647084} .text{white-space:pre-wrap;overflow-wrap:anywhere}.answer{background:rgba(244,247,255,.22);border:1px solid rgba(219,229,255,.7);padding:10px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}.q{font-weight:650}.opts{margin:6px 0;padding-left:22px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.error{background:rgba(255,241,240,.30);color:#8f211b;border:1px solid rgba(255,209,204,.8);border-radius:9px;padding:10px;white-space:pre-wrap}.hidden{display:none!important}.collapsed .body{display:none}.footRow{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:#748094;margin-top:12px}.linkBtn{border:0;background:none;padding:2px 4px;color:#2563eb;font:inherit;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;border-radius:6px}.linkBtn:hover{background:rgba(37,99,235,.08)}
      .cfgHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.cfgTitle{font-weight:700;font-size:13px;color:#18202b}.field{margin-bottom:10px}.field label{display:block;font-size:11px;font-weight:650;color:#596579;margin-bottom:4px}.row{display:flex;gap:6px;align-items:center}.inp{width:100%;border:1px solid rgba(185,196,210,.9);background:rgba(255,255,255,.78);color:#18202b;border-radius:8px;padding:7px 9px;font:inherit;font-size:12px}.inp:focus{outline:2px solid rgba(37,99,235,.35);border-color:#2563eb}.hint{font-size:11px;color:#647084;margin-top:3px}.msg{font-size:12px;border-radius:8px;padding:8px 10px;margin-top:8px}.msg.ok{background:rgba(240,253,244,.8);color:#166534;border:1px solid rgba(187,247,208,.9)}.msg.err{background:rgba(255,241,240,.8);color:#8f211b;border:1px solid rgba(255,209,204,.9)}@media(max-width:440px){.panel{width:calc(100vw - 24px);max-height:70vh}}
    </style><section class="panel"><header class="head"><span aria-hidden="true">✦</span><span class="brand">Ask Gemini AutoScan</span><button class="btn" id="min" title="Minimize">−</button><button class="btn" id="close" title="Close">×</button></header><div class="body"><div id="scanView"><div class="status"><span class="dot" id="dot"></span><span id="status">Ready to scan</span></div><div id="results"></div><div id="err" class="error hidden"></div><label style="display:flex;gap:7px;align-items:center;margin-top:12px;font-size:12px;color:#596579"><input id="firstOnly" type="checkbox"> Answer only the first detected question</label><div class="actions"><button class="btn primary" id="copy">Copy Answer</button><button class="btn" id="again">Scan Again</button><button class="btn primary hidden" id="retry">Retry</button></div></div><div id="settingsView" class="hidden"><div class="cfgHead"><span class="cfgTitle">Server Settings</span><button class="btn" id="cfgBack" type="button">← Back</button></div><div class="status" style="margin-bottom:10px"><span class="dot" id="cfgDot"></span><span id="cfgStatus">Checking server…</span></div><div class="field"><label for="cfgUrl">Backend Server URL (Local or Cloud)</label><div class="row"><input class="inp" id="cfgUrl" type="url" placeholder="https://scan-lime.vercel.app"><button class="btn" id="cfgTest" type="button">Test</button></div></div><div class="field"><label for="cfgModel">Gemini Model</label><input class="inp" id="cfgModel" type="text" list="cfgModels" placeholder="gemini-3.6-flash"><datalist id="cfgModels"><option value="gemini-3.6-flash"></option><option value="gemini-3.8-flash"></option><option value="gemini-flash-lite-latest"></option><option value="gemini-2.5-pro"></option></datalist></div><div class="field"><label for="cfgKey">Gemini API Key (optional update)</label><input class="inp" id="cfgKey" type="password" placeholder="Leave blank to keep existing key" autocomplete="off"><div class="hint" id="cfgKeyHint">Stored only on your local server (.env)</div></div><div class="actions"><button class="btn primary" id="cfgSave" type="button">Save Settings</button><button class="btn" id="cfgReset" type="button">Reset URL</button></div><div id="cfgMsg" class="msg hidden"></div></div><div class="footRow"><span>Screen processed safely.</span><button class="linkBtn" id="settingsBtn" type="button" title="Configure local server, model, and API key">⚙ Server Settings</button></div></div></section>`;
    document.documentElement.appendChild(host);
    $("#close").addEventListener("click", () => { host.remove(); host = null; settingsOpen = false; panelHidden = true; });
    $("#min").addEventListener("click", () => { minimized = !minimized; $(".panel").classList.toggle("collapsed", minimized); $("#min").textContent = minimized ? "□" : "−"; });
    $("#again").addEventListener("click", () => requestScan());
    $("#retry").addEventListener("click", () => requestScan());
    $("#copy").addEventListener("click", async () => { const text = shadow.querySelector("#results").innerText; try { await navigator.clipboard.writeText(text || ""); $("#copy").textContent = "Copied!"; setTimeout(() => { if(host?.isConnected) $("#copy").textContent = "Copy Answer"; }, 1200); } catch { setStatus("Clipboard blocked. Select and copy the answer manually.", false); } });
    $("#settingsBtn").addEventListener("click", () => toggleSettings(!settingsOpen));
    $("#cfgBack").addEventListener("click", () => toggleSettings(false));
    $("#cfgTest").addEventListener("click", () => testServerConnection());
    $("#cfgSave").addEventListener("click", () => saveServerSettings());
    $("#cfgReset").addEventListener("click", () => { $("#cfgUrl").value = "https://scan-lime.vercel.app"; void saveServerSettings(); });
    $("#cfgUrl").addEventListener("input", () => {
      const val = $("#cfgUrl").value.trim();
      if (val.startsWith("http://127.0.0.1") || val.startsWith("http://localhost")) {
        $("#cfgModel").disabled = false;
        $("#cfgKey").disabled = false;
      }
    });
    const head = $(".head"); let drag = null;
    head.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; const r=host.getBoundingClientRect(); drag={x:e.clientX-r.left,y:e.clientY-r.top}; head.setPointerCapture(e.pointerId); });
    head.addEventListener("pointermove", e => { if(!drag)return; host.style.left=Math.max(0,Math.min(innerWidth-host.offsetWidth,e.clientX-drag.x))+"px"; host.style.top=Math.max(0,Math.min(innerHeight-45,e.clientY-drag.y))+"px"; host.style.right="auto"; host.style.bottom="auto"; });
    head.addEventListener("pointerup", () => drag=null);
  }

  function setCfgMessage(text, isError = false) {
    const box = $("#cfgMsg");
    if (!text) { box.classList.add("hidden"); box.textContent = ""; return; }
    box.textContent = text;
    box.className = `msg ${isError ? "err" : "ok"}`;
  }

  function applySettingsSnapshot(data) {
    if (data?.serverUrl) {
      currentServer = data.serverUrl;
      $("#cfgUrl").value = data.serverUrl;
    }
    supportsSettingsApi = data?.supportsSettingsApi !== false;
    const dot = $("#cfgDot");
    dot.classList.remove("spin", "ok", "bad");
    if (data?.connected === false) {
      dot.classList.add("bad");
      $("#cfgStatus").textContent = data.error || "Server unreachable";
    } else if (data?.ok) {
      dot.classList.add("ok");
      $("#cfgStatus").textContent = `Connected · Model: ${data.model || "unknown"}`;
    } else {
      dot.classList.add("bad");
      $("#cfgStatus").textContent = data?.error || "Server unreachable";
    }
    loadedModel = data?.model || "";
    $("#cfgModel").value = loadedModel;
    $("#cfgModel").disabled = data?.connected !== false && !supportsSettingsApi;
    $("#cfgKey").disabled = data?.connected !== false && !supportsSettingsApi;
    if (Array.isArray(data?.availableModels) && data.availableModels.length) {
      const list = $("#cfgModels");
      list.replaceChildren(...data.availableModels.map(m => {
        const opt = document.createElement("option");
        opt.value = m;
        return opt;
      }));
    }
    if (data?.connected !== false && !supportsSettingsApi) {
      $("#cfgKeyHint").textContent = "Model & API key are managed on this remote cloud server.";
    } else {
      $("#cfgKeyHint").textContent = data?.apiKeyPreview
        ? `Current key: ${data.apiKeyPreview} (stored in server/.env)`
        : "Stored only on your local server (.env)";
    }
  }

  async function toggleSettings(open) {
    ensurePanel();
    settingsOpen = Boolean(open);
    $("#scanView").classList.toggle("hidden", settingsOpen);
    $("#settingsView").classList.toggle("hidden", !settingsOpen);
    $("#settingsBtn").textContent = settingsOpen ? "← Back to Scan" : "⚙ Server Settings";
    if (!settingsOpen) return;

    setCfgMessage("");
    $("#cfgDot").className = "dot spin";
    $("#cfgStatus").textContent = "Loading server settings…";
    try {
      const data = await chrome.runtime.sendMessage({ type: "AUTOSCAN_GET_SETTINGS" });
      applySettingsSnapshot(data);
    } catch (e) {
      applySettingsSnapshot({ connected: false, serverUrl: currentServer, error: e?.message || "Could not load settings." });
    }
  }

  async function testServerConnection() {
    setCfgMessage("");
    $("#cfgDot").className = "dot spin";
    $("#cfgStatus").textContent = "Testing connection…";
    $("#cfgTest").disabled = true;
    try {
      const data = await chrome.runtime.sendMessage({ type: "AUTOSCAN_TEST_SERVER", serverUrl: $("#cfgUrl").value });
      applySettingsSnapshot({ ...data, connected: Boolean(data?.ok) });
      setCfgMessage(data?.ok ? `Connected to ${data.serverUrl}.` : (data?.error || "Server check failed."), !data?.ok);
    } catch (e) {
      applySettingsSnapshot({ connected: false, error: e?.message || "Connection test failed." });
      setCfgMessage(e?.message || "Connection test failed.", true);
    } finally {
      $("#cfgTest").disabled = false;
    }
  }

  async function saveServerSettings() {
    setCfgMessage("");
    $("#cfgSave").disabled = true;
    $("#cfgDot").className = "dot spin";
    $("#cfgStatus").textContent = "Saving settings…";
    try {
      const nextUrl = $("#cfgUrl").value.trim();
      const nextModel = $("#cfgModel").value.trim();
      const nextKey = $("#cfgKey").value.trim();
      const urlChanged = nextUrl && nextUrl !== currentServer;
      const modelChanged = nextModel && nextModel !== loadedModel && !urlChanged;

      const data = await chrome.runtime.sendMessage({
        type: "AUTOSCAN_SAVE_SETTINGS",
        serverUrl: nextUrl,
        model: modelChanged ? nextModel : "",
        apiKey: (!urlChanged || supportsSettingsApi) ? nextKey : ""
      });
      if (!data?.ok) throw new Error(data?.error || "Could not save settings.");
      $("#cfgKey").value = "";
      applySettingsSnapshot(data);
      setCfgMessage(data.connected ? "Server settings saved and applied." : "Server URL saved locally (start backend to apply model/key).");
    } catch (e) {
      applySettingsSnapshot({ connected: false, error: e?.message || "Save failed." });
      setCfgMessage(e?.message || "Save failed.", true);
    } finally {
      $("#cfgSave").disabled = false;
    }
  }

  // Ctrl+Shift+Q hides/shows only the extension's own host element.
  // It never changes visibility or styles of the webpage or its MCQ content.
  function togglePanelVisibility() {
    if (!host?.isConnected) {
      panelHidden = false;
      ensurePanel();
      return;
    }
    panelHidden = !panelHidden;
    host.style.display = panelHidden ? "none" : "block";
  }

  function setStatus(s, loading=false) { ensurePanel(); $("#status").textContent=s; $("#dot").classList.toggle("spin",loading); $("#err").classList.add("hidden"); $("#retry").classList.add("hidden"); }
  function showError(message) { ensurePanel(); panelHidden=false; host.style.display="block"; busy=false; $("#status").textContent="Scan failed"; $("#dot").classList.remove("spin"); $("#err").textContent=message; $("#err").classList.remove("hidden"); $("#retry").classList.remove("hidden"); $("#again").disabled=false; }
  function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function render(data) {
    const root=$("#results"); root.replaceChildren();
    const qs=Array.isArray(data.questions)?data.questions: [{question:data.extractedText||"Detected text",options:[],answer:data.answer||"No answer returned.",explanation:""}];
    qs.forEach((q,i)=>{ const block=el("section"); if(qs.length>1) block.append(el("h4",null,`Question ${i+1}`)); block.append(el("div","q",q.question||"Question not detected"));
      if(Array.isArray(q.options)&&q.options.length){const list=el("ol","opts"); q.options.forEach(o=>list.append(el("li",null,String(o)))); block.append(list);}
      block.append(el("h4",null,"Gemini answer"),el("div","answer",q.answer||"No answer returned.")); if(q.explanation)block.append(el("h4",null,"Explanation"),el("div","text",q.explanation)); root.append(block);
    });
    $("#status").textContent=`Answer ready · ${qs.length} question${qs.length===1?"":"s"}`; $("#dot").classList.remove("spin"); $("#err").classList.add("hidden"); $("#retry").classList.add("hidden"); $("#again").disabled=false; busy=false;
  }
  function waitForPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function requestScan(screenshot) {
    ensurePanel(); if (settingsOpen) void toggleSettings(false); panelHidden=false; host.style.display="block"; if(busy)return; busy=true; minimized=false; $(".panel").classList.remove("collapsed"); $("#min").textContent="−"; $("#again").disabled=true; $("#results").replaceChildren();
    try {
      if(!screenshot) {
        setStatus("Capturing visible page…",true);
        host.style.display="none";
        await waitForPaint();
        let response;
        try {
          response=await chrome.runtime.sendMessage({type:"AUTOSCAN_RECAPTURE"});
        } finally {
          if(host?.isConnected && !panelHidden) host.style.display="block";
        }
        screenshot=response?.screenshot;
        if(!screenshot)throw new Error(response?.error||"Could not capture the page. Use Alt+X while the target tab is active.");
      }
      setStatus("Extracting text locally…",true);
      const domText=extractRelevantDomText();
      setStatus("Identifying questions…",true);
      setStatus("Generating answer with Gemini…",true);
      const data = await chrome.runtime.sendMessage({type:"AUTOSCAN_PROCESS", server:currentServer, image:screenshot, domText, firstOnly:$("#firstOnly").checked});
      if(!data?.ok) throw new Error(data?.error || "Backend request failed.");
      render(data.result);
    } catch(e) { showError(e.name==="AbortError"?"Request timed out after 90 seconds. Check the server and retry.":(e.message.includes("Failed to fetch")?`Cannot reach backend at ${currentServer}. Check Server Settings or start the local server, then retry.`:e.message||"Unexpected scan error.")); }
  }
  function extractCodeContext() {
    try {
      const blocks = [];
      const seen = new Set();
      const addBlock = (raw) => {
        const cleaned = (raw || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (cleaned.length >= 12 && cleaned.length <= 5000 && !seen.has(cleaned)) {
          seen.add(cleaned);
          blocks.push(cleaned);
        }
      };

      for (const container of document.querySelectorAll(".ace_text-layer, .cm-content, .CodeMirror-code, .view-lines")) {
        if (container.closest("#ask-gemini-autoscan-host")) continue;
        const lineNodes = container.querySelectorAll(".ace_line, .cm-line, .CodeMirror-line, .view-line");
        const text = lineNodes.length
          ? [...lineNodes].map(n => n.textContent || "").join("\n")
          : (container.innerText || container.textContent || "");
        addBlock(text);
      }

      for (const pre of document.querySelectorAll("pre, code")) {
        if (pre.closest("#ask-gemini-autoscan-host, .ace_text-layer, .cm-content, .CodeMirror-code, .view-lines")) continue;
        if (pre.tagName === "CODE" && pre.closest("pre")) continue;
        const text = (pre.innerText || pre.textContent || "").trim();
        if (pre.tagName === "PRE" || text.includes("\n") || /[{}();]/.test(text)) addBlock(text);
      }

      const currentCode = blocks.join("\n\n").slice(0, 5000);
      const cacheKey = `askGeminiLastCode:${location.pathname}`;
      if (currentCode) {
        try { sessionStorage.setItem(cacheKey, currentCode); } catch {}
        return `VISIBLE_OR_DOM_CODE:\n${currentCode}`;
      }
      try {
        const cached = sessionStorage.getItem(cacheKey) || "";
        if (cached) {
          return `PREVIOUS_QUIZ_CODE (from an earlier screen of this quiz; ONLY use if the current question refers to "the provided implementation/code" and no code is visible now):\n${cached}`;
        }
      } catch {}
      return "";
    } catch { return ""; }
  }

  function extractRelevantDomText() {
    try {
      const nodes = [...document.querySelectorAll("h1,h2,h3,p,label,li,[role=question],[role=option],[role=listitem],[role=checkbox],[role=radio],[draggable=true],[data-rbd-draggable-id],.question,[class*=question i],[class*=option i],[class*=choice i],[class*=step i],[class*=prompt i],[class*=statement i],input[type=radio],input[type=checkbox]")];
      const seen = new Set();
      const lines = [];
      for (const n of nodes) {
        if (n.closest("#ask-gemini-autoscan-host")) continue;
        const text = (n.matches("input") ? (n.labels?.[0]?.innerText || n.getAttribute("aria-label") || "") : (n.innerText || n.textContent || "")).trim();
        if (text.length > 1 && text.length < 1200 && !seen.has(text)) {
          seen.add(text);
          lines.push(text);
          if (lines.length >= 120) break;
        }
      }
      const codeSection = extractCodeContext();
      if (codeSection) lines.push(codeSection);
      return lines.join("\n").slice(0, 12000);
    } catch { return ""; }
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if(msg?.type==="AUTOSCAN_HIDE_FOR_CAPTURE"){ if(host?.isConnected){ host.style.display="none"; waitForPaint().then(()=>sendResponse({ok:true})); return true; } sendResponse({ok:true}); }
    if(msg?.type==="AUTOSCAN_START"){ currentServer=msg.server||currentServer; void requestScan(msg.screenshot); }
    if(msg?.type==="AUTOSCAN_TOGGLE_VISIBILITY") togglePanelVisibility();
    if(msg?.type==="AUTOSCAN_ERROR")showError(msg.error||"Unable to start scan on this page.");
  });
})();
