## What

## How to try it

```powershell
docker compose up --build -d
```

Open http://localhost:8360/#setup . Setup steps shows whether sign-in, consent and Exchange Online PowerShell are in place. Demo data is Contoso.

## Checks

- [ ] `npm test`
- [ ] Pages stay GET-only
- [ ] A missing permission says Not authorized and names the permission
