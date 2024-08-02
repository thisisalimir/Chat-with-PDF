"use server";

// import { generateEmbeddingsInPineconeVectorStore } from "@/lib/langchain";
import { generateEmbeddingsInPineconeVectorStore } from "@/lib/gemini";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function generateEmbeddings(docId: string) {
  // Check only Auth user have access
  auth().protect();

  // Turn PDF to embeddings
  await generateEmbeddingsInPineconeVectorStore(docId);

  revalidatePath("/dashboard");

  return { completed: true };
}
