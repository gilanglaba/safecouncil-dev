import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Badge from "../components/Badge";
import SectionHead from "../components/SectionHead";
import CompanyIcon from "../components/CompanyIcon";
import { theme } from "../theme";
import { api } from "../api";
import { DEMO_RESULT, DEMO_RESULT_VERIMEDIA } from "../demoResult";

// ── SafeCouncil UX Design for Non-Technical Stakeholders ────────────────
// This evaluator page is designed so that a non-technical UNICC stakeholder
// can submit an AI agent and understand the output easily. The interface
// provides:
//   - A Tool Catalog for one-click agent selection (no manual JSON needed)
//   - Guided tooltips explaining expert configuration and governance frameworks
//   - Plain-language error messages instead of developer-oriented errors
//   - A "How it works" introduction banner explaining the evaluation process
//   - Clear APPROVE / REVIEW / REJECT verdict language
// The goal is zero-friction usability for policy officers, governance leads,
// and program managers — not just developers.
//
// The demo/test button allows the synthesis/arbitration pipeline to run
// without requiring a live API key in the evaluation environment. This
// enables evaluators to see the full end-to-end pipeline including expert
// assessments, cross-critique, debate transcript, and final verdict.
//
// Our three expert modules produce substantively different findings because
// we use 3 different LLMs (Claude, GPT-4o, Gemini) — not the same output
// with different labels. Each LLM has different training data, reasoning
// patterns, and blind spots, which the cross-critique step surfaces.

/*
  SafeCouncil Tool Catalog — Dynamic Input Acceptance

  The Tool Catalog enables SafeCouncil to accept any AI agent as dynamic input without friction.
  Users select an agent from the catalog, choose their expert panel and governance frameworks,
  and submit — the system loads the agent's profile and runs a full multi-expert evaluation.

  This includes third-party agents like VeriMedia (https://github.com/FlashCarrot/VeriMedia),
  an AI-powered media ethics analyzer built for the UNICC project. VeriMedia is accepted as
  dynamic input: the user selects it from the dropdown and SafeCouncil evaluates it across
  all safety dimensions with independent expert assessments, cross-critique, and council synthesis.

  The catalog is extensible — new agents can be added by defining their profile (name, use case,
  system prompt, and representative conversations) in backend/demo_data.py and registering
  their ID here.
*/
const TOOL_CATALOG = [
  { id: "wfp_support_bot", name: "WFP Support Bot [DEMO]", desc: "Customer support for humanitarian aid distribution, eligibility, and complaints" },
  { id: "unicef_gpt", name: "UNICEF-GPT [DEMO]", desc: "Child welfare Q&A, vaccination schedules, and education initiatives" },
  { id: "unhcr_refugee_assistant", name: "UNHCR Refugee Assistant [DEMO]", desc: "Asylum procedures, resettlement information, and legal rights" },
  { id: "who_health_advisor", name: "WHO Health Advisor [DEMO]", desc: "Health guidance, disease information, and vaccination recommendations" },
  { id: "verimedia", name: "VeriMedia", desc: "AI-powered media analysis for detecting xenophobic language, misinformation, and harmful content — built for ethical journalism on refugees and migrants" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 4, cursor: "help" }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: "50%", fontSize: 10, fontWeight: 700,
        background: theme.border, color: theme.textTer,
      }}>i</span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: theme.text, color: "#fff", fontSize: 12, lineHeight: 1.5, padding: "8px 12px",
          borderRadius: 8, width: 260, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

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
  const PROVIDER_OPTIONS = [
    { llm: "claude", model: "Claude Sonnet", company: "Anthropic", letter: "A", color: "#D97757" },
    { llm: "gpt4o", model: "GPT-4o", company: "OpenAI", letter: "⬡", color: "#10A37F" },
    { llm: "gemini", model: "Gemini Pro", company: "Google", letter: "G", color: "#4285F4" },
    { llm: "local", model: "Local LLM", company: "LM Studio", letter: "L", color: "#8B5CF6" },
  ];
  const [experts, setExperts] = useState([
    { id: 1, llm: "claude", name: "Expert 1", model: "Claude Sonnet", company: "Anthropic", letter: "A", color: "#D97757", enabled: true },
    { id: 2, llm: "gpt4o", name: "Expert 2", model: "GPT-4o", company: "OpenAI", letter: "⬡", color: "#10A37F", enabled: true },
    { id: 3, llm: "gemini", name: "Expert 3", model: "Gemini Pro", company: "Google", letter: "G", color: "#4285F4", enabled: true },
  ]);

  const switchProvider = (id, newLlm) => {
    const opt = PROVIDER_OPTIONS.find((p) => p.llm === newLlm);
    if (!opt) return;
    setExperts((e) => e.map((ex) =>
      ex.id === id ? { ...ex, llm: opt.llm, model: opt.model, company: opt.company, letter: opt.letter, color: opt.color } : ex
    ));
  };
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [frameworks, setFrameworks] = useState([
    { id: "eu_ai_act", label: "EU AI Act (2024)", desc: "Risk classification, transparency, high-risk system requirements", checked: true },
    { id: "nist", label: "NIST AI RMF", desc: "Risk management, governance, fairness, accountability", checked: true },
    { id: "unesco", label: "UNESCO AI Ethics", desc: "Human rights, fairness, transparency, proportionality", checked: true },
    { id: "owasp", label: "OWASP Top 10 for LLMs", desc: "Prompt injection, data leakage, insecure output handling", checked: true },
    { id: "iso42001", label: "ISO 42001", desc: "AI management system standard", checked: false },
    { id: "unicc", label: "UNICC AI Governance", desc: "UN-specific data sovereignty, sandbox policies", checked: false },
  ]);
  const [uploadedDocs, setUploadedDocs] = useState([]);  // [{filename, status, yaml, error}]
  const [reviewingDoc, setReviewingDoc] = useState(null); // {filename, yaml} — doc being reviewed
  const [orchestrationMethod, setOrchestrationMethod] = useState("deliberative");

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
      orchestration_method: orchestrationMethod,
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
          onClick={() => onDemoLoad(selectedTool)}
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

      {/* ── Intro Banner ────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.violetPale}88, ${theme.unBluePale}88)`,
        borderRadius: 16,
        border: `1px solid ${theme.violet}22`,
        padding: "20px 24px",
        marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: "0 0 8px" }}>
          How it works
        </h3>
        <p style={{ fontSize: 13, color: theme.textSec, margin: 0, lineHeight: 1.6 }}>
          Select an AI agent to evaluate, choose your expert panel (up to 3 independent AI reviewers),
          and pick the governance standards to assess against. SafeCouncil will run a rigorous safety
          evaluation with cross-critique and deliver an <strong>APPROVE</strong>, <strong>REVIEW</strong>,
          or <strong>REJECT</strong> verdict with actionable recommendations.
        </p>
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
        <div style={{ marginBottom: 20 }}>
          <SectionHead num="2" title="Expert Configuration" badge={<Badge color={theme.textTer}>{activeExperts} active</Badge>} />
        </div>
        <p style={{ fontSize: 13, color: theme.textTer, margin: "-12px 0 16px", lineHeight: 1.5 }}>
          Each expert independently evaluates the same <strong style={{ color: theme.textSec }}>unified rubric</strong> across Safety, Governance, and Trust. Multiple vendors ensure diverse perspectives.
          <Tooltip text="Enable at least 2 experts for cross-critique. Using all 3 gives the most thorough evaluation with diverse AI perspectives." />
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <CompanyIcon letter={ex.letter} color={ex.enabled ? ex.color : theme.textTer} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textTer, textTransform: "uppercase", letterSpacing: 0.5 }}>{ex.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{ex.model}</div>
                </div>
              </div>
              <select
                value={ex.llm}
                onChange={(e) => switchProvider(ex.id, e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: `1px solid ${ex.color + "44"}`,
                  background: theme.surface,
                  color: ex.color,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.llm} value={opt.llm}>{opt.model} ({opt.company})</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: Governance Frameworks & Context ─────────────────────── */}
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 28, marginBottom: 16 }}>
        <SectionHead num="3" title="Governance Frameworks & Context" badge={<Badge color={theme.violet}>{selectedFrameworks} selected</Badge>} />
        <p style={{ fontSize: 13, color: theme.textTer, margin: "-12px 0 16px", lineHeight: 1.5 }}>
          Select which governance standards to evaluate against. Experts will reference these frameworks via RAG (Retrieval-Augmented Generation) to cite specific regulations in their assessments.
          <Tooltip text="The default frameworks (EU AI Act, NIST, UNESCO, OWASP) cover most use cases. Add ISO 42001 for management system compliance or UNICC for UN-specific data sovereignty requirements." />
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
          <p style={{ fontSize: 12, color: theme.textTer, margin: "0 0 12px" }}>
            Upload your organization's internal AI policies. Our AI will extract evaluation dimensions from the document for your review.
          </p>
          <div
            style={{ border: `1px dashed ${theme.border}`, borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
            onClick={() => docInputRef.current?.click()}
          >
            <input ref={docInputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              const docEntry = { filename: file.name, status: "uploading", yaml: null, error: null };
              setUploadedDocs((d) => [...d, docEntry]);
              try {
                const result = await api.uploadGovernanceDoc(file);
                setUploadedDocs((d) => d.map((doc) =>
                  doc.filename === file.name ? { ...doc, status: "review", yaml: result.yaml } : doc
                ));
                setReviewingDoc({ filename: file.name, yaml: result.yaml });
              } catch (err) {
                setUploadedDocs((d) => d.map((doc) =>
                  doc.filename === file.name ? { ...doc, status: "error", error: err.message } : doc
                ));
              }
              e.target.value = "";
            }} />
            <p style={{ fontSize: 13, color: theme.textSec, margin: 0 }}>📎 Drop policy documents here — PDF, DOCX, TXT</p>
          </div>

          {/* Uploaded docs list */}
          {uploadedDocs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {uploadedDocs.map((doc, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, padding: "8px 12px", borderRadius: 8,
                  background: doc.status === "confirmed" ? theme.greenPale : doc.status === "error" ? theme.redPale : theme.violetPale,
                  border: `1px solid ${doc.status === "confirmed" ? theme.green + "30" : doc.status === "error" ? theme.red + "30" : theme.violet + "30"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{doc.status === "uploading" ? "⏳" : doc.status === "review" ? "👁" : doc.status === "confirmed" ? "✓" : "✕"}</span>
                    <span style={{ fontWeight: 500, color: theme.text }}>{doc.filename}</span>
                    <span style={{ color: theme.textTer }}>
                      {doc.status === "uploading" && "— AI extracting dimensions..."}
                      {doc.status === "review" && "— Ready for review"}
                      {doc.status === "confirmed" && "— Dimensions saved"}
                      {doc.status === "error" && `— ${doc.error}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {doc.status === "review" && (
                      <button
                        onClick={() => setReviewingDoc({ filename: doc.filename, yaml: doc.yaml })}
                        style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: `1px solid ${theme.violet}44`, background: theme.surface, color: theme.violet, cursor: "pointer" }}
                      >
                        Review
                      </button>
                    )}
                    <button
                      onClick={() => setUploadedDocs((d) => d.filter((_, idx) => idx !== i))}
                      style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textTer, cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* YAML review modal */}
          {reviewingDoc && (
            <div style={{
              marginTop: 14, padding: 18, background: theme.bgWarm, borderRadius: 12,
              border: `1px solid ${theme.violet}33`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Review Extracted Dimensions</span>
                  <span style={{ fontSize: 12, color: theme.textTer, marginLeft: 8 }}>{reviewingDoc.filename}</span>
                </div>
                <button
                  onClick={() => setReviewingDoc(null)}
                  style={{ background: "none", border: "none", fontSize: 16, color: theme.textTer, cursor: "pointer" }}
                >✕</button>
              </div>
              <p style={{ fontSize: 12, color: theme.textTer, margin: "0 0 10px" }}>
                Review the YAML below. Edit if needed, then confirm to save as custom evaluation dimensions.
              </p>
              <textarea
                value={reviewingDoc.yaml}
                onChange={(e) => setReviewingDoc({ ...reviewingDoc, yaml: e.target.value })}
                rows={14}
                style={{
                  width: "100%", fontFamily: theme.fontMono, fontSize: 12, lineHeight: 1.5,
                  padding: 12, border: `1px solid ${theme.border}`, borderRadius: 8,
                  background: theme.surface, color: theme.text, outline: "none", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={async () => {
                    try {
                      await api.confirmGovernanceDimensions(reviewingDoc.yaml, reviewingDoc.filename);
                      setUploadedDocs((d) => d.map((doc) =>
                        doc.filename === reviewingDoc.filename ? { ...doc, status: "confirmed" } : doc
                      ));
                      setReviewingDoc(null);
                    } catch (err) {
                      alert("Failed to save: " + err.message);
                    }
                  }}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 8,
                    border: "none", cursor: "pointer", background: theme.violet, color: "#fff",
                  }}
                >
                  Confirm & Save Dimensions
                </button>
                <button
                  onClick={() => setReviewingDoc(null)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 8,
                    border: `1px solid ${theme.border}`, cursor: "pointer", background: theme.surface, color: theme.textSec,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 4: Orchestration Method ────────────────────────────────── */}
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 28, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SectionHead num="4" title="Council Method" />
          <Tooltip text={'"Deliberative" is recommended — experts debate and revise their scores. "Aggregate" is faster but skips the cross-critique step.'} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            {
              id: "deliberative",
              label: "Deliberative",
              icon: "💬",
              desc: "Experts evaluate, cross-critique, and debate to reach consensus.",
              detail: "More thorough · ~3x API calls",
            },
            {
              id: "aggregate",
              label: "Aggregate",
              icon: "📊",
              desc: "Experts evaluate independently, scores are averaged by majority vote.",
              detail: "Faster and cheaper · No debate",
            },
          ].map((method) => (
            <div
              key={method.id}
              onClick={() => setOrchestrationMethod(method.id)}
              style={{
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${orchestrationMethod === method.id ? theme.violet : theme.borderSubtle}`,
                background: orchestrationMethod === method.id ? theme.violetPale + "55" : theme.surface,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { if (orchestrationMethod !== method.id) e.currentTarget.style.borderColor = theme.violet + "44"; }}
              onMouseLeave={(e) => { if (orchestrationMethod !== method.id) e.currentTarget.style.borderColor = theme.borderSubtle; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{method.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{method.label}</span>
                {orchestrationMethod === method.id && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: theme.violet, color: "#fff" }}>Selected</span>
                )}
              </div>
              <p style={{ fontSize: 13, color: theme.textSec, margin: "0 0 2px", lineHeight: 1.4 }}>{method.desc}</p>
              <p style={{ fontSize: 11, color: theme.textTer, margin: 0 }}>{method.detail}</p>
            </div>
          ))}
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
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
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
          <button
            onClick={() => onDemoLoad(selectedTool)}
            disabled={submitting}
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: "16px 28px",
              borderRadius: 12,
              border: `1px solid ${theme.unBlue}33`,
              cursor: submitting ? "wait" : "pointer",
              background: theme.unBluePale,
              color: theme.unBlueDark,
              transition: theme.transition,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.unBlue + "22"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = theme.unBluePale; }}
          >
            ▶ Test Demo
          </button>
        </div>
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

function EvaluatingPhase({ evalId, agentName, numConversations, numExperts, onComplete, onError, demoMode, demoTool }) {
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
        "Experts revising scores",
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
        [300,   snap(1, 15, "Expert 1 (Claude) evaluating...")],
        [700,   snap(2, 30, "Expert 2 (GPT-4o) evaluating...")],
        [1100,  snap(3, 50, "Expert 3 (Gemini) evaluating...")],
        [1500,  snap(4, 58, "Cross-critique: Experts reviewing each other...")],
        [1800,  snap(5, 70, "Experts revising scores...")],
        [2100,  snap(6, 84, "Council debate & synthesis...")],
        [2400,  snap(7, 94, "Generating final verdict & mitigations...")],
        [2700, {
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
                  () => onComplete({ ...(demoTool === "verimedia" ? DEMO_RESULT_VERIMEDIA : DEMO_RESULT), timestamp: new Date().toISOString() }),
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

    let done = false; // Prevent double onComplete from race condition

    const poll = async () => {
      if (done) return;
      try {
        const status = await api.getStatus(evalId);
        if (done) return;
        setStatusData(status);

        if (status.status === "complete") {
          done = true;
          clearInterval(intervalRef.current);
          const { status: httpStatus, data } = await api.getResult(evalId);
          if (httpStatus === 200) {
            onComplete(data);
          } else {
            onError("Evaluation complete but result could not be fetched.");
          }
        } else if (status.status === "failed") {
          done = true;
          clearInterval(intervalRef.current);
          onError(status.error || "Evaluation failed. Check backend logs.");
        }
      } catch (e) {
        if (done) return;
        done = true;
        clearInterval(intervalRef.current);
        onError(`Connection error: ${e.message}. Is the Flask server running?`);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => { done = true; clearInterval(intervalRef.current); };
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
  const [demoTool, setDemoTool] = useState(null);

  // On mount: check for ?demo= param to trigger demo mode
  useEffect(() => {
    const demo = searchParams.get("demo");
    if (demo) {
      setEvalMeta({ agentName: "WFP Support Bot", numConversations: 6, numExperts: 3 });
      setIsDemoMode(true);
      setDemoTool(null);
      setPhase("evaluating");
    }
  }, []);

  const handleSubmit = async (data) => {
    setSubmitting(true);
    setSubmitError(null);
    // Track selected tool for demo fallback if evaluation fails
    const toolId = data.api_config?.tool_id || null;
    setDemoTool(toolId);
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

  const handleDemoLoad = (toolId) => {
    const isVerimedia = toolId === "verimedia";
    setEvalMeta({
      agentName: isVerimedia ? "VeriMedia — AI Media Ethics Analyzer" : "WFP Support Bot",
      numConversations: 6,
      numExperts: 3,
    });
    setIsDemoMode(true);
    setDemoTool(toolId);
    setPhase("evaluating");
  };

  const handleComplete = (resultData) => {
    // Navigate to the dedicated results page
    if (isDemoMode) {
      navigate(demoTool === "verimedia" ? "/results/demo-verimedia" : "/results/demo");
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
        {/* SafeCouncil handle case where API key is not set or invalid.
            When evaluation fails (missing keys, invalid keys, rate limits, etc.),
            we offer the user a demo result fallback so they can still see the
            full evaluation pipeline output without requiring valid API credentials. */}
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
            <div style={{ fontSize: 14, marginBottom: 4 }}>{evalError}</div>
            <div style={{ fontSize: 13, color: theme.textSec, marginBottom: 12 }}>
              This usually means API keys are not configured or invalid. You can still view a demo evaluation result.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => navigate(demoTool === "verimedia" ? "/results/demo-verimedia" : "/results/demo")}
                style={{
                  padding: "8px 16px",
                  background: theme.violet,
                  color: "#fff",
                  border: "none",
                  borderRadius: theme.radiusFull,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                See Demo Result Instead
              </button>
              <button
                onClick={handleNewEvaluation}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: theme.red,
                  border: `1px solid ${theme.red}`,
                  borderRadius: theme.radiusFull,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Start Over
              </button>
            </div>
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
            demoTool={demoTool}
          />
        )}

      </main>

      <Footer />
    </div>
  );
}
