# Setllend Docs

Documentation for [Setllend](https://www.setllend.xyz), served at https://docs.setllend.xyz. Built with [Docusaurus](https://docusaurus.io) 3.

The protocol's code lives in [TarasBrilian/setllend](https://github.com/TarasBrilian/setllend).

## Develop

Requires Node 20 or later.

```bash
npm install
npm start          # http://localhost:3000, reloads on save
npm run build      # static site in build/, fails on broken links and anchors
npm run serve      # serve build/ locally
```

## Layout

| Path | Contents |
|---|---|
| `docs/` | The pages. `.md` files are CommonMark, `.mdx` files are MDX (pages with React components) |
| `sidebars.ts` | Sidebar order. A new page must be added here |
| `src/components/calculators/` | Rate, health, and liquidation calculators used by the concept pages |
| `src/css/custom.css` | Theme: the app's colors and the Figtree font, dark by default with a light mode |
| `static/img/` | Logo and favicon |

## Deploy

Vercel, with the Docusaurus preset (build command `npm run build`, output directory `build`), on the domain `docs.setllend.xyz`.
