import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import pineconeClient from "./pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { PineconeConflictError } from "@pinecone-database/pinecone/dist/errors";
import { Index, RecordMetadata } from "@pinecone-database/pinecone";
import { auth } from "@clerk/nextjs/server";
import { adminDb } from "@/firebaseAdmin";

const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  modelName: "gemini-1.5-pro",
  maxOutputTokens: 2048,
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    },
  ],
});

export const indexName = "papafam";

async function fetchMessagesFromDB(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not found");
  }

  const LIMIT = 6;
  console.log("--- Fetching chat history from the firestore database");
  //Get messages from the chat history
  const chats = await adminDb
    .collection(`users`)
    .doc(userId)
    .collection("files")
    .doc(docId)
    .collection("chat")
    .orderBy("createdAt", "desc")
    .limit(LIMIT)
    .get();

  // Get Chat History
  const chatHistory = chats.docs.map((doc) =>
    doc.data().role === "human"
      ? new HumanMessage(doc.data().message)
      : new AIMessage(doc.data().message)
  );

  console.log(`--- fetched last ${chatHistory.length} messages successfully`);
  console.log(chatHistory.map((msg) => msg.content.toString()));

  return chatHistory;
}

export async function generateDocs(docId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("user not found");
  }
  console.log("---- fetching the download URL from firebase... ---");
  const firebaseRef = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .get();

  const downloadUrl = firebaseRef.data()?.downloadUrl;
  if (!downloadUrl) {
    throw new Error("Download URL not found");
  }
  console.log(`--- downloading url fetched successfully: ${downloadUrl} ---`);
  const res = await fetch(downloadUrl);
  const data = await res.blob();
  console.log("--- Loading PDF document.... ----");
  const loader = new PDFLoader(data);
  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter();
  const splitDocs = await splitter.splitDocuments(docs);
  console.log(`--- Split into ${splitDocs.length} parts ---`);
  return splitDocs;
}
async function NamespaceExist(index: Index<RecordMetadata>, namespace: string) {
  if (namespace === null) throw new Error("No namespace value provided.");
  const { namespaces } = await index.describeIndexStats();
  return namespaces?.[namespace] !== undefined;
}

export async function generateEmbeddingsInPineconeVectorStore(docId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("user not found");
  }
  let pineconeVectorStore;
  console.log("---Generating Embeddings... ---");
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: "embedding-001",
  });
  const index = await pineconeClient.index(indexName);
  const nameSpaceAlreadyExist = await NamespaceExist(index, docId);
  if (nameSpaceAlreadyExist) {
    console.log(
      `--- Namespace ${docId} already exists, reusing existing embeddings.... ---`
    );
    pineconeVectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: docId,
    });
    return pineconeVectorStore;
  } else {
    const splitDocs = await generateDocs(docId);
    console.log(
      `---- Storing the embeddings in namespace ${docId} in the ${indexName} Pinecone vector store.....`
    );
    pineconeVectorStore = await PineconeStore.fromDocuments(
      splitDocs,
      embeddings,
      {
        namespace: docId,
        pineconeIndex: index,
      }
    );
    return pineconeVectorStore;
  }
}
// Additional functions (createRetrievalChain, createHistoryAwareRetriever, etc.) would need to be implemented here,
// potentially with adjustments for Gemini API specifics
const generateLangchainCompletion = async (docId: string, question: string) => {
  let pineconeVectorStore;

  pineconeVectorStore = await generateEmbeddingsInPineconeVectorStore(docId);
  if (!pineconeVectorStore) {
    throw new Error("Pinecone vector store not found");
  }

  // Create a retriever to search through the vector store
  console.log("--- Creating a retriever... ---");
  const retriever = pineconeVectorStore.asRetriever();

  // Fetch the chat history from the database
  const chatHistory = await fetchMessagesFromDB(docId);

  // Define a prompt template for generating search queries based on conversation history
  console.log("--- Defining a prompt template... ---");
  const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    ...chatHistory, // Insert the actual chat history here

    ["user", "{input}"],
    [
      "user",
      "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation",
    ],
  ]);

  // Create a history-aware retriever chain that uses the model, retriever, and prompt
  console.log("--- Creating a history-aware retriever chain... ---");
  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm: model,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  });

  // Define a prompt template for answering questions based on retrieved context
  console.log("--- Defining a prompt template for answering questions... ---");
  const historyAwareRetrievalPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Answer the user's questions based on the below context:\n\n{context}",
    ],

    ...chatHistory, // Insert the actual chat history here

    ["user", "{input}"],
  ]);

  // Create a chain to combine the retrieved documents into a coherent response
  console.log("--- Creating a document combining chain... ---");
  const historyAwareCombineDocsChain = await createStuffDocumentsChain({
    llm: model,
    prompt: historyAwareRetrievalPrompt,
  });

  // Create the main retrieval chain that combines the history-aware retriever and document combining chains
  console.log("--- Creating the main retrieval chain... ---");
  const conversationalRetrievalChain = await createRetrievalChain({
    retriever: historyAwareRetrieverChain,
    combineDocsChain: historyAwareCombineDocsChain,
  });

  console.log("--- Running the chain with a sample conversation... ---");
  const reply = await conversationalRetrievalChain.invoke({
    chat_history: chatHistory,
    input: question,
  });

  // Print the result to the console
  console.log(reply.answer);
  return reply.answer;
};

// Export the model and the run function
export { model, generateLangchainCompletion };
