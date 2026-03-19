# AI & LLM Configuration Guide

Sovereign Watch uses a **three-layer configuration system** to manage AI models. This architecture decouples sensitive API keys and model versions from the codebase, allowing you to update your AI stack entirely via the `.env` file.

---

## 1. The Environment Layer (`.env`)

**Location:** Project Root (`/.env`)

The `.env` file is now the single source of truth for **active models**, **labels**, and **API keys**. This allows for "hot-swapping" models without touching YAML files or restarting the entire stack (though a backend restart is recommended to refresh LiteLLM mappings).

### Available Variables

| Variable          | Description                                       | Example                                |
| :---------------- | :------------------------------------------------ | :------------------------------------- |
| `LITELLM_MODEL`   | The default model ID to use for analysis.         | `secure-core`                          |
| `OPEN_API_BASE`   | The endpoint for local/OpenAI-compatible models.  | `http://host.docker.internal:11434`    |
| `OPEN_API_MODEL`  | The specific model string for the local provider. | `openai/llama3`                        |
| `OPEN_API_LABEL`  | The human-readable name for the local model.      | `Llama3 (Local)`                       |
| `GEMINI_MODEL`    | The LiteLLM-prefixed Gemini model string.         | `gemini/gemini-2.5-flash`              |
| `GEMINI_LABEL`    | The human-readable name for the Gemini model.     | `Gemini 2.5 Flash`                     |
| `ANTHROPIC_MODEL` | The LiteLLM-prefixed Anthropic model string.      | `anthropic/claude-3-5-sonnet-20240620` |
| `ANTHROPIC_LABEL` | The human-readable name for the Anthropic model.  | `Claude 3.5 Sonnet`                    |

---

## 2. The Model Registry (`models.yaml`)

**Location:** `backend/ai/models.yaml` (Mounted to `/app/models.yaml` in Docker)

This file defines the **Catalog**—how models appear in the UI's "AI Analyst" dropdown. It uses a special `os.environ/` prefix to resolve values directly from your `.env`.

**Example:**

```yaml
models:
  - id: public-flash
    label: os.environ/GEMINI_LABEL # Resolves to "Gemini 2.5 Flash" from .env
    provider: Google
    local: false
```

---

## 3. The Routing Layer (`litellm_config.yaml`)

**Location:** `backend/ai/litellm_config.yaml` (Mounted to `/app/litellm_config.yaml` in Docker)

This is the **Plumbing** layer powered by [LiteLLM](https://docs.litellm.ai/). It maps UI IDs to technical endpoints and handles secure API key injection.

**Example:**

```yaml
model_list:
  - model_name: public-flash
    litellm_params:
      model: os.environ/GEMINI_MODEL # Resolves to "gemini/gemini-2.5-flash"
      api_key: os.environ/GEMINI_API_KEY # Securely injected from .env
```

---

## Analysis Modes

The AI Analyst supports multiple personas to focus on different tactical aspects:

| Mode | Persona | Focus |
| :--- | :--- | :--- |
| **Tactical** | Tactical Analyst | Telemetry anomalies, trajectory profile, and immediate movement assessment. |
| **OSINT** | OSINT Specialist | Callsign/Registration verification, identifying spoofing, and metadata audit. |
| **SAR** | SAR Coordinator | Searching for circular paths, sudden altitude changes, or signs of distress. |

---

## Adding or Updating a Model

If you want to upgrade a model (e.g., switching from Gemini 1.5 to 2.5):

1.  **Update `.env`**: Change `GEMINI_MODEL` to the new version and update `GEMINI_LABEL`.
2.  **Restart Backend**:
    ```bash
    docker compose up -d backend-api
    ```
    The backend will automatically resolve the new strings in both the Registry (for the UI) and the Routing Layer (for the API connection).

---

## Technical Details: Variable Resolution

Our Backend API includes a custom resolution engine in `backend/api/routers/system.py` and `analysis.py`.

- **Prefix-Based**: Any string starting with `os.environ/` in the YAML files is intercepted.
- **Dynamic Fetch**: The backend looks up the part after the slash (e.g., `GEMINI_LABEL`) in the container's environment variables.
- **Fallback**: If the environment variable is missing, it falls back to the literal string.

---

## Related

- [General Configuration](./Configuration.md)
- [UI User Guide](./UI_Guide.md)
- [LiteLLM Documentation](https://docs.litellm.ai/docs/proxy/configs)
