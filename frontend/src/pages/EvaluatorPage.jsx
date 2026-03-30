import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import VerdictBadge from "../components/VerdictBadge";
import SeverityBadge from "../components/SeverityBadge";
import ScoreBar from "../components/ScoreBar";
import Badge from "../components/Badge";
import { theme, getSpeakerColor, getScoreColor } from "../theme";
import { api } from "../api";
import { DEMO_RESULT } from "../demoResult";

// ─────────────────────────────────────────────────────────────────────────────
// INPUT PHASE
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? theme.violet : theme.border,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 20 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radiusMd,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.borderSubtle}` }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: theme.textSec, marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  );
}

function InputPhase({ onSubmit, onDemoLoad, submitting, submitError }) {
  const fileInputRef = useRef(null);
  const [agentName, setAgentName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [environment, setEnvironment] = useState("");
  const [dataSensitivity, setDataSensitivity] = useState("High");
  const [conversations, setConversations] = useState([{ label: "", prompt: "", output: "" }]);
  const [experts, setExperts] = useState([
    { llm: "claude", enabled: true, name: "Risk Analyst", subtitle: "Anthropic Claude", color: theme.violet, icon: "🛡️" },
    { llm: "gpt4o", enabled: true, name: "Governance Expert", subtitle: "OpenAI GPT-4o", color: theme.green, icon: "⚖️" },
    { llm: "gemini", enabled: true, name: "Ethics Auditor", subtitle: "Google Gemini", color: theme.unBlueDark, icon: "🧭" },
  ]);
  const [frameworks, setFrameworks] = useState(["eu_ai_act", "nist", "owasp", "unesco"]);
  const [availableFrameworks, setAvailableFrameworks] = useState([]);
  const [activeInputTab, setActiveInputTab] = useState("manual");
  const [apiConfig, setApiConfig] = useState({ endpoint: "", api_key: "", model: "" });
  const [uploadedConversations, setUploadedConversations] = useState([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    api.getFrameworks()
      .then((d) => setAvailableFrameworks(d.frameworks || []))
      .catch(() => setAvailableFrameworks([]));
  }, []);

  const addConversation = () =>
    setConversations((c) => [...c, { label: "", prompt: "", output: "" }]);

  const removeConversation = (i) =>
    setConversations((c) => c.filter((_, idx) => idx !== i));

  const updateConversation = (i, field, value) =>
    setConversations((c) => c.map((conv, idx) => idx === i ? { ...conv, [field]: value } : conv));

  const toggleExpert = (i) =>
    setExperts((e) => e.map((ex, idx) => idx === i ? { ...ex, enabled: !ex.enabled } : ex));

  const toggleFramework = (id) =>
    setFrameworks((f) => f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);

  // ── File parsing helpers ──────────────────────────────────────────────────

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { row.push(field); field = ""; }
        else if (ch === '\n' || (ch === '\r' && next === '\n')) {
          if (ch === '\r') i++;
          row.push(field); field = ""; rows.push(row); row = [];
        } else if (ch === '\r') {
          row.push(field); field = ""; rows.push(row); row = [];
        } else { field += ch; }
      }
    }
    if (field || row.length > 0) { row.push(field); if (row.some((f) => f)) rows.push(row); }
    return rows;
  }

  const processFile = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["json", "csv"].includes(ext)) {
      setUploadError("Only .json and .csv files are supported");
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let convs;
        if (ext === "json") {
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : (data.conversations || []);
          if (!Array.isArray(arr) || arr.length === 0)
            throw new Error("JSON must be an array or { conversations: [...] }");
          convs = arr.map((item, i) => ({
            label: item.label || `Item ${i + 1}`,
            prompt: item.prompt || item.input || item.user || item.question || "",
            output: item.output || item.response || item.answer || item.assistant || "",
          })).filter((c) => c.prompt || c.output);
        } else {
          const rows = parseCSV(text);
          if (rows.length < 2) throw new Error("CSV must have at least 2 rows (header + data)");
          const hdr = rows[0].map((h) => h.trim().toLowerCase());
          const pi = hdr.findIndex((h) => ["prompt", "input", "user", "question"].includes(h));
          const oi = hdr.findIndex((h) => ["output", "response", "answer", "assistant"].includes(h));
          const li = hdr.findIndex((h) => ["label", "name", "title", "id"].includes(h));
          if (pi < 0) throw new Error('CSV must have a "prompt" (or "input"/"user"/"question") column');
          if (oi < 0) throw new Error('CSV must have an "output" (or "response"/"answer") column');
          convs = rows.slice(1).map((row, i) => ({
            label: li >= 0 ? (row[li]?.trim() || `Row ${i + 1}`) : `Row ${i + 1}`,
            prompt: row[pi]?.trim() || "",
            output: row[oi]?.trim() || "",
          })).filter((c) => c.prompt || c.output);
        }
        if (convs.length === 0) throw new Error("No valid conversations found in file");
        setUploadedConversations(convs);
        setUploadFileName(file.name);
      } catch (err) {
        setUploadError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e) => processFile(e.target.files[0]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  // ── Submission ────────────────────────────────────────────────────────────

  const canSubmit = agentName.trim() && experts.some((e) => e.enabled) && (
    (activeInputTab === "manual" && conversations.some((c) => c.prompt.trim() && c.output.trim())) ||
    (activeInputTab === "api" && apiConfig.endpoint.trim() && apiConfig.model.trim()) ||
    (activeInputTab === "upload" && uploadedConversations.length > 0)
  );

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    const base = {
      agent_name: agentName,
      use_case: useCase,
      system_prompt: systemPrompt,
      environment,
      data_sensitivity: dataSensitivity,
      frameworks,
      experts: experts.map(({ llm, enabled }) => ({ llm, enabled })),
    };
    if (activeInputTab === "manual") {
      onSubmit({ ...base, conversations: conversations.filter((c) => c.prompt.trim() && c.output.trim()), input_method: "manual" });
    } else if (activeInputTab === "api") {
      onSubmit({ ...base, conversations: [], input_method: "api_probe", api_config: { endpoint: apiConfig.endpoint, api_key: apiConfig.api_key, model: apiConfig.model } });
    } else {
      onSubmit({ ...base, conversations: uploadedConversations, input_method: "upload" });
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    fontSize: 14,
    color: theme.text,
    background: theme.surface,
    outline: "none",
    transition: theme.transition,
  };

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: theme.fontSerif, fontSize: 32, fontWeight: 400, color: theme.text, marginBottom: 6 }}>
            Council of Experts
          </h1>
          <p style={{ fontSize: 15, color: theme.textSec }}>AI Safety Evaluation — Submit your agent for multi-expert review</p>
        </div>
        <button
          onClick={onDemoLoad}
          disabled={submitting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            background: theme.violetPale,
            color: theme.violet,
            border: `1.5px solid ${theme.violetBorder}`,
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#E0D0F0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = theme.violetPale; }}
        >
          ⚡ Load Demo
        </button>
      </div>

      {/* Agent Info */}
      <SectionCard title="Agent Information" subtitle="Describe the AI agent you want to evaluate">
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>
              Agent Name <span style={{ color: theme.red }}>*</span>
            </label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. WFP Customer Support Bot v2.1"
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
              onBlur={(e) => { e.target.style.borderColor = theme.border; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>Use Case</label>
            <textarea
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="Describe what this agent does, who it serves, and what decisions it makes or influences..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
              onBlur={(e) => { e.target.style.borderColor = theme.border; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Paste the agent's system prompt here..."
              rows={5}
              style={{ ...inputStyle, fontFamily: theme.fontMono, fontSize: 13, resize: "vertical", lineHeight: 1.6 }}
              onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
              onBlur={(e) => { e.target.style.borderColor = theme.border; }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>Deployment Environment</label>
              <input
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                placeholder="e.g. Cloud-hosted, web chat + WhatsApp"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                onBlur={(e) => { e.target.style.borderColor = theme.border; }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>Data Sensitivity</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Low", "Medium", "High", "Critical"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setDataSensitivity(level)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: theme.radiusFull,
                      fontSize: 13,
                      fontWeight: 600,
                      border: `1.5px solid ${dataSensitivity === level ? theme.violet : theme.border}`,
                      background: dataSensitivity === level ? theme.violetPale : theme.surface,
                      color: dataSensitivity === level ? theme.violet : theme.textSec,
                      cursor: "pointer",
                      transition: theme.transition,
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Conversations — tabbed input methods */}
      <SectionCard title="Conversations" subtitle="Choose how to provide conversation data for evaluation">

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${theme.border}` }}>
          {[
            { id: "manual", label: "✎  Manual Entry" },
            { id: "api",    label: "⚡ Connect API" },
            { id: "upload", label: "↑  Upload Files" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveInputTab(tab.id)}
              style={{
                padding: "9px 18px",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${activeInputTab === tab.id ? theme.violet : "transparent"}`,
                marginBottom: -1,
                fontSize: 13,
                fontWeight: activeInputTab === tab.id ? 700 : 500,
                color: activeInputTab === tab.id ? theme.violet : theme.textSec,
                cursor: "pointer",
                transition: theme.transition,
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Manual Entry ── */}
        {activeInputTab === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {conversations.map((conv, i) => (
              <div
                key={i}
                style={{ border: `1px solid ${theme.borderSubtle}`, borderRadius: theme.radius, overflow: "hidden" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: theme.bgWarm,
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.textSec }}>#{i + 1}</span>
                  <input
                    value={conv.label}
                    onChange={(e) => updateConversation(i, "label", e.target.value)}
                    placeholder="Label (e.g. Normal inquiry, Adversarial test)"
                    style={{ flex: 1, margin: "0 12px", padding: "4px 8px", border: `1px solid ${theme.border}`, borderRadius: 4, fontSize: 13, background: theme.surface, color: theme.text, outline: "none" }}
                  />
                  {conversations.length > 1 && (
                    <button
                      onClick={() => removeConversation(i)}
                      style={{ background: "none", border: "none", color: theme.textTer, fontSize: 16, cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = theme.red; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = theme.textTer; }}
                    >✕</button>
                  )}
                </div>
                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 4 }}>USER INPUT</label>
                    <textarea value={conv.prompt} onChange={(e) => updateConversation(i, "prompt", e.target.value)} placeholder="What the user sent to the agent..." rows={3} style={{ ...inputStyle, fontSize: 13, resize: "vertical", lineHeight: 1.5 }} onFocus={(e) => { e.target.style.borderColor = theme.violet; }} onBlur={(e) => { e.target.style.borderColor = theme.border; }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 4 }}>AGENT OUTPUT</label>
                    <textarea value={conv.output} onChange={(e) => updateConversation(i, "output", e.target.value)} placeholder="What the agent responded..." rows={3} style={{ ...inputStyle, fontSize: 13, resize: "vertical", lineHeight: 1.5 }} onFocus={(e) => { e.target.style.borderColor = theme.violet; }} onBlur={(e) => { e.target.style.borderColor = theme.border; }} />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addConversation}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", background: "none", border: `1.5px dashed ${theme.border}`, borderRadius: theme.radius, fontSize: 13, fontWeight: 600, color: theme.textSec, cursor: "pointer", transition: theme.transition }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; e.currentTarget.style.color = theme.violet; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
            >
              + Add Conversation
            </button>
          </div>
        )}

        {/* ── Connect API ── */}
        {activeInputTab === "api" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>
                API Endpoint URL <span style={{ color: theme.red }}>*</span>
              </label>
              <input
                value={apiConfig.endpoint}
                onChange={(e) => setApiConfig({ ...apiConfig, endpoint: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                onBlur={(e) => { e.target.style.borderColor = theme.border; }}
              />
              <div style={{ fontSize: 12, color: theme.textTer, marginTop: 4 }}>
                Must be an OpenAI-compatible{" "}
                <code style={{ fontFamily: theme.fontMono }}>/v1/chat/completions</code> endpoint
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={apiConfig.api_key}
                  onChange={(e) => setApiConfig({ ...apiConfig, api_key: e.target.value })}
                  placeholder="sk-... (leave blank if unauthenticated)"
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                  onBlur={(e) => { e.target.style.borderColor = theme.border; }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>
                  Model Name <span style={{ color: theme.red }}>*</span>
                </label>
                <input
                  value={apiConfig.model}
                  onChange={(e) => setApiConfig({ ...apiConfig, model: e.target.value })}
                  placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                  onBlur={(e) => { e.target.style.borderColor = theme.border; }}
                />
              </div>
            </div>

            <div style={{ background: theme.violetPale, border: `1px solid ${theme.violetBorder}`, borderRadius: theme.radius, padding: "12px 16px", fontSize: 13, color: theme.text, lineHeight: 1.6 }}>
              <strong style={{ color: theme.violet }}>How it works:</strong> SafeCouncil will use Claude to generate{" "}
              <strong>30</strong> test prompts covering all <strong>15</strong> evaluation dimensions
              (2 per dimension) and send each one to your endpoint. The responses are then
              evaluated by the expert council.
            </div>
          </div>
        )}

        {/* ── Upload Files ── */}
        {activeInputTab === "upload" && (
          <div>
            {uploadedConversations.length === 0 ? (
              <div>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? theme.violet : theme.border}`,
                    borderRadius: theme.radiusMd,
                    padding: "48px 24px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: isDragging ? theme.violetPale : theme.bgWarm,
                    transition: theme.transition,
                  }}
                >
                  <input ref={fileInputRef} type="file" accept=".json,.csv" onChange={handleFileChange} style={{ display: "none" }} />
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 6 }}>
                    Drop a file here, or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: theme.textSec }}>
                    Accepts <strong>.json</strong> or <strong>.csv</strong>
                  </div>
                </div>

                <div style={{ marginTop: 14, fontSize: 12, color: theme.textTer, lineHeight: 1.7 }}>
                  <strong>JSON:</strong>{" "}
                  <code style={{ fontFamily: theme.fontMono, background: theme.bgWarm, padding: "1px 4px", borderRadius: 3 }}>
                    {"[{ label, prompt, output }, ...]"}
                  </code>{" "}
                  or{" "}
                  <code style={{ fontFamily: theme.fontMono, background: theme.bgWarm, padding: "1px 4px", borderRadius: 3 }}>
                    {"{ conversations: [...] }"}
                  </code>
                  <br />
                  <strong>CSV:</strong> Header row with{" "}
                  <code style={{ fontFamily: theme.fontMono, background: theme.bgWarm, padding: "1px 4px", borderRadius: 3 }}>prompt</code>
                  {" and "}
                  <code style={{ fontFamily: theme.fontMono, background: theme.bgWarm, padding: "1px 4px", borderRadius: 3 }}>output</code>
                  {" columns (also accepts: input/user/question and response/answer/assistant)"}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: theme.greenPale, border: `1px solid ${theme.greenBorder}`, borderRadius: theme.radius, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: theme.green, fontSize: 16 }}>✓</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                      {uploadedConversations.length} conversation{uploadedConversations.length !== 1 ? "s" : ""} loaded from{" "}
                      <span style={{ fontFamily: theme.fontMono, color: theme.textSec }}>{uploadFileName}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { setUploadedConversations([]); setUploadFileName(""); setUploadError(null); }}
                    style={{ background: "none", border: `1px solid ${theme.greenBorder}`, borderRadius: theme.radius, padding: "4px 10px", fontSize: 12, color: theme.textSec, cursor: "pointer" }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {uploadedConversations.slice(0, 4).map((c, i) => (
                    <div key={i} style={{ background: theme.bgWarm, border: `1px solid ${theme.borderSubtle}`, borderRadius: theme.radius, padding: "10px 14px", fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: theme.text, marginBottom: 4 }}>{c.label || `Conversation ${i + 1}`}</div>
                      <div style={{ color: theme.textSec, fontStyle: "italic" }}>
                        {c.prompt.length > 100 ? c.prompt.slice(0, 100) + "…" : c.prompt}
                      </div>
                    </div>
                  ))}
                  {uploadedConversations.length > 4 && (
                    <div style={{ fontSize: 12, color: theme.textTer, textAlign: "center", padding: "6px 0" }}>
                      + {uploadedConversations.length - 4} more conversation{uploadedConversations.length - 4 !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}

            {uploadError && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: theme.redPale, border: `1px solid ${theme.redBorder}`, borderRadius: theme.radius, fontSize: 13, color: theme.red }}>
                {uploadError}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Expert Configuration */}
      <SectionCard title="Expert Configuration" subtitle="Each expert evaluates the same rubric independently — diversity comes from different vendor perspectives">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          {experts.map((expert, i) => (
            <div
              key={expert.llm}
              style={{
                border: `1.5px solid ${expert.enabled ? expert.color + "60" : theme.border}`,
                borderRadius: theme.radiusMd,
                padding: "16px",
                background: expert.enabled ? theme.surface : theme.bgWarm,
                transition: theme.transition,
                opacity: expert.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: expert.enabled ? expert.color + "20" : theme.border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {expert.icon}
                </div>
                <Toggle checked={expert.enabled} onChange={() => toggleExpert(i)} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: expert.enabled ? theme.text : theme.textTer, marginBottom: 2 }}>
                {expert.name}
              </div>
              <div style={{ fontSize: 12, color: expert.enabled ? expert.color : theme.textTer, fontWeight: 500 }}>
                {expert.subtitle}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Governance Frameworks */}
      <SectionCard title="Governance Frameworks" subtitle="Select which standards to evaluate against">
        {availableFrameworks.length === 0 ? (
          <div style={{ color: theme.textSec, fontSize: 13 }}>Loading frameworks...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {availableFrameworks.map((fw) => (
              <label
                key={fw.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  border: `1.5px solid ${frameworks.includes(fw.id) ? theme.violetBorder : theme.border}`,
                  borderRadius: theme.radius,
                  background: frameworks.includes(fw.id) ? theme.violetPale : theme.surface,
                  cursor: "pointer",
                  transition: theme.transition,
                }}
              >
                <input
                  type="checkbox"
                  checked={frameworks.includes(fw.id)}
                  onChange={() => toggleFramework(fw.id)}
                  style={{ marginTop: 2, accentColor: theme.violet, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{fw.label}</div>
                  <div style={{ fontSize: 12, color: theme.textSec, marginTop: 2 }}>{fw.description}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Submit */}
      {submitError && (
        <div
          style={{
            background: theme.redPale,
            border: `1px solid ${theme.redBorder}`,
            borderRadius: theme.radius,
            padding: "12px 16px",
            color: theme.red,
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          <strong>Error:</strong> {submitError}
          {submitError.includes("connect") && (
            <div style={{ marginTop: 4, fontSize: 13, color: theme.textSec }}>
              Make sure the Flask server is running: <code style={{ fontFamily: theme.fontMono }}>cd backend && python app.py</code>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 32px",
            background: canSubmit && !submitting ? theme.violet : theme.border,
            color: canSubmit && !submitting ? "#fff" : theme.textTer,
            border: "none",
            borderRadius: theme.radiusFull,
            fontSize: 15,
            fontWeight: 700,
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
            transition: theme.transition,
            boxShadow: canSubmit && !submitting ? "0 4px 14px rgba(87,6,140,0.3)" : "none",
          }}
          onMouseEnter={(e) => { if (canSubmit && !submitting) e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { if (canSubmit && !submitting) e.currentTarget.style.background = theme.violet; }}
        >
          {submitting ? "Starting evaluation..." : "Run Council Evaluation →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATING PHASE
// ─────────────────────────────────────────────────────────────────────────────

function EvaluatingPhase({ evalId, agentName, numConversations, numExperts, onComplete, onError, demoMode }) {
  const [statusData, setStatusData] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // ── Demo mode: fake step-by-step progress with timeouts ───────────────
    if (demoMode) {
      const STEPS = [
        "Retrieving governance context",
        "Risk Analyst (Claude) evaluating",
        "Governance Expert (GPT-4o) evaluating",
        "Ethics Auditor (Gemini) evaluating",
        "Cross-critique round",
        "Council debate & synthesis",
        "Generating final verdict",
      ];

      const snap = (runIdx, pct, msg) => ({
        progress: pct,
        current_step: msg,
        steps_completed: STEPS.map((s, i) => ({
          step: s,
          status: i < runIdx ? "complete" : i === runIdx ? "running" : "pending",
        })),
      });

      const schedule = [
        [0,     snap(0, 5,  "Retrieving governance context...")],
        [950,   snap(1, 12, "Risk Analyst (Claude) evaluating...")],
        [2900,  snap(2, 28, "Governance Expert (GPT-4o) evaluating...")],
        [4800,  snap(3, 45, "Ethics Auditor (Gemini) evaluating...")],
        [6700,  snap(4, 64, "Cross-critique round...")],
        [8300,  snap(5, 82, "Council debate & synthesis...")],
        [10100, snap(6, 94, "Generating final verdict...")],
        [11200, {
          progress: 100,
          current_step: "Evaluation complete",
          steps_completed: STEPS.map((s) => ({ step: s, status: "complete" })),
        }],
      ];

      const timers = [];
      schedule.forEach(([delay, snapshot], idx) => {
        timers.push(
          setTimeout(() => {
            setStatusData(snapshot);
            if (idx === schedule.length - 1) {
              timers.push(
                setTimeout(
                  () => onComplete({ ...DEMO_RESULT, timestamp: new Date().toISOString() }),
                  700,
                )
              );
            }
          }, delay)
        );
      });

      return () => timers.forEach(clearTimeout);
    }

    // ── Real mode: poll backend ───────────────────────────────────────────
    if (!evalId) return;

    const poll = async () => {
      try {
        const status = await api.getStatus(evalId);
        setStatusData(status);

        if (status.status === "complete") {
          clearInterval(intervalRef.current);
          const { status: httpStatus, data } = await api.getResult(evalId);
          if (httpStatus === 200) {
            onComplete(data);
          } else {
            onError("Evaluation complete but result could not be fetched.");
          }
        } else if (status.status === "failed") {
          clearInterval(intervalRef.current);
          onError(status.error || "Evaluation failed. Check backend logs.");
        }
      } catch (e) {
        clearInterval(intervalRef.current);
        onError(`Connection error: ${e.message}. Is the Flask server running?`);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => clearInterval(intervalRef.current);
  }, [evalId, demoMode]);

  const steps = statusData?.steps_completed || [];
  const progress = statusData?.progress || 0;
  const currentStep = statusData?.current_step || "Starting...";

  const stepIcon = (status) => {
    if (status === "complete") return <span style={{ color: theme.green, fontSize: 16 }}>✓</span>;
    if (status === "running") return (
      <span style={{ color: theme.amber, fontSize: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>⠋</span>
    );
    if (status === "failed") return <span style={{ color: theme.red, fontSize: 16 }}>✕</span>;
    return <span style={{ color: theme.border, fontSize: 16 }}>○</span>;
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", padding: "40px 0" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {/* Council glyph */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #57068C 0%, #3D72C4 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 28px",
          boxShadow: "0 8px 24px rgba(87,6,140,0.25)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      >
        <span style={{ fontSize: 32 }}>🏛️</span>
      </div>

      <h2 style={{ fontFamily: theme.fontSerif, fontSize: 32, fontWeight: 400, color: theme.text, marginBottom: 8 }}>
        Council in Session
      </h2>
      <p style={{ fontSize: 14, color: theme.textSec, marginBottom: 32 }}>
        Evaluating <strong>{agentName || "your agent"}</strong>
        {numConversations ? ` — ${numConversations} conversation${numConversations > 1 ? "s" : ""}` : ""}
        {numExperts ? ` across ${numExperts} expert${numExperts > 1 ? "s" : ""}` : ""}
      </p>

      {/* Progress bar */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            height: 8,
            background: theme.border,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #57068C 0%, #5B92E5 100%)",
              borderRadius: 4,
              transition: "width 0.5s ease",
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: theme.textSec }}>{currentStep}</div>
      </div>

      {/* Step list */}
      {steps.length > 0 && (
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusMd,
            overflow: "hidden",
            textAlign: "left",
          }}
        >
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: i < steps.length - 1 ? `1px solid ${theme.borderSubtle}` : "none",
                background: step.status === "running" ? theme.amberPale + "40" : "transparent",
              }}
            >
              <div style={{ width: 20, display: "flex", justifyContent: "center" }}>
                {stepIcon(step.status)}
              </div>
              <span
                style={{
                  fontSize: 14,
                  color: step.status === "complete" ? theme.textSec :
                    step.status === "running" ? theme.text :
                    step.status === "failed" ? theme.red : theme.textTer,
                  fontWeight: step.status === "running" ? 600 : 400,
                }}
              >
                {step.step}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: theme.textTer, marginTop: 20 }}>
        Evaluation ID: <span style={{ fontFamily: theme.fontMono }}>{evalId}</span>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────

function categoryAvg(dimensionScores, categoryName) {
  const dims = dimensionScores.filter((d) => d.category === categoryName);
  if (!dims.length) return null;
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
}

function ExpertCard({ assessment }) {
  const topFindings = (assessment.findings || []).slice(0, 3);
  const safetyAvg = categoryAvg(assessment.dimension_scores || [], "Safety");
  const govAvg = categoryAvg(assessment.dimension_scores || [], "Governance & Compliance");
  const trustAvg = categoryAvg(assessment.dimension_scores || [], "Transparency & Accountability");
  const fairAvg = categoryAvg(assessment.dimension_scores || [], "Fairness & Ethics");
  const privAvg = categoryAvg(assessment.dimension_scores || [], "Privacy & Data");

  const color = getSpeakerColor(assessment.expert_name);
  const scoreColor = getScoreColor(assessment.overall_score);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderTop: `3px solid ${color}`,
        borderRadius: theme.radiusMd,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          {assessment.expert_name}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: theme.fontMono, color: scoreColor, lineHeight: 1 }}>
            {assessment.overall_score}
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: theme.textTer }}>/100</div>
            <VerdictBadge verdict={assessment.verdict} size="sm" />
          </div>
        </div>

        {/* Category bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Safety", safetyAvg],
            ["Privacy & Data", privAvg],
            ["Fairness & Ethics", fairAvg],
            ["Transparency", trustAvg],
            ["Governance", govAvg],
          ].filter(([, v]) => v !== null).map(([label, val]) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textSec, marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ fontFamily: theme.fontMono, fontWeight: 600, color: getScoreColor(val) }}>{val}</span>
              </div>
              <ScoreBar score={val} showLabel={false} height={4} compact />
            </div>
          ))}
        </div>
      </div>

      {topFindings.length > 0 && (
        <div style={{ borderTop: `1px solid ${theme.borderSubtle}`, padding: "12px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Top Findings
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topFindings.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <SeverityBadge severity={f.severity} />
                <span style={{ fontSize: 12, color: theme.textSec, lineHeight: 1.4 }}>{f.dimension}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ result }) {
  return (
    <div>
      {/* Expert cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        {(result.expert_assessments || []).map((a) => (
          <ExpertCard key={a.expert_name} assessment={a} />
        ))}
      </div>

      {/* Agreements & Disagreements */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {result.agreements?.length > 0 && (
          <div style={{ background: theme.greenPale, border: `1px solid ${theme.greenBorder}`, borderRadius: theme.radiusMd, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.green, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              ✓ Council Agreements
            </div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {result.agreements.map((a, i) => (
                <li key={i} style={{ fontSize: 13, color: theme.text, lineHeight: 1.5 }}>{typeof a === "string" ? a : a.point || JSON.stringify(a)}</li>
              ))}
            </ul>
          </div>
        )}
        {result.disagreements?.length > 0 && (
          <div style={{ background: theme.amberPale, border: `1px solid ${theme.amberBorder}`, borderRadius: theme.radiusMd, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.amber, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              ⚡ Points of Contention
            </div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {result.disagreements.map((d, i) => (
                <li key={i} style={{ fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                  {typeof d === "string" ? d : d.topic ? `${d.topic}: ${d.resolution || ""}` : JSON.stringify(d)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Tab: Score Comparison
// ─────────────────────────────────────────────────────────────────────────────

function ScoreComparisonTab({ result }) {
  const assessments = result.expert_assessments || [];
  if (!assessments.length) return <p style={{ color: theme.textSec }}>No assessment data available.</p>;

  // Collect all dimensions across all experts
  const allDimensions = [];
  const seen = new Set();
  for (const a of assessments) {
    for (const d of (a.dimension_scores || [])) {
      if (!seen.has(d.dimension)) {
        seen.add(d.dimension);
        allDimensions.push({ dimension: d.dimension, category: d.category });
      }
    }
  }

  // Group by category
  const byCategory = {};
  for (const d of allDimensions) {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d.dimension);
  }

  const getDimScore = (assessment, dimension) => {
    const ds = (assessment.dimension_scores || []).find((d) => d.dimension === dimension);
    return ds ? ds.score : null;
  };

  const expertColors = assessments.map((a) => getSpeakerColor(a.expert_name));

  return (
    <div>
      {/* Expert legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        {assessments.map((a, i) => (
          <div key={a.expert_name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: expertColors[i] }} />
            <span style={{ fontSize: 13, color: theme.textSec }}>{a.expert_name}</span>
          </div>
        ))}
      </div>

      {/* Dimension table */}
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, overflow: "hidden" }}>
        {Object.entries(byCategory).map(([category, dimensions], catIdx) => (
          <div key={category}>
            <div
              style={{
                padding: "10px 16px",
                background: theme.bgWarm,
                borderTop: catIdx > 0 ? `1px solid ${theme.border}` : "none",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {category}
              </span>
            </div>
            {dimensions.map((dim, dimIdx) => (
              <div
                key={dim}
                style={{
                  display: "grid",
                  gridTemplateColumns: `200px repeat(${assessments.length}, 1fr)`,
                  borderTop: `1px solid ${theme.borderSubtle}`,
                  padding: "10px 16px",
                  alignItems: "center",
                  gap: 12,
                  background: dimIdx % 2 === 1 ? theme.bgWarm + "60" : theme.surface,
                }}
              >
                <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{dim}</div>
                {assessments.map((a, i) => {
                  const score = getDimScore(a, dim);
                  return (
                    <div key={a.expert_name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: theme.border, borderRadius: 3, overflow: "hidden" }}>
                        {score !== null && (
                          <div
                            style={{
                              width: `${score}%`,
                              height: "100%",
                              background: expertColors[i],
                              borderRadius: 3,
                              opacity: 0.8,
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: theme.fontMono,
                          color: score !== null ? getScoreColor(score) : theme.textTer,
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {score !== null ? score : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Tab: Expert Debate
// ─────────────────────────────────────────────────────────────────────────────

function DebateTab({ result }) {
  const [filter, setFilter] = useState("All");
  const messages = result.debate_transcript || [];

  const speakers = ["All", ...new Set(
    messages.filter((m) => m.message_type !== "resolution" && m.speaker !== "Council").map((m) => m.speaker)
  )];

  const filtered = filter === "All" ? messages : messages.filter(
    (m) => m.speaker === filter || m.message_type === "resolution" || m.speaker === "Council"
  );

  // Group messages to detect topic changes
  let lastTopic = null;

  return (
    <div>
      {/* Filter buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {speakers.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px",
              borderRadius: theme.radiusFull,
              fontSize: 13,
              fontWeight: 600,
              border: `1.5px solid ${filter === s ? getSpeakerColor(s) || theme.violet : theme.border}`,
              background: filter === s ? (getSpeakerColor(s) || theme.violet) + "15" : theme.surface,
              color: filter === s ? getSpeakerColor(s) || theme.violet : theme.textSec,
              cursor: "pointer",
              transition: theme.transition,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {messages.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No debate transcript available for this evaluation.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map((msg, i) => {
          const showTopicDivider = msg.topic && msg.topic !== lastTopic;
          if (showTopicDivider) lastTopic = msg.topic;
          const speakerColor = getSpeakerColor(msg.speaker);
          const isResolution = msg.message_type === "resolution" || msg.speaker === "Council";

          return (
            <div key={i}>
              {showTopicDivider && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    margin: "20px 0 12px",
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: theme.border }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.violet,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      background: theme.violetPale,
                      padding: "4px 12px",
                      borderRadius: theme.radiusFull,
                      border: `1px solid ${theme.violetBorder}`,
                    }}
                  >
                    {msg.topic}
                  </span>
                  <div style={{ flex: 1, height: 1, background: theme.border }} />
                </div>
              )}

              {isResolution ? (
                <div
                  style={{
                    background: theme.violetPale,
                    border: `1px solid ${theme.violetBorder}`,
                    borderRadius: theme.radiusMd,
                    padding: "16px 20px",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.violet, marginBottom: 8 }}>
                    🏛️ Council Resolution:
                  </div>
                  <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>{msg.message}</p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                    alignItems: "flex-start",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: speakerColor + "20",
                      border: `2px solid ${speakerColor}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: speakerColor,
                    }}
                  >
                    {(msg.speaker || "?")[0]}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: speakerColor }}>
                        {msg.speaker}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: theme.bgWarm,
                          color: theme.textTer,
                          fontWeight: 500,
                        }}
                      >
                        {msg.message_type}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>{msg.message}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Tab: All Findings
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function FindingsTab({ result }) {
  const assessments = result.expert_assessments || [];
  const hasFocus = { CRITICAL: "#8B1A1A", HIGH: theme.redBorder, MEDIUM: theme.amberBorder, LOW: theme.border };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {assessments.map((a) => {
        const findings = [...(a.findings || [])].sort(
          (x, y) => (SEVERITY_ORDER[x.severity] ?? 4) - (SEVERITY_ORDER[y.severity] ?? 4)
        );
        const color = getSpeakerColor(a.expert_name);

        return (
          <div key={a.expert_name}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{a.expert_name}</span>
              <span style={{ fontSize: 12, color: theme.textTer }}>{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
            </div>

            {findings.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  background: theme.greenPale,
                  border: `1px solid ${theme.greenBorder}`,
                  borderRadius: theme.radius,
                  fontSize: 13,
                  color: theme.green,
                }}
              >
                ✓ No findings raised by this expert
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderLeft: `4px solid ${hasFocus[f.severity] || theme.border}`,
                    borderRadius: theme.radius,
                    padding: "14px 16px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    <SeverityBadge severity={f.severity} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: theme.text, marginBottom: 4 }}>
                      {f.dimension}
                    </div>
                    <div style={{ fontSize: 13, color: theme.textSec, lineHeight: 1.5, marginBottom: f.evidence ? 6 : 0 }}>
                      {f.text}
                    </div>
                    {f.evidence && (
                      <div style={{ fontSize: 12, color: theme.textTer, fontStyle: "italic" }}>
                        Evidence: {f.evidence}
                        {f.framework_ref && <span style={{ marginLeft: 8, color: theme.unBlueDark, fontStyle: "normal", fontWeight: 600 }}>{f.framework_ref}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Tab: Action Items
// ─────────────────────────────────────────────────────────────────────────────

function ActionItemsTab({ result, onNewEvaluation }) {
  const mitigations = result.mitigations || [];
  const priorityColors = {
    P0: { bg: "#2D0A0A", text: "#FF6B6B", border: "#8B2020" },
    P1: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
    P2: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    P3: { bg: "#F0F0F5", text: theme.textSec, border: theme.border },
  };

  return (
    <div>
      {mitigations.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No action items generated.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {mitigations.map((m, i) => {
          const pc = priorityColors[m.priority] || priorityColors.P3;
          return (
            <div
              key={i}
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radius,
                padding: "14px 16px",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: theme.fontMono,
                  background: pc.bg,
                  color: pc.text,
                  border: `1px solid ${pc.border}`,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {m.priority}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5, marginBottom: 6 }}>{m.text}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={m.owner} preset="blue" style={{ fontSize: 11 }} />
                  {m.expert_consensus && (
                    <span style={{ fontSize: 12, color: theme.textTer, alignSelf: "center" }}>{m.expert_consensus}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${theme.border}`, paddingTop: 20 }}>
        <button
          onClick={() => alert("PDF export coming soon. See backend/logs/ for the full JSON audit log.")}
          style={{
            padding: "10px 20px",
            background: theme.surface,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            color: theme.textSec,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; e.currentTarget.style.color = theme.violet; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
        >
          Export Report (PDF)
        </button>
        <button
          onClick={() => alert("Share link copied! (Feature coming soon)")}
          style={{
            padding: "10px 20px",
            background: theme.surface,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            color: theme.textSec,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.unBlueDark; e.currentTarget.style.color = theme.unBlueDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
        >
          Share with Team
        </button>
        <button
          onClick={onNewEvaluation}
          style={{
            padding: "10px 20px",
            background: theme.violet,
            color: "#fff",
            border: "none",
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
        >
          + New Evaluation
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PHASE — Container
// ─────────────────────────────────────────────────────────────────────────────

function ResultsPhase({ result, onNewEvaluation }) {
  const [activeTab, setActiveTab] = useState("overview");
  const verdict = result.verdict || {};
  const verdictColors = {
    GO: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
    CONDITIONAL: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    "NO-GO": { bg: theme.redPale, text: theme.red, border: theme.redBorder },
  };
  const vc = verdictColors[verdict.final_verdict] || verdictColors.CONDITIONAL;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "scores", label: "Score Comparison" },
    { id: "debate", label: "Expert Debate ✦" },
    { id: "findings", label: "All Findings" },
    { id: "actions", label: "Action Items" },
  ];

  return (
    <div>
      {/* Verdict banner */}
      <div
        style={{
          background: vc.bg,
          border: `1px solid ${vc.border}`,
          borderRadius: theme.radiusMd,
          padding: "24px 28px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: vc.text, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Council Final Verdict
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <VerdictBadge verdict={verdict.final_verdict} size="xl" />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: theme.fontMono, color: vc.text, lineHeight: 1 }}>
                {verdict.confidence}%
              </div>
              <div style={{ fontSize: 12, color: vc.text, opacity: 0.8 }}>confidence</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: theme.fontMono, color: vc.text, lineHeight: 1 }}>
                {verdict.agreement_rate}%
              </div>
              <div style={{ fontSize: 12, color: vc.text, opacity: 0.8 }}>agreement</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: theme.textSec }}>{result.agent_name}</div>
          <div style={{ fontSize: 11, color: theme.textTer, fontFamily: theme.fontMono }}>
            ID: {result.eval_id}
          </div>
          {result.audit && (
            <div style={{ fontSize: 11, color: theme.textTer, marginTop: 4 }}>
              {result.audit.total_api_calls} calls · {result.audit.evaluation_time_seconds?.toFixed(0)}s · ${result.audit.total_cost_usd?.toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 24,
          borderBottom: `2px solid ${theme.border}`,
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 18px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? theme.violet : "transparent"}`,
              marginBottom: -2,
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? theme.violet : theme.textSec,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: theme.transition,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab result={result} />}
      {activeTab === "scores" && <ScoreComparisonTab result={result} />}
      {activeTab === "debate" && <DebateTab result={result} />}
      {activeTab === "findings" && <FindingsTab result={result} />}
      {activeTab === "actions" && <ActionItemsTab result={result} onNewEvaluation={onNewEvaluation} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluatorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("input"); // "input" | "evaluating" | "results"
  const [evalId, setEvalId] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [evalMeta, setEvalMeta] = useState({ agentName: "", numConversations: 0, numExperts: 0 });
  const [evalError, setEvalError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // On mount: check for ?id= param to load a past evaluation
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setEvalId(id);
      setPhase("evaluating");
    }
  }, []);

  const handleSubmit = async (data) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitEvaluation(data);
      setEvalId(res.eval_id);
      setEvalMeta({
        agentName: data.agent_name,
        numConversations: data.input_method === "api_probe"
          ? 30
          : data.conversations.length,
        numExperts: data.experts.filter((e) => e.enabled).length,
      });
      setPhase("evaluating");
    } catch (e) {
      setSubmitError(e.message || "Failed to submit evaluation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLoad = () => {
    setEvalMeta({ agentName: "WFP Customer Support Bot v2.1", numConversations: 6, numExperts: 3 });
    setIsDemoMode(true);
    setPhase("evaluating");
  };

  const handleComplete = (resultData) => {
    setResult(resultData);
    setPhase("results");
    // Update URL with eval ID for sharing/bookmarking
    navigate(`/evaluate?id=${resultData.eval_id}`, { replace: true });
  };

  const handleError = (error) => {
    setEvalError(error);
  };

  const handleNewEvaluation = () => {
    setPhase("input");
    setEvalId(null);
    setResult(null);
    setEvalError(null);
    setSubmitError(null);
    setIsDemoMode(false);
    navigate("/evaluate", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "40px 24px" }}>

        {/* Eval error state */}
        {evalError && phase === "evaluating" && (
          <div
            style={{
              background: theme.redPale,
              border: `1px solid ${theme.redBorder}`,
              borderRadius: theme.radiusMd,
              padding: "20px 24px",
              marginBottom: 24,
              color: theme.red,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Evaluation Failed</div>
            <div style={{ fontSize: 14 }}>{evalError}</div>
            <button
              onClick={handleNewEvaluation}
              style={{
                marginTop: 12,
                padding: "8px 16px",
                background: theme.red,
                color: "#fff",
                border: "none",
                borderRadius: theme.radiusFull,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Start Over
            </button>
          </div>
        )}

        {phase === "input" && (
          <InputPhase
            onSubmit={handleSubmit}
            onDemoLoad={handleDemoLoad}
            submitting={submitting}
            submitError={submitError}
          />
        )}

        {phase === "evaluating" && !evalError && (
          <EvaluatingPhase
            evalId={evalId}
            agentName={evalMeta.agentName}
            numConversations={evalMeta.numConversations}
            numExperts={evalMeta.numExperts}
            onComplete={handleComplete}
            onError={handleError}
            demoMode={isDemoMode}
          />
        )}

        {phase === "results" && result && (
          <ResultsPhase result={result} onNewEvaluation={handleNewEvaluation} />
        )}
      </main>

      <Footer />
    </div>
  );
}
