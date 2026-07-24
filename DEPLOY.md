# WorkflowPulse — independent deploy

This is a **standalone product**, not a route under Workflow UI.

## Pipeline

```
local E:\therealsaitama\Edxso\WorkflowPulse
  → git push origin main   (ossogdev/WorkflowPulse)
  → ssh playground
  → /var/www/WorkflowPulse  git pull
  → pm2 restart workflow-pulse
```

**Do not** mount this app at `workflow.conversely.in/pulse/`.

## Runtime

| Item | Value |
|---|---|
| Repo | `ossogdev/WorkflowPulse` |
| Server path | `/var/www/WorkflowPulse` |
| Process | PM2 name `workflow-pulse` |
| Port | **3200** (own process; UFW allow 3200/tcp) |
| Public interim URL | `http://142.93.213.101:3200/` |
| Future hostname | `pulse.conversely.in` (DNS + nginx sample in `deploy/`) |

## Remove wrong nesting

If nginx still has `/pulse` under `piper-8088` / `workflow.conversely.in`, delete those `location` blocks and reload nginx.

## Env

```bash
PORT=3200
HOST=0.0.0.0
```

