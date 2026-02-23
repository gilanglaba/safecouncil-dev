"""
RAG-lite governance framework text chunks.
Each entry contains an accurate, curated summary of the framework
suitable for inclusion in AI safety evaluation prompts.
"""

from typing import List

FRAMEWORKS: dict = {
    "eu_ai_act": {
        "label": "EU AI Act (2024)",
        "description": "Risk classification, transparency, high-risk requirements",
        "default": True,
        "text": """
## EU Artificial Intelligence Act (2024) — Key Provisions

### Risk Classification (Articles 5–6)
The EU AI Act establishes a four-tier risk hierarchy:

1. **Prohibited AI** (Article 5): AI systems that pose unacceptable risk are banned outright. This includes:
   - Social scoring by governments or private actors
   - Real-time remote biometric surveillance in public spaces (with narrow exceptions for law enforcement)
   - Subliminal manipulation exploiting vulnerabilities
   - Exploitation of children or vulnerable groups

2. **High-Risk AI** (Annex III): AI systems requiring mandatory conformity assessment before deployment. Categories include:
   - Biometric identification and categorization
   - Critical infrastructure (energy, water, transport)
   - Education and vocational training (access, assessment)
   - Employment (recruitment, task allocation, performance monitoring, termination)
   - Essential private/public services (credit scoring, benefits, emergency dispatch)
   - Law enforcement and border control
   - Administration of justice
   - Democratic processes (campaigning, voting systems)

3. **Limited-Risk AI**: Subject to transparency obligations (e.g., chatbots must disclose they are AI).

4. **Minimal-Risk AI**: No regulatory requirements beyond voluntary codes of conduct.

### Requirements for High-Risk Systems (Articles 9–15)
Providers and deployers of high-risk AI must implement:

- **Risk Management System** (Article 9): Continuous iterative process throughout the lifecycle, identifying and mitigating foreseeable risks.
- **Data Governance** (Article 10): Training data must be relevant, representative, and free of biases likely to cause discriminatory outputs. Data quality practices required.
- **Technical Documentation** (Article 11): Comprehensive documentation enabling conformity assessment, including design specifications, training data, testing procedures.
- **Record-Keeping & Logging** (Article 12): Automatic logging of system operations to enable traceability and audit.
- **Transparency** (Article 13): Clear, understandable information for deployers about the system's purpose, capabilities, limitations, and performance metrics.
- **Human Oversight** (Article 14): Measures enabling natural persons to understand, oversee, and intervene in AI outputs. Systems must allow override/pause.
- **Accuracy, Robustness, Cybersecurity** (Article 15): Systems must be resilient to adversarial attacks, bias, errors, and inconsistencies.

### General-Purpose AI Models (Articles 51–55)
Large language models and general-purpose AI (GPAI) must:
- Maintain technical documentation
- Comply with copyright laws
- Publish summaries of training data
- Models with systemic risk (>10^25 FLOPs) require adversarial testing, incident reporting, and cybersecurity measures.

### Transparency for Interacting Systems (Article 50)
AI systems interacting directly with users must inform them they are interacting with AI (unless obvious). Deepfakes and AI-generated content must be labeled.

### Humanitarian/Development Context
For UN agencies and humanitarian operators: Systems deployed in high-sensitivity contexts (refugee assistance, food aid distribution, health services) are likely to qualify as high-risk under employment, essential services, or public administration categories, requiring full compliance with Articles 9–15.
""",
    },
    "nist": {
        "label": "NIST AI RMF",
        "description": "Risk management, governance, fairness",
        "default": True,
        "text": """
## NIST Artificial Intelligence Risk Management Framework (AI RMF 1.0)

### Overview
The NIST AI RMF (January 2023) provides a voluntary, flexible framework for organizations to manage AI risks across the full AI lifecycle. It emphasizes trustworthiness through seven properties: Valid and Reliable, Safe, Secure and Resilient, Explainable and Interpretable, Privacy Enhanced, Fair with Bias Managed, and Accountable and Transparent.

### Core Functions

**GOVERN** — Establish culture, accountability, and policies
- Organizational policies assign accountability for AI risk management
- Risk tolerance defined for the organization and individual AI systems
- Workforce trained on AI risk management roles and responsibilities
- Legal, compliance, and ethical considerations integrated into AI development
- Mechanisms for AI incident reporting and feedback collection
- Policies cover AI supply chain and third-party risks

**MAP** — Categorize risk context
- AI system purpose, context, and expected users identified
- Business requirements, legal obligations, and stakeholder needs documented
- Potential negative impacts (harms to individuals, groups, society, environment) enumerated
- Risk prioritization across likelihood and magnitude
- Data and model provenance documented

**MEASURE** — Analyze and assess risks
- Quantitative and qualitative metrics defined for each AI risk category
- Bias testing across demographic groups (race, gender, age, disability, geography)
- Robustness testing including adversarial inputs, distributional shift, edge cases
- Explainability assessed: can outputs be understood by operators and affected individuals?
- Privacy impact assessment conducted
- Performance benchmarked against appropriate baselines with disaggregated results

**MANAGE** — Prioritize and implement risk treatments
- Identified risks prioritized and treated with controls (mitigate, transfer, accept, avoid)
- Monitoring mechanisms deployed for ongoing performance tracking
- Incident response plans for AI failures, biased outputs, or misuse
- Residual risk documented and accepted by appropriate authority
- Human oversight mechanisms maintained and regularly tested
- AI system retirement processes defined

### Key Risk Categories for LLM-based Systems
- **Bias & Fairness**: Differential performance across demographic groups; stereotyping; exclusion
- **Explainability**: Can the system's outputs be explained to operators and affected individuals?
- **Privacy**: Memorization of training data; inference attacks; disclosure of PII
- **Robustness**: Adversarial prompts; out-of-distribution inputs; prompt injection
- **Security**: Unauthorized access; model extraction; data poisoning
- **Human-AI Configuration**: Appropriate role for human oversight given stakes and reliability
- **Transparency**: Disclosure of AI involvement to end users; limitations communicated

### Accountability Structure
Organizations should designate:
- **AI Risk Owner**: Accountable for AI risk decisions for each system
- **AI Developer**: Responsible for technical implementation and documentation
- **AI Deployer**: Responsible for deployment context, monitoring, and user impact
- **AI Operator**: Day-to-day operation and escalation

The NIST AI RMF cross-references NIST SP 800-218A (secure AI development), NIST SP 1270 (AI bias), and aligns with ISO/IEC 42001.
""",
    },
    "unesco": {
        "label": "UNESCO AI Ethics",
        "description": "Human rights, fairness, proportionality",
        "default": True,
        "text": """
## UNESCO Recommendation on the Ethics of Artificial Intelligence (2021)

### Overview
Adopted by 193 member states in November 2021, the UNESCO Recommendation is the first global standard-setting instrument on AI ethics. It addresses the full AI lifecycle — research, design, development, deployment, and use — and prioritizes human rights, dignity, and sustainable development.

### Core Principles

**1. Proportionality and Do No Harm**
AI systems must be proportionate to the legitimate aims pursued. Where potential harms outweigh benefits, AI should not be used. Developers must conduct impact assessments. The precautionary principle applies to novel and uncertain risks.

**2. Safety and Security**
AI systems must be technically robust and operate safely within intended parameters. Security vulnerabilities, adversarial attacks, and system failures must be anticipated and mitigated.

**3. Fairness and Non-Discrimination**
AI must not perpetuate or amplify existing social inequalities. Systems must be designed to address biases in data and algorithms. Non-discrimination is non-negotiable — systems must perform equitably across gender, race, age, disability, geography, and other protected characteristics.

**4. Sustainability**
AI development must consider environmental impact (energy consumption, carbon footprint) and contribute to sustainable development goals.

**5. Right to Privacy and Data Protection**
Privacy is a fundamental right. AI systems must not enable mass surveillance, unauthorized data collection, or profiling without meaningful consent. Data minimization principles apply.

**6. Human Oversight and Determination**
Humans must retain ultimate authority over decisions affecting individuals. Fully autonomous AI decision-making in high-stakes domains (justice, welfare, security) is inappropriate. Human review must be accessible and effective — not a rubber stamp.

**7. Transparency and Explainability**
People must know when they are interacting with AI. Individuals have the right to understand how AI systems make decisions that affect them. Algorithmic accountability requires that explanations be accessible to non-experts.

**8. Responsibility and Accountability**
Clear chains of responsibility must be established. When AI causes harm, affected individuals must have access to remedies. Liability frameworks must not create accountability gaps.

**9. Awareness and Literacy**
AI developers, deployers, and users must be equipped with adequate knowledge. Populations affected by AI systems have the right to understand how AI impacts their lives.

**10. Multi-Stakeholder and Adaptive Governance**
AI governance should be inclusive, participatory, and adaptive. Marginalized communities — including refugees, displaced persons, and conflict-affected populations — must be included in AI governance processes that affect them.

### Humanitarian and Development Contexts
The Recommendation specifically addresses vulnerable populations. AI deployed in humanitarian operations, refugee assistance, food security, or development programming must:
- Obtain meaningful, informed consent (adapted for literacy levels and languages)
- Ensure community participation in design and governance
- Maintain special protections for sensitive data (health, displacement status, financial need)
- Provide effective human recourse mechanisms
- Avoid digital exclusion of those without reliable connectivity or digital literacy

UNESCO Recommendation aligns with the UN Secretary-General's "Roadmap for Digital Cooperation" and the "AI for Good" agenda.
""",
    },
    "owasp": {
        "label": "OWASP Top 10 for LLMs",
        "description": "Prompt injection, data leakage, insecure output",
        "default": True,
        "text": """
## OWASP Top 10 for Large Language Model Applications (v1.1, 2023)

### LLM01: Prompt Injection
Attackers manipulate LLM behavior by crafting inputs that override the system prompt, ignore instructions, or redirect the model to perform unintended actions.
- **Direct Injection**: User inputs malicious content in their prompt ("Ignore previous instructions and...")
- **Indirect Injection**: External content (web pages, documents, tool outputs) contains injected instructions
- **Mitigations**: Input sanitization; constrain LLM to narrow domains; privilege separation; output validation; human oversight for sensitive actions

### LLM02: Insecure Output Handling
LLM outputs are trusted and passed to downstream systems (code execution, databases, browsers) without validation, enabling XSS, CSRF, SQL injection, or remote code execution.
- **Mitigations**: Treat LLM output as untrusted user input; validate and sanitize before use; avoid executing LLM-generated code; use allowlists for acceptable output formats

### LLM03: Training Data Poisoning
Malicious actors corrupt training data to introduce backdoors, biases, or vulnerabilities that affect model behavior. This is a supply chain risk for fine-tuned models.
- **Mitigations**: Verify training data provenance; conduct adversarial testing; monitor for unexpected model behaviors after training updates

### LLM04: Model Denial of Service
Attackers craft resource-intensive inputs to exhaust computational resources, causing service degradation or outages.
- **Mitigations**: Rate limiting; input length restrictions; computational resource caps; anomaly detection on inference patterns

### LLM05: Supply Chain Vulnerabilities
Pre-trained models, datasets, and plugins may contain vulnerabilities, backdoors, or bias introduced by third-party suppliers.
- **Mitigations**: Audit model and plugin provenance; use only vetted model sources; maintain SBOM for AI components; regularly update and patch

### LLM06: Sensitive Information Disclosure
LLMs may inadvertently reveal sensitive information from training data, system prompts, or user conversations, including PII, proprietary data, or confidential system instructions.
- **Mitigations**: Apply data minimization in training; implement output filtering; avoid storing sensitive user data; test for training data extraction attacks; clearly scope system prompt confidentiality

### LLM07: Insecure Plugin Design
LLM plugins with excessive permissions, insufficient validation, or inadequate access controls can be exploited by prompt injection or malicious content.
- **Mitigations**: Apply principle of least privilege to plugins; validate plugin inputs; require explicit user confirmation for consequential actions; audit plugin code

### LLM08: Excessive Agency
LLMs given excessive permissions, capabilities, or autonomy can take harmful actions when manipulated or when they hallucinate.
- **Mitigations**: Limit LLM permissions to minimum required; require human approval for irreversible or high-stakes actions; implement kill switches; prefer reversible actions

### LLM09: Overreliance
Organizations and users over-trust LLM outputs, failing to detect hallucinations, errors, or outdated information, leading to misinformed decisions.
- **Mitigations**: Communicate AI limitations clearly; require verification for high-stakes outputs; establish human review for critical decisions; monitor for accuracy degradation

### LLM10: Model Theft
Unauthorized access to proprietary LLM models via API abuse (model extraction attacks) or insider threats enables theft of intellectual property and creation of malicious replicas.
- **Mitigations**: Rate limiting and anomaly detection on API usage; watermarking; access controls and authentication; monitor for systematic querying patterns

### Application to Chatbot/Conversational AI Systems
Conversational agents face heightened risk from LLM01 (prompt injection via user inputs), LLM06 (disclosure of system prompts or user conversation history), LLM08 (taking actions based on manipulated inputs), and LLM09 (users over-trusting outputs in high-stakes domains like healthcare, legal, or financial advice).
""",
    },
    "iso42001": {
        "label": "ISO 42001",
        "description": "AI management system standard",
        "default": False,
        "text": """
## ISO/IEC 42001:2023 — Artificial Intelligence Management System (AIMS)

### Overview
ISO/IEC 42001 is the first international standard specifying requirements for an AI management system (AIMS). Published December 2023, it follows the structure of ISO 9001 (quality) and ISO 27001 (information security) and is certifiable through third-party audit.

### Structure (Harmonized Approach — Clauses 4–10)

**Clause 4: Context of the Organization**
- Understand the external and internal context affecting AI objectives
- Identify interested parties (users, affected communities, regulators, suppliers)
- Determine the AIMS scope and the AI systems within scope
- Address AI-specific roles: developer, provider, deployer, user

**Clause 5: Leadership**
- Top management demonstrates commitment to responsible AI
- AI policy defined, documented, and communicated
- Organizational roles and responsibilities for AI management assigned
- AI objectives aligned with organizational strategy

**Clause 6: Planning**
- AI risk assessment: identify threats, vulnerabilities, and impacts
- AI impact assessment: evaluate potential harms to individuals and society
- Risk treatment plan: controls selected and implemented
- Objectives established with measurable criteria
- Planning for change: how AI system changes are managed

**Clause 7: Support**
- Resources provided: people, infrastructure, and tools
- Competence: staff trained on AI ethics, safety, and management
- Awareness program for all personnel involved in AI
- Communication (internal and external) about AI activities
- Documented information: policies, procedures, records maintained

**Clause 8: Operations**
- Operational planning and control: translate risk treatment into practice
- AI system impact assessment processes conducted and documented
- Management of AI-related data (quality, governance, lineage)
- Third-party and supply chain AI management
- AI system design and development controls
- Deployment and monitoring controls

**Clause 9: Performance Evaluation**
- Monitoring and measurement of AI system performance
- Internal audit program for AIMS
- Management review: top management reviews AIMS effectiveness
- Metrics for AI risk management maturity

**Clause 10: Improvement**
- Nonconformity and corrective action processes
- Continual improvement of the AIMS
- Incident management for AI-related events

### Key Annexes
- **Annex A**: Controls (organized by domain): policies, resource management, understanding AI context, human oversight, responsible AI objectives, documentation, data management, system development, third-party management, AI system operation)
- **Annex B**: AI use objectives (lists 12 AI use objective categories organizations should consider)
- **Annex C**: Explanation of AI risk assessment
- **Annex D**: Use of the ISO/IEC 42001 across different AI contexts

### Relevance for Evaluating AI Deployments
ISO 42001 provides the management system backbone for ensuring AI systems are developed and deployed responsibly. Key gaps to assess: Is there a documented AI policy? Are roles and responsibilities defined? Is there a formal AI impact assessment? Are monitoring and incident response processes in place?
""",
    },
    "unicc": {
        "label": "UNICC AI Governance",
        "description": "UN-specific data sovereignty, sandbox policies",
        "default": False,
        "text": """
## UNICC AI Governance Framework — UN Data Sovereignty and AI Sandbox Policies

### Overview
The United Nations International Computing Centre (UNICC) serves as the primary ICT service provider for the UN system. UNICC's AI governance framework addresses unique requirements for UN agencies operating under international law with special obligations around data sovereignty, neutrality, and protection of beneficiary data.

### Data Sovereignty Principles

**1. UN Data Remains UN Property**
Data processed by AI systems on behalf of UN agencies is subject to UN immunities and privileges under the Convention on Privileges and Immunities of the United Nations (1946). Commercial AI providers must not claim rights over UN data, including the right to use it for model training.

**2. Jurisdictional Neutrality**
AI systems used by UN agencies should not be subject to any single national jurisdiction that could compel disclosure of confidential UN data. Data residency requirements apply — sensitive data should remain within approved UN data centers or sovereign cloud environments.

**3. Beneficiary Data Classification**
UNICC classifies UN data into:
- **RESTRICTED**: Standard business operations, not publicly available
- **CONFIDENTIAL**: PII, sensitive programmatic data, beneficiary records
- **STRICTLY CONFIDENTIAL**: Protection-sensitive data (refugee status, survivors of GBV, informants, law enforcement cooperation)
- **PRIVILEGED**: Data subject to UN immunities

AI systems handling CONFIDENTIAL or above data require enhanced security assessments and restricted access controls.

### AI System Requirements for UN Agencies

**Transparency and Explainability**
AI systems that affect beneficiaries must be able to explain decisions in accessible terms. Automated decision-making that affects humanitarian assistance eligibility, refugee status determination, or benefit allocation must have explainable outputs and meaningful human review.

**Vendor Lock-in Avoidance**
UN agencies are encouraged to use open standards and avoid dependence on single commercial AI providers. Portability of models, data, and outputs should be contractually guaranteed.

**AI Sandbox Policy**
UNICC operates AI sandboxes for controlled experimentation. AI systems must pass sandbox testing before production deployment:
- Security scan of model and dependencies
- Bias and fairness assessment with representative UN beneficiary data
- Performance benchmarking under realistic load conditions
- Privacy impact assessment
- Compliance check against applicable UN regulations (e.g., ST/SGB/2007/6 on personal data protection)

**Supply Chain Security**
AI models, plugins, and APIs from commercial providers require UNICC security review. Model provenance, training data practices, and security posture of vendors are assessed before approval for use with sensitive UN data.

### Privacy Requirements (ST/SGB/2007/6 Alignment)
The UN Secretary-General's bulletin on personal data protection applies to AI systems:
- **Lawful purpose**: AI must be used only for specified, explicit, and legitimate purposes
- **Data minimization**: Only the minimum necessary data should be processed
- **Accuracy**: AI outputs affecting individuals must be verifiable and correctable
- **Storage limitation**: Retention periods defined; beneficiary data deleted after purpose fulfilled
- **Subject rights**: Individuals have rights to access, correction, and objection to automated processing
- **International transfers**: Data transfers to external providers require data processing agreements aligned with UN standards

### Incident Response
UNICC maintains a UN CERT with AI-specific incident categories:
- Model manipulation (prompt injection resulting in data leakage)
- Unauthorized data access via AI interface
- Biased output causing discriminatory outcomes
- AI system compromise affecting service continuity

Incidents affecting beneficiary data or system integrity must be reported to the UN Data Protection Officer within 72 hours.
""",
    },
}


def get_governance_context(framework_ids: List[str]) -> str:
    """
    Concatenate selected framework texts into a single governance context string.
    Filters to only frameworks that exist in FRAMEWORKS dict.
    """
    selected = []
    for fid in framework_ids:
        if fid in FRAMEWORKS:
            framework = FRAMEWORKS[fid]
            selected.append(
                f"=== {framework['label']} ===\n{framework['text'].strip()}"
            )

    if not selected:
        return "No specific governance frameworks selected. Apply general AI ethics principles."

    return "\n\n".join(selected)


def list_frameworks() -> list:
    """Return framework metadata list for the /api/frameworks endpoint."""
    return [
        {
            "id": fid,
            "label": fw["label"],
            "description": fw["description"],
            "default": fw["default"],
        }
        for fid, fw in FRAMEWORKS.items()
    ]
