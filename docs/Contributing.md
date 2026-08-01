# Contributing to Send2Me

We welcome contributions from the open-source community! Whether it's fixing a bug, adding a new feature, or improving documentation, your help is deeply appreciated.

## Getting Started

1. **Fork the Repository:** Start by forking the `send2me-rust-app` repository to your GitHub account.
2. **Clone Locally:** Clone your fork to your local machine.
3. **Follow the Setup Guide:** See the [Getting Started Guide](GettingStarted.md) to install Rust, Node, and Tauri prerequisites.

## Branching Strategy

- `main`: The primary, stable branch.
- Create a new branch for your feature or bugfix (e.g., `feat/add-new-button` or `fix/transfer-bug`).

## Code Standards

### Rust (Backend)
- Run `cargo clippy` to ensure your code matches idiomatic Rust standards. We enforce a zero-warning policy.
- Run `cargo fmt` to automatically format your code.

### TypeScript / React (Frontend)
- Ensure your code passes the TypeScript compiler (`npm run build`).
- We use Tailwind CSS for styling. Please utilize the existing design tokens and refrain from introducing entirely new color palettes without discussion.
- All new UI components must be fully responsive.

## Pull Request Process

1. Ensure your branch is fully updated with the `main` branch.
2. Ensure you have tested your code locally (both UI and Rust logic).
3. Submit a Pull Request with a clear description of the problem you solved or the feature you added.
4. Include screenshots or videos if you are making visual UI changes!

## Code of Conduct

Be respectful, inclusive, and highly collaborative. We are all here to build an incredible, secure application. Toxic behavior, harassment, or dismissive attitudes towards new developers will not be tolerated.
