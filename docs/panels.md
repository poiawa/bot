# Panel Integration Guide

## Marzban (implemented — requires live panel for testing)

**Status**: Adapter code implemented against the official API. NOT yet integration-tested — requires a live Marzban panel.

### Required credentials
| Variable | Description |
|---|---|
| `MARZBAN_URL` | Panel base URL, e.g. `https://panel.example.com` |
| `MARZBAN_USERNAME` | Panel admin username (use a least-privilege account) |
| `MARZBAN_PASSWORD` | Panel admin password (stored encrypted at rest) |

### API endpoints used (documented by Marzban)
- `POST /api/admin/token` — JWT authentication
- `GET /api/system` — system info (used by connection test)
- `GET /api/inbounds` — list inbounds/protocols
- `POST /api/user` — create subscription
- `GET/PUT/DELETE /api/user/{username}` — read/modify/delete
- `POST /api/user/{username}/reset` — reset usage
- `GET /api/nodes` — node health

### Capability matrix
| Operation | Supported |
|---|---|
| Create/Read/Update/Delete subscription | ✅ |
| Renew (expiry + data) | ✅ |
| Reset usage | ✅ |
| Enable/Disable | ✅ |
| Change subscription URL suffix | ✅ (via PUT user) |
| Transfer between panels | ❌ (not supported by design) |

## Not yet implemented
- Marzneshin, Remnawave, Pasarguard, 3X-UI, Hiddify — registry raises `UNSUPPORTED_OPERATION` for these panel types. Adapters must be written and integration-tested against a live panel before being enabled.
