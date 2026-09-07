## Description

<!-- Briefly describe the UI, Web3 wallet integration, or state management changes introduced. -->

## Linked Issue

Closes #<!-- Issue number if applicable -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking UI/UX or Stellar integration feature)
- [ ] 💄 UI/Styling update (visual improvements, responsive design)
- [ ] ⚡ Performance optimization (bundle size, re-renders, caching)
- [ ] 🧪 Tests (adding unit tests with Vitest or manual verification)
- [ ] 📚 Documentation update

## Frontend Checklist

- [ ] Strict TypeScript compilation passes (`npm run build` -> `tsc -b && vite build`)
- [ ] Unit test suite passes (`npm test`)
- [ ] No hardcoded secrets or sensitive keys added
- [ ] Stellar address validation adhered to (RFC 4648 Base32 `G...` keys and `C...` contract IDs)
- [ ] Freighter wallet connection tested and gracefully handles absent extension
- [ ] Responsive design verified across desktop and mobile viewports
- [ ] Dark / Light theme styling consistent

## Verification & Testing

<!-- Detail the exact commands run and visual checks performed -->

```bash
npm run build
npm test
```
