# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Launchpad team project

This is a team's project for the Launchpad hackathon ([mwlaunchpad.com](https://mwlaunchpad.com)). All teams share one Azure and Microsoft 365 tenant and one subscription, so a mistake here can affect other teams. `M365_AZURE_INSTRUCTIONS.md` has the full rules, and `CLAUDE_CODE_INSTRUCTIONS.md` covers signing in.

The repo is a starting template with no application code yet, so there are no build, lint or test commands. When code is added, document its commands here.

`NN` below is the team's two-digit number. If you don't know it, ask. Don't guess.

## Azure and Microsoft 365

- Create Azure resources only in the team's own resource group.
- Never change anything belonging to another team, or any tenant-wide setting. That includes Conditional Access, security defaults, consent, domains, licensing and the Teams, SharePoint and Exchange admin policies.
- Deploy only to UK South or Italy North. Other regions fail with `RequestDisallowedByPolicy`.
- Always sign in to the hackathon tenant explicitly with `az login --tenant <tenant-domain>`. If the CLI shows the wrong subscription, run `az logout` and sign in again.
- Tag Azure resources with `--tags team=teamNN event=hackathon`.
- Prefer managed identities or OIDC federated credentials over keys and client secrets. Scope role assignments to the resource group or to a single resource, never higher.
- For Graph, use delegated permissions with the least privilege the app needs.
- Use synthetic data only. Don't give admin roles to test users, and don't send email outside the tenant.
- The team account can't create resource groups, register resource providers or raise quotas, and some role assignments fail with `AuthorizationFailed`. Hand these to the organizers instead of trying workarounds.

## Cost

- The budget is £150 for the whole event, and quotas are shared across all seven teams. This applies especially to Azure OpenAI tokens-per-minute and VM vCPUs.
- Default to Free, Basic, Consumption or serverless SKUs. Deploy AI models with modest capacity.
- On 13 November 2026 every tenant object will be deleted. Only code pushed to the fork survives.

## Naming

| What | Pattern |
| --- | --- |
| Azure resources | `<type>-teamNN-<purpose>` |
| Globally unique Azure names | Same pattern with a short random suffix, for example `kv-teamNN-a91f`. Storage accounts allow only lowercase letters and numbers, for example `stteamNNdata7x2`. |
| Entra ID app registrations | `teamNN-<purpose>` |
| Test users | `teamNN-<name>` |
| Microsoft 365 groups, Teams and SharePoint sites | `TeamNN - <name>` |

## Secrets

Treat this repo as public. Forks of it are public, and so are GitHub Actions logs. Never commit:

- Passwords, keys, client secrets, connection strings or tokens.
- Anything from the team sheet, including the account name and tenant domain.
- Tenant or subscription IDs, or CLI output, screenshots or logs that show them.

Keep real values in a local `.env`, which is ignored by git, and put placeholders in `.env.example`. `.gitignore` also excludes `*.pem`, `*.pfx`, `local.settings.json`, `appsettings.Development.json`, `.azure/` and `.claude/`. Runtime secrets go in Key Vault or app settings, and CI values go in GitHub Actions secrets. If a secret leaks, it has to be rotated. Deleting the commit isn't enough.
