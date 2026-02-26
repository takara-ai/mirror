<img src="https://raw.githubusercontent.com/takara-ai/mirror/refs/heads/main/app/twitter-image.png" width="100%" alt="Mirror Logo"/>

**[Mirror](https://mirror-azure.vercel.app/) is the fastest and most cost effective way to build web apps with multimodal embeddings.**

Backed by OpenAI CLIP, Turbopuffer and NextJS(Lovable), build the next Pintrest, Instagram or whatever you could imagine with no GPU's, no complex deployments and no drain on your wallet.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftakara-ai%2Fmirror)

We've shipped our frontier UI to demo the capabilities of Mirror, we indexed thousands of images in just a few hours costing less than a few cents and we can enable natural language search over these images forever, only paying for what you use, or if within the free plan, absolutely nothing!

<img src="https://github.com/takara-ai/mirror/blob/main/media/mirror.png" width="400" alt="Mirror Demo"/>

Below is our serverless solution compared to traditional deployments.

<img src="https://github.com/takara-ai/mirror/blob/main/media/price_comparison.png" width="400" alt="Mirror Demo"/>

## Getting Started

### Prerequisites

This project uses [Turbopuffer](https://turbopuffer.com/) for the vector store. Create an account and API key in the [dashboard](https://turbopuffer.com/dashboard), then add:

```
TURBOPUFFER_API_KEY="[YOUR API KEY]"
TURBOPUFFER_REGION="gcp-us-central1"   # optional, see https://turbopuffer.com/docs/regions
```

We also use Vercel's Blob store to efficiently store images for use for the browser, go to your vercel project -> storage

And create a new Blob store with access to prod/preview/dev or whatever stages you prefer.

We also use OpenAI for captioning for further accessibility, if you require this feature then please include an OpenAI API KEY

```
OPENAI_API_KEY="[YOUR KEY]"
```

Now run

```
bun install
```

```
vercel env pull
```

Then, run the development server:

```bash
vercel dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This will start mirror and it's frontier UI, ready for you to take over and build something amazing!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## API

For documentation on the API we expose by default in Mirror please see the [readme](https://github.com/takara-ai/mirror/tree/main/api).
