import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Badge from "../components/Badge";
import SectionHead from "../components/SectionHead";
import CompanyIcon from "../components/CompanyIcon";
import { theme } from "../theme";
import { api } from "../api";
import { DEMO_RESULT } from "../demoResult";

// ── Tool Catalog ──────────────────────────────────────────────────────────────
const TOOL_CATALOG = [
  { id: "wfp_support_bot", name: "WFP Support Bot", desc: "Customer support for humanitarian aid distribution, eligibility, and complaints" },
  { id: "unicef_gpt", name: "UNICEF-GPT", desc: "Child welfare Q&A, vaccination schedules, and education initiatives" },
  { id: "unhcr_refugee_assistant", name: "UNHCR Refugee Assistant", desc: "Asylum procedures, resettlement information, and legal rights" },
  { id: "who_health_advisor", name: "WHO Health Advisor", desc: "Health guidance, disease information, and vaccination recommendations" },
];

// ─────────────────────────────────────────────────────────────────────────────
// INPUT PHASE
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, color }) {
  const bg = color || theme.violet;
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 20,
        borderRadius: 10,
        background: checked ? bg : theme.border,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.3s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: "#fff",
          transition: "left 0.3s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

function InputPhase({ onSubmit, onDemoLoad, submitting, submitError }) {
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [inputMethod, setInputMethod] = useState("catalog");
  const [selectedTool, setSelectedTool] = useState("");
  const [apiConfig, setApiConfig] = useState({ endpoint: "", api_key: "", model: "" });
  const [uploadedConversations, setUploadedConversations] = useState([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [experts, setExperts] = useState([
    { id: 1, llm: "claude", name: "Expert 1", model: "Claude Sonnet", company: "Anthropic", letter: "A", color: "#D97757", enabled: true },
    { id: 2, llm: "gpt4o", name: "Expert 2", model: "GPT-4o", company: "OpenAI", letter: "⬡", color: "#10A37F", enabled: true },
    { id: 3, llm: "gemini", name: "Expert 3", model: "Gemini Pro", company: "Google", letter: "G", color: "#4285F4", enabled: true },
  ]);
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [frameworks, setFrameworks] = useState([
    { id: "eu_ai_act", label: "EU AI Act (2024)", desc: "Risk classification, transparency, high-risk system requirements", checked: true },
    { id: "nist", label: "NIST AI RMF", desc: "Risk management, governance, fairness, accountability", checked: true },
    { id: "unesco", label: "UNESCO AI Ethics", desc: "Human rights, fairness, transparency, proportionality", checked: true },
    { id: "owasp", label: "OWASP Top 10 for LLMs", desc: "Prompt injection, data leakage, insecure output handling", checked: true },
    { id: "iso42001", label: "ISO 42001", desc: "AI management system standard", checked: false },
    { id: "unicc", label: "UNICC AI Governance", desc: "UN-specific data sovereignty, sandbox policies", checked: false },
  ]);
  const [uploadedDocs, setUploadedDocs] = useState([]);

  const selectedToolData = TOOL_CATALOG.find(tc => tc.id === selectedTool);

  const toggleExpert = (id) =>
    setExperts((e) => e.map((ex) => ex.id === id ? { ...ex, enabled: !ex.enabled } : ex));

  const toggleFramework = (id) =>
    setFrameworks((f) => f.map((fw) => fw.id === id ? { ...fw, checked: !fw.checked } : fw));

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

  const canSubmit = experts.some((e) => e.enabled) && (
    (inputMethod === "catalog" && selectedTool !== "") ||
    (inputMethod === "api" && apiConfig.endpoint.trim() !== "") ||
    (inputMethod === "upload" && uploadedConversations.length > 0)
  );

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    const agentName = inputMethod === "catalog"
      ? (selectedToolData?.name || selectedTool)
      : inputMethod === "api"
        ? (apiConfig.model || "API Agent")
        : (uploadFileName || "Uploaded Agent");
    const base = {
      agent_name: agentName,
      frameworks: frameworks.filter((f) => f.checked).map((f) => f.id),
      experts: experts.map(({ llm, enabled }) => ({ llm, enabled })),
    };
    if (inputMethod === "catalog") {
      onSubmit({ ...base, conversations: [], input_method: "api_probe", api_config: { tool_id: selectedTool } });
    } else if (inputMethod === "api") {
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

  const activeExperts = experts.filter((e) => e.enabled).length;
  const selectedFrameworks = frameworks.filter((f) => f.checked).length;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: theme.fontSerif, fontSize: 30, fontWeight: 400, color: theme.text, marginBottom: 4, letterSpacing: "-0.02em" }}>
            Council of Experts — AI Safety Evaluation
          </h1>
          <p style={{ fontSize: 14, color: theme.textTer }}>Three independent LLMs evaluate the same agent using a unified rubric, then debate their findings</p>
        </div>
        <button
          onClick={onDemoLoad}
          disabled={submitting}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 20px",
            borderRadius: 8,
            border: `1px solid ${theme.unBlue}33`,
            cursor: submitting ? "wait" : "pointer",
            background: theme.unBluePale,
            color: theme.unBlueDark,
          }}
        >
          ▶ Test Demo
        </button>
      </div>

      {/* ── SECTION 1: Choose a Tool ──────────────────────────────────────── */}
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 28, marginBottom: 16 }}>
        <SectionHead num="1" title="Choose a Tool to Evaluate" />

        {/* Method tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: theme.bgWarm, borderRadius: 10, padding: 4 }}>
          {[
            { id: "catalog", icon: "📋", label: "Tool Catalog", desc: "Select from pre-loaded tools" },
            { id: "api", icon: "🔗", label: "Connect API", desc: "Auto-probe live endpoint" },
            { id: "upload", icon: "📄", label: "Upload Files", desc: "Batch JSON/CSV upload" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setInputMethod(m.id)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: inputMethod === m.id ? theme.surface : "transparent",
                color: inputMethod === m.id ? theme.text : theme.textTer,
                fontSize: 13,
                fontWeight: inputMethod === m.id ? 600 : 500,
                transition: "all 0.2s",
                boxShadow: inputMethod === m.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                textAlign: "left",
              }}
            >
              {m.icon} {m.label}<br /><span style={{ fontSize: 11, fontWeight: 400, color: theme.textTer }}>{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Tool Catalog */}
        {inputMethod === "catalog" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>Select Tool</label>
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer", appearance: "auto" }}
            >
              <option value="">Select a tool...</option>
              {TOOL_CATALOG.map((tool) => (
                <option key={tool.id} value={tool.id}>{tool.name}</option>
              ))}
            </select>
            {selectedToolData && (
              <p style={{ fontSize: 13, color: theme.textSec, margin: "10px 0 0", lineHeight: 1.5 }}>{selectedToolData.desc}</p>
            )}

          </div>
        )}

        {/* Connect API */}
        {inputMethod === "api" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 16, background: theme.unBluePale, borderRadius: 10, border: `1px solid ${theme.unBlue}22` }}>
              <p style={{ fontSize: 13, color: theme.unBlueDark, margin: 0 }}>
                🔗 <strong>Live API Probing:</strong> SafeCouncil connects to your AI agent's API, automatically sends adversarial + normal test prompts, and evaluates the responses.
              </p>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>API Endpoint URL</label>
              <input
                value={apiConfig.endpoint}
                onChange={(e) => setApiConfig({ ...apiConfig, endpoint: e.target.value })}
                placeholder="https://api.example.com/v1/chat/completions"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                onBlur={(e) => { e.target.style.borderColor = theme.border; }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>API Key</label>
                <input
                  type="password"
                  value={apiConfig.api_key}
                  onChange={(e) => setApiConfig({ ...apiConfig, api_key: e.target.value })}
                  placeholder="sk-..."
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                  onBlur={(e) => { e.target.style.borderColor = theme.border; }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>Model Name</label>
                <input
                  value={apiConfig.model}
                  onChange={(e) => setApiConfig({ ...apiConfig, model: e.target.value })}
                  placeholder="e.g., gpt-4o, claude-sonnet"
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = theme.violet; }}
                  onBlur={(e) => { e.target.style.borderColor = theme.border; }}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, color: theme.textTer }}>🔒 API keys are used only during evaluation, never stored. All communication is encrypted end-to-end.</p>
          </div>
        )}

        {/* Upload Files */}
        {inputMethod === "upload" && (
          <div>
            {uploadedConversations.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${isDragging ? theme.violet : theme.border}`,
                  borderRadius: 12,
                  padding: 36,
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragging ? theme.violetPale : "transparent",
                  transition: theme.transition,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; }}
                onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.borderColor = theme.border; }}
              >
                <input ref={fileInputRef} type="file" accept=".json,.csv" onChange={handleFileChange} style={{ display: "none" }} />
                <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: theme.textSec, margin: "0 0 4px" }}>Drop conversation files here or click to upload</p>
                <p style={{ fontSize: 12, color: theme.textTer, margin: 0 }}>JSON (array of prompt/output pairs), CSV, or TXT — max 10MB</p>
                <p style={{ fontSize: 11, color: theme.textTer, marginTop: 8 }}>
                  Expected format: <code style={{ fontFamily: theme.fontMono, fontSize: 11, background: theme.bgWarm, padding: "2px 6px", borderRadius: 4 }}>
                    {`[{"label": "...", "prompt": "...", "output": "..."}]`}
                  </code>
                </p>
              </div>
            ) : (
              <div style={{ padding: 16, background: theme.greenPale, borderRadius: 10, border: `1px solid ${theme.green}30` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.green }}>✓ Loaded {uploadedConversations.length} conversations from {uploadFileName}</span>
                  <button
                    onClick={() => { setUploadedConversations([]); setUploadFileName(""); setUploadError(null); }}
                    style={{ fontSize: 12, color: theme.red, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {uploadedConversations.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fff", color: theme.textSec }}>
                      #{i + 1} {c.label || "Conversation"}
                    </span>
                  ))}
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
      </div>

      {/* ── SECTION 2: Expert Configuration ───────────────────────────────── */}
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 28, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <SectionHead num="2" title="Expert Configuration" badge={<Badge color={theme.textTer}>{activeExperts} active</Badge>} />
          <button
            onClick={() => setShowAddExpert(!showAddExpert)}
            style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, cursor: "pointer", background: theme.surface, color: theme.violet }}
          >
            + Add Expert
          </button>
        </div>
        <p style={{ fontSize: 13, color: theme.textTer, margin: "-12px 0 16px", lineHeight: 1.5 }}>
          Each expert independently evaluates the same <strong style={{ color: theme.textSec }}>unified rubric</strong> across Safety, Governance, and Trust. Multiple vendors ensure diverse perspectives.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {experts.map((ex) => (
            <div
              key={ex.id}
              style={{
                borderRadius: 12,
                padding: 16,
                border: `1px solid ${ex.enabled ? ex.color + "33" : theme.border}`,
                background: ex.enabled ? ex.color + "08" : theme.bgWarm,
                opacity: ex.enabled ? 1 : 0.5,
                transition: "all 0.3s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CompanyIcon letter={ex.letter} color={ex.enabled ? ex.color : theme.textTer} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textTer, textTransform: "uppercase", letterSpacing: 0.5 }}>{ex.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{ex.model}</div>
                  </div>
                </div>
                <Toggle checked={ex.enabled} onChange={() => toggleExpert(ex.id)} color={ex.color} />
              </div>
              <div style={{ fontSize: 12, color: ex.color, fontWeight: 500 }}>{ex.company}</div>
            </div>
          ))}
        </div>
        {showAddExpert && (
          <div style={{ marginTop: 14, padding: 18, background: theme.bgWarm, borderRadius: 12, border: `1px solid ${theme.border}` }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: "0 0 12px" }}>Add Custom Expert</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>Expert Name</label>
                <input placeholder="e.g., Expert 4" style={inputStyle} onFocus={(e) => { e.target.style.borderColor = theme.violet; }} onBlur={(e) => { e.target.style.borderColor = theme.border; }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>LLM Provider</label>
                <select style={{ ...inputStyle, cursor: "pointer" }}>
                  <option>Claude (Anthropic)</option>
                  <option>GPT-4o (OpenAI)</option>
                  <option>Gemini (Google)</option>
                  <option>Llama (Local)</option>
                  <option>Custom API</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 6 }}>API Key</label>
                <input type="password" placeholder="Your API key" style={inputStyle} onFocus={(e) => { e.target.style.borderColor = theme.violet; }} onBlur={(e) => { e.target.style.borderColor = theme.border; }} />
              </div>
            </div>
            <button style={{ fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: theme.violet, color: "#fff", marginTop: 12 }}>
              Add Expert
            </button>
          </div>
        )}
      </div>

      {/* ── SECTION 3: Governance Frameworks & Context ─────────────────────── */}
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 28, marginBottom: 16 }}>
        <SectionHead num="3" title="Governance Frameworks & Context" badge={<Badge color={theme.violet}>{selectedFrameworks} selected</Badge>} />
        <p style={{ fontSize: 13, color: theme.textTer, margin: "-12px 0 16px", lineHeight: 1.5 }}>
          Select which governance standards to evaluate against. Experts will reference these frameworks via RAG (Retrieval-Augmented Generation) to cite specific regulations in their assessments.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {frameworks.map((f) => (
            <div
              key={f.id}
              onClick={() => toggleFramework(f.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${f.checked ? theme.violet + "44" : theme.borderSubtle}`,
                background: f.checked ? theme.violetPale + "55" : theme.surface,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: `2px solid ${f.checked ? theme.violet : theme.border}`,
                  background: f.checked ? theme.violet : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                  transition: "all 0.2s",
                }}
              >
                {f.checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{f.label}</span>
                <p style={{ fontSize: 11, color: theme.textTer, margin: "2px 0 0" }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Custom governance doc upload */}
        <div style={{ borderTop: `1px solid ${theme.borderSubtle}`, paddingTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: theme.textSec, display: "block", marginBottom: 8 }}>Upload Custom Governance Documents (Optional)</label>
          <p style={{ fontSize: 12, color: theme.textTer, margin: "0 0 12px" }}>Upload your organization's internal AI policies. These will be injected into expert prompts as additional evaluation context via RAG.</p>
          <div
            style={{ border: `1px dashed ${theme.border}`, borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
            onClick={() => docInputRef.current?.click()}
          >
            <input ref={docInputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={(e) => {
              if (e.target.files[0]) setUploadedDocs((d) => [...d, e.target.files[0].name]);
            }} />
            <p style={{ fontSize: 13, color: theme.textSec, margin: 0 }}>📎 Drop policy documents here — PDF, DOCX, TXT</p>
          </div>
          {uploadedDocs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {uploadedDocs.map((doc, i) => (
                <span key={i} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: theme.violetPale, color: theme.violet, fontWeight: 500 }}>
                  📎 {doc}
                  <button
                    onClick={() => setUploadedDocs((d) => d.filter((_, idx) => idx !== i))}
                    style={{ background: "none", border: "none", color: theme.violet, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Submission ─────────────────────────────────────────────────────── */}
      {submitError && (
        <div style={{ background: theme.redPale, border: `1px solid ${theme.redBorder}`, borderRadius: theme.radius, padding: "12px 16px", color: theme.red, fontSize: 14, marginBottom: 16 }}>
          <strong>Error:</strong> {submitError}
          {submitError.includes("connect") && (
            <div style={{ marginTop: 4, fontSize: 13, color: theme.textSec }}>
              Make sure the Flask server is running: <code style={{ fontFamily: theme.fontMono }}>cd backend && python app.py</code>
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            fontSize: 16,
            fontWeight: 600,
            padding: "16px 48px",
            borderRadius: 12,
            border: "none",
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
            background: canSubmit && !submitting ? theme.violet : theme.border,
            color: "#fff",
            boxShadow: canSubmit && !submitting ? "0 4px 20px rgba(87,6,140,0.25)" : "none",
            opacity: canSubmit && !submitting ? 1 : 0.5,
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { if (canSubmit && !submitting) e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { if (canSubmit && !submitting) e.currentTarget.style.background = theme.violet; }}
        >
          {submitting ? "Starting evaluation..." : "Run Council Evaluation →"}
        </button>
        <p style={{ fontSize: 12, color: theme.textTer, marginTop: 8 }}>
          {activeExperts} expert{activeExperts !== 1 ? "s" : ""} × {selectedFrameworks} framework{selectedFrameworks !== 1 ? "s" : ""}
        </p>
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
        "Retrieving governance context (RAG)",
        "Expert 1 (Claude) evaluating...",
        "Expert 2 (GPT-4o) evaluating...",
        "Expert 3 (Gemini) evaluating...",
        "Cross-critique: Experts reviewing each other",
        "Council debate & synthesis",
        "Generating final verdict & mitigations",
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
        [0,     snap(0, 5,  "Retrieving governance context (RAG)...")],
        [950,   snap(1, 12, "Expert 1 (Claude) evaluating...")],
        [2900,  snap(2, 28, "Expert 2 (GPT-4o) evaluating...")],
        [4800,  snap(3, 45, "Expert 3 (Gemini) evaluating...")],
        [6700,  snap(4, 64, "Cross-critique: Experts reviewing each other...")],
        [8300,  snap(5, 82, "Council debate & synthesis...")],
        [10100, snap(6, 94, "Generating final verdict & mitigations...")],
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

export default function EvaluatorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("input"); // "input" | "evaluating"
  const [evalId, setEvalId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [evalMeta, setEvalMeta] = useState({ agentName: "", numConversations: 0, numExperts: 0 });
  const [evalError, setEvalError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // On mount: check for ?demo= param to trigger demo mode
  useEffect(() => {
    const demo = searchParams.get("demo");
    if (demo) {
      setEvalMeta({ agentName: "WFP Support Bot", numConversations: 6, numExperts: 3 });
      setIsDemoMode(true);
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
          ? 0
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
    setEvalMeta({ agentName: "WFP Support Bot", numConversations: 6, numExperts: 3 });
    setIsDemoMode(true);
    setPhase("evaluating");
  };

  const handleComplete = (resultData) => {
    // Navigate to the dedicated results page
    if (isDemoMode) {
      navigate("/results/demo");
    } else {
      navigate(`/results/${resultData.eval_id}`);
    }
  };

  const handleError = (error) => {
    setEvalError(error);
  };

  const handleNewEvaluation = () => {
    setPhase("input");
    setEvalId(null);
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

      </main>

      <Footer />
    </div>
  );
}
