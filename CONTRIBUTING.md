# Contributing to StormSale

Thank you for your interest in contributing to **StormSale**! As an open-source decentralized affiliate protocol on the Stellar Network, we hold our code quality, security, and developer discipline to the highest standards.

Please review this guide before submitting any issues or Pull Requests.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Treat all contributors with respect and professionalism.

---

## Branching Strategy

We follow standard Git-Flow conventions:

- `main`: Production-ready releases.
- `dev`: Primary integration branch.
- Feature branches: `feat/<feature-name>` (e.g., `feat/freighter-wallet-connector`)
- Bugfix branches: `fix/<issue-description>` (e.g., `fix/role-redirect-persistence`)
- Chore/Docs branches: `chore/<description>` or `docs/<description>`

---

## Commit Message Standards

All commits must adhere to the **Conventional Commits** specification:

```text
<type>(<scope>): <short descriptive summary in imperative mood>

[optional body]
[optional footer(s)]
```

### Allowed Types:

- `feat`: A new user-facing feature or enhancement.
- `fix`: A bug fix or defect correction.
- `docs`: Documentation updates only.
- `style`: Formatting, missing semicolons, whitespace changes.
- `refactor`: Code restructuring without changing behavior or adding features.
- `perf`: Code changes that improve execution performance.
- `test`: Adding missing unit/integration tests or correcting existing tests.
- `chore`: Changes to build process, tooling, or package configurations.

### 🚨 Forbidden Commit Habits:

- Generic commit messages (e.g., `update`, `fix stuff`, `changes`, `checkpoint`).
- Fake or auto-generated commit spam.
- Bundling unrelated changes across multiple domains into a single commit.

---

## Pull Request Requirements

Every PR submitted to StormSale must satisfy our **Quality Gate**:

1. **Self-Contained & Scoped**: Keep PRs focused on a single issue or feature.
2. **Visual Proof**: If modifying UI components, you **MUST** attach screenshots or a screen recording GIF demonstrating the change in both desktop and mobile viewports.
3. **Automated Validation**:
   Before submitting, ensure all pre-flight checks pass locally:
   ```bash
   npm run lint
   npm run build
   ```
4. **Structured PR Description**:
   Use our standard PR template covering:
   - **Summary**: What changed?
   - **Why**: Why was this change required?
   - **How**: Key technical decisions.
   - **Verification**: Exact commands run and manual test evidence.
   - **Issue Reference**: `Closes #<issue_number>`

---

## Local Development Workflow

```bash
# 1. Clone the repository
git clone https://github.com/StormSale/StormSale.git
cd StormSale

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Start local development server
npm run dev
```
