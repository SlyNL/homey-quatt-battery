# Contributing to Quatt Home Battery – Homey App

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

- Be respectful and constructive
- Welcome diversity of opinion and experience
- Focus on the code and ideas, not the person
- Help create a safe and inclusive environment

## Getting Started

### Prerequisites
- Node.js 18+
- Homey CLI: `npm install -g homey`
- A Homey bridge or hub for testing

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/SlyNL/homey-quatt-battery.git
   cd homey-quatt-battery
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Validate the app structure**
   ```bash
   npm run lint
   ```

4. **Install to Homey (for testing)**
   ```bash
   homey app install
   ```

## Making Changes

### Branch Naming
- Feature: `feature/short-description`
- Bug fix: `bugfix/short-description`
- Improvement: `improve/short-description`

### Code Style

This project uses ESLint to enforce consistent code style:

```bash
npm run lint
```

Key style guidelines:
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Trailing commas for multiline objects/arrays
- No unused variables (use `_` prefix for intentionally unused params)

### Commit Messages

Follow this format:
```
[Type] Brief description (50 chars max)

Optional detailed explanation if needed.
Keep lines under 72 characters.

Closes #issue-number
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Example:
```
[fix] Add timeout protection to API requests

Prevents hanging connections when network is slow or unresponsive.
Uses AbortController to cancel fetch after 10 seconds.

Closes #42
```

## Testing

### Manual Testing
1. Test on a real Homey device or emulator
2. Verify pairing flow works correctly
3. Check API calls complete within reasonable timeouts
4. Test error scenarios (network down, invalid credentials, etc.)

### Areas to Test
- Pairing flow with valid/invalid credentials
- Token refresh on 401/403 responses
- Polling with different intervals
- Flow card triggers (SOC threshold, charging state)
- Capability updates in Homey UI

## Types of Contributions

### Bug Reports
**Found a bug?** Great! Please:
1. Check if it's already been reported
2. Create an issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Homey version, app version, OS
   - Relevant logs (enable debug mode if needed)

### Feature Requests
**Have an idea?** We'd love to hear it:
1. Check if similar feature was requested
2. Explain the use case and benefits
3. Provide examples if applicable

### Documentation
- Fix typos or unclear explanations in README or comments
- Add examples or troubleshooting guides
- Document API quirks you discover

### Code Improvements
- Refactor for clarity or performance
- Add error handling
- Improve type safety with JSDoc comments
- Add logging for debugging
- Fix lint warnings

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following the code style
3. **Test thoroughly** on a real or emulated Homey
4. **Run linter**: `npm run lint`
5. **Commit with clear messages**
6. **Push your branch**
7. **Open a Pull Request** with:
   - Clear description of changes
   - Reference to related issues
   - Checklist of testing performed
   - Screenshots/logs if relevant

### PR Checklist
- [ ] Code follows project style guidelines
- [ ] No console errors or warnings
- [ ] Tested on Homey device/emulator
- [ ] Updated README if needed
- [ ] Commit messages are clear
- [ ] No hardcoded credentials or sensitive data

## Reverse Engineering Notes

This app is based on reverse-engineered Quatt APIs. When working with these:

1. **Document your findings** – Add comments explaining API behavior
2. **Respect rate limits** – Polling is set to reasonable intervals by default
3. **Be careful with changes** – The Quatt API may change without notice
4. **Log API responses** – Include error details for debugging issues
5. **Test edge cases** – Invalid responses, network errors, timeouts

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Check existing issues and PRs for similar questions
- Review the README and code comments
- Open a new discussion if needed

## Recognition

Contributors will be recognized in:
- Release notes for meaningful contributions
- CONTRIBUTORS.md file (when created)
- GitHub contributor graph

Thank you for making this integration better! 🚀
