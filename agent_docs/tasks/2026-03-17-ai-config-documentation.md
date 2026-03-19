# 2026-03-17-ai-config-documentation.md

- **Issue**: There was no documentation explaining the distinction between `models.yaml` (UI catalog) and `litellm_config.yaml` (Backend infrastructure). This led to confusion for users wanting to add new AI models.
- **Solution**: Created a dedicated AI Configuration guide and linked it from the main configuration reference.
- **Changes**:
    - Created [AI_Configuration.md](../../Documentation/AI_Configuration.md) in the `Documentation/` directory.
    - Updated [Configuration.md](../../Documentation/Configuration.md) to include a reference and link to the new guide.
- **Verification**: Verified the files exist and the links are correct relative to each other.
- **Benefits**: Provides clear guidance for operators on how to extend the platform's AI capabilities and explains the rationale behind the dual-layer configuration system.
