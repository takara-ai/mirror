<img src="https://raw.githubusercontent.com/takara-ai/mirror/refs/heads/main/app/icon.svg" width="200" alt="Mirror Logo"/>

**Mirror is the fastest and most cost effective way to build web apps with multimodal embeddings.**

Backed by OpenAI CLIP, Weaviate and NextJS(lovable), build the next Pintrest, Instagram or whatever you could imagine with no GPU's, no complex deployments and no drain on your wallet.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftakara-ai%2Fmirror)

We've shipped our frontier UI to demo the capabilities of Mirror, we indexed thousands of images in just a few hours costing less than a few cents and we can enable natural language search over these images forever, only paying for what you use, or if within the free plan, absolutely nothing!

Below is our serverless solution compared to traditional deployments.

<img src="https://github.com/takara-ai/mirror/blob/main/media/price_comparison.png" width="400" alt="Mirror Demo"/>


## Getting Started

### Prerequisites

This project uses [weaviate](https://weaviate.io/), it's neccessary to make a cloud account and use their database for vector store.

You will then need to add these Environment variables to your vercel account:

```
WEAVIATE_API_KEY="[YOUR API KEY]" # This will need permissions for reading and writing to the index
WEAVIATE_HTTP="[HOST HTTP URL]" # We don't support GRPC at this time
```

We also use Vercel's Blob store to efficiently store images for use for the browser, go to your vercel project -> storage 

And create a new Blob store with access to prod/preview/dev or whatever stages you prefer.

We also use OpenAI for captioning for further accessibility, if you require this feature then please include an OpenAI API KEY

```
OPENAI_API_KEY="[YOUR KEY]"
```
Now run 

```
pnpm i
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
