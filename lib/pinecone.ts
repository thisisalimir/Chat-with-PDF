import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_Key) {
  throw new Error("PINECONE_API_Key is not set");
}

const pineconeClient = new Pinecone({
  apiKey: process.env.PINECONE_API_Key,
});

export default pineconeClient;
