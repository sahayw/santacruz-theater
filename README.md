# Santa Cruz Theater

A resource for theater-goers and theater companies in Santa Cruz County — built as an Astro 6 static site, deployed to Netlify. Built with assistance from Claude Code (under very close supervision).

Five areas, reachable from a persistent top nav and a hub landing page:

| Section   | URL          | What it is                                                           |
| --------- | ------------ | -------------------------------------------------------------------- |
| Calendar  | `/calendar`  | Performances calendar — year view, month / week drill-down           |
| Companies | `/companies` | Santa Cruz County theater company directory                          |
| Events    | `/events`    | Upcoming auditions and other events                                  |
| Services  | `/services`  | Production resources — crew, equipment, spaces, coaching             |
| About     | `/about`     | Site info + contact form                                             |

Visitors can sign up at `/subscribe` for two email lists — Performance updates and Audition & event notices (Buttondown).

Content is maintained through a data editor at `/admin` — no local build or deploy needed. Saved changes commit directly and trigger a Netlify rebuild.

**→ [`docs/feature-guide.md`](docs/feature-guide.md)** is the full description of what the site does, publicly and editorially — read it before assuming a feature doesn't exist.

**→ [`docs/implementation.md`](docs/implementation.md)** is the technical reference — data schemas, architecture, functions, environment variables, build & deploy.

---

## Getting started

```sh
nvm use          # Node 22 (.nvmrc)
npm install
npm run dev       # netlify dev → http://localhost:8888, editor included
```

| Command           | Action                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`     | `netlify dev` at :8888 — public pages, functions, and the `/admin` editor together |
| `npm run check`   | Validate all data JSON                                                             |
| `npm run build`   | Netlify's build command (`check` + `astro build`)                                  |
| `npm run sync`    | Pull live `/admin` data edits into local `main` + `dev`                            |
| `npm run release` | Promote `dev` → `main` (deploy) and back-merge                                     |

See `docs/implementation.md` §10–12 for local-dev details and the full branch/release workflow.

## License / contact

The source code is MIT licensed (see [`LICENSE`](LICENSE)). The contents of
`data/` and the images under `public/images/` are not covered by that
license and remain all rights reserved. Questions → the contact form at
`/about`.
