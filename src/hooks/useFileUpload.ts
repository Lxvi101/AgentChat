import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useFileUpload() {
  // Track the number of active uploads instead of a single boolean
  const [activeUploads, setActiveUploads] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0); // Optional: for future progress bars

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveMetadata = useMutation(api.files.saveMetadata);

  const uploadFile = async (file: File): Promise<Id<"files">> => {
    setActiveUploads((prev) => prev + 1);
    setUploadProgress(0);

    try {
      // 1. Get a short-lived upload URL
      const postUrl = await generateUploadUrl();

      // 2. POST the file to the URL
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error(`Upload failed with status: ${result.status}`);
      }

      const { storageId } = await result.json();

      // 3. Save the newly allocated storage id to the database
      const fileId = await saveMetadata({
        storageId,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
      });

      return fileId;
    } catch (error) {
      console.error("File upload failed:", error);
      throw error;
    } finally {
      // Safely decrement the counter, ensuring it never drops below 0
      setActiveUploads((prev) => Math.max(0, prev - 1));
      setUploadProgress(100);
    }
  };

  // Derive the boolean state from the counter
  const isUploading = activeUploads > 0;

  return { uploadFile, isUploading, uploadProgress };
}
