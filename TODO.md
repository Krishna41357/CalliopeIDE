# TODO.md

> A living task list for CalliopeIDE.  
> Focus: stability, security, Soroban workflow support, and contributor-friendly improvements.

---

## 1) Soroban / Blockchain Features

- [ ] Add Soroban project templates
- [ ] Add a Soroban contract starter template
- [ ] Add token contract template
- [ ] Add NFT contract template
- [ ] Add DAO / governance contract template
- [ ] Compile Rust contracts to WASM inside the workspace
- [ ] Integrate Soroban CLI commands into the workflow
- [ ] Support testnet deployment of Soroban contracts
- [ ] Store deployed contract IDs per project
- [ ] Add contract function invocation from the UI
- [ ] Add contract state inspection
- [ ] Add transaction result decoding
- [ ] Add event/log viewing for smart contract actions
- [ ] Add a transaction history panel
- [ ] Add network selection support
- [ ] Add wallet integration for Freighter and other supported wallets
- [ ] Add transaction signing flow from the frontend
- [ ] Add balance display and account context in the UI
- [ ] Add test helpers for Soroban unit tests
- [ ] Add gas/fee visibility where possible
- [ ] Add AI-assisted contract review and security checks
- [ ] Add AI-assisted contract test generation
- [ ] Add contract versioning support
- [ ] Add upgrade workflow support for contracts that allow it

---

## 2) Authentication & User Management

- [ ] Implement a complete signup/login/logout flow
- [ ] Add OAuth support for GitHub and/or Google
- [ ] Add user-scoped sessions and project ownership
- [ ] Add basic roles and permissions
- [ ] Add password reset / account recovery flows
- [ ] Add account settings for theme, preferences, and notifications

---

## 3) Project System

- [ ] Add a real project workspace model
- [ ] Support multi-file projects instead of only chat-based state
- [ ] Add file explorer support in the UI
- [ ] Add create/rename/delete file actions
- [ ] Add create/rename/delete folder actions
- [ ] Persist project structure across sessions
- [ ] Add project templates and starter kits
- [ ] Add project import/export support
- [ ] Add project duplication / fork functionality

---

## 4) Editor Experience

- [ ] Integrate a proper code editor component
- [ ] Add split view for chat + editor
- [ ] Support syntax highlighting for Soroban/Rust files
- [ ] Add auto-formatting support
- [ ] Add search within project files
- [ ] Add basic diagnostics / lint display
- [ ] Add tab support for multiple open files
- [ ] Add unsaved-change indicators

---

## 5) AI Assistant Improvements

- [ ] Make AI responses project-aware using current workspace context
- [ ] Add prompt templates for common tasks
- [ ] Add contract generation prompts
- [ ] Add test generation prompts
- [ ] Add code explanation prompts
- [ ] Add vulnerability review prompts
- [ ] Add response streaming for better UX
- [ ] Add chat history search and retrieval
- [ ] Add “apply suggestion” flow for generated code

---

## 6) Frontend UX & Accessibility

- [ ] Add loading states everywhere async work happens
- [ ] Add better empty states and error states
- [ ] Improve chat message readability
- [ ] Improve sidebar and layout behavior on smaller screens

---

## 7) Documentation & Developer Experience

- [ ] Document the actual backend architecture
- [ ] Add a high-level system diagram
- [ ] Add API documentation
- [ ] Add setup docs for local development
- [ ] Add setup docs for Docker-based development
- [ ] Add Soroban setup and workflow documentation
- [ ] Add contribution guidelines for backend, frontend, and blockchain tasks
- [ ] Add a troubleshooting section for common setup/runtime issues

---

## 8) Testing & Quality

- [ ] Add unit tests for backend utilities
- [ ] Add integration tests for major API routes
- [ ] Add tests for session lifecycle and cleanup
- [ ] Add tests for sandboxed execution
- [ ] Add frontend component tests
- [ ] Add end-to-end tests for core user flows
- [ ] Add tests for Soroban compile/deploy/invoke workflows
- [ ] Add linting and formatting checks in CI
- [ ] Add pre-commit hooks for consistency

---

## Notes

- Keep issues/PRs small and specific so contributors can pick them up quickly.
- Soroban features should be end-to-end: prompt → code → compile → deploy → inspect → test.
- Update this file as the repo evolves.
