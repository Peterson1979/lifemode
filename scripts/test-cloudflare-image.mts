import { CloudflareWorkersAIImageProvider } from "../src/lib/editorial/images/providers/cloudflare.ts";

const provider = new CloudflareWorkersAIImageProvider();

const result = await provider.generate({
  prompt: "A warm editorial lifestyle photograph of a quiet morning reading corner, natural sunlight, linen textures, plants, architecture magazine aesthetic, no text",
  aspectRatio: "16:9",
  width: 1536,
  height: 864
});

console.log(JSON.stringify(result, null, 2));