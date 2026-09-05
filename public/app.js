(() => {
  "use strict";

  const PLUGIN_META = {
    web_search: { name: "Web Search", note: "Real search results (needs SEARCH_API_KEY)" },
    music: { name: "Music Player", note: "YouTube audio playback (no key needed)" },
    youtube: { name: "YouTube", note: "Video search (needs YOUTUBE_API_KEY)" },
    weather: { name: "Weather", note: "Live conditions (needs WEATHER_API_KEY)" },
    calculator: { name: "Calculator", note: "Real math evaluation" },
    world_time: { name: "World Time", note: "Real IANA timezone lookup" },
    github: { name: "GitHub", note: "Requires connecting a token below" },
  };

  const state = {
    plugins: { calculator: true, world_time: true, web_search: false, weather: false, youtube: false, music: false, github: false },
    model: null,
    githubConnected: false,
    messages: [], // {role, content}
    controller: null,
  };

  const $ = (id) => document.getElementById(id);
  const messagesEl = $("messages");
  const emptyState = $("emptyState");
  const form = $("composerForm");
  const input = $("messageInput");
  const sendBtn = $("sendBtn");
  const stopBtn = $("stopBtn");
  const toolActivity = $("toolActivity");
  const pluginList = $("pluginList");
  const modelSelect = $("modelSelect");
  const modelNote = $("modelNote");
  const statusDot = $("statusDot");
  const statusText = $("statusText");
  const railToggle = $("railToggle");
  const rail = $("rail");

  railToggle.addEventListener("click", () => rail.classList.toggle("open"));

  // ---------------------------------------------------------------
  // Plugin panel
  // ---------------------------------------------------------------
  function renderPlugins() {
    pluginList.innerHTML = "";
    for (const [id, meta] of Object.entries(PLUGIN_META)) {
      const li = document.createElement("li");
      li.className = "plugin-item";
      li.innerHTML = `
        <span>${meta.name}<small>${meta.note}</small></span>
        <label class="switch">
          <input type="checkbox" data-plugin="${id}" ${state.plugins[id] ? "checked" : ""} />
          <span class="track"></span><span class="thumb"></span>
        </label>`;
      pluginList.appendChild(li);
    }
    pluginList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-plugin");
        if (id === "github" && e.target.checked && !state.githubConnected) {
          e.target.checked = false;
          input.focus();
          return;
        }
        state.plugins[id] = e.target.checked;
      });
    });
  }

  // ---------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------
  async function loadModels() {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? data.error.message : "Failed to load models");
      modelSelect.innerHTML = "";
      if (!data.models || data.models.length === 0) {
        modelSelect.innerHTML = `<option value="${data.defaultModel}">${data.defaultModel} (default)</option>`;
      } else {
        for (const m of data.models) {
          const opt = document.createElement("option");
          opt.value = m.id || m.name;
          opt.textContent = m.id || m.name;
          modelSelect.appendChild(opt);
        }
      }
      modelSelect.disabled = false;
      state.model = modelSelect.value;
      modelSelect.addEventListener("change", () => (state.model = modelSelect.value));
      setStatus("ok", "xKiro configured and reachable.");
    } catch (err) {
      modelSelect.innerHTML = `<option>Unavailable</option>`;
      modelNote.textContent = err.message;
      setStatus("err", "xKiro is not configured. Set XKIRO_API_KEY.");
    }
  }

  function setStatus(kind, text) {
    statusDot.className = `status-dot status-dot--${kind}`;
    statusText.textContent = text;
  }

  // ---------------------------------------------------------------
  // GitHub connect flow
  // ---------------------------------------------------------------
  $("ghConnectBtn").addEventListener("click", async () => {
    const token = $("ghTokenInput").value.trim();
    if (!token) return;
    const btn = $("ghConnectBtn");
    btn.disabled = true;
    btn.textContent = "Connecting…";
    try {
      const res = await fetch("/api/github/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? data.error.message : "Connection failed");
      state.githubConnected = true;
      $("githubPanel").innerHTML = `<p class="rail-note">Connected as <strong>${escapeHtml(data.login)}</strong></p>
        <label class="plugin-item"><span>Auto Apply<small>Skip manual approval for writes/deletes</small></span>
          <label class="switch"><input type="checkbox" id="autoApplyToggle" /><span class="track"></span><span class="thumb"></span></label>
        </label>
        <button id="ghDisconnectBtn" class="btn btn--ghost">Disconnect</button>`;
      $("ghDisconnectBtn").addEventListener("click", disconnectGithub);
      $("autoApplyToggle").addEventListener("change", async (e) => {
        await fetch("/api/github/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": readCookie("csrf_token") },
          body: JSON.stringify({ setAutoApply: e.target.checked }),
        });
      });
    } catch (err) {
      $("githubPanel").insertAdjacentHTML("beforeend", `<p class="rail-note" style="color:var(--red)">${escapeHtml(err.message)}</p>`);
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  });

  async function disconnectGithub() {
    await fetch("/api/github/disconnect", {
      method: "POST",
      headers: { "X-CSRF-Token": readCookie("csrf_token") },
    });
    state.githubConnected = false;
    state.plugins.github = false;
    $("githubPanel").innerHTML = `<p class="rail-note">Not connected.</p>
      <input id="ghTokenInput" type="password" placeholder="Personal access token" class="text-input" />
      <button id="ghConnectBtn" class="btn btn--secondary">Connect</button>`;
    renderPlugins();
    location.reload();
  }

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------
  // Chat rendering
  // ---------------------------------------------------------------
  function addMessage(role, content) {
    if (emptyState) emptyState.remove();
    const div = document.createElement("div");
    div.className = `msg msg--${role}`;
    div.innerHTML = `<span class="msg-role">${role}</span><div class="msg-bubble"></div>`;
    div.querySelector(".msg-bubble").textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div.querySelector(".msg-bubble");
  }

  function addToolTrace(text) {
    const div = document.createElement("div");
    div.className = "tool-trace";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addError(text) {
    const div = document.createElement("div");
    div.className = "error-banner";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------------------------------------------------------------
  // Sending a message (SSE streaming)
  // ---------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || state.controller) return;

    state.messages.push({ role: "user", content: text });
    addMessage("user", text);
    input.value = "";
    autoGrow();

    const bubble = addMessage("assistant", "");
    sendBtn.disabled = true;
    stopBtn.hidden = false;
    toolActivity.hidden = true;

    state.controller = new AbortController();
    let assistantText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: state.controller.signal,
        body: JSON.stringify({
          model: state.model,
          messages: state.messages,
          plugins: state.plugins,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? data.error.message : `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = rawEvent.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          handleStreamEvent(event, payload, bubble, (t) => (assistantText += t));
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") addError(err.message);
    } finally {
      if (assistantText) state.messages.push({ role: "assistant", content: assistantText });
      state.controller = null;
      sendBtn.disabled = false;
      stopBtn.hidden = true;
      toolActivity.hidden = true;
    }
  });

  function handleStreamEvent(event, payload, bubble, appendText) {
    switch (event) {
      case "delta":
        bubble.textContent += payload.content;
        appendText(payload.content);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      case "tool_call":
        toolActivity.hidden = false;
        toolActivity.textContent = `Running ${payload.name}…`;
        addToolTrace(`→ ${payload.name}(${JSON.stringify(payload.arguments)})`);
        break;
      case "tool_result":
        toolActivity.hidden = true;
        if (payload.result && payload.result.status === "pending_approval") {
          showApprovalModal(payload.result);
        }
        addToolTrace(`← ${payload.name}: ${JSON.stringify(payload.result).slice(0, 400)}`);
        break;
      case "error":
        addError(payload.message || "Something went wrong.");
        break;
      default:
        break;
    }
  }

  stopBtn.addEventListener("click", () => {
    if (state.controller) state.controller.abort();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", autoGrow);
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  // ---------------------------------------------------------------
  // GitHub approval modal
  // ---------------------------------------------------------------
  function showApprovalModal(pending) {
    const backdrop = $("approvalBackdrop");
    $("approvalDetail").textContent = JSON.stringify(pending.action, null, 2);
    backdrop.hidden = false;

    const cleanup = () => {
      backdrop.hidden = true;
      $("approvalConfirm").onclick = null;
      $("approvalCancel").onclick = null;
    };
    $("approvalCancel").onclick = cleanup;
    $("approvalConfirm").onclick = async () => {
      await fetch("/api/github/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": readCookie("csrf_token") },
        body: JSON.stringify({ approvalId: pending.approvalId }),
      });
      cleanup();
    };
  }

  renderPlugins();
  loadModels();
})();
