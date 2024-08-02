"use client";

import { generateEmbeddings } from "@/actions/generateEmbeddings";
import { db, storage } from "@/firebase";
import { useUser } from "@clerk/nextjs";
import { doc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

export enum StatusText {
  UPLOADING = "Uploading file...",
  UPLOADED = "File uploaded successfully",
  SAVING = "Saving file to database",
  GENERATING = "Generating AI Embeddings, This will only take a few seconds...",
}
export type Status = StatusText[keyof StatusText];

function useUpload() {
  const [progress, setProgress] = useState<number | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const { user } = useUser(); //Get Auth User
  const router = useRouter();

  const handleUpload = async (file: File) => {
    if (!file || !user) return;

    // Free/Pro limitation
    //Create ID for file
    const fileIdToUploadTo = uuidv4();

    // Store file on Storage
    const storageRef = ref(
      storage,
      `users/${user.id}/files/${fileIdToUploadTo}`
    );

    // This is like we give a task to Firebase to Upload file
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Calculate how many percent of file is upload
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setStatus(StatusText.UPLOADING);
        setProgress(percent);
      },
      (error) => {
        console.error("Error uploading file", error);
      },
      async () => {
        // File is Uploaded successfully
        setStatus(StatusText.UPLOADED);
        // Get URL of file to Download
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

        setStatus(StatusText.SAVING);
        // Store file on DB
        await setDoc(doc(db, "users", user.id, "files", fileIdToUploadTo), {
          name: file.name,
          size: file.size,
          type: file.type,
          downloadUrl: downloadUrl,
          ref: uploadTask.snapshot.ref.fullPath,
          createdAt: new Date(),
        });

        setStatus(StatusText.GENERATING);

        // Generate AI Embeddings
        await generateEmbeddings(fileIdToUploadTo);

        setFileId(fileIdToUploadTo);
      }
    );
  };

  return { progress, status, fileId, handleUpload };
}

export default useUpload;
