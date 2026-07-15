# Contributing to SayCopy

Thank you for improving SayCopy. Contributions should preserve the app's privacy model, remain focused, and include evidence that the change works.

## Before you start

- Search existing issues and pull requests.
- Open an issue before a large behavioral or architectural change.
- Never submit API keys, recordings, transcripts, personal information, or production environment values.
- Review `TRADEMARKS.md` before adding or modifying brand assets.

## Local setup

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run doctor
```

Use the Node.js version in `.nvmrc`. Keep `package-lock.json` synchronized with `package.json` and avoid forced dependency resolutions that move Expo or React Native outside their supported compatibility ranges.

## Making a change

1. Create a focused branch from the latest `main`.
2. Add or update tests for behavioral changes.
3. Keep credentials and local deployment state out of Git.
4. Run every quality check listed above.
5. Open a pull request that explains the user impact, privacy or security implications, and validation performed.

Pull requests should be small enough to review, use clear commit messages, and avoid unrelated formatting or generated-file churn.

## Dependency changes

Explain why a new dependency is needed, whether it reaches production, its license, and any known advisories. Expo and React Native dependencies must stay on versions supported by the active Expo SDK. Do not use `npm audit fix --force` to silence an advisory by downgrading the application stack.

## Licensing contributions

By submitting a contribution, you agree that it may be distributed under the Apache License 2.0. This does not transfer or grant rights to SayCopy trademarks or brand assets.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
