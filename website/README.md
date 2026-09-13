# Binsight Marketing Website

Static marketing website for [Binsight](https://github.com/adrijshikhar/binsight), deployed to [binsight.adrijshikhar.dev](https://binsight.adrijshikhar.dev).

Built with **Astro** + **Tailwind CSS v4** + **TypeScript**.

## Local Development

```sh
cd website
bun install
bun run dev
```

The dev server will run on `http://localhost:4321`.

## Production Build

```sh
cd website
bun run build
```

Generates 100% static HTML, CSS, and assets in `website/dist/`.

## Cloudflare Pages Deployment

Connect the repository in the Cloudflare Dashboard:

1. Go to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select repository `adrijshikhar/binsight`.
3. Configure build settings:
   - **Framework preset**: `Astro` (or `None`)
   - **Root directory**: `website`
   - **Build command**: `bun run build`
   - **Build output directory**: `dist`
4. Custom Domain:
   - Go to **Custom domains** tab → Add `binsight.adrijshikhar.dev`.
