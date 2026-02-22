# Contributing to Producer.ai Track Downloader

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- **Node.js 18+** — [Download here](https://nodejs.org)
- **Git** — [Download here](https://git-scm.com/)
- A code editor (VS Code, WebStorm, etc.)

### Setup Steps

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/producer-ai-sync.git
   cd producer-ai-sync
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Locally

Test your changes with:

```bash
# Run the main script
npm start

# Run with dry-run to preview without downloading
npm run dry-run

# Run with debug logging
npx tsx sync-favorites.ts --debug
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Quality Checks

Before submitting a pull request, ensure all quality checks pass:

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Run TypeScript type checking
npm run typecheck
```

## Code Style

This project follows these conventions:

- **Indentation:** 2 spaces (not tabs)
- **TypeScript:** Strict mode enabled
- **ESLint:** v10 flat config format
- **Naming:**
  - `camelCase` for variables and functions
  - `PascalCase` for types and interfaces
  - Meaningful, descriptive names
- **Comments:** Use JSDoc for functions and complex logic
- **Async/Await:** Prefer over callbacks or raw promises
- **Const by default:** Use `const` unless reassignment is needed
- **No semicolons:** This project uses ASI (Automatic Semicolon Insertion)

### Example

```typescript
/**
 * Downloads a track from Producer.ai
 * @param trackId - The unique identifier for the track
 * @param outputPath - Where to save the downloaded file
 * @returns Promise resolving to the file path
 */
async function downloadTrack(trackId: string, outputPath: string): Promise<string> {
  const response = await fetch(`/api/tracks/${trackId}`)
  const data = await response.json()
  
  // Process and save the track
  return outputPath
}
```

## Testing Guidelines

### Test Structure

Tests use Vitest and follow this structure:

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = processInput(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

### What to Test

- **Core functionality:** Key features and logic
- **Edge cases:** Boundary conditions, empty inputs, etc.
- **Error handling:** How the code handles failures
- **Configuration:** Valid and invalid configurations

### What NOT to Test

- External APIs (mock them instead)
- Browser automation (unless integration testing)
- File system operations (use temporary directories)

## Submitting Changes

### Pull Request Process

1. **Ensure all tests pass** (`npm test`)
2. **Run linting** (`npm run lint`)
3. **Run type checking** (`npm run typecheck`)
4. **Push your branch** to your fork
5. **Open a Pull Request** against the `master` branch
6. **Fill out the PR template** with a clear description of your changes
7. **Link related issues** if applicable

### PR Title Format

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add support for playlist downloads`
- `fix: resolve authentication timeout issue`
- `docs: update README with new examples`
- `test: add tests for batch processing`
- `refactor: simplify error handling logic`
- `chore: update dependencies`

### Commit Message Format

```
type: short description

Longer explanation if needed. Wrap at 72 characters.

- Bullet points are okay
- Reference issues like #123

Closes #123
```

## What to Contribute

### Good First Issues

Look for issues labeled `good first issue` — these are great entry points for new contributors.

### Welcome Contributions

- **Bug fixes** — Help us squash bugs
- **Documentation** — Improve clarity, fix typos, add examples
- **Tests** — Increase test coverage
- **Features** — New functionality (discuss in an issue first)
- **Performance** — Optimizations and improvements
- **Accessibility** — Make the tool more accessible

### Not Currently Accepting

- **Major architectural changes** — Discuss in an issue first
- **Alternative implementations** — Unless solving a specific problem
- **Dependencies** — Adding new dependencies requires strong justification

## Code of Conduct

### Our Pledge

We pledge to make participation in this project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by opening an issue or contacting the project maintainer. All complaints will be reviewed and investigated and will result in a response that is deemed necessary and appropriate to the circumstances.

## Getting Help

### Questions?

- **Open an issue** for bug reports or feature requests
- **Check existing issues** before creating a new one
- **Be specific** — Include error messages, screenshots, and steps to reproduce

### Discussion

For general questions and discussions, open a GitHub Discussion or issue.

## Recognition

Contributors are recognized in the following ways:

- Listed in release notes for their contributions
- Mentioned in the README (for significant contributions)
- GitHub's Contributors page

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Thank you for contributing! 🎉
